// Reportes: mensajes, conversaciones, ventas y de dónde vienen (por tienda y rango de días)
import { Hono } from 'hono';
import { now, fail, tzOffset, localDay, localParts } from './util.js';
import { storeFor } from './auth.js';

const r = new Hono();
const DAY = 864e5;
export const SALE_LABELS = ['COMPRÓ', '✅ LIMA', '✅ PROVINCIA'];

// Inicio del día local (YYYY-MM-DD) en milisegundos UTC
function dayStart(s, tz) {
  const [y, m, d] = s.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  return guess - tzOffset(guess, tz);
}

import { colorsOf, tallaOf, strip, title } from './catalogo.js';
export { colorsOf, tallaOf };

function destinoOf(v, labels) {
  if (labels.includes('✅ PROVINCIA') || v.sede_shalom) return 'Provincia';
  if (labels.includes('✅ LIMA')) return 'Lima';
  const d = strip(v.destino);
  if (d.includes('provincia') || d.includes('shalom')) return 'Provincia';
  if (d.includes('lima') || v.distrito) return 'Lima';
  return 'Sin dato';
}

const count = (map, k, n = 1) => map.set(k, (map.get(k) || 0) + n);
const top = (map, n = 12) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, value]) => ({ name, value }));

r.get('/stores/:id/reporte', async (c) => {
  const st = await storeFor(c, c.req.param('id'));
  const tz = st.timezone || 'America/Lima';
  const q = c.req.query();
  const today = localDay(now(), tz);
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const desde = re.test(q.desde || '') ? q.desde : today;
  const hasta = re.test(q.hasta || '') ? q.hasta : desde;
  if (hasta < desde) fail(400, 'La fecha final es antes que la inicial.');
  const t0 = dayStart(desde, tz);
  const t1 = dayStart(hasta, tz) + DAY; // hasta el final de ese día
  if (t1 - t0 > 93 * DAY) fail(400, 'Elige como máximo 3 meses.');
  const oneDay = t1 - t0 <= DAY + 3600e3;
  const db = c.env.DB;

  // Cubetas: por hora si es un solo día, si no por día
  const buckets = [];
  if (oneDay) for (let h = 0; h < 24; h++) buckets.push({ key: String(h), label: `${h}h` });
  else for (let t = t0; t < t1; t += DAY) {
    const d = localDay(t + 3600e3, tz);
    buckets.push({ key: d, label: d.slice(8) + '/' + d.slice(5, 7) });
  }
  const bucketOf = (t) => (oneDay ? String(localParts(t, tz).h) : localDay(t, tz));

  // Si la tienda ya usa Pedidos, las ventas salen de los pedidos; si no, de las etiquetas COMPRÓ / ✅ LIMA / ✅ PROVINCIA
  const usaPedidos = !!(await db.prepare('SELECT 1 AS x FROM orders WHERE store_id = ? LIMIT 1').bind(st.id).first());
  const [msgs, chats, sales, calls] = await Promise.all([
    db.prepare(`SELECT m.created_at FROM messages m JOIN chats c ON c.id = m.chat_id
      WHERE m.store_id = ? AND c.sim = 0 AND m.direction = 'in' AND m.created_at >= ? AND m.created_at < ? LIMIT 50000`).bind(st.id, t0, t1).all(),
    db.prepare(`SELECT id, ad_id, ad_headline, created_at, first_reply_at FROM chats
      WHERE store_id = ? AND sim = 0 AND created_at >= ? AND created_at < ? LIMIT 20000`).bind(st.id, t0, t1).all(),
    usaPedidos
      ? db.prepare(`SELECT o.id, o.modo, o.status, o.items, o.unidades, o.total, o.distrito, o.ciudad, o.created_at AS sold_at,
          COALESCE(o.ad_id, c.ad_id) AS ad_id, c.ad_headline
        FROM orders o LEFT JOIN chats c ON c.id = o.chat_id
        WHERE o.store_id = ? AND o.status != 'cancelado' AND o.created_at >= ? AND o.created_at < ? LIMIT 20000`).bind(st.id, t0, t1).all()
      : db.prepare(`SELECT c.id, c.ad_id, c.ad_headline, c.bot_vars, MIN(cl.created_at) AS sold_at,
        (SELECT GROUP_CONCAT(l2.name, '|') FROM chat_labels x JOIN labels l2 ON l2.id = x.label_id WHERE x.chat_id = c.id) AS labels
      FROM chat_labels cl JOIN labels l ON l.id = cl.label_id JOIN chats c ON c.id = cl.chat_id
      WHERE c.store_id = ? AND c.sim = 0 AND l.name IN (?, ?, ?) AND cl.created_at >= ? AND cl.created_at < ?
      GROUP BY c.id LIMIT 20000`).bind(st.id, ...SALE_LABELS, t0, t1).all(),
    db.prepare(`SELECT result, COUNT(*) AS n FROM calls WHERE store_id = ? AND created_at >= ? AND created_at < ? GROUP BY result`).bind(st.id, t0, t1).all(),
  ]);

  const series = new Map(buckets.map((b) => [b.key, { chats: 0, ventas: 0, mensajes: 0 }]));
  for (const m of msgs.results) { const s = series.get(bucketOf(m.created_at)); if (s) s.mensajes++; }
  for (const ch of chats.results) { const s = series.get(bucketOf(ch.created_at)); if (s) s.chats++; }

  const tallas = new Map();
  const colores = new Map();
  const promos = new Map();
  const lugares = new Map();
  const destino = { Lima: 0, Provincia: 0, 'Sin dato': 0 };
  let unidades = 0;
  const ads = new Map();
  const ad = (id, head) => {
    const k = id || 'directo';
    if (!ads.has(k)) ads.set(k, { id: id || null, name: id ? head || `Anuncio ${id}` : 'Escribieron directo (sin anuncio)', chats: 0, ventas: 0, entregadas: 0, monto: 0 });
    return ads.get(k);
  };
  for (const ch of chats.results) ad(ch.ad_id, ch.ad_headline).chats++;

  let monto = 0;
  let entregados = 0;
  let perdidos = 0;
  if (usaPedidos) for (const o of sales.results) {
    const b = series.get(bucketOf(o.sold_at));
    if (b) b.ventas++;
    const A = ad(o.ad_id, o.ad_headline);
    A.ventas++;
    A.monto += Number(o.total) || 0;
    if (['entregado', 'recogido'].includes(o.status)) A.entregadas++;
    const dest = o.modo === 'lima' ? 'Lima' : 'Provincia';
    destino[dest]++;
    monto += Number(o.total) || 0;
    if (['entregado', 'recogido'].includes(o.status)) entregados++;
    if (['rechazado', 'no_recogido'].includes(o.status)) perdidos++;
    let items = [];
    try { items = JSON.parse(o.items || '[]') || []; } catch {}
    const qty = o.unidades || items.reduce((a, it) => a + (Number(it.cantidad) || 0), 0) || 1;
    unidades += qty;
    count(promos, qty >= 5 ? '5 o más (por mayor)' : `${qty} ${qty === 1 ? 'pantalón' : 'pantalones'}`);
    if (items.length) for (const it of items) {
      const n = Number(it.cantidad) || 1;
      count(tallas, tallaOf(it.talla) || 'Sin dato', n);
      count(colores, colorsOf(it.color)[0] || (it.color ? title(it.color) : 'Sin dato'), n);
    } else {
      count(tallas, 'Sin dato', qty);
      count(colores, 'Sin dato', qty);
    }
    const lugar = title(dest === 'Lima' ? o.distrito || '' : o.ciudad || o.distrito || '');
    count(lugares, lugar ? `${lugar}${dest === 'Provincia' ? ' (prov.)' : ''}` : 'Sin dato');
  }
  else for (const s of sales.results) {
    let v = {};
    try { v = JSON.parse(s.bot_vars || '{}') || {}; } catch {}
    const labels = String(s.labels || '').split('|');
    const b = series.get(bucketOf(s.sold_at));
    if (b) b.ventas++;
    ad(s.ad_id, s.ad_headline).ventas++;
    const dest = destinoOf(v, labels);
    destino[dest]++;
    const cols = colorsOf(v.colores);
    let qty = parseInt(String(v.cantidad || '').replace(/\D/g, ''), 10);
    if (!qty || qty > 50) qty = cols.length || 1;
    unidades += qty;
    count(promos, qty >= 5 ? '5 o más (por mayor)' : `${qty} ${qty === 1 ? 'pantalón' : 'pantalones'}`);
    const talla = tallaOf(v.talla);
    count(tallas, talla || 'Sin dato', qty);
    if (cols.length) {
      // Si pidió 3 y dijo 3 colores, 1 de cada uno; si dijo menos, se reparte lo que queda en el primero
      const each = cols.map(() => 1);
      each[0] += Math.max(0, qty - cols.length);
      cols.forEach((col, i) => count(colores, col, each[i]));
    } else count(colores, 'Sin dato', qty);
    const lugar = dest === 'Provincia' ? title(v.destino || v.distrito || 'Provincia') : title(v.distrito || v.destino || '');
    count(lugares, lugar ? `${lugar}${dest === 'Provincia' && !/provincia/i.test(lugar) ? ' (prov.)' : ''}` : 'Sin dato');
  }

  const ORDER_T = ['XS', 'S', 'M', 'L', 'XL', 'Sin dato'];
  const nChats = chats.results.length;
  const nSales = sales.results.length;
  const callMap = Object.fromEntries(calls.results.map((x) => [x.result, x.n]));
  const fromAd = chats.results.filter((x) => x.ad_id).length;
  const replied = chats.results.filter((x) => x.first_reply_at).length;

  return c.json({
    desde, hasta, oneDay, tz, store: st.name, fuente: usaPedidos ? 'pedidos' : 'etiquetas',
    totales: {
      monto: usaPedidos ? Math.round(monto * 100) / 100 : null,
      entregados: usaPedidos ? entregados : null,
      perdidos: usaPedidos ? perdidos : null,
      mensajes: msgs.results.length,
      chats: nChats,
      chats_anuncio: fromAd,
      ventas: nSales,
      unidades,
      tasa: nChats ? nSales / nChats : null,
      lima: destino.Lima,
      provincia: destino.Provincia,
      sin_destino: destino['Sin dato'],
      respondidas_anuncio: replied,
    },
    series: buckets.map((b) => ({ label: b.label, ...series.get(b.key) })),
    tallas: ORDER_T.filter((t) => tallas.has(t)).map((t) => ({ name: t, value: tallas.get(t) })),
    colores: top(colores, 10),
    promos: [...promos.entries()].sort((a, b) => parseInt(a[0]) - parseInt(b[0])).map(([name, value]) => ({ name, value })),
    lugares: top(lugares, 10),
    anuncios: [...ads.values()].sort((a, b) => b.ventas - a.ventas || b.chats - a.chats).slice(0, 15).map((a) => ({ ...a, tasa: a.chats ? a.ventas / a.chats : null })),
    llamadas: { cerro: callMap.cerro || 0, lo_piensa: callMap.lo_piensa || 0, no_contesto: callMap.no_contesto || 0 },
  });
});

/* ---------- Reporte de tiendas que venden por Shopify (su web) ---------- */
// Lo que importa: pedidos que entran de la web, cuántos se confirman por WhatsApp, carritos abandonados y recuperados.
const CONFIRMADOS = ['confirmado', 'en_ruta', 'reprogramado', 'entregado', 'rechazado', 'validado', 'enviado', 'en_camino', 'en_agencia', 'falta_abonar', 'recogido', 'no_recogido'];
const AUTO_NAMES = { confirmar: 'Confirmar pedido', adelanto: 'Pedir adelanto', agendado: 'Agendado', en_ruta: 'En ruta', enviado: 'Enviado', en_agencia: 'Llegó a la agencia', entregado: 'Entregado', recompra: 'Volver a comprar', carrito: 'Carrito olvidado' };

r.get('/stores/:id/reporte-web', async (c) => {
  const st = await storeFor(c, c.req.param('id'));
  const tz = st.timezone || 'America/Lima';
  const q = c.req.query();
  const today = localDay(now(), tz);
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const desde = re.test(q.desde || '') ? q.desde : today;
  const hasta = re.test(q.hasta || '') ? q.hasta : desde;
  if (hasta < desde) fail(400, 'La fecha final es antes que la inicial.');
  const t0 = dayStart(desde, tz);
  const t1 = dayStart(hasta, tz) + DAY;
  if (t1 - t0 > 93 * DAY) fail(400, 'Elige como máximo 3 meses.');
  const oneDay = t1 - t0 <= DAY + 3600e3;
  const db = c.env.DB;
  const buckets = [];
  if (oneDay) for (let h = 0; h < 24; h++) buckets.push({ key: String(h), label: `${h}h` });
  else for (let t = t0; t < t1; t += DAY) {
    const d = localDay(t + 3600e3, tz);
    buckets.push({ key: d, label: d.slice(8) + '/' + d.slice(5, 7) });
  }
  const bucketOf = (t) => (oneDay ? String(localParts(t, tz).h) : localDay(t, tz));
  const [orders, carts, autos] = await Promise.all([
    db.prepare(`SELECT id, source, modo, status, items, unidades, total, distrito, ciudad, created_at FROM orders
      WHERE store_id = ? AND created_at >= ? AND created_at < ? LIMIT 20000`).bind(st.id, t0, t1).all(),
    db.prepare(`SELECT k.id, k.total, k.sent_at, k.order_id, k.created_at, o.total AS order_total FROM carts k LEFT JOIN orders o ON o.id = k.order_id
      WHERE k.store_id = ? AND k.created_at >= ? AND k.created_at < ? LIMIT 20000`).bind(st.id, t0, t1).all(),
    db.prepare(`SELECT json_extract(extra, '$.auto') AS k, COUNT(*) AS n FROM messages
      WHERE store_id = ? AND direction = 'out' AND created_at >= ? AND created_at < ? AND extra LIKE '%"auto":%' GROUP BY k`).bind(st.id, t0, t1).all(),
  ]);
  const series = new Map(buckets.map((b) => [b.key, { pedidos: 0, confirmados: 0, carritos: 0 }]));
  const T = { pedidos: 0, web: 0, manual: 0, confirmados: 0, por_confirmar: 0, cancelados: 0, entregados: 0, perdidos: 0, monto: 0, unidades: 0, lima: 0, provincia: 0 };
  const productos = new Map();
  const tallas = new Map();
  const colores = new Map();
  const promos = new Map();
  const lugares = new Map();
  for (const o of orders.results) {
    const b = series.get(bucketOf(o.created_at));
    T.pedidos++;
    if (o.source === 'shopify') T.web++;
    else T.manual++;
    if (b) b.pedidos++;
    if (o.status === 'cancelado') {
      T.cancelados++;
      continue;
    }
    if (['nuevo', 'por_pagar'].includes(o.status)) T.por_confirmar++;
    if (CONFIRMADOS.includes(o.status)) {
      T.confirmados++;
      if (b) b.confirmados++;
    }
    if (['entregado', 'recogido'].includes(o.status)) T.entregados++;
    if (['rechazado', 'no_recogido'].includes(o.status)) T.perdidos++;
    T.monto += Number(o.total) || 0;
    const dest = o.modo === 'lima' ? 'Lima' : 'Provincia';
    T[dest === 'Lima' ? 'lima' : 'provincia']++;
    let items = [];
    try { items = JSON.parse(o.items || '[]') || []; } catch {}
    const qty = o.unidades || items.reduce((a, it) => a + (Number(it.cantidad) || 0), 0) || 1;
    T.unidades += qty;
    count(promos, qty >= 5 ? '5 o más' : `${qty} ${qty === 1 ? 'unidad' : 'unidades'}`);
    for (const it of items) {
      const n = Number(it.cantidad) || 1;
      count(productos, title(it.producto || '') || 'Sin nombre', n);
      if (it.talla) count(tallas, tallaOf(it.talla) || String(it.talla).toUpperCase(), n);
      if (it.color) count(colores, colorsOf(it.color)[0] || title(it.color), n);
    }
    const lugar = title(dest === 'Lima' ? o.distrito || '' : o.ciudad || o.distrito || '');
    count(lugares, lugar ? `${lugar}${dest === 'Provincia' ? ' (prov.)' : ''}` : 'Sin dato');
  }
  const K = { abandonados: carts.results.length, avisados: 0, recuperados: 0, recuperados_aviso: 0, monto_recuperado: 0, monto_perdido: 0 };
  for (const k of carts.results) {
    const b = series.get(bucketOf(k.created_at));
    if (b) b.carritos++;
    if (k.sent_at) K.avisados++;
    if (k.order_id) {
      K.recuperados++;
      if (k.sent_at) K.recuperados_aviso++;
      K.monto_recuperado += Number(k.order_total ?? k.total) || 0;
    } else K.monto_perdido += Number(k.total) || 0;
  }
  const vivos = T.pedidos - T.cancelados;
  return c.json({
    desde, hasta, oneDay, tz, store: st.name,
    totales: {
      ...T, monto: Math.round(T.monto * 100) / 100,
      ticket: vivos ? Math.round((T.monto / vivos) * 100) / 100 : null,
      tasa_confirma: vivos ? T.confirmados / vivos : null,
      tasa_entrega: T.confirmados ? T.entregados / T.confirmados : null,
    },
    carritos: { ...K, monto_recuperado: Math.round(K.monto_recuperado * 100) / 100, monto_perdido: Math.round(K.monto_perdido * 100) / 100, tasa: K.abandonados ? K.recuperados / K.abandonados : null },
    avisos: autos.results.filter((x) => x.k).map((x) => ({ name: AUTO_NAMES[x.k] || x.k, value: x.n })).sort((a, b) => b.value - a.value),
    series: buckets.map((b) => ({ label: b.label, ...series.get(b.key) })),
    productos: top(productos, 10),
    tallas: ['XS', 'S', 'M', 'L', 'XL'].filter((t) => tallas.has(t)).map((t) => ({ name: t, value: tallas.get(t) })).concat(top(tallas, 10).filter((x) => !['XS', 'S', 'M', 'L', 'XL'].includes(x.name))),
    colores: top(colores, 10),
    promos: [...promos.entries()].sort((a, b) => parseInt(a[0]) - parseInt(b[0])).map(([name, value]) => ({ name, value })),
    lugares: top(lugares, 10),
  });
});

export default r;

/* ---------------- Embudo: hasta qué paso llega cada conversación ---------------- */
// Cohorte = conversaciones que empezaron en el periodo. Cada chat cuenta hasta el paso más alto que alcanzó
// (sale de lo que guardó el bot, el formulario enviado y sus pedidos). «Se quedaron» = llegaron hasta ese paso y no pasaron.
const EMBUDO_ROPA = [
  ['llegaron', 'Llegaron'],
  ['respondieron', 'Respondieron algo'],
  ['talla', 'Dieron su talla'],
  ['colores', 'Eligieron colores'],
  ['destino', 'Dijeron su distrito o ciudad'],
  ['datos', 'Dieron sus datos'],
  ['formulario', 'Recibieron el formulario'],
  ['compra', 'Confirmaron o pagaron (pedido)'],
  ['entregado', 'Entregado o recogido'],
];
const EMBUDO_SIMPLE = EMBUDO_ROPA.filter(([k]) => !['talla', 'colores'].includes(k));

export function etapaDe(x, simple) {
  let v = {};
  try {
    v = JSON.parse(x.bot_vars || '{}') || {};
  } catch {}
  const labels = String(x.labels || '').split('|');
  const ok = {
    llegaron: true,
    respondieron: x.n_in >= 2,
    talla: !!v.talla || labels.some((l) => /^talla /i.test(l)),
    colores: !!v.colores,
    destino: !!(v.distrito || v.destino || v.sede_shalom || v.ciudad),
    datos: !!(v.nombre && (v.direccion || v.dni)),
    formulario: !!x.n_form,
    compra: !!x.o_status || labels.some((l) => SALE_LABELS.includes(l)),
    entregado: ['entregado', 'recogido', 'falta_abonar'].includes(x.o_status),
  };
  const pasos = simple ? EMBUDO_SIMPLE : EMBUDO_ROPA;
  let i = 0;
  pasos.forEach(([k], j) => {
    if (ok[k]) i = j;
  });
  const zona = x.o_modo ? (x.o_modo === 'lima' ? 'lima' : 'provincia') : (() => {
    const d = destinoOf(v, labels);
    return d === 'Lima' ? 'lima' : d === 'Provincia' ? 'provincia' : 'sin';
  })();
  return { i, zona, vars: v };
}

r.get('/stores/:id/embudo', async (c) => {
  const st = await storeFor(c, c.req.param('id'));
  const tz = st.timezone || 'America/Lima';
  const q = c.req.query();
  const today = localDay(now(), tz);
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const desde = re.test(q.desde || '') ? q.desde : today;
  const hasta = re.test(q.hasta || '') ? q.hasta : desde;
  if (hasta < desde) fail(400, 'La fecha final es antes que la inicial.');
  const t0 = dayStart(desde, tz);
  const t1 = dayStart(hasta, tz) + DAY;
  if (t1 - t0 > 93 * DAY) fail(400, 'Elige como máximo 3 meses.');
  const db = c.env.DB;
  const simple = st.rubro === 'simple';
  const pasos = simple ? EMBUDO_SIMPLE : EMBUDO_ROPA;
  const { results } = await db.prepare(`SELECT c.id, c.wa_id, c.profile_name, c.ad_id, c.ad_headline, c.bot_vars, c.last_preview, c.last_msg_at, c.bot_paused,
      (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.id AND m.direction = 'in') AS n_in,
      (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.id AND m.direction = 'out' AND m.body LIKE '%Pedido:%') AS n_form,
      (SELECT o.status FROM orders o WHERE o.chat_id = c.id AND o.status != 'cancelado' ORDER BY o.id DESC LIMIT 1) AS o_status,
      (SELECT o.modo FROM orders o WHERE o.chat_id = c.id AND o.status != 'cancelado' ORDER BY o.id DESC LIMIT 1) AS o_modo,
      (SELECT GROUP_CONCAT(l.name, '|') FROM chat_labels x JOIN labels l ON l.id = x.label_id WHERE x.chat_id = c.id) AS labels
    FROM chats c WHERE c.store_id = ? AND c.sim = 0 AND c.created_at >= ? AND c.created_at < ? LIMIT 5000`).bind(st.id, t0, t1).all();

  // Anuncios del periodo (para el filtro)
  const ads = new Map();
  for (const x of results) if (x.ad_id) ads.set(x.ad_id, ads.get(x.ad_id) || { id: x.ad_id, name: x.ad_headline || 'Anuncio sin título', n: 0 }), ads.get(x.ad_id).n++;
  const zonaQ = ['lima', 'provincia'].includes(q.zona) ? q.zona : '';
  const rows = results.filter((x) => (!q.ad ? true : q.ad === 'sin' ? !x.ad_id : q.ad === 'con' ? !!x.ad_id : x.ad_id === q.ad));
  const n = pasos.map(() => 0);
  const quedaron = pasos.map(() => []);
  for (const x of rows) {
    const { i, zona, vars } = etapaDe(x, simple);
    if (zonaQ && zona !== zonaQ) continue;
    for (let j = 0; j <= i; j++) n[j]++;
    quedaron[i].push({
      id: x.id,
      nombre: vars.nombre || x.profile_name || '',
      wa: x.wa_id,
      ultimo: x.last_preview || '',
      at: x.last_msg_at,
      pausa: !!x.bot_paused,
    });
  }
  const etapas = pasos.map(([key, label], j) => ({
    key,
    label,
    n: n[j],
    de_arriba: j ? (n[j - 1] ? n[j] / n[j - 1] : null) : null,
    del_total: n[0] ? n[j] / n[0] : null,
    quedaron: j === pasos.length - 1 ? 0 : quedaron[j].length,
    chats: j === pasos.length - 1 ? [] : quedaron[j].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 60),
  }));
  // La caída más grande (sin contar el último paso): ahí conviene cambiar el texto
  let peor = null;
  etapas.slice(0, -1).forEach((e, j) => {
    if (e.quedaron && (!peor || e.quedaron > peor.quedaron)) peor = { key: e.key, label: e.label, quedaron: e.quedaron, sig: etapas[j + 1].label };
  });

  // Seguimientos: cuántas recibieron cada mensaje y cuántas respondieron después (revivieron)
  const { results: flows } = await db.prepare('SELECT id, name, graph FROM bot_flows WHERE store_id = ?').bind(st.id).all();
  const segName = new Map();
  for (const f of flows) {
    let g = {};
    try {
      g = JSON.parse(f.graph || '{}');
    } catch {}
    for (const s of g.sequences || []) (s.steps || []).forEach((p, k) => {
      const m = Number(p.after_min) || 0;
      const cuando = m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
      const que = (p.items || []).map((it) => ({ image: 'foto', video: 'video', audio: 'audio', document: 'PDF' }[it.kind] || 'texto')).join(' + ');
      segName.set(`seq:${s.id}:${k}`, { flow: f.name, seq: s.name || s.id, paso: k + 1, cuando, que });
    });
  }
  const { results: segs } = await db.prepare(`SELECT m.bot_node AS node, COUNT(DISTINCT m.chat_id) AS enviados,
      COUNT(DISTINCT CASE WHEN m.replied = 1 THEN m.chat_id END) AS revivieron,
      COUNT(DISTINCT CASE WHEN m.status = 'failed' THEN m.chat_id END) AS fallidos
    FROM messages m JOIN chats c ON c.id = m.chat_id
    WHERE m.store_id = ? AND c.sim = 0 AND m.bot_node LIKE 'seq:%' AND m.created_at >= ? AND m.created_at < ?
    GROUP BY m.bot_node`).bind(st.id, t0, t1).all();
  const seguimientos = segs.map((s) => ({ ...s, ...(segName.get(s.node) || { seq: s.node, paso: '', cuando: '', que: '' }), tasa: s.enviados ? s.revivieron / s.enviados : null }))
    .sort((a, b) => String(a.seq).localeCompare(String(b.seq)) || a.paso - b.paso);

  return c.json({ desde, hasta, etapas, peor, total: n[0], anuncios: [...ads.values()].sort((a, b) => b.n - a.n), seguimientos });
});
