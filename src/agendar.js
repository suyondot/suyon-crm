// Agendar un chat: crea el pedido con su último formulario (o pasa a Confirmado/Validado el que dejó la IA)
import { now } from './util.js';
import { draftFromChat, insertOrder, varsFromForm } from './orders.js';
import { onOrderCreated, setOrderStatus } from './automations.js';

export async function pedidoAlAgendar(env, store, chatId, zona, userId) {
  const open = await env.DB.prepare("SELECT * FROM orders WHERE chat_id = ? AND status NOT IN ('cancelado') AND created_at > ? ORDER BY id DESC LIMIT 1").bind(chatId, now() - 3 * 864e5).first();
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
