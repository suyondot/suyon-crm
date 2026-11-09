// Bot Suyon AI: corre los flujos (bloques), los seguimientos y la IA Suyon.
// Todo es por tienda. Se activa desde el webhook (mensaje entrante) y desde el cron de cada minuto.
import { now, clip, windowOpen, DEFAULT_TZ, localParts, tzOffset, localDay, HttpError } from './util.js';
import { sendText, uploadMedia, sendMediaById, kindForMime, sendButtons, sendList } from './whatsapp.js';
import { PROMPT_PANTALON, KNOWLEDGE_PANTALON, PROMPT_GENERICO } from './bot-template.js';
import { iaAllowed } from './billetera.js';
import { draftFromChat, insertOrder, cfgOf, varsFromForm } from './orders.js';
import { agenciesNear, agenciesIn, agencyOptions } from './shalom.js';
import { onOrderCreated } from './automations.js';
import { storeBlocked, loadPlan, priceText } from './billing.js';
import { addSpend } from './saldo.js';

const MIN = 60e3;
const MAX_STEPS = 40;

export const NODE_TYPES = ['start', 'send', 'recognize', 'condition', 'action', 'delay', 'ia', 'handoff', 'goto'];

// Precios por millón de tokens (US$), vistos el 2 nov 2026
export const IA_MODELS = {
  'claude-haiku-5-5': { provider: 'anthropic', name: 'Claude Haiku 5.5', in: 0.1, out: 0.5 },
  'gpt-5-mini': { provider: 'openai', name: 'GPT-5 mini', in: 0.25, out: 2.0 },
};

export const DEFAULT_SETTINGS = {
  bot_on: 0,
  audience: 'equipo', // equipo = solo números de prueba · todas
  test_numbers: '',
  ia_model: 'claude-haiku-5-5',
  ia_secret: 'ANTHROPIC_API_KEY',
  ia_daily_cap: 3,
  ia_prompt: null,
  ia_knowledge: null,
  ia_delay_s: 5,
  ia_history: 50,
  ia_follow_min: 30,
  ia_follow_text: '¿Te quedó alguna duda, bella? 💕 Cuéntame y te ayudo con tu pedido 😊',
  pay_yape: '',
  pay_titular: '',
  pay_bcp: '',
  pay_cci: '',
  corte_h: 13, // pedidos de Lima confirmados antes de esta hora llegan HOY
  entrega_sab: 1, // sábado se entrega (con la misma hora de corte)
  entrega_dom: 0, // domingo no se entrega
  entrega_horario: 'entre 2 y 8 p.m.',
  voz_on: 1, // notas de voz → texto (necesita el secreto OPENAI_API_KEY)
};

/* ---------------- Utilidades ---------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function limaParts(t = now(), tz = DEFAULT_TZ) {
  return localParts(t, tz);
}

// Si la hora cae fuera del horario permitido, la pasa al siguiente inicio de horario (hora de la tienda)
export function fitWindow(t, fromH, toH, tz = DEFAULT_TZ) {
  if (fromH == null || toH == null) return t;
  const p = localParts(t, tz);
  if (p.h >= fromH && p.h < toH) return t;
  const off = tzOffset(t, tz);
  return Date.UTC(p.y, p.mo - 1, p.d + (p.h >= toH ? 1 : 0), fromH) - off;
}

export function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fill(text, vars) {
  return String(text || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null && vars[k] !== '' ? String(vars[k]) : m));
}

// Reconoce un valor (talla) sin IA. Si hay varios, se queda con el último de la lista (la talla más grande).
export function recognize(text, options) {
  const n = norm(text);
  if (!n) return null;
  const tokens = n.split(' ');
  const hits = new Set();
  options.forEach((opt, i) => {
    for (const w of opt.words || []) {
      const ww = norm(w);
      if (!ww) continue;
      if (n === ww) hits.add(i);
      else if (ww.includes(' ') ? (' ' + n + ' ').includes(' ' + ww + ' ') : tokens.includes(ww)) {
        // Letras sueltas (s, m, l) solo cuentan en mensajes cortos o con «talla/soy/uso» delante
        if (/^[a-z]{1,3}$/.test(ww) && !/^\d+$/.test(ww)) {
          const idx = tokens.indexOf(ww);
          const prev = tokens[idx - 1];
          if (tokens.length <= 3 || ['talla', 'soy', 'uso', 'es', 'la'].includes(prev)) hits.add(i);
        } else hits.add(i);
      }
    }
  });
  // Números de jean mayores a 40 → la última opción (XL)
  for (const tk of tokens) if (/^\d{2}$/.test(tk) && Number(tk) > 40 && Number(tk) <= 50) hits.add(options.length - 1);
  if (!hits.size) return null;
  return options[Math.max(...hits)].value;
}

/* ---------------- Datos ---------------- */

export async function loadSettings(env, storeId) {
  const row = await env.DB.prepare('SELECT * FROM bot_settings WHERE store_id = ?').bind(storeId).first();
  const st = await env.DB.prepare('SELECT s.timezone, s.language, s.hour12, s.order_cfg, co.plan_status FROM stores s LEFT JOIN companies co ON co.id = s.company_id WHERE s.id = ?').bind(storeId).first();
  const saved = Object.fromEntries(Object.entries(row || {}).filter(([k, v]) => v != null || DEFAULT_SETTINGS[k] == null));
  // Las tiendas de Jordan (empresas sin cobro) usan su prompt «Ventas pantalón» por defecto; las de alumnos, uno genérico
  const own = !st?.plan_status || st.plan_status === 'free';
  return { ...DEFAULT_SETTINGS, ...saved, timezone: st?.timezone || DEFAULT_TZ, language: st?.language || 'es', hour12: st?.hour12 ?? 1, store_id: storeId, __own: own, __sin: cfgOf({ order_cfg: st?.order_cfg }).sin_cobertura };
}

export async function loadFlow(env, flowId) {
  const f = await env.DB.prepare('SELECT * FROM bot_flows WHERE id = ?').bind(flowId).first();
  if (!f) return null;
  return { ...f, graph: JSON.parse(f.graph) };
}

const nodeOf = (flow, id) => (id ? flow.graph.nodes.find((n) => n.id === id) : null);

async function saveState(env, chatId, st) {
  const sets = [];
  const vals = [];
  for (const k of ['bot_flow_id', 'bot_node', 'bot_wait', 'bot_vars', 'bot_paused', 'handler', 'bot_ag']) {
    if (k in st) {
      sets.push(`${k} = ?`);
      vals.push(k === 'bot_vars' ? JSON.stringify(st[k] || {}) : st[k]);
    }
  }
  if (!sets.length) return;
  await env.DB.prepare(`UPDATE chats SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).bind(...vals, now(), chatId).run();
}

const bump = (env, storeId) => env.DB.prepare('UPDATE stores SET rev = rev + 1 WHERE id = ?').bind(storeId).run();

// En el simulador los avisos salen dentro del chat de prueba, no en Avisos
async function alertFor(env, store, chat, payload) {
  if (chat?.sim) {
    const t = now();
    await env.DB.prepare(`INSERT INTO messages (chat_id, store_id, direction, sender, type, body, status, created_at, updated_at) VALUES (?, ?, 'out', 'sys', 'text', ?, 'sent', ?, ?)`)
      .bind(chat.id, store.id, clip(payload.title + (payload.body ? ' · ' + payload.body : ''), 600), t, t).run();
    return;
  }
  return notify(env, store.id, { ...payload, chatId: 'chatId' in payload ? payload.chatId : chat?.id ?? null });
}

export async function notify(env, storeId, { kind, chatId = null, title, body = null, dedupe = false }) {
  if (dedupe) {
    const dup = await env.DB.prepare('SELECT id FROM notifications WHERE store_id = ? AND kind = ? AND title = ? AND read_at IS NULL AND created_at > ?')
      .bind(storeId, kind, title, now() - 864e5).first();
    if (dup) return;
  }
  await env.DB.prepare('INSERT INTO notifications (store_id, kind, chat_id, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(storeId, kind, chatId, clip(title, 200), body ? clip(body, 600) : null, now()).run();
  await bump(env, storeId);
}

async function count(env, flowId, nodeId) {
  await env.DB.prepare(
    'INSERT INTO bot_counts (flow_id, node_id, entered) VALUES (?, ?, 1) ON CONFLICT (flow_id, node_id) DO UPDATE SET entered = entered + 1'
  ).bind(flowId, nodeId).run();
}

async function labelId(env, storeId, name) {
  name = clip(String(name || '').trim(), 30);
  if (!name) return null;
  let l = await env.DB.prepare('SELECT id FROM labels WHERE store_id = ? AND name = ? COLLATE NOCASE').bind(storeId, name).first();
  if (!l) {
    await env.DB.prepare('INSERT OR IGNORE INTO labels (store_id, name, color, auto, sort, created_at) VALUES (?, ?, ?, 1, 99, ?)').bind(storeId, name, '--t-grey', now()).run();
    l = await env.DB.prepare('SELECT id FROM labels WHERE store_id = ? AND name = ? COLLATE NOCASE').bind(storeId, name).first();
  }
  return l?.id;
}

export async function addLabel(env, storeId, chatId, name) {
  const id = await labelId(env, storeId, name);
  if (id) await env.DB.prepare('INSERT OR IGNORE INTO chat_labels (chat_id, label_id, created_at) VALUES (?, ?, ?)').bind(chatId, id, now()).run();
}

async function removeLabel(env, storeId, chatId, name) {
  const l = await env.DB.prepare('SELECT id FROM labels WHERE store_id = ? AND name = ? COLLATE NOCASE').bind(storeId, String(name || '').trim()).first();
  if (l) await env.DB.prepare('DELETE FROM chat_labels WHERE chat_id = ? AND label_id = ?').bind(chatId, l.id).run();
}

async function chatLabels(env, chatId) {
  const { results } = await env.DB.prepare('SELECT l.name FROM chat_labels cl JOIN labels l ON l.id = cl.label_id WHERE cl.chat_id = ?').bind(chatId).all();
  return results.map((r) => r.name);
}

export async function cancelJobs(env, chatId, filter = null) {
  let sql = 'UPDATE bot_jobs SET canceled_at = ? WHERE chat_id = ? AND done_at IS NULL AND canceled_at IS NULL';
  const vals = [now(), chatId];
  if (filter === 'reply') sql += " AND (cancel_on = 'reply' OR kind = 'ia_follow')";
  else if (filter === 'image') sql += " AND cancel_on IN ('reply', 'image')";
  else if (filter) {
    sql += ' AND seq_id = ?';
    vals.push(filter);
  }
  await env.DB.prepare(sql).bind(...vals).run();
}

/* ---------------- Enviar ---------------- */

async function assetFor(env, storeId, key) {
  return env.DB.prepare('SELECT * FROM bot_assets WHERE store_id = ? AND key = ?').bind(storeId, key).first();
}

// Manda un mensaje del bot o de la IA y lo deja en el chat como cualquier otro
export async function botSend(env, store, chat, item, { flowId, node, sender = 'bot', vars = {} }) {
  const fresh = await env.DB.prepare('SELECT * FROM chats WHERE id = ?').bind(chat.id).first();
  const sim = !!fresh.sim;
  if (!sim && !windowOpen(fresh)) return { ok: false, reason: 'ventana' };
  let type = 'text';
  let body = null;
  let asset = null;
  if (item.kind === 'text') {
    body = fill(item.text, vars).trim();
    if (!body) return { ok: false, reason: 'vacio' };
  } else {
    const key = fill(item.asset, vars);
    asset = await assetFor(env, store.id, key);
    if (!asset && item.opcional) return { ok: false, reason: 'archivo' }; // archivo opcional: si no lo subió, se salta sin aviso
    if (!asset) {
      await alertFor(env, store, fresh, { kind: 'archivo', chatId: null, title: `Falta subir el archivo «${key}»`, body: 'El bot se saltó ese archivo. Súbelo en Configuración → Bot Suyon AI → Archivos.', dedupe: true });
      return { ok: false, reason: 'archivo' };
    }
    type = item.kind === 'file' ? kindForMime(asset.mime) : item.kind || kindForMime(asset.mime);
    body = item.caption ? fill(item.caption, vars) : null;
  }
  // Botones para tocar (solo en textos): hasta 3 = botones, 4 a 10 = lista
  const opciones = type === 'text' && Array.isArray(item.opciones) ? item.opciones.map((o) => fill(String(o), vars).trim()).filter(Boolean).slice(0, 10) : [];
  const extra = opciones.length ? JSON.stringify({ opciones, boton: item.boton || null }) : null;
  const t = now();
  const r = await env.DB.prepare(
    `INSERT INTO messages (chat_id, store_id, direction, sender, type, body, media_key, media_mime, media_name, media_size, media_status, status, bot_flow_id, bot_node, extra, created_at, updated_at)
     VALUES (?, ?, 'out', ?, ?, ?, ?, ?, ?, ?, ?, 'sending', ?, ?, ?, ?, ?)`
  ).bind(chat.id, store.id, sender, type, body, asset?.r2_key || null, asset?.mime || null, asset?.name || null, asset?.size || null, asset ? 'ok' : null, sim ? null : flowId || null, node || null, extra, t, t).run();
  const msgId = r.meta.last_row_id;
  let ok = true;
  if (sim) {
    await env.DB.prepare("UPDATE messages SET status = 'read', updated_at = ? WHERE id = ?").bind(now(), msgId).run();
    await env.DB.prepare("UPDATE chats SET last_msg_at = ?, last_dir = 'out', updated_at = ? WHERE id = ?").bind(now(), now(), chat.id).run();
    return { ok: true, id: msgId };
  }
  try {
    let wamid;
    if (type === 'text' && opciones.length) wamid = await sendChoices(env, store, chat.wa_id, body, opciones, item.boton);
    else if (type === 'text') wamid = await sendText(env, store, chat.wa_id, body);
    else {
      let mediaId = asset.wa_media_id;
      if (!mediaId || !asset.wa_media_at || t - asset.wa_media_at > 20 * 864e5) {
        const obj = await env.MEDIA.get(asset.r2_key);
        if (!obj) throw new Error('El archivo ya no está guardado. Vuelve a subirlo.');
        mediaId = await uploadMedia(env, store, await obj.arrayBuffer(), asset.mime, asset.name);
        await env.DB.prepare('UPDATE bot_assets SET wa_media_id = ?, wa_media_at = ? WHERE id = ?').bind(mediaId, t, asset.id).run();
      }
      wamid = await sendMediaById(env, store, chat.wa_id, type, mediaId, { caption: body, filename: asset.name, mime: asset.mime });
    }
    await env.DB.prepare("UPDATE messages SET wamid = ?, status = 'sent', updated_at = ? WHERE id = ?").bind(wamid, now(), msgId).run();
  } catch (e) {
    ok = false;
    await env.DB.prepare("UPDATE messages SET status = 'failed', error = ?, updated_at = ? WHERE id = ?").bind(clip(e.message, 300), now(), msgId).run();
    await notify(env, store.id, { kind: 'error', chatId: chat.id, title: `No se pudo enviar (${node || 'bot'})`, body: e.message });
  }
  const label = { image: '📷 Foto', video: '🎥 Video', audio: '🎤 Audio', document: '📄 Documento' }[type];
  const pv = clip(label ? (body ? `${label}: ${body}` : label) : (body || '').split('\n')[0], 120);
  await env.DB.prepare(
    `UPDATE chats SET last_msg_at = ?, last_preview = ?, last_dir = 'out', updated_at = ?,
       first_reply_at = CASE WHEN referral_at IS NOT NULL AND first_reply_at IS NULL THEN ? ELSE first_reply_at END WHERE id = ?`
  ).bind(now(), pv, now(), now(), chat.id).run();
  await bump(env, store.id);
  return { ok, id: msgId };
}

// «M · Jean 31-33» → título «M» y descripción «Jean 31-33» (la descripción solo se ve en listas)
export function splitOpt(o) {
  const [title, ...rest] = String(o).split(' · ');
  return { title: title.trim(), description: rest.join(' · ').trim() || null };
}

export function sendChoices(env, store, to, body, opciones, boton) {
  const opts = opciones.map(splitOpt);
  if (opts.length <= 3) return sendButtons(env, store, to, body, opts.map((o, i) => ({ id: `opt:${i}:${o.title}`.slice(0, 256), title: o.title })));
  return sendList(env, store, to, body, boton || 'Elegir', opts.map((o, i) => ({ id: `opt:${i}:${o.title}`.slice(0, 200), title: o.title, description: o.description })));
}

async function sendItems(env, store, chat, items, meta) {
  let i = 0;
  for (const it of items || []) {
    if (i++) await sleep(meta.gap ?? 600); // mantiene el orden en WhatsApp
    const r = await botSend(env, store, chat, it, meta);
    if (r.reason === 'ventana') return false;
  }
  return true;
}

/* ---------------- Correr el flujo ---------------- */

async function startSequence(env, store, chat, flow, seqId, t0 = now()) {
  const seq = (flow.graph.sequences || []).find((s) => s.id === seqId);
  if (!seq) return;
  await cancelJobs(env, chat.id, seqId);
  const stmts = (seq.steps || []).map((st, i) =>
    env.DB.prepare(
      `INSERT INTO bot_jobs (store_id, chat_id, flow_id, kind, seq_id, step, cancel_on, run_at, created_at) VALUES (?, ?, ?, 'seq', ?, ?, ?, ?, ?)`
    ).bind(store.id, chat.id, flow.id, seqId, i, seq.cancel_on || 'reply', fitWindow(t0 + (Number(st.after_min) || 0) * MIN, st.from_h, st.to_h, store.timezone), now())
  );
  if (stmts.length) await env.DB.batch(stmts);
}

async function doOps(env, store, chat, flow, ops, vars) {
  for (const op of ops || []) {
    const v = fill(op.label ?? op.value ?? '', vars);
    switch (op.op) {
      case 'add_label': await addLabel(env, store.id, chat.id, v); break;
      case 'remove_label': await removeLabel(env, store.id, chat.id, v); break;
      case 'set_var': if (op.var) vars[op.var] = v; break;
      case 'clear_var': if (op.var) delete vars[op.var]; break;
      case 'start_seq': await startSequence(env, store, chat, flow, op.seq); break;
      case 'stop_seq': await cancelJobs(env, chat.id, op.seq); break;
      case 'notify': await alertFor(env, store, chat, { kind: 'aviso', title: v || 'Aviso del bot' }); break;
    }
  }
}

function checkCondition(node, vars, labels, chat) {
  const rules = node.rules || [];
  if (!rules.length) return true;
  const test = (r) => {
    const val = String(fill(r.value || '', vars)).toLowerCase();
    let have;
    if (r.on === 'label') have = labels.map((x) => x.toLowerCase()).includes(val);
    else if (r.on === 'ad') have = r.op === 'any' ? !!chat.ad_id : String(chat.ad_id || '') === val;
    else {
      const cur = String(vars[r.var] ?? '').toLowerCase();
      have = r.op === 'contains' ? cur.includes(val) : r.op === 'set' ? cur !== '' : cur === val;
    }
    return r.not ? !have : have;
  };
  return node.mode === 'any' ? rules.some(test) : rules.every(test);
}

// Corre bloques desde nodeId hasta que uno espere (respuesta o tiempo) o se acabe el flujo
export async function runFrom(env, ctx, store, chatId, flow, nodeId, vars, triggerMsgId = null) {
  let chat = await env.DB.prepare('SELECT * FROM chats WHERE id = ?').bind(chatId).first();
  const settings = await loadSettings(env, store.id);
  let id = nodeId;
  for (let step = 0; id && step < MAX_STEPS; step++) {
    const node = nodeOf(flow, id);
    if (!node) break;
    if (!chat.sim) await count(env, flow.id, node.id);
    const meta = { flowId: flow.id, node: node.id, vars };
    switch (node.type) {
      case 'start':
        for (const l of node.labels || []) await addLabel(env, store.id, chat.id, fill(l, vars));
        id = node.next;
        break;
      case 'send': {
        // El primer mensaje ya traía la respuesta (ej. «precio y colores en talla L»): no se pregunta, se sigue
        if (node.wait && vars.__primer) {
          const nx = nodeOf(flow, node.next);
          const primer = vars.__primer;
          delete vars.__primer;
          if (nx?.type === 'recognize' && (nx.from || 'respuesta') === (node.save_to || 'respuesta') && recognize(primer, nx.options || [])) {
            vars[node.save_to || 'respuesta'] = primer;
            id = node.next;
            break;
          }
        }
        const ok = await sendItems(env, store, chat, node.items, meta);
        if (node.wait) {
          await saveState(env, chat.id, { bot_flow_id: flow.id, bot_node: node.id, bot_wait: 1, bot_vars: vars, handler: 'bot' });
          return;
        }
        id = ok ? node.next : null;
        break;
      }
      case 'recognize': {
        const val = recognize(vars[node.from || 'respuesta'], node.options || []);
        if (val) {
          vars[node.var || 'talla'] = val;
          id = (node.options.find((o) => o.value === val) || {}).next || node.next;
        } else id = node.next_other;
        break;
      }
      case 'condition':
        id = checkCondition(node, vars, await chatLabels(env, chat.id), chat) ? node.next : node.next_no;
        break;
      case 'action':
        await doOps(env, store, chat, flow, node.ops, vars);
        id = node.next;
        break;
      case 'goto':
        id = node.target;
        break;
      case 'delay': {
        const at = fitWindow(now() + (Number(node.minutes) || 1) * MIN, node.from_h, node.to_h, store.timezone);
        await env.DB.prepare(`INSERT INTO bot_jobs (store_id, chat_id, flow_id, kind, node_id, cancel_on, run_at, created_at) VALUES (?, ?, ?, 'resume', ?, ?, ?, ?)`)
          .bind(store.id, chat.id, flow.id, node.next || null, node.cancel_on_reply ? 'reply' : 'none', at, now()).run();
        await saveState(env, chat.id, { bot_flow_id: flow.id, bot_node: node.id, bot_wait: 3, bot_vars: vars, handler: 'bot' });
        return;
      }
      case 'handoff': {
        if (node.message) await botSend(env, store, chat, { kind: 'text', text: node.message }, meta);
        for (const l of node.labels || []) await addLabel(env, store.id, chat.id, fill(l, vars));
        await cancelJobs(env, chat.id);
        await saveState(env, chat.id, { bot_flow_id: flow.id, bot_node: node.id, bot_wait: 0, bot_vars: vars, bot_paused: 1, handler: 'asesora' });
        await env.DB.prepare('UPDATE chats SET unread = MAX(unread, 1), updated_at = ? WHERE id = ?').bind(now(), chat.id).run();
        // Compró: la IA deja el pedido armado con lo que guardó (la asesora lo revisa y lo valida)
        if ((node.labels || []).some((l) => /COMPR[OÓ]/i.test(l)) && !node.no_order) await orderFromBot(env, store, chat.id, vars);
        await alertFor(env, store, chat, { kind: 'asesora', title: chat.sim ? `Pasó a asesora: ${fill(node.reason || '', vars)}` : `${chat.name || chat.profile_name || '+' + chat.wa_id}: ${fill(node.reason || 'Pasó a asesora', vars)}` });
        return;
      }
      case 'ia': {
        await saveState(env, chat.id, { bot_flow_id: flow.id, bot_node: node.id, bot_wait: 2, bot_vars: vars, handler: 'bot' });
        const r = await runIA(env, store, chat, flow, node, settings, vars, triggerMsgId);
        if (r.aborted) return; // llegó otro mensaje: lo responde ese
        if (!r.ok) id = node.next_error;
        else if (r.caseId) id = (node.cases || []).find((c) => c.id === r.caseId)?.next || node.next;
        else id = node.next;
        break;
      }
      default:
        id = null;
    }
    chat = await env.DB.prepare('SELECT * FROM chats WHERE id = ?').bind(chatId).first();
    if (chat.bot_paused) return;
  }
  await saveState(env, chatId, { bot_node: null, bot_wait: 0, bot_vars: vars });
}

async function orderFromBot(env, store, chatId, vars) {
  const chat = await env.DB.prepare('SELECT * FROM chats WHERE id = ?').bind(chatId).first();
  // Si al bot le faltan colores/talla/datos, se toman del último formulario que mandó la IA
  if (!vars.colores || !vars.talla || !vars.nombre || !vars.dni || !vars.direccion) {
    const f = await env.DB.prepare("SELECT body FROM messages WHERE chat_id = ? AND direction = 'out' AND body LIKE '%Pedido:%' ORDER BY id DESC LIMIT 1").bind(chatId).first();
    if (f?.body) for (const [k, v] of Object.entries(varsFromForm(f.body))) if (!vars[k]) vars[k] = v;
  }
  const draft = draftFromChat({ ...chat, bot_vars: JSON.stringify(vars) }, store);
  if (chat.sim) {
    const t = now();
    await env.DB.prepare(`INSERT INTO messages (chat_id, store_id, direction, sender, type, body, status, created_at, updated_at) VALUES (?, ?, 'out', 'sys', 'text', ?, 'sent', ?, ?)`)
      .bind(chat.id, store.id, `Aquí se crearía el pedido (en el simulador no se guarda): ${draft.items.map((i) => `${i.cantidad} × ${[i.talla, i.color].filter(Boolean).join(' ')}`).join(', ')} · S/${draft.total} · ${draft.modo === 'agencia' ? 'Agencia' : 'Lima'}`, t, t).run();
    return;
  }
  const open = await env.DB.prepare(
    "SELECT id FROM orders WHERE chat_id = ? AND status IN ('nuevo', 'por_pagar') AND created_at > ? LIMIT 1"
  ).bind(chat.id, now() - 3 * 864e5).first();
  if (open) return;
  try {
    const o = await insertOrder(env, store, draft, { source: 'ia' });
    if (o) await onOrderCreated(env, store, o);
  } catch (e) {
    await notify(env, store.id, { kind: 'error', chatId: chat.id, title: 'La IA no pudo crear el pedido', body: e.message });
  }
}

/* ---------------- Mensaje entrante ---------------- */

function audienceOk(settings, waId) {
  if (settings.audience === 'todas') return true;
  const list = String(settings.test_numbers || '').split(/[\s,;]+/).map((x) => x.replace(/\D/g, '')).filter(Boolean);
  return list.some((n) => waId.endsWith(n) || n.endsWith(waId));
}

function triggerMatch(trigger, chat, text, isFirst) {
  if (!trigger) return false;
  const fromAd = !!chat.ad_id;
  const adOk =
    trigger.ads === 'ads' ? fromAd : trigger.ads === 'organic' ? !fromAd : trigger.ads === 'list' ? (trigger.ad_ids || []).map(String).includes(String(chat.ad_id || '')) : true;
  if (trigger.new_chat && isFirst && adOk) return true;
  const n = norm(text);
  return (trigger.keywords || []).some((k) => norm(k) && n.includes(norm(k)));
}

// Clienta que ya había escrito y vuelve desde un anuncio. Devuelve true si el bot se encargó.
async function volvioPorAnuncio(env, ctx, store, chat, msg, text) {
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE chat_id = ? AND direction = 'in'").bind(chat.id).first();
  if (n <= 1) return false; // es su primer mensaje: lo maneja el inicio normal
  // Si una persona del equipo le está escribiendo ahora (últimas 2 h), no se mete el bot
  const ase = await env.DB.prepare("SELECT created_at FROM messages WHERE chat_id = ? AND direction = 'out' AND sender = 'ase' ORDER BY id DESC LIMIT 1").bind(chat.id).first();
  if (ase && now() - ase.created_at < 2 * 3600 * 1000) return false;
  // En medio de una conversación con el bot (no en pausa): sigue igual, como cualquier respuesta
  if (!chat.bot_paused && chat.bot_flow_id && chat.bot_node && chat.bot_wait) return false;
  const { results: flows } = await env.DB.prepare('SELECT id FROM bot_flows WHERE store_id = ? AND active = 1 ORDER BY id').bind(store.id).all();
  let flow = null;
  for (const f of flows) {
    const fl = await loadFlow(env, f.id);
    if (triggerMatch(nodeOf(fl, fl.graph.start)?.trigger, chat, text, true)) {
      flow = fl;
      break;
    }
  }
  if (!flow) return false;
  const vars = JSON.parse(chat.bot_vars || '{}');
  const ia = flow.graph.nodes.find((x) => x.type === 'ia');
  const avanzo = ['talla', 'colores', 'destino', 'distrito', 'nombre'].some((k) => vars[k]);
  if (avanzo && ia && (chat.bot_flow_id === flow.id || !chat.bot_flow_id)) {
    // Ya había avanzado: la IA la saluda de nuevo y retoma lo que eligió (no se le repite todo desde cero)
    vars.__volvio = 1;
    await cancelJobs(env, chat.id);
    await saveState(env, chat.id, { bot_flow_id: flow.id, bot_node: ia.id, bot_wait: 2, bot_vars: vars, bot_paused: 0, handler: 'bot' });
    await runFrom(env, ctx, store, chat.id, flow, ia.id, vars, msg.id);
  } else {
    await startFlow(env, ctx, store, chat.id, flow, msg.id, text);
  }
  return true;
}

export async function startFlow(env, ctx, store, chatId, flow, triggerMsgId = null, primer = '') {
  await cancelJobs(env, chatId);
  await saveState(env, chatId, { bot_flow_id: flow.id, bot_node: null, bot_wait: 0, bot_vars: {}, bot_paused: 0, handler: 'bot', bot_ag: null });
  const vars = primer && String(primer).length <= 80 ? { __primer: String(primer) } : {};
  await runFrom(env, ctx, store, chatId, flow, flow.graph.start, vars, triggerMsgId);
}

export async function onInbound(env, ctx, store, chatId, msg, { sim = false } = {}) {
  const settings = await loadSettings(env, store.id);
  // «Respondieron»: el último mensaje del bot recibió respuesta
  await env.DB.prepare(
    `UPDATE messages SET replied = 1 WHERE id = (SELECT MAX(id) FROM messages WHERE chat_id = ? AND direction = 'out' AND sender IN ('bot', 'ia') AND id < ?) AND replied IS NULL`
  ).bind(chatId, msg.id).run();
  await cancelJobs(env, chatId, msg.type === 'image' || msg.type === 'document' ? 'image' : 'reply');
  if (!settings.bot_on && !sim) return;
  if (!sim && (await storeBlocked(env, store.id))) return; // plan vencido: los mensajes llegan, el bot no responde
  let chat = await env.DB.prepare('SELECT * FROM chats WHERE id = ?').bind(chatId).first();
  if (!chat || (!sim && !audienceOk(settings, chat.wa_id))) return;
  const text = msg.body || (msg.type === 'audio' ? '[nota de voz]' : msg.type === 'image' ? '[foto]' : '');
  // Volvió por un anuncio nuevo: el bot la atiende otra vez, aunque estuviera en pausa o el flujo hubiera terminado
  // (en Botcake solo se atendía a «nuevos suscriptores» y estas clientas se quedaban sin respuesta)
  if (msg.fromAd && !sim && (await volvioPorAnuncio(env, ctx, store, chat, msg, text))) return;
  if (chat.bot_paused) return;

  if (chat.bot_flow_id && chat.bot_node && chat.bot_wait) {
    const flow = await loadFlow(env, chat.bot_flow_id);
    if (flow?.active || (sim && flow)) {
      const node = nodeOf(flow, chat.bot_node);
      const vars = JSON.parse(chat.bot_vars || '{}');
      if (node && chat.bot_wait === 1) {
        vars[node.save_to || 'respuesta'] = text;
        await saveState(env, chat.id, { bot_wait: 0, bot_vars: vars });
        return runFrom(env, ctx, store, chat.id, flow, node.next, vars, msg.id);
      }
      if (node?.type === 'ia' && chat.bot_wait === 2) {
        // La IA estaba por responder: este mensaje se suma y responde una sola vez
        vars.respuesta = text;
        return runFrom(env, ctx, store, chat.id, flow, node.id, vars, msg.id);
      }
      if (chat.bot_wait === 3) return; // esperando un tiempo
    }
  }
  if (sim) return; // en el simulador el flujo se inicia con «Empezar como clienta nueva»
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE chat_id = ? AND direction = 'in'").bind(chat.id).first();
  const { results: flows } = await env.DB.prepare('SELECT id FROM bot_flows WHERE store_id = ? AND active = 1 ORDER BY id').bind(store.id).all();
  for (const f of flows) {
    const flow = await loadFlow(env, f.id);
    const start = nodeOf(flow, flow.graph.start);
    if (triggerMatch(start?.trigger, chat, text, n === 1)) return startFlow(env, ctx, store, chat.id, flow, msg.id, text);
  }
}

/* ---------------- IA Suyon ---------------- */

const LANGS = { es: 'español', pt: 'portugués', en: 'inglés' };
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// Qué día llega un pedido de Lima si se confirma en este momento (lo calcula el sistema, no la IA)
export function entregaDia(t, tz, { corte_h = 13, entrega_sab = 1, entrega_dom = 0 } = {}) {
  const p = localParts(t, tz);
  const ok = (dow) => (dow === 6 ? !!entrega_sab : dow === 0 ? !!entrega_dom : true);
  let add = ok(p.dow) && p.h < Number(corte_h ?? 13) ? 0 : 1;
  while (add < 8 && !ok((p.dow + add) % 7)) add++;
  const dow = (p.dow + add) % 7;
  if (add === 0) return 'HOY';
  if (add === 1) return dow === 1 ? 'MAÑANA lunes' : 'MAÑANA';
  return `el ${DIAS[dow].toUpperCase()}`;
}

// Variables que se pueden usar en el prompt con {llave}
export const PROMPT_VARS = [
  ['ahora', 'Fecha y hora de la tienda'], ['fecha', 'Fecha de hoy'], ['hora', 'Hora actual'], ['dia', 'Día de la semana'],
  ['entrega', 'Día de entrega en Lima (HOY / MAÑANA / el LUNES)'], ['horario_entrega', 'Horario de entrega en Lima'], ['sin_cobertura', 'Distritos de Lima sin motorizado (Pedidos)'],
  ['etiquetas', 'Etiquetas de la clienta'], ['yape', 'Yape / Plin'], ['titular', 'A nombre de'], ['bcp', 'Cuenta BCP'], ['cci', 'CCI'],
  ['talla', 'Talla que guardó el bot'], ['colores', 'Colores elegidos'], ['cantidad', 'Cantidad'], ['destino', 'Destino'], ['distrito', 'Distrito'],
  ['nombre', 'Nombre para el pedido'], ['celular', 'Celular para el pedido'], ['dni', 'DNI'], ['direccion', 'Dirección'], ['sede_shalom', 'Sede Shalom'],
  ['precio_base', 'Control Total: plan base al mes'], ['precio_numero', 'Control Total: número extra'], ['precio_trabajadora', 'Control Total: trabajadora extra'],
  ['dias_prueba', 'Control Total: días de prueba gratis'], ['tabla_precios', 'Control Total: precios con pack y planes de 3, 6 y 12 meses'], ['enlace_demo', 'Enlace para agendar demo'], ['enlace_registro', 'Enlace para crear cuenta'], ['enlace_web', 'Página de Control Total'],
];
const DATA_KEYS = ['talla', 'colores', 'cantidad', 'destino', 'distrito', 'nombre', 'celular', 'dni', 'direccion', 'sede_shalom'];

function fillPrompt(text, settings, labels, vars) {
  const tz = settings.timezone;
  const p = localParts(now(), tz);
  const h12 = settings.hour12 !== 0;
  const hh = h12 ? `${((p.h + 11) % 12) + 1}:${String(p.m).padStart(2, '0')} ${p.h < 12 ? 'a. m.' : 'p. m.'}` : `${String(p.h).padStart(2, '0')}:${String(p.m).padStart(2, '0')}`;
  const map = {
    ahora: nowText(tz, h12),
    fecha: `${DIAS[p.dow]} ${String(p.d).padStart(2, '0')}/${String(p.mo).padStart(2, '0')}/${p.y}`,
    hora: hh,
    dia: DIAS[p.dow],
    entrega: entregaDia(now(), tz, settings),
    horario_entrega: settings.entrega_horario || DEFAULT_SETTINGS.entrega_horario,
    sin_cobertura: settings.__sin || 'ninguno',
    etiquetas: labels.length ? labels.join(', ') : 'ninguna',
    yape: settings.pay_yape || '[FALTA YAPE]',
    titular: settings.pay_titular || '[FALTA TITULAR]',
    bcp: settings.pay_bcp || '[FALTA BCP]',
    cci: settings.pay_cci || '[FALTA CCI]',
  };
  const pl = settings.__plan;
  if (pl) {
    const cur = 'S/';
    const web = settings.__url || '';
    Object.assign(map, {
      precio_base: `${cur}${pl.base}`, precio_numero: `${cur}${pl.per_number}`, precio_trabajadora: `${cur}${pl.per_user}`,
      dias_prueba: String(pl.trial_days), tabla_precios: priceText(pl), enlace_demo: `${web}/inicio#demo`, enlace_registro: `${web}/registro`, enlace_web: `${web}/inicio`,
    });
  }
  for (const k of DATA_KEYS) map[k] = vars[k] ? String(vars[k]) : '(todavía no lo dijo)';
  return String(text).replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m));
}

function nowText(tz = DEFAULT_TZ, hour12 = true) {
  const p = localParts(now(), tz);
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const hh = ((p.h + 11) % 12) + 1;
  const mm = String(p.m).padStart(2, '0');
  const h24 = `${String(p.h).padStart(2, '0')}:${mm}`;
  return `${dias[p.dow]} ${String(p.d).padStart(2, '0')}/${String(p.mo).padStart(2, '0')}/${p.y}, ${hour12 ? `${hh}:${mm} ${p.h < 12 ? 'a. m.' : 'p. m.'} (${h24})` : h24}`;
}

// Datos del plan de Control Total para {precio_base}, {enlace_demo}…
async function withPlan(env, settings) {
  const plan = await loadPlan(env).catch(() => null);
  return { ...settings, __plan: plan, __url: String(env.PUBLIC_URL || 'https://controltotalecom.com').replace(/\/+$/, '') };
}

export function buildSystem(settings, node, labels, vars, assets) {
  const base = settings.ia_prompt || (settings.__own === false ? PROMPT_GENERICO : PROMPT_PANTALON);
  const knowledge = settings.ia_knowledge ?? (settings.__own === false ? '' : KNOWLEDGE_PANTALON);
  const filled = fillPrompt(base, settings, labels, vars);
  const cases = (node.cases || []).map((c) => `- "${c.id}": ${c.when}`).join('\n');
  const known = Object.entries(vars).filter(([k, v]) => v && k !== 'respuesta').map(([k, v]) => `${k}: ${v}`).join(' · ');
  return `${filled}

${knowledge ? `## CONOCIMIENTO\n${fillPrompt(knowledge, settings, labels, vars)}\n\n` : ''}## AHORA MISMO (calculado por el sistema, úsalo tal cual)
Si una clienta de Lima confirma ahora, su pedido llega ${entregaDia(now(), settings.timezone, settings)}, ${String(settings.entrega_horario || DEFAULT_SETTINGS.entrega_horario).replace(/\.+$/, '')}. Donde tu guía diga [HOY/MAÑANA], escribe: ${entregaDia(now(), settings.timezone, settings)}.

## CÓMO DISTINGUIR CELULAR Y DOCUMENTO (Perú)
- Celular: 9 dígitos y empieza con 9 (ej. 987 654 321).
- DNI: 8 dígitos; puede empezar con cualquier número, también con 9 (ej. 73559594).
- Carnet de extranjería: 12 dígitos (a veces 9 con letras). Guárdalo en "dni".
Cuenta los dígitos antes de decidir: nunca guardes un número de 8 dígitos como celular ni uno de 9 que empieza con 9 como DNI. Si la clienta solo te dio uno, pide el que falta.

## DATOS YA GUARDADOS DE ESTA CLIENTA
${known || 'ninguno'}

## ARCHIVOS DISPONIBLES AHORA (solo puedes adjuntar estas claves)
${assets.length ? assets.join(', ') : 'ninguno'}

## FORMATO DE TU RESPUESTA (obligatorio)
Responde SOLO con un JSON válido, sin texto antes ni después:
{"mensajes":[{"texto":"...","archivo":null}],"caso":null,"datos":{}}
- "mensajes": cada elemento es un mensaje de WhatsApp separado, en orden. "archivo": la clave de un archivo para adjuntar en ese mensaje, o null. Si solo envías el archivo, deja "texto" vacío.
- "caso": si la clienta está en uno de estos casos, pon su clave exacta; si no, null.
${cases || '(sin casos)'}
- "datos": lo que la clienta ya dijo de: talla, colores, cantidad, destino, distrito, nombre, celular, dni, direccion, sede_shalom. Solo lo que dijo; no inventes.${settings.language && settings.language !== 'es' && LANGS[settings.language] ? `\n\nIDIOMA: escribe los "texto" siempre en ${LANGS[settings.language]}.` : ''}`;
}

function historyFor(rows) {
  const out = [];
  for (const m of rows) {
    const role = m.direction === 'in' ? 'user' : 'assistant';
    const tag = { image: '[foto]', video: '[video]', audio: '[nota de voz]', document: '[documento]', sticker: '[sticker]', location: '[ubicación]' }[m.type];
    const text = [tag, m.transcript ? `(dijo: «${m.transcript}»)` : null, m.body].filter(Boolean).join(' ').trim() || '[mensaje]';
    const last = out[out.length - 1];
    if (last && last.role === role) last.text += '\n' + text;
    else out.push({ role, text, imgKey: null });
    if (role === 'user' && m.type === 'image' && m.media_key) out[out.length - 1].imgKey = { key: m.media_key, mime: m.media_mime || 'image/jpeg' };
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

async function imageB64(env, img) {
  try {
    const obj = await env.MEDIA.get(img.key);
    if (!obj || obj.size > 4.5 * 1048576) return null;
    const bytes = new Uint8Array(await obj.arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  } catch {
    return null;
  }
}

// Si la IA está saturada o falla la red, se reintenta 2 veces antes de rendirse (antes salía «Estamos validando» al toque)
async function fetchRetry(url, opts) {
  let last;
  for (let i = 0; i < 3; i++) {
    if (i) await sleep(i * 1500);
    try {
      const res = await fetch(url, opts);
      const data = await res.json().catch(() => ({}));
      last = { res, data };
      if (![429, 500, 502, 503, 504, 529].includes(res.status)) return last;
    } catch (e) {
      last = { res: { ok: false, status: 0 }, data: { error: { message: e.message } } };
    }
  }
  return last;
}

async function callModel(env, settings, system, hist) {
  const model = IA_MODELS[settings.ia_model] ? settings.ia_model : 'claude-haiku-5-5';
  const info = IA_MODELS[model];
  const key = env[settings.ia_secret || (info.provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY')];
  if (!key) throw Object.assign(new Error(`Falta la clave de IA. Ponla en Cloudflare como secreto «${settings.ia_secret}».`), { noKey: true });
  // Solo la última foto de la clienta va como imagen (las demás como texto)
  const lastImg = [...hist].reverse().find((h) => h.imgKey);
  const imgData = lastImg ? await imageB64(env, lastImg.imgKey) : null;
  let res;
  let data;
  if (info.provider === 'anthropic') {
    const messages = hist.map((h) => ({
      role: h.role,
      content: h === lastImg && imgData
        ? [{ type: 'image', source: { type: 'base64', media_type: lastImg.imgKey.mime, data: imgData } }, { type: 'text', text: h.text }]
        : h.text,
    }));
    ({ res, data } = await fetchRetry((env.ANTHROPIC_API || 'https://api.anthropic.com') + '/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 1500, system, messages }),
    }));
    if (!res.ok) throw new Error(`La IA respondió con error: ${data?.error?.message || res.status}`);
    return { text: (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join(''), inTok: data.usage?.input_tokens || 0, outTok: data.usage?.output_tokens || 0, model };
  }
  const messages = [{ role: 'system', content: system }, ...hist.map((h) => ({
    role: h.role,
    content: h === lastImg && imgData
      ? [{ type: 'text', text: h.text }, { type: 'image_url', image_url: { url: `data:${lastImg.imgKey.mime};base64,${imgData}` } }]
      : h.text,
  }))];
  ({ res, data } = await fetchRetry((env.OPENAI_API || 'https://api.openai.com') + '/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages, response_format: { type: 'json_object' }, max_completion_tokens: 4000 }),
  }));
  if (!res.ok) throw new Error(`La IA respondió con error: ${data?.error?.message || res.status}`);
  return { text: data.choices?.[0]?.message?.content || '', inTok: data.usage?.prompt_tokens || 0, outTok: data.usage?.completion_tokens || 0, model };
}

// Lee la respuesta de la IA. Solo es válida si viene el JSON pedido; si no, NO se manda nada a la clienta.
function cleanText(t) {
  let x = String(t ?? '').replace(/```[a-z]*\n?|```/gi, '').replace(/\r/g, '').trim();
  // Restos de formato que nunca deben llegar a la clienta
  if (/^\s*[{[]/.test(x) || /"(mensajes|texto|archivo|caso|datos)"\s*:/.test(x)) return '';
  return x.slice(0, 4000);
}

export function parseReply(text, validCases = null) {
  const s = String(text || '').replace(/```[a-z]*\n?|```/gi, '').trim();
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return { valid: false, mensajes: [], caso: null, datos: {} };
  let j;
  try {
    j = JSON.parse(s.slice(a, b + 1));
  } catch {
    return { valid: false, mensajes: [], caso: null, datos: {} };
  }
  if (!j || typeof j !== 'object' || (!Array.isArray(j.mensajes) && !j.caso)) return { valid: false, mensajes: [], caso: null, datos: {} };
  const mensajes = (Array.isArray(j.mensajes) ? j.mensajes : [])
    .slice(0, 6)
    .map((m) => (typeof m === 'string' ? { texto: m } : m || {}))
    .map((m) => ({ texto: cleanText(m.texto), archivo: m.archivo && /^[\w{}-]{1,40}$/.test(String(m.archivo)) ? String(m.archivo) : null }))
    .filter((m) => m.texto || m.archivo);
  let caso = typeof j.caso === 'string' && j.caso.trim() ? j.caso.trim() : null;
  if (caso && validCases && !validCases.includes(caso)) caso = null;
  const datos = {};
  if (j.datos && typeof j.datos === 'object' && !Array.isArray(j.datos)) {
    for (const [k, v] of Object.entries(j.datos)) if (/^\w{1,30}$/.test(k) && v != null && typeof v !== 'object' && String(v).trim()) datos[k] = String(v).trim();
  }
  return { valid: true, mensajes, caso, datos };
}

const today = (tz) => localDay(now(), tz);

// Perú: celular = 9 dígitos que empiezan con 9 · DNI = 8 dígitos · carnet de extranjería = 12 dígitos.
// Corrige si la IA los cruzó y completa lo que falta con los números que escribió la clienta.
export function fixIds(vars, text = '') {
  const dig = (x) => String(x || '').replace(/\D/g, '');
  const isCel = (d) => /^9\d{8}$/.test(d);
  const isDoc = (d) => d.length === 8 || d.length === 12;
  let cel = dig(vars.celular).replace(/^51(?=9\d{8}$)/, '');
  let doc = dig(vars.dni);
  if (doc && isCel(doc) && !isCel(cel)) [cel, doc] = [doc, isDoc(cel) ? cel : ''];
  if (cel && !isCel(cel) && isDoc(cel) && !isDoc(doc)) [doc, cel] = [cel, ''];
  // Números sueltos de su último mensaje: celulares escritos «987 654 321» y números seguidos
  let rest = String(text);
  const nums = [];
  rest = rest.replace(/(?<!\d)(?:\+?51[ .-]?)?9\d{2}[ .-]\d{3}[ .-]\d{3}(?!\d)/g, (m) => (nums.push(dig(m).slice(-9)), ' '));
  nums.push(...(rest.match(/\d+/g) || []));
  if (!isCel(cel)) cel = nums.find(isCel) || cel;
  if (!isDoc(doc)) doc = nums.find((d) => isDoc(d) && d !== cel) || doc;
  if (cel) vars.celular = cel;
  else delete vars.celular;
  if (doc) vars.dni = String(vars.dni || '').replace(/\D/g, '') === doc ? vars.dni : doc;
  else delete vars.dni;
  return vars;
}

// Celular de su propio WhatsApp (Perú: 51 + 9 dígitos que empiezan con 9). Con usuario sin número → null
export function celularWa(waId) {
  const d = String(waId || '').replace(/\D/g, '');
  return /^519\d{8}$/.test(d) ? d.slice(2) : null;
}

// Colores que la IA puso en el pedido y que la clienta NUNCA dijo (ni con un sinónimo): el candado de colores
const COLOR_GRUPOS = [
  ['vino', 'rojo', 'roja', 'guinda', 'granate', 'burdeo', 'borgona', 'tinto', 'cereza'],
  ['negro', 'negra', 'black'],
  ['blanco', 'blanca', 'perla', 'hueso', 'marfil', 'crema'],
  ['gris', 'plomo'],
  ['azul', 'navy', 'marino', 'noche'],
  ['beige', 'nude', 'camel', 'arena', 'crema'],
  ['celeste', 'celestito', 'bebe', 'cielo'],
  ['rosa', 'rosado', 'rosada', 'fucsia', 'palo'],
  ['verde', 'militar', 'olivo', 'esmeralda'],
  ['marron', 'cafe', 'chocolate'],
  ['morado', 'morada', 'lila', 'lavanda', 'purpura'],
  ['amarillo', 'mostaza'],
  ['naranja', 'coral'],
];
const nrm = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function coloresNoPedidos(colores, textos) {
  const t = ` ${nrm(textos.join(' ')).replace(/[^a-z0-9]+/g, ' ')} `;
  const has = (w) => w.length > 2 && t.includes(` ${w} `);
  const out = [];
  for (const c of String(colores || '').split(/,|\sy\s|\+|\/|;|\n/).map((x) => x.trim()).filter(Boolean)) {
    const ws = nrm(c).replace(/^\d+\s*(x\s*)?/, '').split(/[^a-z0-9]+/).filter((w) => w.length > 2);
    if (!ws.length) continue;
    const syn = new Set(ws);
    for (const g of COLOR_GRUPOS) if (ws.some((w) => g.includes(w))) g.forEach((x) => syn.add(x));
    if (![...syn].some(has)) out.push(c);
  }
  return out;
}

const LOCK_MS = 60 * 1000; // un candado más viejo que esto se considera abandonado
const newestIn = async (env, chatId) => (await env.DB.prepare("SELECT MAX(id) AS id FROM messages WHERE chat_id = ? AND direction = 'in'").bind(chatId).first())?.id || 0;

// Una sola respuesta de la IA a la vez por chat. Si otra está pensando, se espera a que termine;
// si esa ya leyó este mensaje, no se responde de nuevo (antes se cruzaban y salía «Estamos validando…»).
async function lockIA(env, chatId, msgId, maxWaitMs = 22000) {
  const t0 = Date.now();
  for (;;) {
    const r = await env.DB.prepare('UPDATE chats SET bot_lock = ? WHERE id = ? AND (bot_lock IS NULL OR bot_lock < ?)').bind(Date.now(), chatId, Date.now() - LOCK_MS).run();
    if (r.meta?.changes) {
      if (msgId) {
        const c = await env.DB.prepare('SELECT bot_seen FROM chats WHERE id = ?').bind(chatId).first();
        if ((c?.bot_seen || 0) >= msgId) {
          await unlockIA(env, chatId);
          return 'answered';
        }
      }
      return 'ok';
    }
    if (Date.now() - t0 > maxWaitMs) return 'busy';
    await sleep(1200);
  }
}
const unlockIA = (env, chatId) => env.DB.prepare('UPDATE chats SET bot_lock = NULL WHERE id = ?').bind(chatId).run();

async function runIA(env, store, chat, flow, node, settings, vars, triggerMsgId) {
  // Espera unos segundos por si la clienta manda varios mensajes seguidos
  const delay = chat.sim ? Math.min(Number(settings.ia_delay_s) || 0, 1) : Math.min(Math.max(Number(settings.ia_delay_s) || 0, 0), 20);
  if (delay) await sleep(delay * 1000);
  if (triggerMsgId) {
    const newer = await env.DB.prepare("SELECT id FROM messages WHERE chat_id = ? AND direction = 'in' AND id > ? LIMIT 1").bind(chat.id, triggerMsgId).first();
    if (newer) return { aborted: true };
  }
  if (chat.sim) return iaCore(env, store, chat, flow, node, settings, vars, true);
  const lk = await lockIA(env, chat.id, triggerMsgId);
  if (lk === 'answered') return { aborted: true }; // la otra respuesta ya incluyó este mensaje
  if (lk === 'busy') {
    // La otra respuesta demora: se reintenta en un minuto (el cron revisa si quedó algo sin responder)
    await env.DB.prepare(`INSERT INTO bot_jobs (store_id, chat_id, flow_id, kind, node_id, cancel_on, run_at, created_at) VALUES (?, ?, ?, 'ia_again', ?, 'none', ?, ?)`)
      .bind(store.id, chat.id, flow.id, node.id, now() + 30 * 1000, now()).run();
    return { aborted: true };
  }
  try {
    // Si la clienta escribió mientras la IA pensaba, se vuelve a pensar con todo junto (1 vez)
    const volvio = vars.__volvio;
    let r = await iaCore(env, store, chat, flow, node, settings, vars, false);
    if (r.redo) {
      if (volvio) vars.__volvio = volvio;
      chat = await env.DB.prepare('SELECT * FROM chats WHERE id = ?').bind(chat.id).first();
      r = await iaCore(env, store, chat, flow, node, settings, vars, true);
    }
    return r;
  } finally {
    await unlockIA(env, chat.id);
  }
}

async function iaCore(env, store, chat, flow, node, settings, vars, final) {
  const cap = Number(settings.ia_daily_cap) || 0;
  if (cap > 0) {
    const u = await env.DB.prepare('SELECT cost FROM ia_usage WHERE store_id = ? AND day = ?').bind(store.id, today(store.timezone)).first();
    if (u && u.cost >= cap) {
      await alertFor(env, store, chat, { kind: 'ia', chatId: null, title: `La IA llegó al tope de US$${cap} de hoy`, body: 'Las clientas pasan a la asesora hasta mañana, o sube el tope.', dedupe: true });
      return { ok: false };
    }
  }
  const limit = Math.min(Math.max(Number(settings.ia_history) || 50, 4), 100);
  const { results } = await env.DB.prepare(
    "SELECT id, direction, sender, type, body, transcript, media_key, media_mime FROM messages WHERE chat_id = ? AND sender != 'sys' ORDER BY id DESC LIMIT ?"
  ).bind(chat.id, limit).all();
  results.reverse();
  const seenId = results.filter((m) => m.direction === 'in').reduce((a, m) => Math.max(a, m.id), 0);
  const hist = historyFor(results);
  if (!hist.length) return { ok: false };
  // La clienta escribió justo mientras salían los mensajes de la respuesta anterior: su mensaje quedó ANTES de la
  // última burbuja y el historial termina en «assistant». Así la IA falla (no acepta terminar en su propio mensaje)
  // y salía «Estamos validando». Se le pasa lo que quedó sin responder como último mensaje de la clienta.
  let allowEmpty = false;
  if (hist[hist.length - 1].role === 'assistant') {
    if (chat.sim) return { ok: true };
    const seenBefore = (await env.DB.prepare('SELECT bot_seen FROM chats WHERE id = ?').bind(chat.id).first())?.bot_seen || 0;
    const pend = results.filter((m) => m.direction === 'in' && m.id > seenBefore).map((m) => String(m.transcript || m.body || '').trim() || '[archivo]');
    if (!pend.length) return { ok: true }; // ya estaba todo respondido
    hist.push({ role: 'user', text: `(Mensajes que escribió mientras le respondías: ${pend.map((t) => `«${clip(t, 200)}»`).join(' · ')}) Respóndelos ahora sin repetir lo que ya le dijiste. Si tu último mensaje ya los respondió, devuelve "mensajes": [].`, imgKey: null });
    allowEmpty = true;
  }
  // Lo que la clienta escribió desde la última respuesta (puede ser más de un mensaje)
  const lastOut = results.reduce((a, m, i) => (m.direction === 'out' ? i : a), -1);
  const nuevos = results.slice(lastOut + 1).filter((m) => m.direction === 'in').map((m) => String(m.transcript || m.body || '').trim()).filter(Boolean);
  // ¿Dijo su talla en estos mensajes? Se reconoce sin IA (igual que el paso de la talla) y no se le vuelve a preguntar
  const rec = Object.values(flow.graph?.nodes || {}).find((n) => n.type === 'recognize' && (n.var || 'talla') === 'talla');
  if (rec?.options?.length) {
    for (const t of [...nuevos].reverse()) {
      const v = t.length <= 40 ? recognize(t, rec.options) : null;
      if (v) {
        vars.talla = v;
        break;
      }
    }
  }
  const labels = await chatLabels(env, chat.id);
  // Su celular ya viene en su WhatsApp: no se le pide (si escribe con usuario sin número, sí)
  const celWa = chat.sim ? null : celularWa(chat.wa_id);
  if (celWa && !vars.celular) vars.celular = celWa;
  const { results: arows } = await env.DB.prepare('SELECT key FROM bot_assets WHERE store_id = ?').bind(store.id).all();
  let system = buildSystem(await withPlan(env, settings), node, labels, vars, arows.map((a) => a.key));
  system += `\n\n## CÓMO RESPONDER (reglas del sistema)
- Lee TODOS los mensajes de la clienta desde tu última respuesta${nuevos.length > 1 ? ` (esta vez son ${nuevos.length}: ${nuevos.map((t) => `«${clip(t, 80)}»`).join(', ')})` : ''} y respóndelos juntos, en orden, sin dejar ninguno.
- Los precios ya se los mandó el bot al inicio. Si pregunta el precio, contesta en 1 o 2 líneas (la promo o el precio de la cantidad que quiere) y sigue con el paso que toca. No repitas la tabla completa.
- Si pregunta qué talla le queda, pídele su talla de jean (o su peso y estatura) y recomiéndale una. No le muestres colores hasta saber su talla.
- Nunca digas «déjame confirmar», «te aviso en un momento» ni algo parecido: responde con lo que sabes. Si no tienes una sede en la lista, pregúntale su distrito o la ciudad más cercana.
- No digas «de nada» si no te agradeció.
- Si pregunta cómo pagar o a qué número yapear: en Lima con cobertura paga al recibir; para Shalom/provincia dale el adelanto con los datos de pago${settings.pay_yape ? ` (Yape / Plin: ${settings.pay_yape}${settings.pay_titular ? `, a nombre de ${settings.pay_titular}` : ''})` : ''}, aunque todavía no le hayas mandado el formulario. NUNCA digas que no tienes la información de pago ni que contacte a otra persona.`;
  if (vars.__volvio) {
    system += `\n\n## VOLVIÓ DESDE UN ANUNCIO NUEVO\nEsta clienta ya había conversado antes y volvió a escribir desde un anuncio. Salúdala con cariño como alguien que regresa (sin presentarte de nuevo), recuérdale en 1 línea lo que ya había elegido y retoma el paso pendiente con UNA pregunta. No le repitas precios ni fotos que ya vio.`;
  }
  delete vars.__volvio;
  delete vars.__primer;
  if (vars.talla) system += `\n\n## TALLA YA ELEGIDA: ${vars.talla}\nNO le vuelvas a preguntar la talla. Si todavía no vio los colores, muéstrale los de su talla${arows.some((a) => a.key === `colores-${vars.talla}`) ? ` (archivo colores-${vars.talla})` : ''} y pregúntale cuáles quiere.`;
  if (celWa) system += `\n\n## CELULAR DE LA CLIENTA: ${vars.celular}\nYa lo tenemos de su WhatsApp. NO se lo pidas: al pedir datos quita la línea «Celular:» (pide solo lo que falta) y en los formularios usa este número.`;
  // Agencias Shalom: solo provincia o Lima sin cobertura. Si tocó una de la lista, queda guardada exacta.
  let ag = {};
  try {
    ag = JSON.parse(chat.bot_ag || '{}') || {};
  } catch {}
  const ins = results.filter((m) => m.direction === 'in').map((m) => String(m.transcript || m.body || ''));
  const lastIn = (ins[ins.length - 1] || '').trim().toLowerCase();
  const tapped = (ag.opts || []).find((o) => o.t.toLowerCase() === lastIn);
  // ¿Ya mandó la captura del pago? (una foto o un PDF de la clienta)
  const hasCaptura = results.some((m) => m.direction === 'in' && (m.type === 'image' || m.type === 'document'));
  const datosOk = () => !!(String(vars.nombre || '').trim() && String(vars.dni || '').trim() && String(vars.celular || '').trim());
  if (tapped) {
    vars.sede_shalom = tapped.f;
    ag.chosen = tapped.f;
    system = system.replace('## DATOS YA GUARDADOS DE ESTA CLIENTA\n', `## DATOS YA GUARDADOS DE ESTA CLIENTA\nsede_shalom (la eligió de la lista): ${tapped.f} · `);
    system += `\n\n## LA CLIENTA ACABA DE ELEGIR SU AGENCIA: ${tapped.f}\nConfírmala en una línea y sigue con lo que falta: ${datosOk() ? 'ya tiene sus datos, así que envía el formulario Shalom con los datos de pago y pide la captura del adelanto' : 'primero pide sus datos (nombre y apellido, DNI y celular)'}. ${hasCaptura ? '' : 'Todavía NO envió la captura del pago: NO uses el caso yape_sede ni digas que tu compañera valida el pago.'}`;
  }
  let near = null;
  if (!vars.sede_shalom && settings.agencias_on !== 0) {
    // ¿Tocó una provincia/distrito de la lista anterior? Se usa esa zona tal cual
    const zona = (ag.zonas || []).find((z) => z.t.toLowerCase() === lastIn);
    if (zona) near = await agenciesIn(env, ag.nivel, zona.n, ag.dep).catch(() => null);
    // ¿Pidió Shalom / agencia (aunque sea de Lima)? Entonces también se le ofrecen agencias de Lima
    const quiereAgencia = /shalom|agencia|recoj|recog/i.test([...ins.slice(-4), vars.destino].filter(Boolean).join(' '));
    if (!near) near = await agenciesNear(env, [...ins.slice(-3), vars.destino, vars.distrito].filter(Boolean).join(' . '), cfgOf(store).sin_cobertura, quiereAgencia).catch(() => null);
    if (near && !datosOk()) {
      system += `\n\n## AGENCIA SHALOM: TODAVÍA NO\nLa clienta va por agencia (${near.lugar}). Primero pide sus datos (nombre y apellido, DNI y celular) en un solo mensaje. NO le preguntes la agencia ni la sede todavía: apenas dé sus datos, el sistema le manda la lista de agencias para tocar.`;
    } else if (near?.kind === 'agencias') {
      system += `\n\n## AGENCIAS SHALOM EN ${near.lugar} (lista real del sistema${near.total > near.agencias.length ? `, las ${near.agencias.length} primeras de ${near.total}` : ''})\n${near.agencias.map((a, i) => `${i + 1}. ${a.name} — ${a.address || ''}${a.horario ? ` · ${a.horario}` : ''}`).join('\n')}\nSi la clienta envía por agencia, ofrece SOLO estas, no inventes otras. Ya dio sus datos: ahora pregúntale en qué agencia recoge (el sistema le manda la lista para tocar justo después de tu mensaje: no la copies entera). NO envíes todavía el formulario ni los datos de pago: eso va cuando elija su agencia. Cuando elija, pon en "datos" sede_shalom con el nombre exacto.`;
    } else if (near?.kind === 'zonas') {
      system += `\n\n## AGENCIAS SHALOM EN ${near.lugar}\nHay ${near.total} agencias Shalom en ${near.lugar}: son demasiadas para ofrecerlas todas. Ya dio sus datos: ahora pregúntale en qué ${near.nivel} o ciudad está (por ejemplo: ${near.zonas.slice(0, 4).map((z) => z.name).join(', ')}). El sistema le manda la lista para tocar después de tu mensaje. No ofrezcas ninguna agencia todavía ni inventes direcciones.`;
    }
  }
  const caseIds = (node.cases || []).map((c) => c.id);
  // Billetera: una tienda de alumno sin saldo no llama a la IA (pasa a la asesora)
  const allow = await iaAllowed(env, store.id);
  if (!allow.ok) {
    await alertFor(env, store, chat, { kind: 'ia', title: 'Te quedaste sin saldo de IA', body: 'La IA no respondió y el chat pasó a tu asesora. Recarga tu saldo en Configuración → Mi plan → Saldo de IA.', dedupe: true });
    return { ok: false };
  }
  let reply = null;
  let lastErr = null;
  let colorFix = null;
  const lastInImage = results.length && results[results.length - 1].direction === 'in' && results[results.length - 1].type === 'image';
  // Hasta 2 intentos: si la IA no responde en el formato pedido, se le pide de nuevo. Nunca se manda texto raro.
  for (let attempt = 0; attempt < 2 && !reply; attempt++) {
    const h = attempt ? [...hist, { role: 'assistant', text: lastErr.raw || '(vacío)' }, { role: 'user', text: 'Tu respuesta anterior no vino en el formato pedido. Responde de nuevo SOLO con el JSON {"mensajes":[...],"caso":...,"datos":{...}}, sin nada antes ni después.' }] : hist;
    let out;
    try {
      out = await callModel(env, settings, system, h);
    } catch (e) {
      await alertFor(env, store, chat, { kind: 'ia', title: e.noKey ? 'Falta la clave de la IA' : 'La IA no pudo responder', body: e.message, dedupe: !!e.noKey });
      return { ok: false };
    }
    const price = IA_MODELS[out.model];
    const cost = (out.inTok * price.in + out.outTok * price.out) / 1e6;
    await env.DB.prepare(
      `INSERT INTO ia_usage (store_id, day, calls, in_tokens, out_tokens, cost) VALUES (?, ?, 1, ?, ?, ?)
       ON CONFLICT (store_id, day) DO UPDATE SET calls = calls + 1, in_tokens = in_tokens + excluded.in_tokens, out_tokens = out_tokens + excluded.out_tokens, cost = cost + excluded.cost`
    ).bind(store.id, today(store.timezone), out.inTok, out.outTok, cost).run();
    if (!settings.ia_secret || ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'].includes(settings.ia_secret)) await addSpend(env, price.provider, cost, store.timezone, store.id);
    const p = parseReply(out.text, caseIds);
    if (p.valid && (p.mensajes.length || p.caso || allowEmpty)) reply = p;
    else lastErr = { raw: clip(out.text, 1500) };
    // Candado de colores: si la IA armó el pedido con un color que la clienta nunca dijo, se le pide corregir (1 vez)
    if (reply && !colorFix && !lastInImage) {
      const extra = coloresNoPedidos(reply.datos?.colores, ins);
      if (extra.length) {
        colorFix = extra;
        hist.push({ role: 'assistant', text: clip(out.text, 1500) }, { role: 'user', text: `(Nota del sistema, no de la clienta) La clienta NO pidió: ${extra.join(', ')}. Corrige tu respuesta: usa SOLO los colores que ella dijo, sin sumar otros por tu cuenta. Si quiere más prendas, pregúntale cuáles. Responde de nuevo solo con el JSON.` });
        reply = null;
        attempt = -1;
      }
    }
  }
  // La clienta escribió mientras la IA pensaba: se vuelve a pensar con sus mensajes nuevos (no se manda una respuesta vieja)
  if (!final && (await newestIn(env, chat.id)) > seenId) return { redo: true };
  if (!chat.sim) await env.DB.prepare('UPDATE chats SET bot_seen = MAX(COALESCE(bot_seen, 0), ?) WHERE id = ?').bind(seenId, chat.id).run();
  if (!reply) {
    await alertFor(env, store, chat, { kind: 'ia', title: 'La IA respondió algo que no se puede mandar', body: 'No se envió nada a la clienta y pasó a la asesora. Respuesta de la IA: ' + clip(lastErr?.raw || '', 300) });
    return { ok: false };
  }
  // Nunca mandar a la clienta un dato de pago que falta llenar
  if (reply.mensajes.some((m) => /\[FALTA [A-Z]+\]/.test(m.texto || ''))) {
    await alertFor(env, store, chat, { kind: 'ia', title: 'Faltan los datos de pago en IA Suyon', body: 'La IA iba a mandar «[FALTA …]» a la clienta. No se envió y pasó a la asesora. Llénalos en Configuración → Bot Suyon AI → IA Suyon.', dedupe: !chat.sim });
    return { ok: false };
  }
  // Formulario de Shalom sin datos de pago: el sistema agrega el mensaje con el Yape (en Botcake la IA a veces lo olvidaba
  // y la clienta se quedaba lista para pagar sin saber a dónde)
  const yapeDig = String(settings.pay_yape || '').replace(/\D/g, '');
  if (yapeDig.length >= 6 && reply.mensajes.some((m) => /monto restante/i.test(m.texto || ''))) {
    const tieneYape = (t) => String(t || '').replace(/\D/g, '').includes(yapeDig);
    const yaSeMando = results.some((m) => m.direction === 'out' && tieneYape(m.body));
    if (!yaSeMando && !reply.mensajes.some((m) => tieneYape(m.texto))) {
      const adel = cfgOf(store).adelanto || 30;
      reply.mensajes.push({
        texto: `Separa solo con S/${adel} y enviamos tu pedido 🚚💕\n\n👉 Yape / Plin: ${settings.pay_yape}${settings.pay_titular ? `\nA nombre de: ${settings.pay_titular}` : ''}\n\nEnvíame la captura para separarlo 📦`,
      });
    }
  }
  // Si aun así quedó un color que no pidió, no se guarda en sus datos
  if (colorFix && reply.datos?.colores) {
    const still = coloresNoPedidos(reply.datos.colores, ins);
    if (still.length) reply.datos.colores = String(reply.datos.colores).split(/\s*,\s*|\s+y\s+/).filter((c) => !still.includes(c.trim())).join(', ');
  }
  for (const [k, v] of Object.entries(reply.datos)) if (v != null && String(v).trim()) vars[k] = clip(String(v), 200);
  fixIds(vars, lastIn);
  if (celWa && !vars.celular) vars.celular = celWa;
  if (ag.chosen) vars.sede_shalom = ag.chosen; // la elegida de la lista manda
  // «Yape + sede» solo vale con captura del pago, sede y datos: si falta algo, la IA sigue vendiendo (no pasa a la asesora)
  if (reply.caso === 'yape_sede' && !(hasCaptura && String(vars.sede_shalom || '').trim() && datosOk())) reply.caso = null;
  const cs = (node.cases || []).find((c) => c.id === reply.caso);
  const sendIt = !cs || cs.send_reply !== false;
  if (sendIt) {
    const sentMedia = new Set(results.filter((m) => m.direction === 'out' && m.media_key).map((m) => m.media_key));
    let first = true;
    for (const m of reply.mensajes) {
      if (!first) await sleep(900);
      first = false;
      const meta = { flowId: flow.id, node: node.id, sender: 'ia', vars: {} };
      // Cada archivo una sola vez por chat: si ya se mandó, no se repite
      if (m.archivo) {
        const a = await assetFor(env, store.id, String(m.archivo));
        if (!(a && sentMedia.has(a.r2_key))) {
          await botSend(env, store, chat, { kind: 'file', asset: String(m.archivo) }, meta);
          if (a) sentMedia.add(a.r2_key);
        }
      }
      if (String(m.texto || '').trim()) await botSend(env, store, chat, { kind: 'text', text: String(m.texto) }, meta);
    }
    // La lista de agencias sale recién cuando ya están TODOS sus datos (nombre, DNI y celular), una vez por lugar
    const key = near ? `${near.kind}:${near.lugar}` : null;
    if (near && !cs && !vars.sede_shalom && datosOk() && ag.lugar !== key) {
      await sleep(chat.sim ? 0 : 900);
      const meta2 = { flowId: flow.id, node: node.id, sender: 'bot', vars: {} };
      if (near.kind === 'agencias') {
        const opts = agencyOptions(near.agencias);
        await botSend(env, store, chat, {
          kind: 'text',
          text: `📍 Agencias Shalom en ${near.lugar}${near.total > opts.length ? ` (${opts.length} de ${near.total})` : ''}. Toca la que te queda mejor 👇`,
          opciones: opts.map((o) => (o.desc ? `${o.title} · ${o.desc}` : o.title)),
          boton: 'Ver agencias',
        }, meta2);
        ag = { lugar: key, opts: opts.map((o) => ({ t: o.title, f: o.full })) };
      } else {
        const max = near.zonas.length <= 3 ? 20 : 24;
        const zt = near.zonas.map((z) => ({ t: z.name.length > max ? `${z.name.slice(0, max - 1)}…` : z.name, n: z.name, c: z.count }));
        await botSend(env, store, chat, {
          kind: 'text',
          text: `📍 En ${near.lugar} tenemos ${near.total} agencias Shalom. ¿En qué ${near.nivel} estás? 👇${near.mas ? ' Si no está en la lista, escríbela.' : ''}`,
          opciones: zt.map((z) => `${z.t} · ${z.c} ${z.c === 1 ? 'agencia' : 'agencias'}`),
          boton: near.nivel === 'provincia' ? 'Elegir provincia' : 'Elegir distrito',
        }, meta2);
        ag = { lugar: key, nivel: near.nivel, dep: near.dep, zonas: zt.map(({ t, n }) => ({ t, n })) };
      }
    }
  }
  if (JSON.stringify(ag) !== (chat.bot_ag || '{}')) await env.DB.prepare('UPDATE chats SET bot_ag = ? WHERE id = ?').bind(JSON.stringify(ag), chat.id).run();
  // Si no responde, la IA sigue sola una vez
  if (!cs && Number(settings.ia_follow_min) > 0 && String(settings.ia_follow_text || '').trim()) {
    await env.DB.prepare(
      `INSERT INTO bot_jobs (store_id, chat_id, flow_id, kind, node_id, cancel_on, run_at, created_at) VALUES (?, ?, ?, 'ia_follow', ?, 'reply', ?, ?)`
    ).bind(store.id, chat.id, flow.id, node.id, fitWindow(now() + Number(settings.ia_follow_min) * MIN, 8, 22, store.timezone), now()).run(); // nunca de madrugada
  }
  return { ok: true, caseId: cs?.id || null };
}

// Prueba la IA desde Configuración sin mandar nada a WhatsApp
export async function testIA(env, store, flow, node, text) {
  const settings = await loadSettings(env, store.id);
  const { results: arows } = await env.DB.prepare('SELECT key FROM bot_assets WHERE store_id = ?').bind(store.id).all();
  const system = buildSystem(await withPlan(env, settings), node, [], {}, arows.map((a) => a.key));
  if (!(await iaAllowed(env, store.id)).ok) throw new HttpError(400, 'Te quedaste sin saldo de IA. Recarga en Configuración → Mi plan.');
  const out = await callModel(env, settings, system, [{ role: 'user', text }]);
  const r = parseReply(out.text, (node.cases || []).map((c) => c.id));
  return r.valid ? r : { mensajes: [], caso: null, datos: {}, error: 'La IA no respondió en el formato pedido (en un chat real se reintenta y, si falla, pasa a asesora).' };
}

// «Seguir» (botón del chat): el bot retoma la conversación y contesta lo que la clienta dejó sin responder
export async function seguirBot(env, ctx, store, chatId) {
  await env.DB.prepare("UPDATE chats SET bot_paused = 0, handler = 'bot', bot_lock = NULL, updated_at = ? WHERE id = ?").bind(now(), chatId).run();
  const chat = await env.DB.prepare('SELECT * FROM chats WHERE id = ?').bind(chatId).first();
  const last = await env.DB.prepare("SELECT id, direction, body, transcript FROM messages WHERE chat_id = ? AND sender != 'sys' ORDER BY id DESC LIMIT 1").bind(chatId).first();
  const pendiente = last?.direction === 'in';
  let flow = chat.bot_flow_id ? await loadFlow(env, chat.bot_flow_id) : null;
  if (!flow) {
    const f = await env.DB.prepare('SELECT id FROM bot_flows WHERE store_id = ? ORDER BY active DESC, id LIMIT 1').bind(store.id).first();
    flow = f ? await loadFlow(env, f.id) : null;
  }
  if (!flow) return { ok: true, respondio: false, motivo: 'Esta tienda no tiene flujo del bot.' };
  if (!pendiente) return { ok: true, respondio: false, motivo: 'El bot quedó activo. Responderá cuando la clienta escriba.' };
  if (!windowOpen(chat)) return { ok: true, respondio: false, motivo: 'La ventana de 24 h está cerrada: el bot responderá cuando la clienta escriba.' };
  const vars = JSON.parse(chat.bot_vars || '{}');
  const cur = nodeOf(flow, chat.bot_node);
  let from;
  if (cur && cur.type === 'send' && cur.wait && chat.bot_wait === 1) {
    // Estaba esperando una respuesta (ej. la talla): se usa lo último que escribió
    vars[cur.save_to || 'respuesta'] = String(last.transcript || last.body || '');
    from = cur.next;
  } else {
    // Si no, contesta la IA con toda la conversación
    from = (cur?.type === 'ia' ? cur : flow.graph.nodes.find((n) => n.type === 'ia'))?.id;
  }
  if (!from) return { ok: true, respondio: false, motivo: 'El bot quedó activo. Responderá cuando la clienta escriba.' };
  await env.DB.prepare('UPDATE chats SET bot_seen = MIN(COALESCE(bot_seen, 0), ?) WHERE id = ?').bind(last.id - 1, chatId).run();
  const job = runFrom(env, ctx, store, chatId, flow, from, vars, null).catch((e) => console.error('seguir', e));
  if (ctx?.waitUntil) ctx.waitUntil(job);
  else await job;
  return { ok: true, respondio: true };
}

/* ---------------- Cron: seguimientos y esperas ---------------- */

export async function runJob(env, j) {
  const store = await env.DB.prepare('SELECT * FROM stores WHERE id = ?').bind(j.store_id).first();
  const chat = await env.DB.prepare('SELECT * FROM chats WHERE id = ?').bind(j.chat_id).first();
  if (!store || !chat || chat.bot_paused) return;
  const sim = !!chat.sim;
  const settings = await loadSettings(env, j.store_id);
  if (!sim && (!settings.bot_on || store.status !== 'activo')) return;
  const flow = await loadFlow(env, j.flow_id);
  if (!flow || (!flow.active && !sim)) return;
  const vars = JSON.parse(chat.bot_vars || '{}');
  if (j.kind === 'seq') {
    const seq = (flow.graph.sequences || []).find((s) => s.id === j.seq_id);
    const st = seq?.steps?.[j.step];
    if (!st) return;
    const ok = await sendItems(env, store, chat, st.items, { flowId: flow.id, node: `seq:${seq.id}:${j.step}`, vars, gap: sim ? 0 : undefined });
    if (!ok) await cancelJobs(env, chat.id, seq.id); // ventana cerrada: no tiene sentido seguir
  } else if (j.kind === 'ia_follow') {
    await botSend(env, store, chat, { kind: 'text', text: settings.ia_follow_text }, { flowId: flow.id, node: `${j.node_id}:seguimiento`, sender: 'ia', vars });
  } else if (j.kind === 'ia_again') {
    // Quedó un mensaje sin responder porque otra respuesta de la IA estaba en curso
    if ((await newestIn(env, chat.id)) > (chat.bot_seen || 0) && j.node_id) await runFrom(env, null, store, chat.id, flow, j.node_id, vars, null);
  } else if (j.kind === 'resume') {
    await saveState(env, chat.id, { bot_wait: 0 });
    if (j.node_id) await runFrom(env, null, store, chat.id, flow, j.node_id, vars);
  }
}

export async function runJobs(env) {
  const { results: jobs } = await env.DB.prepare(
    'SELECT * FROM bot_jobs WHERE done_at IS NULL AND canceled_at IS NULL AND run_at <= ? ORDER BY run_at LIMIT 40'
  ).bind(now()).all();
  for (const j of jobs) {
    const claim = await env.DB.prepare('UPDATE bot_jobs SET done_at = ? WHERE id = ? AND done_at IS NULL AND canceled_at IS NULL').bind(now(), j.id).run();
    if (!claim.meta.changes) continue;
    try {
      await runJob(env, j);
    } catch (e) {
      console.error('job', j.id, e);
    }
  }
}

// Limpieza de seguimientos viejos: una vez al día (antes cada minuto y recorría toda la tabla)
export async function cleanJobs(env) {
  await env.DB.prepare('DELETE FROM bot_jobs WHERE (done_at IS NOT NULL OR canceled_at IS NOT NULL) AND created_at < ?').bind(now() - 30 * 864e5).run();
}

/* ---------------- Números por bloque ---------------- */

export async function flowStats(env, flowId) {
  const { results } = await env.DB.prepare(
    `SELECT bot_node AS node,
       COUNT(DISTINCT chat_id) AS sent,
       COUNT(DISTINCT CASE WHEN status IN ('delivered', 'read') THEN chat_id END) AS delivered,
       COUNT(DISTINCT CASE WHEN status = 'read' THEN chat_id END) AS read,
       COUNT(DISTINCT CASE WHEN status = 'failed' THEN chat_id END) AS failed,
       COUNT(DISTINCT CASE WHEN replied = 1 THEN chat_id END) AS replied
     FROM messages WHERE bot_flow_id = ? AND bot_node IS NOT NULL GROUP BY bot_node`
  ).bind(flowId).all();
  const { results: counts } = await env.DB.prepare('SELECT node_id, entered FROM bot_counts WHERE flow_id = ?').bind(flowId).all();
  const out = {};
  for (const r of results) out[r.node] = { sent: r.sent, delivered: r.delivered, read: r.read, failed: r.failed, replied: r.replied };
  for (const c of counts) (out[c.node_id] ||= {}).entered = c.entered;
  const fails = await env.DB.prepare(
    "SELECT bot_node AS node, error FROM messages WHERE bot_flow_id = ? AND status = 'failed' AND error IS NOT NULL GROUP BY bot_node ORDER BY MAX(id) DESC"
  ).bind(flowId).all();
  for (const f of fails.results) (out[f.node] ||= {}).last_error = f.error;
  return out;
}
