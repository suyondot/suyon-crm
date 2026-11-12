// «Compra confirmada» a los píxeles de la web (Meta y TikTok), solo cuando el pedido queda 100% confirmado:
// Lima → la clienta dijo «Sí» (Confirmado); provincia → el equipo validó el adelanto (Validado).
// Así los anuncios aprenden con ventas reales y no con pedidos que después se caen.
// Tokens: secretos META_PIXEL_TOKEN y TIKTOK_EVENTS_TOKEN en Cloudflare (nunca en la base ni en el código).
import { now, clip, sha256hex } from './util.js';
import { addEvent, normPhone } from './orders.js';

export const CONV_DEFAULT = { meta_pixel: '', meta_event: 'CompraConfirmada', tiktok_pixel: '', tiktok_event: 'CompraConfirmada', tiktok_map: [] };
export const CONFIRMADOS = ['confirmado', 'validado'];
const TIKTOK_API = 'https://business-api.tiktok.com/open_api/v1.3';

export function convOf(store) {
  try {
    return { ...CONV_DEFAULT, ...(JSON.parse(store.conv || '{}') || {}) };
  } catch {
    return { ...CONV_DEFAULT };
  }
}

// Un píxel de TikTok por producto (ej. leggings cargo y pantalón formal tienen píxeles distintos):
// tiktok_map = [{ p: 'cargo', id: 'PIXEL…' }]. Cada producto del pedido va a su píxel con su parte del monto.
// Sin coincidencia → el píxel general (tiktok_pixel).
export function tiktokTargets(cfg, order) {
  let items = order.items;
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items);
    } catch {
      items = [];
    }
  }
  if (!Array.isArray(items)) items = [];
  const map = (cfg.tiktok_map || []).filter((m) => m && m.p && m.id);
  const total = Number(order.total) || 0;
  const units = items.reduce((a, i) => a + (Number(i.cantidad) || 1), 0) || 1;
  const by = new Map();
  for (const it of items) {
    const prod = norm(it.producto);
    const hit = map.find((m) => prod.includes(norm(m.p)));
    const id = hit?.id || cfg.tiktok_pixel;
    if (!id) continue;
    by.set(id, (by.get(id) || 0) + (Number(it.cantidad) || 1));
  }
  if (!by.size && cfg.tiktok_pixel) by.set(cfg.tiktok_pixel, units);
  return [...by].map(([id, u]) => ({ id, value: Math.round((total * u / units) * 100) / 100 }));
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const h = async (s) => (s ? sha256hex(s) : null);

export async function sendConversion(env, store0, order) {
  const store = await env.DB.prepare('SELECT * FROM stores WHERE id = ?').bind(store0.id).first();
  const cfg = convOf(store || {});
  const meta = cfg.meta_pixel && env.META_PIXEL_TOKEN;
  const ttTokens = [env.TIKTOK_EVENTS_TOKEN, env.TIKTOK_EVENTS_TOKEN_2].filter(Boolean);
  const ttTargets = ttTokens.length ? tiktokTargets(cfg, order) : [];
  const tiktok = ttTargets.length > 0;
  if (!order || (!meta && !tiktok) || order.conv_at || !CONFIRMADOS.includes(order.status)) return { skipped: true };
  const claim = await env.DB.prepare('UPDATE orders SET conv_at = ? WHERE id = ? AND conv_at IS NULL').bind(now(), order.id).run();
  if (!claim.meta.changes) return { skipped: true };
  const phone = normPhone(order.celular);
  const [fn, ...rest] = String(order.nombre || '').trim().split(/\s+/);
  const value = Number(order.total) || 0;
  const currency = store.currency || 'PEN';
  const eventId = `ct-${store.id}-${order.id}`;
  const t = Math.floor(now() / 1000);
  const orderId = order.ext_name || `#${order.number}`;
  const res = [];
  if (meta) {
    try {
      const user = { country: [await h('pe')], external_id: [await h(String(order.id))] };
      if (phone) user.ph = [await h(phone)];
      if (fn) user.fn = [await h(norm(fn))];
      if (rest.length) user.ln = [await h(norm(rest.join(' ')))];
      const city = order.ciudad || order.distrito;
      if (city) user.ct = [await h(norm(city))];
      const r = await fetch(`${env.GRAPH_API}/${cfg.meta_pixel}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: env.META_PIXEL_TOKEN,
          data: [{ event_name: cfg.meta_event || 'CompraConfirmada', event_time: t, event_id: eventId, action_source: 'website', user_data: user, custom_data: { currency, value, order_id: orderId, content_type: 'product' } }],
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error?.message || `Meta respondió ${r.status}`);
      res.push('Meta ✓');
    } catch (e) {
      res.push(`Meta ✗ ${e.message}`);
    }
  }
  if (tiktok) {
    const user = { external_id: await h(String(order.id)) };
    if (phone) user.phone = await h('+' + phone);
    for (const tg of ttTargets) {
      let err = '';
      // Cada píxel puede tener su token (TIKTOK_EVENTS_TOKEN y, si no sirve, TIKTOK_EVENTS_TOKEN_2)
      for (const token of ttTokens) {
        try {
          const r = await fetch(`${env.TIKTOK_API || TIKTOK_API}/event/track/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Access-Token': token },
            body: JSON.stringify({
              event_source: 'web',
              event_source_id: tg.id,
              data: [{ event: cfg.tiktok_event || 'CompraConfirmada', event_time: t, event_id: eventId, user, properties: { currency, value: tg.value, content_type: 'product', order_id: orderId } }],
            }),
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || (j.code !== undefined && j.code !== 0)) throw new Error(j.message || `TikTok respondió ${r.status}`);
          err = '';
          break;
        } catch (e) {
          err = e.message;
        }
      }
      res.push(err ? `TikTok ${tg.id.slice(0, 6)}… ✗ ${err}` : `TikTok ${tg.id.slice(0, 6)}… ✓`);
    }
  }
  const ok = !res.some((x) => x.includes('✗'));
  const msg = `Pedido #${order.number} (S/${value}) · ${res.join(' · ')}`;
  await env.DB.prepare('UPDATE stores SET conv_last = ? WHERE id = ?').bind(JSON.stringify({ at: now(), ok, msg: clip(msg, 300) }), store.id).run();
  await addEvent(env, order.id, 'meta', `Compra confirmada a los anuncios: ${res.join(' · ')}`);
  return { ok, res };
}
