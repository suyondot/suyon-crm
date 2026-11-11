// API de Pedidos y de Configuración → Pedidos y Shopify
import { Hono } from 'hono';
import { now, fail, clip, localDay, tzOffset, randomToken } from './util.js';
import { storeFor, chatFor, requireUser } from './auth.js';
import {
  MODOS, ESTADOS, FLUJO, VENDIDO, PERDIDO, cfgOf, DEFAULT_CFG, cleanOrder, insertOrder, getOrder, shape, draftFromChat, formText, varsFromForm, storeColors, defaultEntrega, addEvent, orderText, firstStatus, pedidoAbierto,
} from './orders.js';
import { convOf, CONV_DEFAULT } from './conversiones.js';
import { loadAutos, saveAuto, submitTemplate, syncTemplates, setOrderStatus, onOrderCreated, AUTO_VARS, prevFrom } from './automations.js';
import { ensureDataset } from './capi.js';
import { trackOrder } from './rastreo.js';
import { loadSettings } from './bot.js';

const r = new Hono();
const body = async (c) => {
  try {
    return await c.req.json();
  } catch {
    return {};
  }
};
const DAY = 864e5;
const bump = (env, id) => env.DB.prepare('UPDATE stores SET rev = rev + 1 WHERE id = ?').bind(id).run();
const dayStart = (s, tz) => {
  const [y, m, d] = s.split('-').map(Number);
  const g = Date.UTC(y, m - 1, d);
  return g - tzOffset(g, tz);
};
const FINAL = [...VENDIDO, ...PERDIDO];
const inList = (n) => Array(n).fill('?').join(',');

// Qué pedidos ve cada rol: despacho de provincia solo provincia y agencia
function modosFor(role) {
  return role === 'despacho_prov' ? ['ce_prov', 'agencia'] : Object.keys(MODOS);
}

async function orderFor(c, id) {
  const o = await getOrder(c.env, id);
  if (!o) fail(404, 'Ese pedido no existe.');
  const store = await storeFor(c, o.store_id, 'any');
  if (!modosFor(store.role).includes(o.modo)) fail(403, 'Tu rol no ve este tipo de pedido.');
  return { order: o, store };
}

r.get('/stores/:id/pedidos', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'any');
  const q = c.req.query();
  const tz = st.timezone || 'America/Lima';
  const today = localDay(now(), tz);
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(q.dia || '') ? q.dia : today;
  const modos = modosFor(st.role).filter((m) => (q.grupo === 'lima' ? m === 'lima' : q.grupo === 'prov' ? m !== 'lima' : true));
  if (!modos.length) return c.json({ pedidos: [], estados: {}, dias: [], dia });
  const db = c.env.DB;
  const where = ['store_id = ?', `modo IN (${inList(modos.length)})`];
  const vals = [st.id, ...modos];
  if (q.vista === 'pendientes') {
    where.push(`status NOT IN (${inList(FINAL.length)})`);
    vals.push(...FINAL);
  } else if (!q.q) {
    where.push('created_at >= ? AND created_at < ?');
    vals.push(dayStart(dia, tz), dayStart(dia, tz) + DAY);
  }
  if (q.q) {
    const like = `%${String(q.q).trim().replace(/[%_]/g, '')}%`;
    const n = Number(String(q.q).replace(/\D/g, ''));
    where.push('(nombre LIKE ? OR celular LIKE ? OR dni LIKE ? OR distrito LIKE ? OR ciudad LIKE ? OR ext_name LIKE ? OR number = ?)');
    vals.push(like, like, like, like, like, like, n || -1);
  }
  const base = where.join(' AND ');
  const { results: byStatus } = await db.prepare(`SELECT status, COUNT(*) AS n, SUM(total) AS total FROM orders WHERE ${base} GROUP BY status`).bind(...vals).all();
  const sw = [...where];
  const sv = [...vals];
  if (q.estado) {
    sw.push('status = ?');
    sv.push(q.estado);
  }
  const { results } = await db.prepare(`SELECT * FROM orders WHERE ${sw.join(' AND ')} ORDER BY created_at DESC LIMIT 500`).bind(...sv).all();
  // Tira de días: pedidos de los últimos 14 días (sin el filtro de estado)
  const from = dayStart(localDay(now() - 13 * DAY, tz), tz);
  const { results: rows } = await db.prepare(
    `SELECT created_at, status FROM orders WHERE store_id = ? AND modo IN (${inList(modos.length)}) AND created_at >= ? LIMIT 20000`
  ).bind(st.id, ...modos, from).all();
  const dias = [];
  for (let i = 13; i >= 0; i--) dias.push({ dia: localDay(now() - i * DAY, tz), n: 0, perdidos: 0 });
  const idx = Object.fromEntries(dias.map((d, i) => [d.dia, i]));
  for (const x of rows) {
    const k = idx[localDay(x.created_at, tz)];
    if (k == null) continue;
    if (PERDIDO.includes(x.status)) dias[k].perdidos++;
    else dias[k].n++;
  }
  return c.json({
    dia, today,
    pedidos: results.map(shape),
    estados: Object.fromEntries(byStatus.map((x) => [x.status, { n: x.n, total: x.total || 0 }])),
    dias,
  });
});

r.get('/pedidos/:id', async (c) => {
  const { order } = await orderFor(c, c.req.param('id'));
  const { results: events } = await c.env.DB.prepare(
    'SELECT e.kind, e.detail, e.created_at, u.name AS user_name FROM order_events e LEFT JOIN users u ON u.id = e.user_id WHERE e.order_id = ? ORDER BY e.id DESC LIMIT 100'
  ).bind(order.id).all();
  const s = await loadSettings(c.env, order.store_id);
  const p = shape(order);
  const store = await c.env.DB.prepare('SELECT * FROM stores WHERE id = ?').bind(order.store_id).first();
  // Pedido sin colores (los creó la IA antes de guardarlos): se sugieren los del chat para no escribirlos a mano
  let sugerido = null;
  if (order.chat_id && !p.items.some((i) => String(i.color || '').trim())) {
    const chat = await c.env.DB.prepare('SELECT * FROM chats WHERE id = ?').bind(order.chat_id).first();
    if (chat) {
      const d = draftFromChat(await chatConForm(c.env, chat), store);
      if (d.items.some((i) => i.color)) sugerido = { items: d.items, dni: d.dni, sede: d.sede, direccion: d.direccion };
    }
  }
  return c.json({ pedido: p, events, texto: orderText(order, { horario: s.entrega_horario }), sugerido, colores: storeColors(store) });
});

r.post('/stores/:id/pedidos', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'any');
  const u = await requireUser(c);
  const b = await body(c);
  if (b.chat_id) {
    const ch = await c.env.DB.prepare('SELECT id, ad_id FROM chats WHERE id = ? AND store_id = ?').bind(Number(b.chat_id), st.id).first();
    if (!ch) fail(400, 'Ese chat no es de esta tienda.');
    b.chat_id = ch.id;
    if (!b.ad_id) b.ad_id = ch.ad_id;
    // No duplicar: si el chat ya tiene un pedido en curso (por ejemplo el que creó la IA), se avisa
    const ya = b.forzar ? null : await pedidoAbierto(c.env, ch.id);
    if (ya) fail(409, `Este chat ya tiene el pedido #${ya.number} (${ESTADOS[ya.status] || ya.status}). Ábrelo y edítalo en vez de crear otro.`, { abierto: { id: ya.id, number: ya.number, status: ya.status } });
  }
  if (b.modo && !modosFor(st.role).includes(b.modo)) fail(403, 'Tu rol no puede crear ese tipo de pedido.');
  const o = await insertOrder(c.env, st, b, { userId: u.id, source: b.chat_id ? 'whatsapp' : 'manual' });
  c.executionCtx.waitUntil(onOrderCreated(c.env, st, o).catch((e) => console.error('pedido', e)));
  return c.json({ pedido: shape(o) });
});

r.get('/chats/:id/pedido-borrador', async (c) => {
  const { chat, store } = await chatFor(c, c.req.param('id'));
  const d = draftFromChat(await chatConForm(c.env, chat), store);
  const e = await defaultEntrega(c.env, store);
  return c.json({ borrador: { ...d, entrega: d.modo === 'agencia' ? null : e.dia }, horario: e.horario, colores: storeColors(store) });
});

// Datos del bot + lo que falte del último formulario que mandó la IA
async function chatConForm(env, chat) {
  let v = {};
  try {
    v = JSON.parse(chat.bot_vars || '{}') || {};
  } catch {}
  if (!v.colores || !v.talla || !v.nombre || !v.dni || !v.direccion) {
    const f = await env.DB.prepare("SELECT body FROM messages WHERE chat_id = ? AND direction = 'out' AND body LIKE '%Pedido:%' ORDER BY id DESC LIMIT 1").bind(chat.id).first();
    if (f?.body) for (const [k, x] of Object.entries(varsFromForm(f.body))) if (!v[k]) v[k] = x;
  }
  return { ...chat, bot_vars: JSON.stringify(v) };
}

// Formulario listo para copiar (ficha del chat): datos del bot + lo que falte del último formulario de la IA
// Si la clienta ya tiene un pedido (de Shopify, de la IA o a mano), el formulario sale de ese pedido: es lo que se acordó
r.get('/chats/:id/formulario', async (c) => {
  const { chat, store } = await chatFor(c, c.req.param('id'));
  const o = await pedidoAbierto(c.env, chat.id, 7);
  const d = o ? shape(o) : draftFromChat(await chatConForm(c.env, chat), store);
  const falta = [];
  if (!d.nombre || d.nombre === chat.profile_name) falta.push('nombre');
  if (d.modo === 'agencia') {
    if (!d.dni) falta.push('DNI');
    if (!d.sede) falta.push('sede');
  } else if (!d.direccion) falta.push('dirección');
  if (!d.items.some((i) => i.color)) falta.push('colores');
  return c.json({ texto: formText(d, cfgOf(store)), falta, modo: d.modo, pedido: o ? o.number : null });
});

r.get('/chats/:id/pedidos', async (c) => {
  const { chat } = await chatFor(c, c.req.param('id'));
  const { results } = await c.env.DB.prepare(`SELECT o.*, EXISTS (SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.detail LIKE 'Mandó la captura%') AS captura
    FROM orders o WHERE o.chat_id = ? ORDER BY o.id DESC LIMIT 30`).bind(chat.id).all();
  return c.json({ pedidos: results.map(shape) });
});

r.patch('/pedidos/:id', async (c) => {
  const { order, store } = await orderFor(c, c.req.param('id'));
  const u = await requireUser(c);
  const b = await body(c);
  const cfg = cfgOf(store);
  const patch = cleanOrder(b, cfg, order);
  if (patch.modo && !modosFor(store.role).includes(patch.modo)) fail(403, 'Tu rol no puede pasar el pedido a ese tipo.');
  const status = patch.status;
  delete patch.status;
  const keys = Object.keys(patch).filter((k) => String(patch[k] ?? '') !== String(order[k] ?? ''));
  if (keys.length) {
    await c.env.DB.prepare(`UPDATE orders SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).bind(...keys.map((k) => patch[k]), now(), order.id).run();
    const names = { items: 'productos', modo: 'tipo de envío', total: 'total', adelanto: 'adelanto', entrega: 'día de entrega', guia: 'nro. de orden Shalom', guia_codigo: 'código Shalom' };
    await addEvent(c.env, order.id, 'edicion', `Cambió ${keys.map((k) => names[k] || k).join(', ')}`, u.id);
  }
  let cur = await getOrder(c.env, order.id);
  // Guía nueva: rastrear de una vez (en segundo plano)
  if ((keys.includes('guia') || keys.includes('guia_codigo')) && cur.guia && cur.guia_codigo && c.env.SHALOM_API_KEY) {
    c.executionCtx.waitUntil(trackOrder(c.env, store, cur, u.id).catch((e) => console.error('rastreo', e)));
  }
  if (patch.modo && !FLUJO[cur.modo].includes(cur.status)) cur = await setOrderStatus(c.env, store, cur, firstStatus(cur.modo), u.id, 'Cambió el tipo de envío');
  if (status && status !== cur.status) cur = await setOrderStatus(c.env, store, cur, status, u.id);
  await bump(c.env, store.id);
  const s = await loadSettings(c.env, store.id);
  return c.json({ pedido: shape(cur), texto: orderText(cur, { horario: s.entrega_horario }) });
});

// Rastrear la guía de Shalom ahora
r.post('/pedidos/:id/rastrear', async (c) => {
  const { order, store } = await orderFor(c, c.req.param('id'));
  const u = await requireUser(c);
  const r2 = await trackOrder(c.env, store, order, u.id);
  return c.json({ ok: r2.ok, error: r2.error || null, summary: r2.summary, pedido: shape(r2.order) });
});

// Recompra: el mismo pedido otra vez, con los mismos datos de entrega
r.post('/pedidos/:id/duplicar', async (c) => {
  const { order, store } = await orderFor(c, c.req.param('id'));
  const u = await requireUser(c);
  const s = shape(order);
  const o = await insertOrder(c.env, store, {
    chat_id: s.chat_id, modo: s.modo, nombre: s.nombre, celular: s.celular, dni: s.dni, distrito: s.distrito, direccion: s.direccion, referencia: s.referencia,
    ciudad: s.ciudad, sede: s.sede, items: s.items, ad_id: s.ad_id, notas: `Recompra del pedido #${s.number}`,
  }, { userId: u.id, source: s.chat_id ? 'whatsapp' : 'manual' });
  await addEvent(c.env, order.id, 'nota', `Se duplicó como pedido #${o.number} (recompra)`, u.id);
  c.executionCtx.waitUntil(onOrderCreated(c.env, store, o).catch((e) => console.error('pedido', e)));
  return c.json({ pedido: shape(o) });
});

r.delete('/pedidos/:id', async (c) => {
  const { order } = await orderFor(c, c.req.param('id'));
  const store = await storeFor(c, order.store_id, 'config');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM order_jobs WHERE order_id = ?').bind(order.id),
    c.env.DB.prepare('DELETE FROM order_events WHERE order_id = ?').bind(order.id),
    c.env.DB.prepare('DELETE FROM orders WHERE id = ?').bind(order.id),
    c.env.DB.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').bind(now(), order.chat_id || 0),
  ]);
  await bump(c.env, store.id);
  return c.json({ ok: true });
});

/* ---------- Configuración → Pedidos y Shopify ---------- */

function shopifyInfo(c, st) {
  const origin = new URL(c.req.url).origin;
  const secret = st.shopify_secret || 'SHOPIFY_SECRET';
  return { url: st.shopify_key ? `${origin}/shopify/${st.id}/${st.shopify_key}` : null, secret_name: secret, secret_ok: !!c.env[secret], last_at: st.shopify_last_at || null };
}

r.get('/stores/:id/pedidos-config', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  return c.json({
    cfg: cfgOf(st), defaults: DEFAULT_CFG, modos: MODOS, estados: ESTADOS, flujo: FLUJO,
    shopify: shopifyInfo(c, st), autos: await loadAutos(c.env, st.id), vars: AUTO_VARS,
    plantillas_ok: !!st.waba_id && st.status === 'activo',
    capi: capiInfo(st),
    conv: convInfo(c, st),
  });
});

/* ---------- Compra confirmada a los píxeles de la web (Meta y TikTok) ---------- */
function convInfo(c, st) {
  let last = null;
  try {
    last = st.conv_last ? JSON.parse(st.conv_last) : null;
  } catch {}
  return { cfg: convOf(st), meta_token: !!c.env.META_PIXEL_TOKEN, tiktok_token: !!c.env.TIKTOK_EVENTS_TOKEN, last };
}

r.patch('/stores/:id/conversiones', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  const b = await body(c);
  const cfg = convOf(st);
  if ('meta_pixel' in b) {
    const v = String(b.meta_pixel || '').replace(/\s/g, '');
    if (v && !/^\d{10,20}$/.test(v)) fail(400, 'El ID del píxel de Meta son solo números (15 o 16).');
    cfg.meta_pixel = v;
  }
  if ('tiktok_pixel' in b) {
    const v = String(b.tiktok_pixel || '').replace(/\s/g, '');
    if (v && !/^[A-Za-z0-9]{10,40}$/.test(v)) fail(400, 'El código del píxel de TikTok son letras y números (unos 20).');
    cfg.tiktok_pixel = v;
  }
  for (const k of ['meta_event', 'tiktok_event']) if (k in b) cfg[k] = clip(String(b[k] || '').replace(/[^\w]/g, ''), 40) || CONV_DEFAULT[k];
  await c.env.DB.prepare('UPDATE stores SET conv = ?, rev = rev + 1 WHERE id = ?').bind(JSON.stringify(cfg), st.id).run();
  const fresh = await c.env.DB.prepare('SELECT * FROM stores WHERE id = ?').bind(st.id).first();
  return c.json({ conv: convInfo(c, fresh) });
});

/* ---------- Compra a Meta (CAPI) ---------- */

function capiInfo(st) {
  let last = null;
  try {
    last = st.capi_last ? JSON.parse(st.capi_last) : null;
  } catch {}
  return { on: !!st.capi_on, dataset: st.capi_dataset || null, last, conectado: !!st.waba_id && st.status === 'activo' };
}

r.patch('/stores/:id/capi', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  const b = await body(c);
  const on = !!b.on;
  let error = null;
  if (on) {
    if (!st.waba_id || st.status !== 'activo') fail(400, 'Primero conecta el número de WhatsApp de esta tienda.');
    try {
      await ensureDataset(c.env, st);
    } catch (e) {
      error = e.message;
    }
  }
  await c.env.DB.prepare('UPDATE stores SET capi_on = ?, capi_last = COALESCE(?, capi_last), rev = rev + 1 WHERE id = ?')
    .bind(on && !error ? 1 : 0, error ? JSON.stringify({ at: now(), ok: false, msg: clip(error, 300) }) : null, st.id).run();
  const fresh = await c.env.DB.prepare('SELECT * FROM stores WHERE id = ?').bind(st.id).first();
  return c.json({ capi: capiInfo(fresh), error });
});

r.patch('/stores/:id/pedidos-config', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  const b = await body(c);
  const cfg = cfgOf(st);
  const n = (v, d) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : d);
  if ('producto' in b) cfg.producto = clip(String(b.producto || '').trim(), 80) || DEFAULT_CFG.producto;
  if (b.precios && typeof b.precios === 'object') {
    const p = {};
    for (const [k, v] of Object.entries(b.precios)) if (/^\d{1,2}$/.test(k) && Number(v) > 0) p[k] = Math.round(Number(v) * 100) / 100;
    if (!Object.keys(p).length) fail(400, 'Pon al menos el precio de 1 unidad.');
    cfg.precios = p;
  }
  if ('mayor_desde' in b) cfg.mayor_desde = Math.round(n(b.mayor_desde, 0));
  if ('mayor_unit' in b) cfg.mayor_unit = n(b.mayor_unit, 0);
  if ('adelanto' in b) cfg.adelanto = n(b.adelanto, 30);
  if ('prov_modo' in b) cfg.prov_modo = b.prov_modo === 'ce_prov' ? 'ce_prov' : 'agencia';
  if ('sin_cobertura' in b) cfg.sin_cobertura = clip(String(b.sin_cobertura || ''), 2000);
  if ('recompra_dias' in b) cfg.recompra_dias = Math.min(Math.max(Math.round(n(b.recompra_dias, 20)), 1), 365);
  if ('carrito_min' in b) cfg.carrito_min = Math.min(Math.max(Math.round(n(b.carrito_min, 60)), 15), 1440);
  const sets = ['order_cfg = ?'];
  const vals = [JSON.stringify(cfg)];
  if ('shopify_secret' in b) {
    const v = String(b.shopify_secret || 'SHOPIFY_SECRET').trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{1,40}$/.test(v)) fail(400, 'El nombre del secreto solo puede tener letras, números y _.');
    sets.push('shopify_secret = ?');
    vals.push(v);
  }
  await c.env.DB.prepare(`UPDATE stores SET ${sets.join(', ')}, rev = rev + 1 WHERE id = ?`).bind(...vals, st.id).run();
  const fresh = await c.env.DB.prepare('SELECT * FROM stores WHERE id = ?').bind(st.id).first();
  return c.json({ cfg: cfgOf(fresh), shopify: shopifyInfo(c, fresh) });
});

r.post('/stores/:id/shopify/enlace', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  if ((st.canal || 'mensajes') !== 'shopify') fail(400, 'Esta tienda vende por mensajes. Para conectar tu web, cámbiala a «Por Shopify» en Configuración → General.');
  const key = randomToken(18);
  await c.env.DB.prepare('UPDATE stores SET shopify_key = ? WHERE id = ?').bind(key, st.id).run();
  const fresh = await c.env.DB.prepare('SELECT * FROM stores WHERE id = ?').bind(st.id).first();
  return c.json({ shopify: shopifyInfo(c, fresh) });
});

r.patch('/stores/:id/autos/:key', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  const key = c.req.param('key');
  const cur = (await loadAutos(c.env, st.id)).find((a) => a.key === key);
  if (!cur) fail(404, 'Ese mensaje automático no existe.');
  const b = await body(c);
  const patch = {};
  if ('on' in b) patch.on = !!b.on;
  if ('text' in b) {
    const t = String(b.text || '').trim();
    if (!t) fail(400, 'El mensaje no puede quedar vacío.');
    if (t.length > 900) fail(400, 'El mensaje puede tener hasta 900 letras.');
    patch.text = t;
    if (t !== cur.text && cur.tpl_name) Object.assign(patch, { tpl_name: null, tpl_status: null, tpl_vars: null, tpl_reason: null, tpl_prev: prevFrom(cur) }); // cambió el texto: hay que pedir otra plantilla (la aprobada se sigue usando mientras tanto)
  }
  if ('delay_min' in b) patch.delay_min = Math.min(Math.max(Math.round(Number(b.delay_min) || 0), 15), 365 * 1440);
  return c.json({ auto: await saveAuto(c.env, st.id, key, patch) });
});

r.post('/stores/:id/autos/:key/plantilla', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  if (st.status !== 'activo' || !st.waba_id) fail(409, 'Primero conecta el número de WhatsApp de esta tienda.');
  return c.json({ auto: await submitTemplate(c.env, st, c.req.param('key')) });
});

r.post('/stores/:id/autos/sync', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  if (st.status !== 'activo' || !st.waba_id) return c.json({ autos: await loadAutos(c.env, st.id) });
  return c.json({ autos: await syncTemplates(c.env, st) });
});

export default r;
