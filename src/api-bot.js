// API de Bot Suyon AI (Configuración → Herramientas) y de Avisos
import { Hono } from 'hono';
import { now, fail, clip, windowOpen, localDay } from './util.js';
import { storeFor, chatFor, requireUser } from './auth.js';
import { mediaKey } from './webhook.js';
import { kindForMime, SEND_RULES } from './whatsapp.js';
import {
  NODE_TYPES, IA_MODELS, PROMPT_VARS, entregaDia, loadSettings, loadFlow, flowStats, startFlow, cancelJobs, testIA, addLabel, onInbound, runJob, seguirBot,
} from './bot.js';
import { flowPantalon, flowCargo, PROMPT_CARGO, PROMPT_PANTALON, KNOWLEDGE_PANTALON, PROMPT_GENERICO, TEMPLATE_ASSETS, assetsFor, flowVentasCT, PROMPT_VENTAS_CT, KNOWLEDGE_VENTAS_CT } from './bot-template.js';

const r = new Hono();
const body = async (c) => {
  try {
    return await c.req.json();
  } catch {
    return {};
  }
};
const bump = (env, storeId) => env.DB.prepare('UPDATE stores SET rev = rev + 1 WHERE id = ?').bind(storeId).run();
const inList = (n) => Array(n).fill('?').join(',');
const today = (tz) => localDay(now(), tz);

/* ---------- Ajustes ---------- */

const SETTING_RULES = {
  bot_on: (v) => (v ? 1 : 0),
  audience: (v) => (v === 'todas' ? 'todas' : 'equipo'),
  test_numbers: (v) => clip(String(v || '').replace(/[^\d,;\s+]/g, ''), 400),
  ia_model: (v) => (IA_MODELS[v] ? v : fail(400, 'Ese modelo no existe.')),
  ia_secret: (v) => (/^[A-Z][A-Z0-9_]{2,40}$/.test(String(v || '')) ? v : fail(400, 'Nombre de secreto inválido (solo MAYÚSCULAS, números y _).')),
  ia_daily_cap: (v) => Math.min(Math.max(Number(v) || 0, 0), 500),
  ia_prompt: (v) => (v == null || v === '' ? null : String(v).slice(0, 40000)),
  ia_knowledge: (v) => (v == null ? null : String(v).slice(0, 40000)),
  ia_delay_s: (v) => Math.min(Math.max(Math.round(Number(v) || 0), 0), 20),
  ia_history: (v) => Math.min(Math.max(Math.round(Number(v) || 50), 4), 100),
  ia_follow_min: (v) => Math.min(Math.max(Math.round(Number(v) || 0), 0), 1440),
  ia_follow_text: (v) => clip(String(v || ''), 1000),
  ia_follow_auto: (v) => (v ? 1 : 0),
  pay_yape: (v) => clip(String(v || '').trim(), 40),
  pay_titular: (v) => clip(String(v || '').trim(), 80),
  pay_bcp: (v) => clip(String(v || '').trim(), 40),
  pay_cci: (v) => clip(String(v || '').trim(), 40),
  corte_h: (v) => Math.min(Math.max(Math.round(Number(v)), 0), 23) || 0,
  entrega_sab: (v) => (v ? 1 : 0),
  entrega_dom: (v) => (v ? 1 : 0),
  entrega_horario: (v) => clip(String(v || '').trim(), 60) || 'entre 2 y 8 p.m.',
  voz_on: (v) => (v ? 1 : 0),
};

export async function saveSettings(env, storeId, patch) {
  const cur = await loadSettings(env, storeId);
  const next = { ...cur };
  for (const [k, fn] of Object.entries(SETTING_RULES)) if (k in patch) next[k] = fn(patch[k]);
  // Si cambia de proveedor y el secreto era el de por defecto, se cambia también
  if ('ia_model' in patch && !('ia_secret' in patch) && ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'].includes(cur.ia_secret)) {
    next.ia_secret = IA_MODELS[next.ia_model].provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
  }
  const keys = Object.keys(SETTING_RULES);
  await env.DB.prepare(
    `INSERT INTO bot_settings (store_id, ${keys.join(', ')}, updated_at) VALUES (?, ${inList(keys.length)}, ?)
     ON CONFLICT (store_id) DO UPDATE SET ${keys.map((k) => `${k} = excluded.${k}`).join(', ')}, updated_at = excluded.updated_at`
  ).bind(storeId, ...keys.map((k) => next[k] ?? null), now()).run();
  return next;
}

r.get('/stores/:id/bot', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  const db = c.env.DB;
  const settings = await loadSettings(c.env, st.id);
  const { results: flows } = await db.prepare('SELECT id, name, active, updated_at FROM bot_flows WHERE store_id = ? ORDER BY id').bind(st.id).all();
  const { results: assets } = await db.prepare('SELECT id, key, name, mime, size, created_at FROM bot_assets WHERE store_id = ? ORDER BY key').bind(st.id).all();
  const { results: usage } = await db.prepare('SELECT day, calls, in_tokens, out_tokens, cost FROM ia_usage WHERE store_id = ? ORDER BY day DESC LIMIT 7').bind(st.id).all();
  const secretNames = [...new Set(['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', settings.ia_secret])];
  return c.json({
    settings: { ...settings, ia_prompt: settings.ia_prompt ?? (settings.__own ? PROMPT_PANTALON : PROMPT_GENERICO), ia_knowledge: settings.ia_knowledge ?? (settings.__own ? KNOWLEDGE_PANTALON : '') },
    flows,
    assets,
    template_assets: (st.asistente || !settings.__own
      ? assetsFor(st.rubro || 'ropa', JSON.parse(st.asistente || '{}').respuestas || {}).map((a) => [a.key, `${a.desc}${a.need === 'si' ? '' : ' (opcional)'}`])
      : TEMPLATE_ASSETS
    ).map(([key, desc]) => ({ key, desc, ok: assets.some((a) => a.key === key) })),
    rubro: st.rubro || 'ropa',
    asistente: !!st.asistente,
    secrets: Object.fromEntries(secretNames.map((n) => [n, !!c.env[n]])),
    usage,
    today: today(st.timezone),
    models: Object.entries(IA_MODELS).map(([id, m]) => ({ id, ...m })),
    prompt_vars: PROMPT_VARS,
    entrega_ahora: entregaDia(now(), settings.timezone, settings),
  });
});

r.patch('/stores/:id/bot/settings', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  const b = await body(c);
  if ('ia_prompt' in b && [PROMPT_PANTALON.trim(), PROMPT_GENERICO.trim()].includes(String(b.ia_prompt || '').trim())) b.ia_prompt = null;
  if ('ia_knowledge' in b && String(b.ia_knowledge || '').trim() === KNOWLEDGE_PANTALON.trim()) b.ia_knowledge = null;
  const s = await saveSettings(c.env, st.id, b);
  await bump(c.env, st.id);
  const own = (await loadSettings(c.env, st.id)).__own;
  return c.json({ settings: { ...s, ia_prompt: s.ia_prompt ?? (own ? PROMPT_PANTALON : PROMPT_GENERICO), ia_knowledge: s.ia_knowledge ?? (own ? KNOWLEDGE_PANTALON : '') } });
});

/* ---------- Flujos ---------- */

const ID_RE = /^[\w-]{1,40}$/;
const str = (v, n = 4000) => clip(String(v ?? ''), n);

function cleanOpts(it) {
  const o = (Array.isArray(it.opciones) ? it.opciones : []).map((x) => str(x, 96).trim()).filter(Boolean).slice(0, 10);
  if (!o.length) return {};
  return { opciones: o, ...(o.length > 3 && it.boton ? { boton: str(it.boton, 20) } : {}) };
}

function cleanItems(items) {
  return (Array.isArray(items) ? items : []).slice(0, 10).map((it) =>
    it?.kind === 'text' ? { kind: 'text', text: str(it.text, 4096), ...cleanOpts(it) } : { kind: ['image', 'video', 'audio', 'document', 'file'].includes(it?.kind) ? it.kind : 'file', asset: str(it?.asset, 60), ...(it?.caption ? { caption: str(it.caption, 1024) } : {}), ...(it?.opcional ? { opcional: true } : {}) }
  );
}

export function validateGraph(g) {
  if (!g || typeof g !== 'object' || !Array.isArray(g.nodes)) fail(400, 'El flujo no tiene bloques.');
  if (JSON.stringify(g).length > 400000) fail(400, 'El flujo es demasiado grande.');
  if (!g.nodes.length || g.nodes.length > 200) fail(400, 'Un flujo puede tener de 1 a 200 bloques.');
  const ids = new Set();
  const nodes = g.nodes.map((n) => {
    if (!n || !ID_RE.test(n.id || '')) fail(400, 'Hay un bloque con nombre interno inválido.');
    if (ids.has(n.id)) fail(400, `Hay dos bloques con el mismo nombre interno: ${n.id}.`);
    ids.add(n.id);
    if (!NODE_TYPES.includes(n.type)) fail(400, `Tipo de bloque desconocido: ${n.type}.`);
    const out = { ...n, title: str(n.title || '', 80), x: Math.round(Math.min(Math.max(Number(n.x) || 0, 0), 6000)), y: Math.round(Math.min(Math.max(Number(n.y) || 0, 0), 8000)) };
    if ('items' in n) out.items = cleanItems(n.items);
    return out;
  });
  const refs = ['next', 'next_other', 'next_error', 'next_no', 'target'];
  for (const n of nodes) {
    for (const k of refs) if (n[k] && !ids.has(n[k])) n[k] = null;
    for (const cs of n.cases || []) if (cs.next && !ids.has(cs.next)) cs.next = null;
    for (const o of n.options || []) if (o.next && !ids.has(o.next)) o.next = null;
  }
  const start = ids.has(g.start) ? g.start : nodes.find((n) => n.type === 'start')?.id || nodes[0].id;
  const sequences = (Array.isArray(g.sequences) ? g.sequences : []).slice(0, 20).map((s) => ({
    id: ID_RE.test(s?.id || '') ? s.id : 'seq' + Math.random().toString(36).slice(2, 7),
    name: str(s?.name || 'Seguimiento', 60),
    cancel_on: ['reply', 'image', 'none'].includes(s?.cancel_on) ? s.cancel_on : 'reply',
    steps: (Array.isArray(s?.steps) ? s.steps : []).slice(0, 20).map((st) => {
      const from = st?.from_h === '' || st?.from_h == null ? null : Math.min(Math.max(Number(st.from_h) || 0, 0), 23);
      const to = st?.to_h === '' || st?.to_h == null ? null : Math.min(Math.max(Number(st.to_h) || 0, 1), 24);
      return { after_min: Math.min(Math.max(Math.round(Number(st?.after_min) || 1), 1), 60 * 24 * 7), ...(from != null && to != null && from < to ? { from_h: from, to_h: to } : {}), items: cleanItems(st?.items) };
    }),
  }));
  return { v: 1, start, nodes, sequences };
}

async function flowFor(c, id, need = 'config') {
  const f = await loadFlow(c.env, Number(id));
  if (!f) fail(404, 'Ese flujo no existe.');
  const store = await storeFor(c, f.store_id, need);
  return { flow: f, store };
}

r.post('/stores/:id/bot/flows', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  const b = await body(c);
  // Las plantillas de Jordan (su prompt y su flujo de pantalones) solo en sus tiendas
  if (['pantalon', 'cargo', 'ventas_ct'].includes(b.template) && !(await requireUser(c)).is_admin) fail(403, 'Esa plantilla no está disponible. Usa «✨ Armar mi bot con preguntas».');
  const web = String(c.env.PUBLIC_URL || new URL(c.req.url).origin).replace(/\/+$/, '');
  const graph = b.template === 'pantalon'
    ? flowPantalon()
    : b.template === 'cargo'
    ? flowCargo()
    : b.template === 'ventas_ct'
    ? flowVentasCT(web)
    : { v: 1, start: 'inicio', nodes: [{ id: 'inicio', type: 'start', x: 360, y: 40, title: 'Clienta nueva', trigger: { new_chat: true, ads: 'all', ad_ids: [], keywords: [] }, labels: [], next: null }], sequences: [] };
  const name = str(b.name || ({ pantalon: 'Ventas pantalón', cargo: 'Ventas leggings cargo', ventas_ct: 'Ventas Control Total' }[b.template] || 'Flujo nuevo'), 60);
  // El cargo trae su prompt (con su abordaje y cierre). Reemplaza el de pantalón, el genérico, uno vacío o una versión anterior del cargo.
  if (b.template === 'cargo') {
    const cur = await loadSettings(c.env, st.id);
    if (!cur.ia_prompt || /Vendes los Leggings Cargo/.test(cur.ia_prompt) || [PROMPT_PANTALON, PROMPT_GENERICO].some((x) => cur.ia_prompt.trim() === x.trim())) await saveSettings(c.env, st.id, { ia_prompt: PROMPT_CARGO });
  }
  // La plantilla de Control Total trae su propio prompt (solo si la tienda no tiene uno propio)
  if (b.template === 'ventas_ct') {
    const cur = await loadSettings(c.env, st.id);
    if (!cur.ia_prompt || cur.ia_prompt.trim() === PROMPT_PANTALON.trim()) await saveSettings(c.env, st.id, { ia_prompt: PROMPT_VENTAS_CT, ia_knowledge: KNOWLEDGE_VENTAS_CT });
  }
  const res = await c.env.DB.prepare('INSERT INTO bot_flows (store_id, name, active, graph, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?)')
    .bind(st.id, name, JSON.stringify(validateGraph(graph)), now(), now()).run();
  await loadSettings(c.env, st.id).then((s) => (s.updated_at ? null : saveSettings(c.env, st.id, {})));
  return c.json({ id: res.meta.last_row_id });
});

r.get('/bot/flows/:id', async (c) => {
  const { flow } = await flowFor(c, c.req.param('id'));
  return c.json({ flow: { id: flow.id, store_id: flow.store_id, name: flow.name, active: flow.active, graph: flow.graph, updated_at: flow.updated_at }, stats: await flowStats(c.env, flow.id) });
});

r.put('/bot/flows/:id', async (c) => {
  const { flow, store } = await flowFor(c, c.req.param('id'));
  const b = await body(c);
  const sets = [];
  const vals = [];
  if ('name' in b) {
    sets.push('name = ?');
    vals.push(str(b.name, 60).trim() || flow.name);
  }
  if ('active' in b) {
    sets.push('active = ?');
    vals.push(b.active ? 1 : 0);
  }
  if ('graph' in b) {
    sets.push('graph = ?');
    vals.push(JSON.stringify(validateGraph(b.graph)));
  }
  if (sets.length) await c.env.DB.prepare(`UPDATE bot_flows SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).bind(...vals, now(), flow.id).run();
  if (b.active === false || b.active === 0) await c.env.DB.prepare('UPDATE bot_jobs SET canceled_at = ? WHERE flow_id = ? AND done_at IS NULL AND canceled_at IS NULL').bind(now(), flow.id).run();
  await bump(c.env, store.id);
  const f = await loadFlow(c.env, flow.id);
  return c.json({ flow: { id: f.id, name: f.name, active: f.active, graph: f.graph, updated_at: f.updated_at } });
});

r.delete('/bot/flows/:id', async (c) => {
  const { flow, store } = await flowFor(c, c.req.param('id'));
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE bot_jobs SET canceled_at = ? WHERE flow_id = ? AND done_at IS NULL').bind(now(), flow.id),
    c.env.DB.prepare('UPDATE chats SET bot_flow_id = NULL, bot_node = NULL, bot_wait = 0 WHERE bot_flow_id = ?').bind(flow.id),
    c.env.DB.prepare('DELETE FROM bot_counts WHERE flow_id = ?').bind(flow.id),
    c.env.DB.prepare('DELETE FROM bot_flows WHERE id = ?').bind(flow.id),
  ]);
  await bump(c.env, store.id);
  return c.json({ ok: true });
});

// Probar la IA sin mandar nada a WhatsApp
r.post('/bot/flows/:id/test-ia', async (c) => {
  const { flow, store } = await flowFor(c, c.req.param('id'));
  const b = await body(c);
  const node = flow.graph.nodes.find((n) => n.id === b.node && n.type === 'ia') || flow.graph.nodes.find((n) => n.type === 'ia');
  if (!node) fail(400, 'Este flujo no tiene bloque de IA.');
  const text = str(b.text, 2000).trim();
  if (!text) fail(400, 'Escribe un mensaje de prueba.');
  try {
    return c.json({ reply: await testIA(c.env, store, flow, node, text) });
  } catch (e) {
    fail(400, e.message);
  }
});

/* ---------- Archivos ---------- */

r.post('/stores/:id/bot/assets', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  const form = await c.req.formData();
  const file = form.get('file');
  const key = String(form.get('key') || '').trim();
  if (!/^[\w-]{1,40}$/.test(key)) fail(400, 'La clave solo puede tener letras, números y guiones (ej: colores-S).');
  if (!file || typeof file === 'string') fail(400, 'No llegó el archivo.');
  const mime = String(file.type || '').split(';')[0].toLowerCase() || 'application/octet-stream';
  const kind = kindForMime(mime);
  if (file.size > SEND_RULES[kind].max) fail(413, `El archivo pasa de ${Math.round(SEND_RULES[kind].max / 1048576)} MB.`);
  if (kind === 'document' && !/pdf/.test(mime)) fail(400, 'Usa foto JPG/PNG, video MP4, audio (MP3, M4A, OGG) o PDF.');
  const r2 = `s${st.id}/bot/${key}-${now()}`;
  await c.env.MEDIA.put(r2, await file.arrayBuffer(), { httpMetadata: { contentType: mime } });
  const old = await c.env.DB.prepare('SELECT r2_key FROM bot_assets WHERE store_id = ? AND key = ?').bind(st.id, key).first();
  await c.env.DB.prepare(
    `INSERT INTO bot_assets (store_id, key, name, mime, size, r2_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (store_id, key) DO UPDATE SET name = excluded.name, mime = excluded.mime, size = excluded.size, r2_key = excluded.r2_key, wa_media_id = NULL, wa_media_at = NULL, created_at = excluded.created_at`
  ).bind(st.id, key, clip(file.name || key, 120), mime, file.size, r2, now()).run();
  // El archivo viejo se guarda: los mensajes ya enviados lo siguen mostrando
  return c.json({ ok: true, replaced: !!old });
});

r.get('/bot/assets/:id', async (c) => {
  const a = await c.env.DB.prepare('SELECT * FROM bot_assets WHERE id = ?').bind(Number(c.req.param('id'))).first();
  if (!a) fail(404, 'No existe.');
  await storeFor(c, a.store_id, 'config');
  const obj = await c.env.MEDIA.get(a.r2_key);
  if (!obj) fail(404, 'El archivo ya no está guardado.');
  return new Response(obj.body, { headers: { 'Content-Type': a.mime, 'Cache-Control': 'private, max-age=86400' } });
});

r.delete('/bot/assets/:id', async (c) => {
  const a = await c.env.DB.prepare('SELECT * FROM bot_assets WHERE id = ?').bind(Number(c.req.param('id'))).first();
  if (!a) fail(404, 'No existe.');
  await storeFor(c, a.store_id, 'config');
  await c.env.DB.prepare('DELETE FROM bot_assets WHERE id = ?').bind(a.id).run();
  return c.json({ ok: true });
});

/* ---------- El bot en un chat ---------- */

r.post('/chats/:id/bot', async (c) => {
  const { chat, store } = await chatFor(c, c.req.param('id'));
  const b = await body(c);
  const db = c.env.DB;
  if (b.action === 'pause') {
    await cancelJobs(c.env, chat.id);
    await db.prepare("UPDATE chats SET bot_paused = 1, handler = 'asesora', updated_at = ? WHERE id = ?").bind(now(), chat.id).run();
  } else if (b.action === 'clear') {
    // Borra lo que hizo el bot en este chat: datos guardados, paso y seguimientos (no toca la conversación)
    await cancelJobs(c.env, chat.id);
    await db.prepare('UPDATE chats SET bot_flow_id = NULL, bot_node = NULL, bot_wait = 0, bot_vars = NULL, bot_ag = NULL, updated_at = ? WHERE id = ?').bind(now(), chat.id).run();
  } else if (b.action === 'resume' || b.action === 'seguir') {
    const r = await seguirBot(c.env, c.executionCtx, store, chat.id);
    await bump(c.env, store.id);
    return c.json(r);
  } else if (b.action === 'start') {
    const f = b.flow_id
      ? await db.prepare('SELECT id FROM bot_flows WHERE id = ? AND store_id = ?').bind(Number(b.flow_id), store.id).first()
      : await db.prepare('SELECT id FROM bot_flows WHERE store_id = ? ORDER BY active DESC, id LIMIT 1').bind(store.id).first();
    if (!f) fail(400, 'Esta tienda todavía no tiene flujos. Créalo en Configuración → Bot Suyon AI.');
    if (!windowOpen(chat)) fail(409, 'La ventana de 24 h de este chat está cerrada: pide a la clienta (o a tu número de prueba) que escriba primero.');
    const flow = await loadFlow(c.env, f.id);
    flow.active = 1; // desde aquí se puede probar aunque el flujo esté apagado
    c.executionCtx.waitUntil(startFlow(c.env, c.executionCtx, store, chat.id, flow).catch((e) => console.error('bot start', e)));
  } else fail(400, 'Acción desconocida.');
  await bump(c.env, store.id);
  return c.json({ ok: true });
});

// Cuando la asesora escribe a mano en un chat del bot, el bot se pausa (para no responder los dos)
export async function pauseForHuman(env, chat) {
  if (chat.handler !== 'bot' || chat.bot_paused) return;
  await cancelJobs(env, chat.id);
  await env.DB.prepare("UPDATE chats SET bot_paused = 1, handler = 'asesora' WHERE id = ?").bind(chat.id).run();
}

/* ---------- Avisos ---------- */

const PEND_COLS = 'c.id, c.wa_id, c.name, c.profile_name, c.last_preview, c.last_msg_at, c.last_dir, c.unread';
// La asesora tiene algo pendiente si el último mensaje del chat no es suyo
const NEEDS_ASESORA = `COALESCE((SELECT sender FROM messages WHERE chat_id = c.id ORDER BY id DESC LIMIT 1), 'cli') NOT IN ('ase', 'cel')`;

export async function pendingCounts(db, storeIds) {
  if (!storeIds.length) return {};
  const [{ results: ev }, { results: ase }] = await Promise.all([db.prepare(
    `SELECT store_id, COUNT(*) AS n FROM notifications WHERE read_at IS NULL AND store_id IN (${inList(storeIds.length)}) GROUP BY store_id`
  ).bind(...storeIds).all(), db.prepare(
    // Solo chats con movimiento en los últimos 7 días (usa el índice por tienda y fecha; antes recorría TODOS los chats con ASESOR)
    `SELECT c.store_id, COUNT(*) AS n FROM chats c
     WHERE c.store_id IN (${inList(storeIds.length)}) AND c.last_msg_at > ? AND c.sim = 0
       AND EXISTS (SELECT 1 FROM chat_labels cl JOIN labels l ON l.id = cl.label_id WHERE cl.chat_id = c.id AND l.name = 'ASESOR')
       AND ${NEEDS_ASESORA} GROUP BY c.store_id`
  ).bind(...storeIds, now() - 7 * 864e5).all()]);
  const out = {};
  for (const x of ev) out[x.store_id] = (out[x.store_id] || 0) + x.n;
  for (const x of ase) out[x.store_id] = (out[x.store_id] || 0) + x.n;
  return out;
}

r.get('/stores/:id/avisos', async (c) => {
  const st = await storeFor(c, c.req.param('id'));
  const db = c.env.DB;
  const byLabel = async (name, onlyIn = false) =>
    (await db.prepare(
      `SELECT ${PEND_COLS}, cl.created_at AS since FROM chats c JOIN chat_labels cl ON cl.chat_id = c.id JOIN labels l ON l.id = cl.label_id
       WHERE c.store_id = ? AND c.sim = 0 AND l.name = ? ${onlyIn ? 'AND ' + NEEDS_ASESORA : ''} ORDER BY COALESCE(c.last_msg_at, c.created_at) DESC LIMIT 100`
    ).bind(st.id, name).all()).results;
  const { results: events } = await db.prepare(
    'SELECT id, kind, chat_id, title, body, created_at, read_at FROM notifications WHERE store_id = ? ORDER BY id DESC LIMIT 100'
  ).bind(st.id).all();
  return c.json({
    pending: { asesora: await byLabel('ASESOR', true), yape: await byLabel('YAPE PENDIENTE'), agendar: await byLabel('LIMA PENDIENTE') },
    events,
  });
});

r.post('/stores/:id/avisos/read', async (c) => {
  const st = await storeFor(c, c.req.param('id'));
  const b = await body(c);
  if (b.id) await c.env.DB.prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND store_id = ? AND read_at IS NULL').bind(now(), Number(b.id), st.id).run();
  else await c.env.DB.prepare('UPDATE notifications SET read_at = ? WHERE store_id = ? AND read_at IS NULL').bind(now(), st.id).run();
  await bump(c.env, st.id);
  return c.json({ ok: true });
});

/* ---------- Llamadas (franja arriba de los chats) ---------- */

const CALL_LABELS = ['YAPE PENDIENTE', 'LIMA PENDIENTE', 'ATENDER PENDIENTE'];

r.get('/stores/:id/llamadas', async (c) => {
  const st = await storeFor(c, c.req.param('id'));
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.wa_id, c.name, c.profile_name, c.last_preview, c.last_msg_at, l.name AS label, cl.created_at AS since,
       (SELECT result FROM calls WHERE chat_id = c.id AND created_at >= cl.created_at ORDER BY id DESC LIMIT 1) AS last_result,
       (SELECT created_at FROM calls WHERE chat_id = c.id AND created_at >= cl.created_at ORDER BY id DESC LIMIT 1) AS last_at,
       (SELECT u.name FROM calls x LEFT JOIN users u ON u.id = x.user_id WHERE x.chat_id = c.id AND x.created_at >= cl.created_at ORDER BY x.id DESC LIMIT 1) AS last_by,
       (SELECT COUNT(*) FROM calls WHERE chat_id = c.id AND created_at >= cl.created_at) AS tries
     FROM chats c JOIN chat_labels cl ON cl.chat_id = c.id JOIN labels l ON l.id = cl.label_id
     WHERE c.store_id = ? AND c.sim = 0 AND l.name IN ('YAPE PENDIENTE', 'LIMA PENDIENTE', 'ATENDER PENDIENTE') ORDER BY cl.created_at DESC LIMIT 300`
  ).bind(st.id).all();
  return c.json({ t: now(), calls: results });
});

r.post('/chats/:id/llamada', async (c) => {
  const { chat, store } = await chatFor(c, c.req.param('id'));
  const u = await requireUser(c);
  const b = await body(c);
  if (!['cerro', 'lo_piensa', 'no_contesto'].includes(b.result)) fail(400, 'Elige el resultado de la llamada.');
  const label = CALL_LABELS.includes(b.label) ? b.label : null;
  const db = c.env.DB;
  await db.prepare('INSERT INTO calls (store_id, chat_id, label, result, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(store.id, chat.id, label, b.result, u.id, now()).run();
  if (b.result === 'cerro') {
    // Cerró: sale de la franja. Lima → ✅ LIMA · Yape → COMPRÓ
    const names = label ? [label] : CALL_LABELS.slice(0, 2);
    await db.prepare(`DELETE FROM chat_labels WHERE chat_id = ? AND label_id IN (SELECT id FROM labels WHERE store_id = ? AND name IN (${inList(names.length)}))`)
      .bind(chat.id, store.id, ...names).run();
    if (!label || label === 'LIMA PENDIENTE') await addLabel(c.env, store.id, chat.id, '✅ LIMA');
    if (label === 'YAPE PENDIENTE') await addLabel(c.env, store.id, chat.id, 'COMPRÓ');
  }
  await db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').bind(now(), chat.id).run();
  await bump(c.env, store.id);
  return c.json({ ok: true });
});

/* ---------- Simulador: chatea con el bot como si fueras clienta (no usa WhatsApp) ---------- */

async function simChat(c, st) {
  const u = await requireUser(c);
  const wa = 'sim' + u.id;
  const db = c.env.DB;
  await db.prepare(`INSERT OR IGNORE INTO chats (store_id, wa_id, name, sim, handler, created_at, updated_at) VALUES (?, ?, 'Simulador', 1, 'bot', ?, ?)`)
    .bind(st.id, wa, now(), now()).run();
  return db.prepare('SELECT * FROM chats WHERE store_id = ? AND wa_id = ?').bind(st.id, wa).first();
}

function parseExtra(x) {
  try {
    return x ? JSON.parse(x) : null;
  } catch {
    return null;
  }
}

async function simState(env, chatId) {
  const db = env.DB;
  const chat = await db.prepare('SELECT * FROM chats WHERE id = ?').bind(chatId).first();
  const { results: messages } = await db.prepare(
    'SELECT id, direction, sender, type, body, media_mime, media_key, bot_node, extra, created_at FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT 200'
  ).bind(chatId).all();
  const { results: labels } = await db.prepare('SELECT l.name, l.color FROM chat_labels cl JOIN labels l ON l.id = cl.label_id WHERE cl.chat_id = ?').bind(chatId).all();
  const { results: jobs } = await db.prepare(
    'SELECT id, kind, seq_id, step, node_id, run_at, flow_id FROM bot_jobs WHERE chat_id = ? AND done_at IS NULL AND canceled_at IS NULL ORDER BY run_at'
  ).bind(chatId).all();
  let flow = null;
  if (chat.bot_flow_id) flow = await loadFlow(env, chat.bot_flow_id);
  const node = flow && chat.bot_node ? flow.graph.nodes.find((n) => n.id === chat.bot_node) : null;
  return {
    chat: { id: chat.id, flow_id: chat.bot_flow_id, node: chat.bot_node, node_title: node?.title || null, wait: chat.bot_wait, paused: chat.bot_paused, vars: JSON.parse(chat.bot_vars || '{}') },
    messages: messages.reverse().map((m) => ({ ...m, media: !!m.media_key, media_key: undefined, extra: parseExtra(m.extra) })),
    labels,
    jobs: jobs.map((j) => {
      const seq = flow?.graph.sequences?.find((s) => s.id === j.seq_id);
      const label = j.kind === 'seq' ? `${seq?.name || 'Seguimiento'} · mensaje ${j.step + 1}` : j.kind === 'ia_follow' ? 'Seguimiento de la IA' : 'Espera de tiempo';
      return { id: j.id, label, run_at: j.run_at };
    }),
  };
}

r.get('/stores/:id/sim', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  const chat = await simChat(c, st);
  return c.json(await simState(c.env, chat.id));
});

r.post('/stores/:id/sim/reset', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  const b = await body(c);
  const chat = await simChat(c, st);
  const db = c.env.DB;
  await db.batch([
    db.prepare('UPDATE bot_jobs SET canceled_at = ? WHERE chat_id = ? AND done_at IS NULL').bind(now(), chat.id),
    db.prepare('DELETE FROM messages WHERE chat_id = ?').bind(chat.id),
    db.prepare('DELETE FROM chat_labels WHERE chat_id = ?').bind(chat.id),
    db.prepare(`UPDATE chats SET bot_flow_id = NULL, bot_node = NULL, bot_wait = 0, bot_vars = NULL, bot_ag = NULL, bot_paused = 0, handler = 'bot',
      ad_id = 'SIMULADOR', referral_at = ?, last_inbound_at = ?, first_reply_at = NULL, updated_at = ? WHERE id = ?`).bind(now(), now(), now(), chat.id),
  ]);
  const f = b.flow_id ? await loadFlow(c.env, Number(b.flow_id)) : null;
  if (!f || f.store_id !== st.id) fail(400, 'Elige un flujo de esta tienda.');
  f.active = 1;
  await startFlow(c.env, c.executionCtx, st, chat.id, f);
  return c.json(await simState(c.env, chat.id));
});

r.post('/stores/:id/sim/send', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  const chat = await simChat(c, st);
  const db = c.env.DB;
  let type = 'text';
  let text = '';
  let file = null;
  if ((c.req.header('content-type') || '').includes('multipart/form-data')) {
    const form = await c.req.formData();
    file = form.get('file');
    text = String(form.get('text') || '').trim();
    if (file && typeof file !== 'string') {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) fail(400, 'En el simulador solo se pueden mandar fotos (JPG o PNG).');
      if (file.size > 5 * 1048576) fail(413, 'La foto pasa de 5 MB.');
      type = 'image';
    } else file = null;
  } else text = String((await body(c)).text || '').trim();
  if (!text && !file) fail(400, 'Escribe un mensaje.');
  const t = now();
  const ins = await db.prepare(
    `INSERT INTO messages (chat_id, store_id, direction, sender, type, body, media_mime, media_status, created_at, updated_at) VALUES (?, ?, 'in', 'cli', ?, ?, ?, ?, ?, ?)`
  ).bind(chat.id, st.id, type, clip(text, 4000) || null, file ? file.type : null, file ? 'ok' : null, t, t).run();
  const msgId = ins.meta.last_row_id;
  if (file) {
    const key = mediaKey(st.id, chat.id, msgId);
    await c.env.MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
    await db.prepare('UPDATE messages SET media_key = ? WHERE id = ?').bind(key, msgId).run();
  }
  await db.prepare("UPDATE chats SET last_inbound_at = ?, last_msg_at = ?, last_dir = 'in', updated_at = ? WHERE id = ?").bind(t, t, t, chat.id).run();
  await onInbound(c.env, c.executionCtx, st, chat.id, { id: msgId, type, body: text }, { sim: true });
  return c.json(await simState(c.env, chat.id));
});

// Adelanta el siguiente seguimiento programado (como si la clienta no hubiera respondido)
r.post('/stores/:id/sim/next', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  const chat = await simChat(c, st);
  const j = await c.env.DB.prepare('SELECT * FROM bot_jobs WHERE chat_id = ? AND done_at IS NULL AND canceled_at IS NULL ORDER BY run_at LIMIT 1').bind(chat.id).first();
  if (!j) fail(400, 'No hay seguimientos pendientes.');
  await c.env.DB.prepare('UPDATE bot_jobs SET done_at = ? WHERE id = ?').bind(now(), j.id).run();
  await runJob(c.env, j);
  return c.json(await simState(c.env, chat.id));
});

export default r;
