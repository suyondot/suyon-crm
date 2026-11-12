// Shopify: los pedidos y carritos llegan por webhook (Configuración → Notificaciones → Webhooks en Shopify)
import { now, clip, safeEqual, b64 } from './util.js';
import { cfgOf, modoFor, normPhone, priceFor, insertOrder, getOrder, ESTADOS, lugarLima } from './orders.js';
import { onOrderCreated, setOrderStatus } from './automations.js';
import { notify } from './bot.js';
import { colorsOf, tallaOf } from './catalogo.js';

async function hmacB64(secret, raw) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(await crypto.subtle.sign('HMAC', key, raw));
}

// «M / Negro» o «Negro / M» → talla y color
export function splitVariant(title) {
  const parts = String(title || '').split(/\s*[/|,-]\s*/).filter(Boolean);
  let talla = '';
  let color = '';
  for (const p of parts) {
    const t = tallaOf(p);
    if (!talla && t && p.length <= 8) talla = t;
    else if (!color) color = colorsOf(p)[0] || p;
  }
  return { talla, color };
}

export function orderFromShopify(o, cfg) {
  const a = o.shipping_address || o.billing_address || {};
  const c = o.customer || {};
  const nombre = clip([a.first_name || c.first_name, a.last_name || c.last_name].filter(Boolean).join(' ') || a.name || '', 80);
  const items = (o.line_items || []).map((li) => {
    const v = splitVariant(li.variant_title);
    return { producto: clip(li.title || cfg.producto, 80), talla: v.talla, color: v.color, cantidad: Number(li.quantity) || 1 };
  });
  const distrito = a.city || '';
  const provincia = a.province || '';
  const modo = modoFor({ ciudad: provincia, provincia, distrito }, cfg);
  // DNI: en EasySell va en «Empresa» (company) o en el campo «Nota» renombrado «DNI / C.E» (llega como nota del pedido)
  const notas = [o.note, ...(o.note_attributes || []).map((x) => `${x.name}: ${x.value}`)].filter(Boolean).join(' ');
  const dniDe = (t) => (String(t || '').replace(/(\d)[\s.-]+(?=\d)/g, '$1').match(/(?<!\d)(\d{12}|\d{8})(?!\d)/) || [])[1] || '';
  const dni = dniDe(a.company) || dniDe(notas);
  const soloDni = dni && String(o.note || '').replace(/\D/g, '') === dni;
  const total = Number(o.current_total_price ?? o.total_price) || priceFor(items.reduce((s, i) => s + i.cantidad, 0), cfg);
  return {
    ext_id: String(o.id),
    ext_name: o.name || null,
    checkout_token: o.checkout_token || o.cart_token || null,
    modo,
    nombre,
    celular: normPhone(a.phone || o.phone || c.phone || o.billing_address?.phone) || clip(a.phone || o.phone || '', 20),
    dni: dni || clip(a.company || '', 12),
    distrito: modo === 'lima' ? distrito : '',
    ciudad: modo === 'lima' ? '' : [distrito, provincia].filter(Boolean).join(', '),
    direccion: clip([a.address1, a.address2].filter(Boolean).join(' '), 200),
    referencia: soloDni ? '' : clip(o.note || '', 200),
    items,
    total,
    notas: o.note ? clip(`Nota de Shopify: ${o.note}`, 500) : null,
  };
}

function cartFromShopify(ck) {
  const a = ck.shipping_address || ck.billing_address || {};
  const items = (ck.line_items || []).map((li) => {
    const v = splitVariant(li.variant_title);
    return { producto: li.title, talla: v.talla, color: v.color, cantidad: Number(li.quantity) || 1 };
  });
  return {
    token: String(ck.token || ck.id),
    nombre: clip([a.first_name, a.last_name].filter(Boolean).join(' ') || ck.customer?.first_name || '', 80),
    celular: normPhone(a.phone || ck.phone || ck.customer?.phone),
    total: Number(ck.total_price) || 0,
    items: JSON.stringify(items),
    url: ck.abandoned_checkout_url || null,
  };
}

export async function handleShopify(c) {
  const env = c.env;
  const store = await env.DB.prepare('SELECT * FROM stores WHERE id = ?').bind(Number(c.req.param('storeId'))).first();
  if (!store || !store.shopify_key || !safeEqual(store.shopify_key, c.req.param('key'))) return c.text('no', 404);
  if ((store.canal || 'mensajes') !== 'shopify') {
    // La tienda se cambió a «por mensajes»: no se crean pedidos de la web (200 para que Shopify no reintente)
    await notify(env, store.id, { kind: 'aviso', title: 'Llegó un pedido de Shopify y no se guardó', body: 'Esta tienda está como «Por mensajes de WhatsApp». Si vende por su web, cámbiala a «Por Shopify» en Configuración → General.', dedupe: true });
    return c.text('esta tienda vende por mensajes', 200);
  }
  const raw = await c.req.arrayBuffer();
  // Una tienda de Control Total puede recibir de 2 tiendas de Shopify (ej. leggings y pantalón formal):
  // cada una firma con su propia clave → se prueba la principal y la «_2»
  const sname = store.shopify_secret || 'SHOPIFY_SECRET';
  const secrets = [env[sname], env[`${sname}_2`]].filter(Boolean);
  const secret = secrets[0];
  if (!secret) {
    await notify(env, store.id, { kind: 'error', title: 'Llegó un aviso de Shopify pero falta la clave', body: `Pon en Cloudflare el secreto «${store.shopify_secret || 'SHOPIFY_SECRET'}» con la clave que muestra Shopify en Notificaciones → Webhooks.`, dedupe: true });
    return c.text('falta la clave', 401);
  }
  const firma = c.req.header('x-shopify-hmac-sha256') || '';
  let okFirma = false;
  for (const s of secrets) if (safeEqual(await hmacB64(s, raw), firma)) okFirma = true;
  if (!okFirma) return c.text('firma', 401);
  const topic = c.req.header('x-shopify-topic') || '';
  let body;
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return c.text('json', 400);
  }
  await env.DB.prepare('UPDATE stores SET shopify_last_at = ? WHERE id = ?').bind(now(), store.id).run();
  const cfg = cfgOf(store);
  const work = (async () => {
    if (topic === 'orders/create' || topic === 'orders/paid' || (topic === 'orders/updated' && !body.cancelled_at)) {
      const exists = await env.DB.prepare("SELECT id FROM orders WHERE store_id = ? AND source = 'shopify' AND ext_id = ?").bind(store.id, String(body.id)).first();
      if (exists) return;
      const data = orderFromShopify(body, cfg);
      // Distrito que no reconocemos en «Lima»: si Shalom tiene agencias en ese lugar fuera de Lima Metropolitana, es provincia
      if (data.modo === 'lima' && data.distrito && lugarLima(data.distrito) === '?') {
        const nz = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
        const q = nz(data.distrito);
        const { results = [] } = await env.DB.prepare("SELECT prov, dist FROM shalom_agencies WHERE upper(dep) LIKE 'LIMA%'").all().catch(() => ({}));
        const ag = q && results.find((r) => nz(r.prov) !== 'lima' && nz(r.prov) !== 'callao' && (nz(r.dist) === q || nz(r.prov) === q));
        if (ag) Object.assign(data, { modo: cfg.prov_modo === 'ce_prov' ? 'ce_prov' : 'agencia', ciudad: [data.distrito, 'Lima'].join(', '), distrito: '' });
      }
      const o = await insertOrder(env, store, data, { source: 'shopify' });
      if (o) await onOrderCreated(env, store, o);
    } else if (topic === 'orders/cancelled' || (topic === 'orders/updated' && body.cancelled_at)) {
      const o = await env.DB.prepare("SELECT * FROM orders WHERE store_id = ? AND source = 'shopify' AND ext_id = ?").bind(store.id, String(body.id)).first();
      if (o && o.status !== 'cancelado') await setOrderStatus(env, store, o, 'cancelado', null, 'Cancelado en Shopify');
    } else if (topic.startsWith('checkouts/')) {
      if (body.completed_at) return;
      const k = cartFromShopify(body);
      if (!k.celular) return;
      const t = now();
      await env.DB.prepare(
        `INSERT INTO carts (store_id, token, nombre, celular, total, items, url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (store_id, token) DO UPDATE SET nombre = excluded.nombre, celular = excluded.celular, total = excluded.total, items = excluded.items, url = excluded.url, updated_at = excluded.updated_at`
      ).bind(store.id, k.token, k.nombre, k.celular, k.total, k.items, k.url, t, t).run();
      const cart = await env.DB.prepare('SELECT * FROM carts WHERE store_id = ? AND token = ?').bind(store.id, k.token).first();
      const pending = await env.DB.prepare("SELECT id FROM order_jobs WHERE cart_id = ? AND done_at IS NULL AND canceled_at IS NULL").bind(cart.id).first();
      if (!pending && !cart.sent_at) {
        const a = await env.DB.prepare("SELECT delay_min FROM automations WHERE store_id = ? AND key = 'carrito'").bind(store.id).first();
        const min = Number(a?.delay_min) || cfg.carrito_min || 60;
        await env.DB.prepare(`INSERT INTO order_jobs (store_id, cart_id, kind, run_at, created_at) VALUES (?, ?, 'carrito', ?, ?)`).bind(store.id, cart.id, t + min * 60e3, t).run();
      }
    }
  })().catch((e) => {
    console.error('shopify', e);
    return notify(env, store.id, { kind: 'error', title: 'Error con un aviso de Shopify', body: e.message }).catch(() => {});
  });
  c.executionCtx.waitUntil(work);
  return c.text('ok');
}

export { ESTADOS, getOrder };
