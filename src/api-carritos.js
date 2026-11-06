// Carritos abandonados de Shopify: quién dejó su compra a medias, si ya se le avisó y si volvió a comprar
import { Hono } from 'hono';
import { fail } from './util.js';
import { storeFor } from './auth.js';
import { sendAuto, loadAutos } from './automations.js';

const r = new Hono();
const FILTROS = {
  todos: '1 = 1',
  pendientes: 'k.order_id IS NULL AND k.sent_at IS NULL',
  avisados: 'k.order_id IS NULL AND k.sent_at IS NOT NULL',
  recuperados: 'k.order_id IS NOT NULL',
};

r.get('/stores/:id/carritos', async (c) => {
  const st = await storeFor(c, c.req.param('id'));
  const f = FILTROS[c.req.query('f')] ? c.req.query('f') : 'todos';
  const q = String(c.req.query('q') || '').trim().toLowerCase().slice(0, 60);
  const db = c.env.DB;
  const where = [`k.store_id = ?`, FILTROS[f]];
  const vals = [st.id];
  if (q) {
    where.push('(LOWER(COALESCE(k.nombre, \'\')) LIKE ? OR k.celular LIKE ?)');
    vals.push(`%${q}%`, `%${q.replace(/\D/g, '') || q}%`);
  }
  const { results } = await db.prepare(
    `SELECT k.id, k.nombre, k.celular, k.total, k.items, k.url, k.sent_at, k.order_id, k.created_at,
       o.number AS order_number, o.total AS order_total,
       (SELECT ch.id FROM chats ch WHERE ch.store_id = k.store_id AND ch.wa_id = k.celular LIMIT 1) AS chat_id
     FROM carts k LEFT JOIN orders o ON o.id = k.order_id
     WHERE ${where.join(' AND ')} ORDER BY k.created_at DESC LIMIT 300`
  ).bind(...vals).all();
  const res = await db.prepare(
    `SELECT COUNT(*) AS total, SUM(order_id IS NULL AND sent_at IS NULL) AS pendientes, SUM(order_id IS NULL AND sent_at IS NOT NULL) AS avisados,
       SUM(order_id IS NOT NULL) AS recuperados, SUM(CASE WHEN order_id IS NULL THEN total ELSE 0 END) AS monto_pendiente
     FROM carts WHERE store_id = ?`
  ).bind(st.id).first();
  const auto = (await loadAutos(c.env, st.id)).find((a) => a.key === 'carrito');
  return c.json({
    carritos: results.map((k) => {
      let items = [];
      try { items = JSON.parse(k.items || '[]') || []; } catch {}
      return { ...k, items };
    }),
    resumen: { total: res?.total || 0, pendientes: res?.pendientes || 0, avisados: res?.avisados || 0, recuperados: res?.recuperados || 0, monto_pendiente: Math.round((res?.monto_pendiente || 0) * 100) / 100 },
    aviso: { on: !!auto?.on, delay_min: auto?.delay_min || null, plantilla: auto?.tpl_status || null },
  });
});

// Mandar el aviso de «carrito olvidado» ahora (a mano)
r.post('/carritos/:id/aviso', async (c) => {
  const k = await c.env.DB.prepare('SELECT * FROM carts WHERE id = ?').bind(Number(c.req.param('id'))).first();
  if (!k) fail(404, 'Ese carrito no existe.');
  const st = await storeFor(c, k.store_id);
  if (k.order_id) fail(400, 'Esta clienta ya compró.');
  const r0 = await sendAuto(c.env, st, 'carrito', { cart: k });
  if (r0.skipped === 'apagado') fail(400, 'El aviso «Carrito olvidado» está apagado. Enciéndelo en Configuración → Shopify.');
  if (r0.skipped) fail(400, 'Este carrito no tiene celular.');
  if (!r0.ok) fail(400, r0.error || 'No se pudo mandar. Mira el motivo en Avisos.');
  await c.env.DB.prepare('UPDATE carts SET sent_at = ? WHERE id = ?').bind(Date.now(), k.id).run();
  return c.json({ ok: true, type: r0.type });
});

export default r;
