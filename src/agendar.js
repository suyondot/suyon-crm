// Agendar un chat: crea el pedido con su último formulario (o pasa a Confirmado/Validado el que dejó la IA)
import { now, windowOpen, localParts, clip } from './util.js';
import { draftFromChat, insertOrder, varsFromForm, cfgOf } from './orders.js';
import { sendText } from './whatsapp.js';
import { entregaDia, loadSettings } from './bot.js';
import { onOrderCreated, setOrderStatus } from './automations.js';

export async function pedidoAlAgendar(env, store, chatId, zona, userId) {
  const open = await env.DB.prepare("SELECT * FROM orders WHERE chat_id = ? AND status NOT IN ('cancelado') AND created_at > ? ORDER BY id DESC LIMIT 1").bind(chatId, now() - 7 * 864e5).first();
  if (open) {
    // El pedido que creó la IA (🟡 Terminar de agendar) pasa a agendado: Lima → Confirmado, Shalom → Validado
    const to = open.status === 'nuevo' ? 'confirmado' : open.status === 'por_pagar' ? 'validado' : null;
    if (to) await setOrderStatus(env, store, open, to, userId, `Etiqueta ✅ ${zona === 'lima' ? 'LIMA' : 'PROVINCIA'}`);
    return { id: open.id, num: open.number, ya: true, estado: to };
  }
  const chat = await env.DB.prepare('SELECT * FROM chats WHERE id = ?').bind(chatId).first();
  let vars = {};
  try {
    vars = JSON.parse(chat.bot_vars || '{}') || {};
  } catch {}
  // El último formulario que se le mandó (de la IA o de la asesora) es lo que se acordó: manda sobre lo guardado
  const f = await env.DB.prepare("SELECT body FROM messages WHERE chat_id = ? AND direction = 'out' AND body LIKE '%Pedido:%' ORDER BY id DESC LIMIT 1").bind(chatId).first();
  if (f?.body) Object.assign(vars, varsFromForm(f.body));
  const draft = draftFromChat({ ...chat, bot_vars: JSON.stringify(vars) }, store);
  if (zona === 'lima') draft.modo = 'lima';
  else if (draft.modo === 'lima') draft.modo = 'agencia';
  if (draft.modo !== 'lima' && !draft.ciudad) draft.ciudad = vars.destino || '';
  const ad = String(f?.body || '').match(/adelanto\s*:\s*S\/\s*([\d.,]+)/i)?.[1];
  if (ad) draft.adelanto = Number(ad.replace(',', '.')) || draft.adelanto;
  draft.status = draft.modo === 'agencia' ? 'validado' : 'confirmado';
  const o = await insertOrder(env, store, draft, { userId, source: 'etiqueta' });
  if (!o) return { error: 'no se pudo guardar' };
  await onOrderCreated(env, store, o);
  const cap = await env.DB.prepare('SELECT capi_at FROM orders WHERE id = ?').bind(o.id).first();
  return { id: o.id, num: o.number, capi: !!cap?.capi_at, capi_on: !!store.capi_on };
}

// Texto que sale al poner ✅ LIMA / ✅ PROVINCIA: HOY o MAÑANA según la hora de la tienda
export async function textoAlAgendar(env, store, zona, t = now()) {
  const a = cfgOf(store).al_agendar;
  const tz = store.timezone || 'America/Lima';
  if (zona === 'lima') {
    const st = await loadSettings(env, store.id).catch(() => ({}));
    const dia = entregaDia(t, tz, st || {});
    return dia === 'HOY' ? a.lima_hoy : a.lima_manana.replace(/\{entrega\}/g, dia.toUpperCase());
  }
  const p = localParts(t, tz);
  const hoy = p.dow !== 0 && p.h < Number(a.prov_corte_h ?? 14);
  if (hoy) return a.prov_hoy;
  const dia = p.dow === 6 || p.dow === 0 ? 'el LUNES' : 'MAÑANA';
  return a.prov_manana.replace(/\{entrega\}/g, dia);
}

// Lo manda como mensaje normal de la asesora (dentro de la ventana de 24/72 h). Si está apagado o la ventana cerró, no manda nada.
export async function mensajeAlAgendar(env, store, chatId, zona, userId) {
  if (!cfgOf(store).al_agendar.on) return { skipped: 'apagado' };
  const chat = await env.DB.prepare('SELECT * FROM chats WHERE id = ?').bind(chatId).first();
  if (!chat || chat.sim) return { skipped: 'sim' };
  if (store.status !== 'activo') return { skipped: 'sin número' };
  if (!windowOpen(chat)) return { skipped: 'ventana', error: 'Pasaron más de 24 h desde su último mensaje: el mensaje de agendado no salió.' };
  const text = await textoAlAgendar(env, store, zona);
  const t = now();
  const r = await env.DB.prepare(
    `INSERT INTO messages (chat_id, store_id, direction, sender, user_id, type, body, status, extra, created_at, updated_at) VALUES (?, ?, 'out', 'ase', ?, 'text', ?, 'sending', ?, ?, ?)`
  ).bind(chat.id, store.id, userId || null, text, JSON.stringify({ auto: 'al_agendar' }), t, t).run();
  const id = r.meta.last_row_id;
  try {
    const wamid = await sendText(env, store, chat.wa_id, text);
    await env.DB.prepare("UPDATE messages SET wamid = ?, status = 'sent', updated_at = ? WHERE id = ?").bind(wamid || null, now(), id).run();
  } catch (e) {
    await env.DB.prepare("UPDATE messages SET status = 'failed', error = ?, updated_at = ? WHERE id = ?").bind(clip(e.message, 300), now(), id).run();
    return { ok: false, error: e.message };
  }
  await env.DB.batch([
    env.DB.prepare("UPDATE chats SET last_msg_at = ?, last_preview = ?, last_dir = 'out', updated_at = ? WHERE id = ?").bind(t, clip(text.split('\n')[0], 120), t, chat.id),
    env.DB.prepare('UPDATE stores SET rev = rev + 1 WHERE id = ?').bind(store.id),
  ]);
  return { ok: true };
}
