// Rastreo de guías Shalom en los pedidos: guarda el estado y avanza el pedido solo (agencia)
import { now, fail } from './util.js';
import { track } from './shalom.js';
import { getOrder, addEvent } from './orders.js';
import { setOrderStatus } from './automations.js';

const ORDEN = ['por_pagar', 'validado', 'enviado', 'en_agencia', 'recogido'];
const SEGUN = { registrado: 'enviado', origen: 'enviado', transito: 'enviado', destino: 'en_agencia', reparto: 'en_agencia', entregado: 'recogido' };

export async function trackOrder(env, store, order, userId = null) {
  if (!env.SHALOM_API_KEY) fail(400, 'Falta conectar Shalom (secreto SHALOM_API_KEY).');
  if (!order.guia || !order.guia_codigo) fail(400, 'Pon el número de orden y el código del ticket de Shalom.');
  const t = await track(env, order.guia, order.guia_codigo);
  const t0 = now();
  if (!t.ok || !t.summary) {
    await env.DB.prepare('UPDATE orders SET guia_at = ? WHERE id = ?').bind(t0, order.id).run();
    return { ok: false, error: t.error || 'Shalom no devolvió el estado de esa guía.', summary: null, order };
  }
  const label = t.summary.demora ? `${t.summary.estado} · ${t.summary.demora}` : t.summary.estado;
  await env.DB.prepare('UPDATE orders SET guia_estado = ?, guia_at = ?, updated_at = ? WHERE id = ?').bind(label, t0, t0, order.id).run();
  if (label !== order.guia_estado) await addEvent(env, order.id, 'rastreo', `Shalom: ${label}${t.summary.fecha ? ` (${t.summary.fecha})` : ''}`, userId);
  let cur = await getOrder(env, order.id);
  // Solo avanza (nunca retrocede) y nunca salta la validación del adelanto
  const to = SEGUN[t.summary.key];
  if (cur.modo === 'agencia' && to && ['validado', 'enviado', 'en_agencia'].includes(cur.status) && ORDEN.indexOf(to) > ORDEN.indexOf(cur.status)) {
    cur = await setOrderStatus(env, store, cur, to, userId, 'según el rastreo de Shalom');
  }
  await env.DB.prepare('UPDATE stores SET rev = rev + 1 WHERE id = ?').bind(store.id).run();
  return { ok: true, summary: t.summary, order: cur };
}

// Cron: revisa cada 2 horas las guías de pedidos que siguen en camino
export async function trackDue(env) {
  if (!env.SHALOM_API_KEY) return;
  const { results } = await env.DB.prepare(
    `SELECT * FROM orders WHERE guia IS NOT NULL AND guia_codigo IS NOT NULL AND modo = 'agencia' AND status IN ('validado', 'enviado', 'en_agencia')
     AND (guia_at IS NULL OR guia_at < ?) ORDER BY COALESCE(guia_at, 0) LIMIT 8`
  ).bind(now() - 2 * 3600e3).all().catch(() => ({ results: [] }));
  for (const o of results) {
    try {
      const store = await env.DB.prepare('SELECT * FROM stores WHERE id = ?').bind(o.store_id).first();
      if (store) await trackOrder(env, store, o);
    } catch (e) {
      console.error('rastreo', o.id, e);
    }
  }
}
