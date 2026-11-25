// Webhook de Meta: mensajes entrantes, estados de entrega y ecos de la app del celular
import { now, hmacSha256hex, safeEqual, clip } from './util.js';
import { downloadMedia, friendlyMetaError } from './whatsapp.js';
import { onInbound, notify, loadSettings, marcarListo, addLabel } from './bot.js';
import { transcribe } from './voz.js';
import { handleOrderReply } from './automations.js';
import { handleProvinciaStep } from './provincia.js';

const MEDIA_TYPES = ['image', 'audio', 'video', 'document', 'sticker'];
const STATUS_RANK = { sending: 0, sent: 1, delivered: 2, read: 3 };

export async function verifySignature(env, raw, header) {
  if (!env.META_APP_SECRET) return { ok: false, reason: 'Falta META_APP_SECRET' };
  const expected = 'sha256=' + (await hmacSha256hex(env.META_APP_SECRET, raw));
  return { ok: safeEqual(expected, header || ''), reason: 'Firma inválida' };
}

export async function logWebhook(env, kind, phoneNumberId, detail) {
  try {
    await env.DB.prepare('INSERT INTO webhook_log (received_at, kind, phone_number_id, detail) VALUES (?, ?, ?, ?)')
      .bind(now(), kind, phoneNumberId || null, clip(typeof detail === 'string' ? detail : JSON.stringify(detail), 2000))
      .run();
  } catch {}
}

// Texto corto para la lista de chats y para guardar en el mensaje
export function describe(msg) {
  const t = msg.type;
  switch (t) {
    case 'text':
      return msg.text?.body || '';
    case 'image':
    case 'video':
    case 'document':
      return msg[t]?.caption || '';
    case 'audio':
    case 'sticker':
      return '';
    case 'location': {
      const l = msg.location || {};
      return [l.name, l.address].filter(Boolean).join(' · ') || 'Ubicación';
    }
    case 'contacts':
      return (msg.contacts || [])
        .map((x) => [x.name?.formatted_name, ...(x.phones || []).map((p) => p.phone)].filter(Boolean).join(' '))
        .join('\n');
    case 'interactive':
      return msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || msg.interactive?.nfm_reply?.body || '';
    case 'button':
      return msg.button?.text || '';
    case 'order':
      return `Pedido del catálogo (${(msg.order?.product_items || []).length} productos)`;
    case 'system':
      return msg.system?.body || 'Aviso de WhatsApp';
    case 'media_placeholder':
      return '📎 Archivo del celular (llega en un momento)';
    default:
      // Coexistencia: mensaje que solo se puede ver en la app del celular
      if ((msg.errors || []).some((e) => Number(e.code) === 131060)) return 'Este mensaje solo se ve en tu app WhatsApp Business del celular';
      return 'Mensaje que el CRM todavía no puede mostrar';
  }
}

export function preview(type, body) {
  const label = { image: '📷 Foto', video: '🎥 Video', audio: '🎤 Audio', document: '📄 Documento', sticker: 'Sticker', location: '📍 Ubicación', contacts: '👤 Contacto' }[type];
  const b = (body || '').split('\n')[0];
  return clip(label ? (b ? `${label}: ${b}` : label) : b, 120);
}

function extraFor(msg) {
  const x = {};
  if (msg.type === 'location') x.location = msg.location;
  if (msg.type === 'sticker') x.animated = msg.sticker?.animated;
  if (msg.type === 'audio') x.voice = msg.audio?.voice;
  if (msg.referral) x.referral = msg.referral;
  if (msg.context?.referred_product) x.product = msg.context.referred_product;
  if (msg.type === 'order') x.order = msg.order;
  if (msg.errors) x.errors = msg.errors;
  return Object.keys(x).length ? JSON.stringify(x) : null;
}

export async function processWebhook(env, payload, ctx) {
  if (payload?.object !== 'whatsapp_business_account') return;
  const storeCache = new Map();
  const touched = new Set();

  const storeByPhoneId = async (pid) => {
    if (!storeCache.has(pid)) {
      storeCache.set(pid, await env.DB.prepare('SELECT * FROM stores WHERE phone_number_id = ?').bind(pid).first());
    }
    return storeCache.get(pid);
  };

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      // Cambios de la cuenta (no traen número): desconexión desde la app del celular, etc.
      if (change.field === 'account_update') {
        await handleAccountUpdate(env, entry, v);
        continue;
      }
      const pid = v.metadata?.phone_number_id;
      if (!pid) continue;
      const store = await storeByPhoneId(pid);
      if (!store) {
        await logWebhook(env, 'tienda_desconocida', pid, { field: change.field, numero: v.metadata?.display_phone_number });
        continue;
      }
      touched.add(store.id);

      if (change.field === 'messages') {
        const names = Object.fromEntries((v.contacts || []).map((ct) => [ct.wa_id, ct.profile?.name]));
        for (const msg of v.messages || []) await handleInbound(env, ctx, store, msg, names[msg.from]);
        for (const st of v.statuses || []) await handleStatus(env, store, st);
        for (const err of v.errors || []) await logWebhook(env, 'error_meta', pid, err);
      } else if (change.field === 'smb_message_echoes') {
        for (const msg of v.message_echoes || []) await handleEcho(env, ctx, store, msg);
      } else if (change.field === 'history') {
        // Puede ser grande (miles de mensajes): se guarda después de responder a Meta
        const job = handleHistory(env, ctx, store, v).catch(async (e) => {
          console.error('history', e);
          await logWebhook(env, 'error_historial', pid, e.message);
        });
        if (ctx?.waitUntil) ctx.waitUntil(job);
        else await job;
      } else if (change.field === 'smb_app_state_sync') {
        await handleStateSync(env, store, v);
      } else {
        await logWebhook(env, 'campo_' + change.field, pid, v);
      }
    }
  }

  if (touched.size) {
    const ids = [...touched];
    await env.DB.prepare(`UPDATE stores SET rev = rev + 1, last_webhook_at = ? WHERE id IN (${ids.map(() => '?').join(',')})`)
      .bind(now(), ...ids)
      .run();
  }
}

async function upsertChat(env, store, waId, profileName, firstAt) {
  const t = now();
  await env.DB.prepare(
    `INSERT INTO chats (store_id, wa_id, name, profile_name, created_at, updated_at)
     VALUES (?, ?, (SELECT name FROM wa_contacts WHERE store_id = ? AND wa_id = ?), ?, ?, ?)
     ON CONFLICT (store_id, wa_id) DO UPDATE SET profile_name = COALESCE(excluded.profile_name, chats.profile_name)`
  ).bind(store.id, waId, store.id, waId, profileName || null, Math.min(firstAt || t, t), t).run();
  return env.DB.prepare('SELECT * FROM chats WHERE store_id = ? AND wa_id = ?').bind(store.id, waId).first();
}

async function handleInbound(env, ctx, store, msg, profileName) {
  if (msg.type === 'reaction') return handleReaction(env, ctx, store, msg);
  const t = msg.timestamp ? Number(msg.timestamp) * 1000 : now();
  const chat = await upsertChat(env, store, msg.from, profileName, t);
  const isMedia = MEDIA_TYPES.includes(msg.type);
  const media = isMedia ? msg[msg.type] || {} : {};
  const body = describe(msg);

  const ins = await env.DB.prepare(
    `INSERT OR IGNORE INTO messages (chat_id, store_id, wamid, direction, sender, type, body, media_id, media_mime, media_name, media_status, context_wamid, extra, created_at, updated_at)
     VALUES (?, ?, ?, 'in', 'cli', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    chat.id, store.id, msg.id, msg.type, body,
    media.id || null, media.mime_type || null, media.filename || null, isMedia ? 'pending' : null,
    msg.context?.id || null, extraFor(msg), t, now()
  ).run();
  if (!ins.meta.changes) return; // Meta reenvió un aviso que ya teníamos
  const msgId = ins.meta.last_row_id;

  const ref = msg.referral;
  const sets = ['last_msg_at = ?', 'last_preview = ?', "last_dir = 'in'", 'last_inbound_at = ?', 'unread = unread + 1', 'updated_at = ?'];
  const vals = [t, preview(msg.type, body), t, now()];
  if (ref) {
    sets.push('ad_id = ?', 'ad_headline = ?', 'ad_source_url = ?', 'ctwa_clid = ?', 'referral_at = ?', 'referral_json = ?', 'first_reply_at = NULL');
    vals.push(ref.source_id || null, ref.headline || null, ref.source_url || null, ref.ctwa_clid || null, t, JSON.stringify(ref));
  }
  await env.DB.prepare(`UPDATE chats SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, chat.id).run();

  // Bot Suyon AI: corre después de responder a Meta (las fotos se bajan primero para que la IA pueda verlas)
  const work = (async () => {
    if (isMedia && media.id) await fetchMediaToR2(env, store, { id: msgId, chat_id: chat.id, media_id: media.id }).catch(() => {});
    // Nota de voz → texto (si hay clave de OpenAI y está encendido): el bot y la IA usan lo que dijo
    let said = body;
    if (msg.type === 'audio' && media.id) {
      const vs = await loadSettings(env, store.id).catch(() => null);
      if (vs?.voz_on) said = (await transcribe(env, store, msgId, { notify })) || body;
    }
    try {
      const payload = msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id || msg.button?.payload || null;
      // Respuesta a «¿Confirmas tu pedido?»: la maneja Pedidos, no el bot
      if (await handleOrderReply(env, store, chat, { type: msg.type, body: said, payload })) return;
      // Captura del pago con todos sus datos → 📌 arriba (aunque el bot esté en pausa)
      if (msg.type === 'image' || msg.type === 'document') await marcarListo(env, chat.id).catch((e) => console.error('listo', e));
      // Pedido de Shopify por Shalom: DNI → agencia → adelanto
      if (await handleProvinciaStep(env, store, chat, { type: msg.type, body: said, payload })) return;
      // Tienda por Shopify: el bot no contesta (para no gastar). Lo que pregunte queda ATENDER PENDIENTE para la asesora
      // (un «gracias», «ok» o un emoji no cuenta)
      if (store.canal === 'shopify') {
        const trivial = msg.type === 'reaction' || msg.type === 'sticker' || /^(gracias|muchas gracias|ok|okey|okay|listo|perfecto|genial|de nada|bendiciones|👍|🙏|❤️|😊|🥰|🙌|ya)[\s.!]*$/i.test(String(said || '').trim());
        if (!trivial) await addLabel(env, store.id, chat.id, 'ATENDER PENDIENTE');
        return;
      }
      await onInbound(env, ctx, store, chat.id, { id: msgId, type: msg.type, body: said, payload, fromAd: !!msg.referral });
    } catch (e) {
      console.error('bot', e);
      await notify(env, store.id, { kind: 'error', chatId: chat.id, title: 'El bot tuvo un error', body: e.message }).catch(() => {});
    }
  })();
  if (ctx?.waitUntil) ctx.waitUntil(work);
  else await work;
}

// Reacciones que cuentan como «sí» (ej. la clienta pone 👍 o ❤️ al formulario en vez de escribir)
const REACCION_SI = new Set(['👍', '👍🏻', '👍🏼', '👍🏽', '👍🏾', '👍🏿', '❤️', '❤', '♥️', '🥰', '😍', '😘', '👌', '✅', '🙏', '💕', '💖', '🫶', '💯', '😊']);

async function handleReaction(env, ctx, store, msg) {
  const r = msg.reaction || {};
  if (!r.message_id) return;
  const res = await env.DB.prepare(
    `UPDATE messages SET extra = json_set(COALESCE(extra, '{}'), '$.reaction', ?), updated_at = ? WHERE wamid = ? AND store_id = ?`
  ).bind(r.emoji || null, now(), r.message_id, store.id).run();
  if (!res.meta.changes) return;
  await env.DB.prepare(`UPDATE chats SET updated_at = ? WHERE id = (SELECT chat_id FROM messages WHERE wamid = ?)`).bind(now(), r.message_id).run();
  if (!r.emoji || !REACCION_SI.has(r.emoji)) return;
  // Reaccionó a un mensaje de la IA mientras el bot espera su respuesta → para el bot es un «sí»
  const m = await env.DB.prepare('SELECT chat_id, direction, sender FROM messages WHERE wamid = ? AND store_id = ?').bind(r.message_id, store.id).first();
  if (!m || m.direction !== 'out' || m.sender !== 'ia') return;
  const chat = await env.DB.prepare('SELECT * FROM chats WHERE id = ?').bind(m.chat_id).first();
  if (!chat || chat.bot_paused || !chat.bot_flow_id || chat.bot_wait !== 1) return;
  const t = msg.timestamp ? Number(msg.timestamp) * 1000 : now();
  const body = `Sí ${r.emoji}`;
  const ins = await env.DB.prepare(
    `INSERT OR IGNORE INTO messages (chat_id, store_id, wamid, direction, sender, type, body, extra, created_at, updated_at)
     VALUES (?, ?, ?, 'in', 'cli', 'text', ?, ?, ?, ?)`
  ).bind(chat.id, store.id, `react:${msg.id}`, body, JSON.stringify({ reaccion: r.emoji }), t, now()).run();
  if (!ins.meta.changes) return;
  await env.DB.prepare("UPDATE chats SET last_msg_at = ?, last_preview = ?, last_dir = 'in', last_inbound_at = ?, updated_at = ? WHERE id = ?")
    .bind(t, body, t, now(), chat.id).run();
  const work = onInbound(env, ctx, store, chat.id, { id: ins.meta.last_row_id, type: 'text', body }).catch((e) => console.error('bot', e));
  if (ctx?.waitUntil) ctx.waitUntil(work);
  else await work;
}

async function handleStatus(env, store, st) {
  const status = st.status; // sent | delivered | read | failed
  const err = st.errors?.[0];
  const pricing = st.pricing ? JSON.stringify({ billable: st.pricing.billable, category: st.pricing.category, type: st.pricing.type }) : null;
  let res;
  if (status === 'failed') {
    res = await env.DB.prepare(`UPDATE messages SET status = 'failed', error = ?, updated_at = ? WHERE wamid = ? AND store_id = ? AND (status IS NULL OR status != 'failed')`)
      .bind(friendlyMetaError(err), now(), st.id, store.id).run();
    if (res.meta.changes) {
      const m = await env.DB.prepare('SELECT chat_id, sender, bot_node FROM messages WHERE wamid = ?').bind(st.id).first();
      const who = m?.sender === 'ia' ? 'IA Suyon' : m?.sender === 'bot' ? `bot (${m.bot_node})` : 'asesora';
      await notify(env, store.id, { kind: 'error', chatId: m?.chat_id, title: `WhatsApp no entregó un mensaje de ${who}`, body: friendlyMetaError(err) });
    }
  } else if (status in STATUS_RANK) {
    res = await env.DB.prepare(
      `UPDATE messages SET status = ?, updated_at = ?,
         extra = CASE WHEN ? IS NULL THEN extra ELSE json_set(COALESCE(extra, '{}'), '$.pricing', json(?)) END
       WHERE wamid = ? AND store_id = ? AND (status IS NULL OR status = 'failed' OR
         (CASE status WHEN 'sending' THEN 0 WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 ELSE 0 END) < ?)`
    ).bind(status, now(), pricing, pricing, st.id, store.id, STATUS_RANK[status]).run();
  }
  if (res?.meta.changes) {
    await env.DB.prepare(`UPDATE chats SET updated_at = ? WHERE id = (SELECT chat_id FROM messages WHERE wamid = ?)`).bind(now(), st.id).run();
  }
}

// Mensajes enviados desde la app WhatsApp Business del celular (coexistencia)
async function handleEcho(env, ctx, store, msg) {
  const to = msg.to;
  if (!to) return;
  const t = msg.timestamp ? Number(msg.timestamp) * 1000 : now();
  const chat = await upsertChat(env, store, to, null, t);
  const isMedia = MEDIA_TYPES.includes(msg.type);
  const media = isMedia ? msg[msg.type] || {} : {};
  const body = describe(msg);
  const ins = await env.DB.prepare(
    `INSERT OR IGNORE INTO messages (chat_id, store_id, wamid, direction, sender, type, body, media_id, media_mime, media_name, media_status, status, created_at, updated_at)
     VALUES (?, ?, ?, 'out', 'cel', ?, ?, ?, ?, ?, ?, 'sent', ?, ?)`
  ).bind(chat.id, store.id, msg.id, msg.type, body, media.id || null, media.mime_type || null, media.filename || null, isMedia ? 'pending' : null, t, now()).run();
  if (!ins.meta.changes) return;
  await env.DB.prepare(`UPDATE chats SET last_msg_at = ?, last_preview = ?, last_dir = 'out', updated_at = ? WHERE id = ?`)
    .bind(t, preview(msg.type, body), now(), chat.id).run();
  if (isMedia && media.id) {
    const job = fetchMediaToR2(env, store, { id: ins.meta.last_row_id, chat_id: chat.id, media_id: media.id }).catch(() => {});
    if (ctx?.waitUntil) ctx.waitUntil(job);
    else await job;
  }
}

export function mediaKey(storeId, chatId, msgId) {
  return `s${storeId}/c${chatId}/m${msgId}`;
}

// Baja el archivo de Meta y lo guarda en R2
export async function fetchMediaToR2(env, store, m) {
  try {
    const f = await downloadMedia(env, store, m.media_id);
    const key = mediaKey(store.id, m.chat_id, m.id);
    await env.MEDIA.put(key, f.body, { httpMetadata: { contentType: f.mime } });
    await env.DB.prepare(`UPDATE messages SET media_key = ?, media_mime = ?, media_size = ?, media_status = 'ok', updated_at = ? WHERE id = ?`)
      .bind(key, f.mime, f.body.byteLength, now(), m.id).run();
    await env.DB.prepare('UPDATE stores SET rev = rev + 1 WHERE id = ?').bind(store.id).run();
    return key;
  } catch (e) {
    await env.DB.prepare(`UPDATE messages SET media_status = 'error', error = ?, updated_at = ? WHERE id = ?`)
      .bind(clip(e.message, 300), now(), m.id).run();
    throw e;
  }
}

// ---------- Coexistencia: historial, contactos y desconexión ----------
const digitsOf = (x) => String(x || '').replace(/\D/g, '');
const HIST_STATUS = { read: 'read', played: 'read', delivered: 'delivered', sent: 'sent', pending: 'sending', error: 'failed' };

async function saveCoex(env, storeId, fn) {
  const row = await env.DB.prepare('SELECT coex_sync FROM stores WHERE id = ?').bind(storeId).first();
  let s = {};
  try {
    s = JSON.parse(row?.coex_sync || '{}') || {};
  } catch {}
  fn(s);
  await env.DB.prepare('UPDATE stores SET coex_sync = ?, rev = rev + 1 WHERE id = ?').bind(JSON.stringify(s), storeId).run();
  return s;
}

// Historial de chats del celular (Meta lo manda por partes). No despierta al bot ni suma «no leídos».
export async function handleHistory(env, ctx, store, v) {
  const biz = digitsOf(v.metadata?.display_phone_number);
  let added = 0;
  let meta = null;
  let declined = false;
  for (const h of v.history || []) {
    if ((h.errors || []).some((e) => Number(e.code) === 2593109)) declined = true;
    if (h.metadata) meta = h.metadata;
    for (const th of h.threads || []) {
      const wa = digitsOf(th.id);
      if (!wa) continue;
      const msgs = (th.messages || []).filter((m) => m?.id);
      if (!msgs.length) continue;
      const times = msgs.map((m) => (m.timestamp ? Number(m.timestamp) * 1000 : now()));
      const chat = await upsertChat(env, store, wa, null, Math.min(...times));
      const media = [];
      const stmts = [];
      const ins = [];
      let last = null;
      let lastIn = 0;
      msgs.forEach((m, i) => {
        const t = times[i];
        const out = (biz && digitsOf(m.from) === biz) || (m.to && digitsOf(m.to) === wa);
        const isMedia = MEDIA_TYPES.includes(m.type);
        const md = isMedia ? m[m.type] || {} : {};
        const body = describe(m);
        ins.push(stmts.length);
        stmts.push(
          env.DB.prepare(
            `INSERT OR IGNORE INTO messages (chat_id, store_id, wamid, direction, sender, type, body, media_id, media_mime, media_name, media_status, status, extra, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(chat.id, store.id, m.id, out ? 'out' : 'in', out ? 'cel' : 'cli', m.type, body, md.id || null, md.mime_type || null, md.filename || null, isMedia ? 'pending' : null,
            out ? HIST_STATUS[m.history_context?.status] || 'sent' : null, JSON.stringify({ historial: true }), t, now())
        );
        // El archivo llega después del aviso «media_placeholder»: se completa ese mismo mensaje
        if (isMedia && md.id) {
          stmts.push(
            env.DB.prepare(`UPDATE messages SET type = ?, body = ?, media_id = ?, media_mime = ?, media_name = ?, media_status = 'pending', updated_at = ? WHERE store_id = ? AND wamid = ? AND type = 'media_placeholder'`)
              .bind(m.type, body, md.id, md.mime_type || null, md.filename || null, now(), store.id, m.id)
          );
          media.push(m.id);
        }
        if (!last || t >= last.t) last = { t, type: m.type, body, out };
        if (!out) lastIn = Math.max(lastIn, t);
      });
      const res = [];
      for (let i = 0; i < stmts.length; i += 80) res.push(...(await env.DB.batch(stmts.slice(i, i + 80))));
      for (const i of ins) added += res[i]?.meta?.changes || 0;
      // Resumen del chat solo si estos mensajes son más nuevos que lo que ya había
      await env.DB.prepare(
        `UPDATE chats SET last_msg_at = ?, last_preview = ?, last_dir = ?, last_inbound_at = MAX(COALESCE(last_inbound_at, 0), ?), created_at = MIN(created_at, ?), updated_at = ?
         WHERE id = ? AND COALESCE(last_msg_at, 0) <= ?`
      ).bind(last.t, preview(last.type, last.body), last.out ? 'out' : 'in', lastIn, Math.min(...times), now(), chat.id, last.t).run();
      await env.DB.prepare('UPDATE chats SET created_at = MIN(created_at, ?), last_inbound_at = MAX(COALESCE(last_inbound_at, 0), ?) WHERE id = ?').bind(Math.min(...times), lastIn, chat.id).run();
      // Archivos de las últimas 2 semanas: se bajan a R2 (de a uno, sin trabar el resto)
      for (const wid of media) {
        const r = await env.DB.prepare("SELECT id, chat_id, media_id FROM messages WHERE store_id = ? AND wamid = ? AND media_status = 'pending' AND media_id IS NOT NULL").bind(store.id, wid).first();
        if (r) await fetchMediaToR2(env, store, r).catch(() => {});
      }
    }
  }
  const s = await saveCoex(env, store.id, (s) => {
    s.history = s.history || { ok: true };
    if (declined) s.history.declined = true;
    if (meta) {
      s.history.phase = Number(meta.phase) || 0;
      s.history.progress = Number(meta.progress) || 0;
    }
    s.history.msgs = (Number(s.history.msgs) || 0) + added;
    s.history.last = now();
  });
  if (declined) {
    await notify(env, store.id, { kind: 'aviso', title: 'No se compartió el historial del celular', body: 'En la app WhatsApp Business no se aceptó «Compartir historial». Los chats nuevos sí llegan a Control Total; los anteriores se quedan solo en el celular.', dedupe: true }).catch(() => {});
  } else if (meta && Number(meta.phase) === 2 && Number(meta.progress) >= 100 && !s.history.done) {
    await saveCoex(env, store.id, (x) => {
      x.history.done = now();
    });
    await notify(env, store.id, { kind: 'aviso', title: 'Historial del celular importado', body: `Ya puedes ver en Chats las conversaciones que tenías en la app WhatsApp Business (${s.history.msgs} mensajes).`, dedupe: true }).catch(() => {});
  }
}

// Contactos guardados en la app del celular: su nombre aparece en los chats (sin pisar uno que puso el equipo)
export async function handleStateSync(env, store, v) {
  const stmts = [];
  let n = 0;
  for (const it of v.state_sync || []) {
    if (it.type !== 'contact') continue;
    const wa = digitsOf(it.contact?.phone_number);
    if (!wa) continue;
    if (it.action === 'remove') {
      stmts.push(env.DB.prepare('DELETE FROM wa_contacts WHERE store_id = ? AND wa_id = ?').bind(store.id, wa));
      continue;
    }
    const name = clip(String(it.contact?.full_name || it.contact?.first_name || '').trim(), 80);
    if (!name) continue;
    n++;
    stmts.push(
      env.DB.prepare('INSERT INTO wa_contacts (store_id, wa_id, name, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (store_id, wa_id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at').bind(store.id, wa, name, now()),
      env.DB.prepare("UPDATE chats SET name = ?, updated_at = ? WHERE store_id = ? AND wa_id = ? AND (name IS NULL OR name = '')").bind(name, now(), store.id, wa)
    );
  }
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  if (n) {
    await saveCoex(env, store.id, (s) => {
      s.contacts = s.contacts || { ok: true };
      s.contacts.n = (Number(s.contacts.n) || 0) + n;
      s.contacts.last = now();
    });
  }
}

// La tienda se desconectó desde la app del celular (o Meta la sacó): se avisa y queda «Pendiente»
export async function handleAccountUpdate(env, entry, v) {
  const ev = String(v.event || '');
  const waba = String(v.waba_info?.waba_id || entry.id || '');
  if (!['PARTNER_REMOVED', 'ACCOUNT_OFFBOARDED', 'ACCOUNT_RECONNECTED'].includes(ev) || !waba) {
    await logWebhook(env, 'campo_account_update', null, v);
    return;
  }
  const { results } = await env.DB.prepare('SELECT id, name FROM stores WHERE waba_id = ?').bind(waba).all();
  if (!results.length) {
    await logWebhook(env, 'cuenta_desconocida', null, { waba, ev });
    return;
  }
  const motivo = { PRIMARY_INACTIVITY: 'el celular estuvo mucho tiempo sin abrir la app WhatsApp Business', CHANGE_NUMBER: 'se cambió el número en la app del celular' }[v.disconnection_info?.reason] || '';
  for (const s of results) {
    if (ev === 'ACCOUNT_RECONNECTED') {
      await notify(env, s.id, { kind: 'aviso', title: 'Tu número se volvió a conectar', body: 'Meta avisó que la cuenta de WhatsApp está conectada otra vez.', dedupe: true }).catch(() => {});
      continue;
    }
    const msg = ev === 'PARTNER_REMOVED'
      ? `Se desconectó desde la app WhatsApp Business del celular${motivo ? ` (${motivo})` : ''}.`
      : 'El número se volvió a registrar en otro celular o se quitó de la app WhatsApp Business.';
    await env.DB.prepare("UPDATE stores SET status = 'pendiente', connect_error = ?, rev = rev + 1 WHERE id = ?").bind(clip(`${msg} Vuelve a tocar «Conectar WhatsApp».`, 300), s.id).run();
    await notify(env, s.id, { kind: 'error', title: 'Tu número de WhatsApp se desconectó de Control Total', body: `${msg} Los mensajes ya no llegan aquí. Entra a Configuración → Número de WhatsApp y toca «Ya uso WhatsApp Business en el celular» para conectarlo otra vez.` }).catch(() => {});
  }
}
