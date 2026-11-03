// Mensajes automáticos por estado del pedido (sirven para Shopify y para los pedidos de WhatsApp)
import { now, clip, windowOpen, localDay } from './util.js';
import { sendText, sendButtons, sendTemplate, createTemplate, templateStatus } from './whatsapp.js';
import { notify, loadSettings, addLabel, cancelJobs } from './bot.js';
import { shape, itemsText, cfgOf, normPhone, addEvent, getOrder, ESTADOS, VENDIDO } from './orders.js';

export const AUTOS = [
  { key: 'confirmar', title: 'Confirmar pedido contra entrega', when: 'Entra un pedido de Shopify para contraentrega.', cat: 'UTILITY',
    text: 'Hola {nombre} 👋 Recibimos tu pedido #{pedido} en {tienda}:\n{productos}\nTotal: {total}, pagas al recibir.\nTe llega {entrega}, {horario}. ¿Confirmas tu pedido?',
    buttons: ['Sí, confirmo', 'Cambiar algo'] },
  { key: 'adelanto', title: 'Pedir adelanto (agencia)', when: 'Entra un pedido de Shopify que va por agencia (Shalom).', cat: 'UTILITY',
    text: 'Hola {nombre} 👋 Recibimos tu pedido #{pedido}:\n{productos}\nTotal: {total}. Para enviarlo por Shalom necesitamos un adelanto de {adelanto}.\nYape o Plin: {yape} a nombre de {titular}. Envíanos la captura por aquí 🙌' },
  { key: 'agendado', title: 'Pedido confirmado', when: 'El pedido pasa a Confirmado o Validado.', cat: 'UTILITY',
    text: '¡Listo, {nombre}! ✅ Tu pedido #{pedido} quedó agendado. {cuando}' },
  { key: 'en_ruta', title: 'En ruta', when: 'El pedido pasa a En ruta (sale con el motorizado).', cat: 'UTILITY',
    text: '{nombre}, tu pedido #{pedido} ya está en camino 🛵 Llega hoy {horario}. Ten listo {total} para pagar al recibir 💕' },
  { key: 'enviado', title: 'Enviado por agencia', when: 'El pedido pasa a Enviado.', cat: 'UTILITY',
    text: '{nombre}, tu pedido #{pedido} ya salió por Shalom 🚚 hacia {sede}. Te avisamos cuando llegue.' },
  { key: 'en_agencia', title: 'Llegó a la agencia', when: 'El pedido pasa a En agencia.', cat: 'UTILITY',
    text: '¡Tu pedido #{pedido} ya llegó a Shalom {sede}! 📦 Acércate con tu DNI. Saldo a pagar: {saldo}.' },
  { key: 'entregado', title: 'Gracias por tu compra', when: 'El pedido pasa a Entregado o Recogido.', cat: 'UTILITY',
    text: 'Gracias por tu compra, {nombre} 💕 Esperamos que te encante. Cualquier duda, escríbenos por aquí.' },
  { key: 'recompra', title: 'Volver a comprar', when: 'Días después de entregado, si no volvió a pedir.', cat: 'MARKETING', delay: 20 * 1440,
    text: 'Hola {nombre} 👋 ¿Qué tal te quedó tu pedido? Tenemos colores nuevos y te los puedo mostrar por aquí 😊' },
  { key: 'carrito', title: 'Carrito abandonado (Shopify)', when: 'Dejó sus datos en el pago de Shopify y no terminó.', cat: 'MARKETING', delay: 60,
    text: 'Hola {nombre} 👋 Vimos que dejaste tu pedido a medio camino:\n{productos}\n¿Te ayudo a terminarlo? Pagas al recibir 😊' },
];
const BY = Object.fromEntries(AUTOS.map((a) => [a.key, a]));
export const AUTO_VARS = ['nombre', 'pedido', 'tienda', 'productos', 'total', 'adelanto', 'saldo', 'entrega', 'horario', 'cuando', 'sede', 'yape', 'titular', 'link'];

export async function loadAutos(env, storeId) {
  const { results } = await env.DB.prepare('SELECT * FROM automations WHERE store_id = ?').bind(storeId).all();
  const by = Object.fromEntries(results.map((r) => [r.key, r]));
  return AUTOS.map((a) => {
    const r = by[a.key] || {};
    return { key: a.key, title: a.title, when: a.when, cat: a.cat, buttons: a.buttons || [], default_text: a.text, on: !!r.on_, text: r.text || a.text, delay_min: r.delay_min ?? a.delay ?? null, tpl_name: r.tpl_name || null, tpl_status: r.tpl_status || null, tpl_reason: r.tpl_reason || null, tpl_vars: r.tpl_vars ? JSON.parse(r.tpl_vars) : null };
  });
}

export async function saveAuto(env, storeId, key, patch) {
  const cur = (await loadAutos(env, storeId)).find((a) => a.key === key);
  const next = { ...cur, ...patch };
  await env.DB.prepare(
    `INSERT INTO automations (store_id, key, on_, text, delay_min, tpl_name, tpl_status, tpl_vars, tpl_reason, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (store_id, key) DO UPDATE SET on_ = excluded.on_, text = excluded.text, delay_min = excluded.delay_min, tpl_name = excluded.tpl_name,
       tpl_status = excluded.tpl_status, tpl_vars = excluded.tpl_vars, tpl_reason = excluded.tpl_reason, updated_at = excluded.updated_at`
  ).bind(storeId, key, next.on ? 1 : 0, next.text === BY[key].text ? null : next.text, next.delay_min, next.tpl_name, next.tpl_status, next.tpl_vars ? JSON.stringify(next.tpl_vars) : null, next.tpl_reason, now()).run();
  return (await loadAutos(env, storeId)).find((a) => a.key === key);
}

const money = (n) => `S/${Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

async function varsFor(env, store, { order, cart }) {
  const s = await loadSettings(env, store.id);
  const tz = s.timezone;
  const first = (n) => String(n || '').trim().split(/\s+/)[0] || 'hola';
  if (cart) {
    let items = [];
    try { items = JSON.parse(cart.items || '[]'); } catch {}
    return { nombre: first(cart.nombre), tienda: store.name, productos: itemsText(items), total: money(cart.total), link: cart.url || '', horario: s.entrega_horario };
  }
  const o = shape(order);
  const today = localDay(now(), tz);
  const tomorrow = localDay(now() + 864e5, tz);
  const entrega = !o.entrega ? 'pronto' : o.entrega === today ? 'HOY' : o.entrega === tomorrow ? 'MAÑANA' : `el ${o.entrega.split('-').reverse().slice(0, 2).join('/')}`;
  const cuando = o.modo === 'agencia' ? `Sale por Shalom hacia ${o.sede || 'tu sede'} y te avisamos cuando llegue 🚚` : `Te llega ${entrega}, ${s.entrega_horario} 🛵`;
  return {
    nombre: first(o.nombre), pedido: String(o.number), tienda: store.name, productos: itemsText(o.items), total: money(o.total), adelanto: money(o.adelanto), saldo: money(o.saldo),
    entrega, horario: s.entrega_horario, cuando, sede: o.sede || 'tu sede', yape: s.pay_yape || '', titular: s.pay_titular || '', link: '',
  };
}

const fill = (text, v) => String(text).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));

async function chatForPhone(env, store, phone, name) {
  const wa = normPhone(phone);
  if (!wa) return null;
  await env.DB.prepare('INSERT OR IGNORE INTO chats (store_id, wa_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(store.id, wa, clip(name || '', 60) || null, now(), now()).run();
  return env.DB.prepare('SELECT * FROM chats WHERE store_id = ? AND wa_id = ?').bind(store.id, wa).first();
}

// Manda un mensaje automático: gratis si la ventana está abierta; si no, con la plantilla aprobada
export async function sendAuto(env, store, key, ctx) {
  const a = (await loadAutos(env, store.id)).find((x) => x.key === key);
  if (!a || !a.on) return { skipped: 'apagado' };
  const order = ctx.order ? await getOrder(env, ctx.order.id) : null;
  const src = order || ctx.cart;
  let chat = order?.chat_id ? await env.DB.prepare('SELECT * FROM chats WHERE id = ?').bind(order.chat_id).first() : null;
  if (!chat) chat = await chatForPhone(env, store, src.celular, src.nombre);
  if (!chat) return { skipped: 'sin celular' };
  if (order && !order.chat_id) await env.DB.prepare('UPDATE orders SET chat_id = ? WHERE id = ?').bind(chat.id, order.id).run();
  const v = await varsFor(env, store, { order, cart: ctx.cart });
  const text = fill(a.text, v);
  const open = windowOpen(chat);
  let type = 'text';
  let wamid;
  const label = `«${a.title}»`;
  try {
    if (store.status !== 'activo') throw Object.assign(new Error('El número de la tienda no está conectado.'), { soft: true });
    if (open) {
      if (key === 'confirmar' && order) {
        type = 'interactive';
        wamid = await sendButtons(env, store, chat.wa_id, text, [{ id: `ord:ok:${order.id}`, title: 'Sí, confirmo' }, { id: `ord:edit:${order.id}`, title: 'Cambiar algo' }]);
      } else wamid = await sendText(env, store, chat.wa_id, text);
    } else if (a.tpl_name && a.tpl_status === 'APPROVED') {
      type = 'template';
      wamid = await sendTemplate(env, store, chat.wa_id, a.tpl_name, 'es', (a.tpl_vars || []).map((k) => v[k] ?? ''));
    } else {
      throw Object.assign(new Error('Pasaron más de 24 h desde su último mensaje y la plantilla de este aviso no está aprobada por Meta. Créala en Configuración → Pedidos y Shopify.'), { soft: true });
    }
  } catch (e) {
    await notify(env, store.id, { kind: e.soft ? 'aviso' : 'error', chatId: chat.id, title: `No se mandó ${label}${order ? ` del pedido #${order.number}` : ''}`, body: e.message });
    if (order) await addEvent(env, order.id, 'mensaje', `No se mandó ${label}: ${e.message}`);
    return { ok: false, error: e.message };
  }
  const t = now();
  await env.DB.prepare(
    `INSERT INTO messages (chat_id, store_id, wamid, direction, sender, type, body, status, extra, created_at, updated_at) VALUES (?, ?, ?, 'out', 'bot', ?, ?, 'sent', ?, ?, ?)`
  ).bind(chat.id, store.id, wamid || null, type === 'template' ? 'text' : type, text, JSON.stringify({ auto: key, order: order?.id || null, template: type === 'template' ? a.tpl_name : undefined }), t, t).run();
  await env.DB.prepare("UPDATE chats SET last_msg_at = ?, last_preview = ?, last_dir = 'out', updated_at = ? WHERE id = ?").bind(t, clip(text.split('\n')[0], 120), t, chat.id).run();
  await env.DB.prepare('UPDATE stores SET rev = rev + 1 WHERE id = ?').bind(store.id).run();
  if (order) await addEvent(env, order.id, 'mensaje', `Se mandó ${label}${type === 'template' ? ' (plantilla)' : ''}`);
  return { ok: true, type };
}

const STATUS_AUTO = { confirmado: 'agendado', validado: 'agendado', en_ruta: 'en_ruta', enviado: 'enviado', en_agencia: 'en_agencia', entregado: 'entregado', recogido: 'entregado' };

// Al crear un pedido (de Shopify sale el aviso para confirmar o pedir el adelanto)
export async function onOrderCreated(env, store, order) {
  if (order.checkout_token) await env.DB.prepare('UPDATE carts SET order_id = ? WHERE store_id = ? AND token = ?').bind(order.id, store.id, order.checkout_token).run();
  if (order.source !== 'shopify') return;
  await sendAuto(env, store, order.modo === 'agencia' ? 'adelanto' : 'confirmar', { order });
}

// Al cambiar de estado: el aviso que toca y, si se entregó, programa la recompra
export async function onOrderStatus(env, store, order, prev) {
  if (order.status === prev) return;
  const key = STATUS_AUTO[order.status];
  if (key) await sendAuto(env, store, key, { order });
  if (VENDIDO.includes(order.status)) {
    const a = (await loadAutos(env, store.id)).find((x) => x.key === 'recompra');
    const min = Number(a.delay_min) || cfgOf(store).recompra_dias * 1440;
    await env.DB.prepare(`INSERT INTO order_jobs (store_id, order_id, kind, run_at, created_at) VALUES (?, ?, 'recompra', ?, ?)`).bind(store.id, order.id, now() + min * 60e3, now()).run();
  } else if (['cancelado', 'rechazado', 'no_recogido'].includes(order.status)) {
    await env.DB.prepare('UPDATE order_jobs SET canceled_at = ? WHERE order_id = ? AND done_at IS NULL AND canceled_at IS NULL').bind(now(), order.id).run();
  }
}

export async function setOrderStatus(env, store, order, status, userId, why) {
  if (order.status === status) return order;
  await env.DB.prepare('UPDATE orders SET status = ?, status_at = ?, updated_at = ? WHERE id = ?').bind(status, now(), now(), order.id).run();
  await addEvent(env, order.id, 'estado', `${ESTADOS[order.status]} → ${ESTADOS[status]}${why ? ` · ${why}` : ''}`, userId);
  const next = await getOrder(env, order.id);
  await onOrderStatus(env, store, next, order.status);
  await env.DB.prepare('UPDATE stores SET rev = rev + 1 WHERE id = ?').bind(store.id).run();
  return next;
}

// Respuesta de la clienta a «¿Confirmas tu pedido?» (botón del mensaje o de la plantilla)
export async function handleOrderReply(env, store, chat, msg) {
  const payload = String(msg.payload || '');
  const body = String(msg.body || '').trim();
  let kind = null;
  let id = null;
  const m = /^ord:(ok|edit):(\d+)$/.exec(payload);
  if (m) [kind, id] = [m[1], Number(m[2])];
  else if (msg.type === 'button' && /^s[ií],?\s*confirmo/i.test(body)) kind = 'ok';
  else if (msg.type === 'button' && /^cambiar algo/i.test(body)) kind = 'edit';
  if (!kind) return false;
  const order = id
    ? await env.DB.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?').bind(id, store.id).first()
    : await env.DB.prepare("SELECT * FROM orders WHERE chat_id = ? AND status IN ('nuevo', 'por_pagar') ORDER BY id DESC LIMIT 1").bind(chat.id).first();
  if (!order) return false;
  const reply = async (text) => {
    if (store.status !== 'activo') return;
    try {
      const wamid = await sendText(env, store, chat.wa_id, text);
      const t = now();
      await env.DB.prepare(`INSERT INTO messages (chat_id, store_id, wamid, direction, sender, type, body, status, created_at, updated_at) VALUES (?, ?, ?, 'out', 'bot', 'text', ?, 'sent', ?, ?)`).bind(chat.id, store.id, wamid, text, t, t).run();
    } catch {}
  };
  const first = String(order.nombre || '').split(/\s+/)[0];
  if (kind === 'ok') {
    if (order.status === 'nuevo') {
      const autos = await loadAutos(env, store.id);
      const willSend = autos.find((a) => a.key === 'agendado')?.on;
      await setOrderStatus(env, store, order, 'confirmado', null, 'La clienta confirmó por WhatsApp');
      if (!willSend) await reply(`¡Gracias${first ? `, ${first}` : ''}! ✅ Tu pedido #${order.number} quedó confirmado.`);
    } else await addEvent(env, order.id, 'nota', 'La clienta volvió a confirmar por WhatsApp');
  } else {
    await addLabel(env, store.id, chat.id, 'ASESOR');
    await cancelJobs(env, chat.id);
    await env.DB.prepare("UPDATE chats SET bot_paused = 1, handler = 'asesora', unread = MAX(unread, 1), updated_at = ? WHERE id = ?").bind(now(), chat.id).run();
    await addEvent(env, order.id, 'nota', 'La clienta quiere cambiar algo del pedido');
    await notify(env, store.id, { kind: 'asesora', chatId: chat.id, title: `${order.nombre || 'Una clienta'} quiere cambiar su pedido #${order.number}` });
    await reply('Claro 😊 Una asesora te escribe en un momento para cambiarlo.');
  }
  return true;
}

// Plantilla de Meta para cuando la ventana de 24 h está cerrada
export function templateFrom(a, example) {
  const vars = [];
  let body = a.text.replace(/\{(\w+)\}/g, (m, k) => {
    if (!AUTO_VARS.includes(k)) return m;
    let i = vars.indexOf(k);
    if (i < 0) i = vars.push(k) - 1;
    return `{{${i + 1}}}`;
  });
  // Meta no acepta que el texto empiece o termine con una variable
  if (/^\s*\{\{/.test(body)) body = 'Hola, ' + body;
  if (/\}\}\s*$/.test(body)) body = body + ' 😊';
  return { body, vars, example: vars.map((k) => example[k] || k) };
}

const SAMPLE = { nombre: 'María', pedido: '128', tienda: 'Porte Perú', productos: '2 × Pantalón formal · talla M · Negro', total: 'S/139', adelanto: 'S/30', saldo: 'S/109', entrega: 'HOY', horario: 'entre 2 y 8 p.m.', cuando: 'Te llega HOY, entre 2 y 8 p.m.', sede: 'Arequipa Av. Ejército', yape: '999 999 999', titular: 'Porte Perú', link: 'https://porte.pe' };

export async function submitTemplate(env, store, key) {
  const a = (await loadAutos(env, store.id)).find((x) => x.key === key);
  const { body, vars, example } = templateFrom(a, { ...SAMPLE, tienda: store.name });
  const name = `suyon_${key}_${store.id}_${Date.now().toString(36)}`.toLowerCase();
  const r = await createTemplate(env, store, { name, category: a.cat, body, example, buttons: a.buttons });
  return saveAuto(env, store.id, key, { tpl_name: name, tpl_status: r.status || 'PENDING', tpl_vars: vars, tpl_reason: null });
}

export async function syncTemplates(env, store) {
  for (const a of await loadAutos(env, store.id)) {
    if (!a.tpl_name) continue;
    try {
      const t = await templateStatus(env, store, a.tpl_name);
      if (t) await saveAuto(env, store.id, a.key, { tpl_status: t.status, tpl_reason: t.rejected_reason && t.rejected_reason !== 'NONE' ? t.rejected_reason : null });
    } catch {}
  }
  return loadAutos(env, store.id);
}

// Cron: recompra y carritos abandonados
export async function runOrderJobs(env) {
  const { results } = await env.DB.prepare('SELECT * FROM order_jobs WHERE done_at IS NULL AND canceled_at IS NULL AND run_at <= ? ORDER BY run_at LIMIT 40').bind(now()).all();
  for (const j of results) {
    const claim = await env.DB.prepare('UPDATE order_jobs SET done_at = ? WHERE id = ? AND done_at IS NULL').bind(now(), j.id).run();
    if (!claim.meta.changes) continue;
    try {
      const store = await env.DB.prepare('SELECT * FROM stores WHERE id = ?').bind(j.store_id).first();
      if (!store) continue;
      if (j.kind === 'recompra') {
        const o = await getOrder(env, j.order_id);
        if (!o || !VENDIDO.includes(o.status)) continue;
        const newer = await env.DB.prepare('SELECT id FROM orders WHERE store_id = ? AND celular = ? AND id > ? LIMIT 1').bind(store.id, o.celular, o.id).first();
        if (!newer) await sendAuto(env, store, 'recompra', { order: o });
      } else if (j.kind === 'carrito') {
        const cart = await env.DB.prepare('SELECT * FROM carts WHERE id = ?').bind(j.cart_id).first();
        if (!cart || cart.order_id || cart.sent_at) continue;
        const r = await sendAuto(env, store, 'carrito', { cart });
        if (r.ok) await env.DB.prepare('UPDATE carts SET sent_at = ? WHERE id = ?').bind(now(), cart.id).run();
      }
    } catch (e) {
      console.error('order job', j.id, e);
    }
  }
}
