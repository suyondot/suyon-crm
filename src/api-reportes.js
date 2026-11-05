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
      WHERE c.store_id = ? AND c.sim = 0 AND m.direction = 'in' AND m.created_at >= ? AND m.created_at < ? LIMIT 50000`).bind(st.id, t0, t1).all(),
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

export default r;
