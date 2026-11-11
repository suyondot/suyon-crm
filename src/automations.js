// Mensajes automáticos por estado del pedido (sirven para Shopify y para los pedidos de WhatsApp)
import { now, clip, windowOpen, localDay } from './util.js';
import { sendText, sendButtons, sendTemplate, createTemplate, templateStatus } from './whatsapp.js';
import { notify, loadSettings, addLabel, cancelJobs } from './bot.js';
import { sendPurchase } from './capi.js';
import { sendConversion, CONFIRMADOS } from './conversiones.js';
import { provinciaSiguiente } from './provincia.js';
import { shape, itemsText, cfgOf, normPhone, addEvent, getOrder, ESTADOS, VENDIDO } from './orders.js';

export const AUTOS = [
  { key: 'confirmar', title: 'Confirmar pedido contra entrega (Lima)', when: 'Entra un pedido de Shopify para contraentrega. Al tocar «Sí» queda Confirmado y sube con 📌 para agendarlo; con «No» queda ATENDER PENDIENTE.', cat: 'UTILITY',
    text: 'Hola 👋 Confirma tu pedido #{pedido}:\n👤 {cliente}\n📱 {celular}\n🏠 {direccion}\n🛍️ {promo}: {colores}\n💰 Total: {total} (pagas al recibir)\n\n*¿Confirmas que te llegue {entrega} de 2 a 8 p.m.?*',
    buttons: ['Sí, confirmo', 'No'] },
  { key: 'confirmar_agencia', title: 'Confirmar pedido por Shalom (provincia)', when: 'Entra un pedido de Shopify que va por agencia. Al tocar «Sí» el bot pide DNI (si falta), la agencia Shalom y el adelanto.', cat: 'UTILITY',
    text: 'Hola 👋 Confirma tus datos del pedido #{pedido}:\n👤 {cliente}\n🪪 DNI: {dni}\n📱 {celular}\n📍 {ciudad}\n🛍️ {promo}: {colores}\n💰 Total: {total}. Adelanto: S/30 y el resto lo pagas al recoger en Shalom.\n\n*¿Tus datos están correctos?*',
    buttons: ['Sí, confirmo', 'No'] },
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
export const AUTO_VARS = ['nombre', 'cliente', 'celular', 'direccion', 'dni', 'promo', 'colores', 'pedido', 'tienda', 'productos', 'total', 'adelanto', 'saldo', 'entrega', 'horario', 'cuando', 'sede', 'ciudad', 'yape', 'titular', 'link'];

export async function loadAutos(env, storeId) {
  const { results } = await env.DB.prepare('SELECT * FROM automations WHERE store_id = ?').bind(storeId).all();
  const by = Object.fromEntries(results.map((r) => [r.key, r]));
  return AUTOS.map((a) => {
    const r = by[a.key] || {};
    return { key: a.key, title: a.title, when: a.when, cat: a.cat, buttons: a.buttons || [], default_text: a.text, on: !!r.on_, text: r.text || a.text, delay_min: r.delay_min ?? a.delay ?? null, tpl_name: r.tpl_name || null, tpl_status: r.tpl_status || null, tpl_reason: r.tpl_reason || null, tpl_vars: r.tpl_vars ? JSON.parse(r.tpl_vars) : null, tpl_prev: r.tpl_prev ? JSON.parse(r.tpl_prev) : null };
  });
}

export async function saveAuto(env, storeId, key, patch) {
  const cur = (await loadAutos(env, storeId)).find((a) => a.key === key);
  const next = { ...cur, ...patch };
  await env.DB.prepare(
    `INSERT INTO automations (store_id, key, on_, text, delay_min, tpl_name, tpl_status, tpl_vars, tpl_reason, tpl_prev, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (store_id, key) DO UPDATE SET on_ = excluded.on_, text = excluded.text, delay_min = excluded.delay_min, tpl_name = excluded.tpl_name,
       tpl_status = excluded.tpl_status, tpl_vars = excluded.tpl_vars, tpl_reason = excluded.tpl_reason, tpl_prev = excluded.tpl_prev, updated_at = excluded.updated_at`
  ).bind(storeId, key, next.on ? 1 : 0, next.text === BY[key].text ? null : next.text, next.delay_min, next.tpl_name, next.tpl_status, next.tpl_vars ? JSON.stringify(next.tpl_vars) : null, next.tpl_reason, next.tpl_prev ? JSON.stringify(next.tpl_prev) : null, now()).run();
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
  // Datos cortos para las plantillas de confirmar (Meta no acepta variables vacías: «—»)
  const dash = (x) => String(x || '').trim() || '—';
  const unidades = o.items.reduce((a, it) => a + (Number(it.cantidad) || 0), 0) || o.unidades || 0;
  const prod = o.items[0]?.producto || cfgOf(store).producto || 'prendas';
  const porTalla = new Map();
  for (const it of o.items) {
    const k = it.talla ? `talla ${it.talla}` : '';
    if (!porTalla.has(k)) porTalla.set(k, []);
    for (let i = 0; i < (Number(it.cantidad) || 1); i++) if (it.color) porTalla.get(k).push(it.color);
  }
  const colores = [...porTalla].map(([t, cs]) => [t, cs.join(', ')].filter(Boolean).join(' · ')).filter(Boolean).join(' / ');
  const cel = String(o.celular || '').replace(/\D/g, '').replace(/^51(?=9\d{8}$)/, '');
  const today = localDay(now(), tz);
  const tomorrow = localDay(now() + 864e5, tz);
  const entrega = !o.entrega ? 'pronto' : o.entrega === today ? 'HOY' : o.entrega === tomorrow ? 'MAÑANA' : `el ${o.entrega.split('-').reverse().slice(0, 2).join('/')}`;
  const cuando = o.modo === 'agencia' ? `Sale por Shalom hacia ${o.sede || 'tu sede'} y te avisamos cuando llegue 🚚` : `Te llega ${entrega}, ${s.entrega_horario} 🛵`;
  return {
    cliente: dash(o.nombre), celular: dash(cel.length === 9 ? cel.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3') : cel), direccion: dash([o.direccion, o.distrito].filter(Boolean).join(', ')),
    dni: dash(o.dni), promo: `${unidades} ${prod}`, colores: dash(colores),
    nombre: first(o.nombre), pedido: String(o.number), tienda: store.name, productos: itemsText(o.items), total: money(o.total), adelanto: money(o.adelanto), saldo: money(o.saldo),
    entrega, horario: s.entrega_horario, cuando, sede: o.sede || 'tu sede', ciudad: o.ciudad || o.distrito || 'tu ciudad', yape: s.pay_yape || '', titular: s.pay_titular || '', link: '',
  };
}

const fill = (text, v) => String(text).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));

async function chatForPhone(env, store, phone, name) {
  const wa = normPhone(phone);
  if (!wa) return null;
  await env.DB.prepare('INSERT OR IGNORE INTO chats (store_id, wa_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(store.id, wa, clip(name || '', 60) || null, now(), now()).run();
  return env.DB.prepare('SELECT * FROM chats WHERE store_id = ? AND wa_id = ?').bind(store.id, wa).first();
}

// La plantilla que se puede usar ahora: la nueva si ya está aprobada; si Meta todavía la revisa, la anterior
export function tplUsable(a) {
  if (a.tpl_name && a.tpl_status === 'APPROVED') return { name: a.tpl_name, vars: a.tpl_vars || [] };
  if (a.tpl_prev?.name) return { name: a.tpl_prev.name, vars: a.tpl_prev.vars || [] };
  return null;
}
// Guarda la plantilla aprobada como «anterior» antes de reemplazarla (para no quedarse sin aviso mientras Meta revisa)
export function prevFrom(a) {
  if (a.tpl_name && a.tpl_status === 'APPROVED') return { name: a.tpl_name, vars: a.tpl_vars || [] };
  return a.tpl_prev || null;
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
  let tplUsed = null;
  const label = `«${a.title}»`;
  try {
    if (store.status !== 'activo') throw Object.assign(new Error('El número de la tienda no está conectado.'), { soft: true });
    if (open) {
      if ((key === 'confirmar' || key === 'confirmar_agencia') && order) {
        type = 'interactive';
        wamid = await sendButtons(env, store, chat.wa_id, text, [{ id: `ord:ok:${order.id}`, title: 'Sí, confirmo' }, { id: `ord:edit:${order.id}`, title: 'Cambiar algo' }]);
      } else wamid = await sendText(env, store, chat.wa_id, text);
    } else if (tplUsable(a)) {
      type = 'template';
      tplUsed = tplUsable(a).name;
      wamid = await sendTemplate(env, store, chat.wa_id, tplUsed, 'es', tplUsable(a).vars.map((k) => v[k] ?? ''));
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
  ).bind(chat.id, store.id, wamid || null, type === 'template' ? 'text' : type, text, JSON.stringify({ auto: key, order: order?.id || null, template: type === 'template' ? tplUsed : undefined }), t, t).run();
  await env.DB.prepare("UPDATE chats SET last_msg_at = ?, last_preview = ?, last_dir = 'out', updated_at = ? WHERE id = ?").bind(t, clip(text.split('\n')[0], 120), t, chat.id).run();
  await env.DB.prepare('UPDATE stores SET rev = rev + 1 WHERE id = ?').bind(store.id).run();
  if (order) await addEvent(env, order.id, 'mensaje', `Se mandó ${label}${type === 'template' ? ' (plantilla)' : ''}`);
  return { ok: true, type };
}

// «Reintentar» un aviso que salió como plantilla y Meta rechazó (p. ej. problema de pago 131042): se vuelve a mandar
// la MISMA plantilla aprobada con los datos actuales del pedido (con la ventana cerrada no se puede mandar como texto)
export async function retryAutoTemplate(env, store, chat, m) {
  let x = {};
  try {
    x = JSON.parse(m.extra || '{}') || {};
  } catch {}
  if (!x.template || !x.auto) return null;
  const a = (await loadAutos(env, store.id)).find((y) => y.key === x.auto);
  const tp = a && tplUsable(a);
  if (!tp) throw new Error('La plantilla de este aviso ya no está aprobada por Meta.');
  const order = x.order ? await getOrder(env, x.order) : null;
  const v = await varsFor(env, store, { order });
  const wamid = await sendTemplate(env, store, chat.wa_id, tp.name, 'es', tp.vars.map((k) => v[k] ?? ''));
  await env.DB.prepare("UPDATE messages SET wamid = ?, status = 'sent', error = NULL, body = ?, extra = ?, updated_at = ? WHERE id = ?")
    .bind(wamid || null, fill(a.text, v), JSON.stringify({ ...x, template: tp.name }), now(), m.id).run();
  if (order) await addEvent(env, order.id, 'mensaje', `Se volvió a mandar «${a.title}» (plantilla)`);
  return true;
}

const STATUS_AUTO = { confirmado: 'agendado', validado: 'agendado', en_ruta: 'en_ruta', enviado: 'enviado', en_agencia: 'en_agencia', entregado: 'entregado', recogido: 'entregado' };

// Al crear un pedido (de Shopify sale el aviso para confirmar o pedir el adelanto)
export async function onOrderCreated(env, store, order) {
  await sendPurchase(env, store, order);
  // Pedido que nace ya confirmado (✅ LIMA / ✅ PROVINCIA o pago validado sin pedido previo)
  if (CONFIRMADOS.includes(order.status)) await sendConversion(env, store, order).catch((e) => console.error('conv', e));
  if (order.checkout_token) await env.DB.prepare('UPDATE carts SET order_id = ? WHERE store_id = ? AND token = ?').bind(order.id, store.id, order.checkout_token).run();
  if (order.source !== 'shopify') return;
  if (order.modo !== 'agencia') return sendAuto(env, store, 'confirmar', { order });
  // Provincia: confirmar con botones y, al «Sí», DNI → agencia → adelanto. Si ese aviso está apagado, el de adelanto de siempre
  const conf = (await loadAutos(env, store.id)).find((a) => a.key === 'confirmar_agencia');
  await sendAuto(env, store, conf?.on ? 'confirmar_agencia' : 'adelanto', { order });
}

// Al cambiar de estado: el aviso que toca y, si se entregó, programa la recompra
export async function onOrderStatus(env, store, order, prev) {
  if (order.status === prev) return;
  const key = STATUS_AUTO[order.status];
  if (key) await sendAuto(env, store, key, { order });
  // 100% confirmado (Lima dijo «Sí» / provincia con el adelanto validado) → compra confirmada a los píxeles
  if (CONFIRMADOS.includes(order.status)) await sendConversion(env, store, order).catch((e) => console.error('conv', e));
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
  if (order.chat_id) await env.DB.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').bind(now(), order.chat_id).run();
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
  else if (msg.type === 'button' && /^(cambiar algo|no)\b/i.test(body)) kind = 'edit';
  else if (msg.type === 'text' && body.length <= 40) {
    // También escrito («sí», «si confirmo», «ok», «no»), pero solo si lo último que le mandamos fue el «¿Confirmas…?»
    const si = /^(s[ií]+|sip|ok(ey)?|okay|correcto|confirmo|dale|claro|de acuerdo|s[ií],?\s*(confirmo|correcto|est[aá]n? bien|todo bien|claro)?)[\s.!👍✅🙌😊]*$/i.test(body);
    const no = /^(no|nop|no,? .*|cambiar.*|est[aá] mal.*|corregir.*)$/i.test(body);
    if (si || no) {
      const last = await env.DB.prepare("SELECT extra FROM messages WHERE chat_id = ? AND direction = 'out' ORDER BY id DESC LIMIT 1").bind(chat.id).first();
      if (/"auto":"confirmar(_agencia)?"/.test(last?.extra || '')) kind = si ? 'ok' : 'edit';
    }
  }
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
  // Si ya pidió un cambio («No») o escribió algo y el equipo todavía no la atendió, su «Sí» de después NO confirma solo:
  // queda para que el equipo lo revise (ej.: «No… quiero que llegue la otra semana» y luego «Sí, confirmo»)
  if (kind === 'ok') {
    const pend = await env.DB.prepare("SELECT 1 FROM chat_labels cl JOIN labels l ON l.id = cl.label_id WHERE cl.chat_id = ? AND l.name IN ('ATENDER PENDIENTE', 'ASESOR') LIMIT 1").bind(chat.id).first();
    const pidioCambio = await env.DB.prepare("SELECT 1 FROM order_events WHERE order_id = ? AND detail = 'La clienta quiere cambiar algo del pedido' LIMIT 1").bind(order.id).first();
    if (pend && pidioCambio) {
      await addEvent(env, order.id, 'nota', 'La clienta tocó «Sí» después de pedir un cambio: no se confirmó solo, revísalo');
      await env.DB.prepare('UPDATE chats SET unread = MAX(unread, 1), updated_at = ? WHERE id = ?').bind(now(), chat.id).run();
      await notify(env, store.id, { kind: 'asesora', chatId: chat.id, title: `${order.nombre || 'Una clienta'} tocó «Sí» después de pedir un cambio (pedido #${order.number})`, body: 'Revisa lo que pidió antes de confirmarlo.' });
      await reply('¡Gracias! 😊 Una asesora revisa tu pedido y te confirma en un momento.');
      return true;
    }
  }
  if (kind === 'ok') {
    if (order.status === 'nuevo') {
      // Decisión de Jordan (11 nov): el «Sí» de la clienta NO agenda. El pedido sigue Nuevo con «👍 Dijo Sí»
      // y queda agendado (Confirmado) recién cuando el equipo pone ✅ LIMA / ✅ PROVINCIA.
      await addEvent(env, order.id, 'nota', 'La clienta confirmó por WhatsApp (dijo Sí) · falta agendar con ✅ LIMA');
      await reply(`¡Gracias${first ? `, ${first}` : ''}! ✅ Tu pedido #${order.number} quedó confirmado.`);
      // 📌 arriba de la lista para que el equipo lo agende
      await env.DB.prepare('UPDATE chats SET listo_at = ?, updated_at = ? WHERE id = ?').bind(now(), now(), chat.id).run();
      await env.DB.prepare('UPDATE stores SET rev = rev + 1 WHERE id = ?').bind(store.id).run();
    } else if (order.status === 'por_pagar' && order.modo === 'agencia') {
      await addEvent(env, order.id, 'nota', 'La clienta confirmó por WhatsApp');
      await provinciaSiguiente(env, store, chat, order);
    } else await addEvent(env, order.id, 'nota', 'La clienta volvió a confirmar por WhatsApp');
  } else {
    // «No»: sin bot; queda para que la asesora la atienda o la llame
    await addLabel(env, store.id, chat.id, store.canal === 'shopify' ? 'ATENDER PENDIENTE' : 'ASESOR');
    await cancelJobs(env, chat.id);
    await env.DB.prepare("UPDATE chats SET bot_paused = 1, handler = 'asesora', unread = MAX(unread, 1), updated_at = ? WHERE id = ?").bind(now(), chat.id).run();
    await addEvent(env, order.id, 'nota', 'La clienta quiere cambiar algo del pedido');
    await notify(env, store.id, { kind: 'asesora', chatId: chat.id, title: `${order.nombre || 'Una clienta'} quiere cambiar su pedido #${order.number}` });
    await reply('Claro 😊 Una asesora te contacta en un momento para corregirlo.');
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

const SAMPLE = { nombre: 'María', pedido: '128', tienda: 'Porte Perú', productos: '2 × Pantalón formal · talla M · Negro', total: 'S/139', adelanto: 'S/30', saldo: 'S/109', entrega: 'HOY', horario: 'entre 2 y 8 p.m.', cuando: 'Te llega HOY, entre 2 y 8 p.m.', sede: 'Arequipa Av. Ejército', ciudad: 'Arequipa', cliente: 'María López', celular: '987 654 321', direccion: 'Av. Perú 123, Los Olivos', dni: '41085894', promo: '3 Leggings Cargo', colores: 'talla M · Negro, Beige, Azul noche', yape: '999 999 999', titular: 'Porte Perú', link: 'https://porte.pe' };

export async function submitTemplate(env, store, key) {
  const a = (await loadAutos(env, store.id)).find((x) => x.key === key);
  const { body, vars, example } = templateFrom(a, { ...SAMPLE, tienda: store.name });
  const name = `suyon_${key}_${store.id}_${Date.now().toString(36)}`.toLowerCase();
  const r = await createTemplate(env, store, { name, category: a.cat, body, example, buttons: a.buttons });
  const st = r.status || 'PENDING';
  return saveAuto(env, store.id, key, { tpl_name: name, tpl_status: st, tpl_vars: vars, tpl_reason: null, tpl_prev: st === 'APPROVED' ? null : prevFrom(a) });
}

export async function syncTemplates(env, store) {
  for (const a of await loadAutos(env, store.id)) {
    if (!a.tpl_name) continue;
    try {
      const t = await templateStatus(env, store, a.tpl_name);
      if (t) await saveAuto(env, store.id, a.key, { tpl_status: t.status, tpl_reason: t.rejected_reason && t.rejected_reason !== 'NONE' ? t.rejected_reason : null, ...(t.status === 'APPROVED' ? { tpl_prev: null } : {}) });
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
