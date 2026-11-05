// Pedidos: 3 caminos (contraentrega Lima, contraentrega provincia, agencia) con sus estados
import { now, clip, fail, localDay } from './util.js';
import { colorsOf, tallaOf } from './catalogo.js';
import { entregaDia, loadSettings } from './bot.js';

export const MODOS = {
  lima: 'Contraentrega Lima',
  ce_prov: 'Contraentrega provincia',
  agencia: 'Agencia (Shalom)',
};

export const ESTADOS = {
  nuevo: 'Nuevo',
  confirmado: 'Confirmado',
  en_ruta: 'En ruta',
  reprogramado: 'Reprogramado',
  entregado: 'Entregado',
  rechazado: 'Rechazado',
  por_pagar: 'Yape por validar',
  validado: 'Validado',
  enviado: 'Enviado',
  en_camino: 'En camino',
  en_agencia: 'En agencia',
  falta_abonar: 'Recogido · falta abonar',
  recogido: 'Recogido',
  no_recogido: 'No recogido',
  cancelado: 'Cancelado',
};

export const FLUJO = {
  lima: ['nuevo', 'confirmado', 'en_ruta', 'reprogramado', 'entregado', 'rechazado', 'cancelado'],
  ce_prov: ['nuevo', 'confirmado', 'en_ruta', 'reprogramado', 'entregado', 'rechazado', 'cancelado'],
  agencia: ['por_pagar', 'validado', 'enviado', 'en_camino', 'en_agencia', 'falta_abonar', 'recogido', 'no_recogido', 'cancelado'],
};

export const VENDIDO = ['entregado', 'recogido'];
export const PERDIDO = ['rechazado', 'no_recogido', 'cancelado'];
export const firstStatus = (modo) => (modo === 'agencia' ? 'por_pagar' : 'nuevo');

// Configuración de pedidos por tienda (precios por cantidad, adelanto, producto)
export const DEFAULT_CFG = {
  producto: 'Pantalón formal',
  precios: { 1: 89, 2: 139, 3: 175, 4: 219 },
  mayor_desde: 5,
  mayor_unit: 55,
  adelanto: 30,
  prov_modo: 'agencia', // cómo van los pedidos de provincia: agencia (Shalom con adelanto) o ce_prov
  sin_cobertura: 'Ancón, Santa Rosa, Carabayllo, Jicamarca, Manchay, Chosica, Chaclacayo, Cieneguilla, Pachacámac, Lurín, Punta Hermosa, Punta Negra, San Bartolo, Santa María del Mar, Pucusana',
  recompra_dias: 20,
  carrito_min: 60,
};

export function cfgOf(store) {
  let c = {};
  try {
    c = JSON.parse(store?.order_cfg || '{}') || {};
  } catch {}
  return { ...DEFAULT_CFG, ...c, precios: { ...DEFAULT_CFG.precios, ...(c.precios || {}) } };
}

export function priceFor(units, cfg) {
  const u = Math.max(0, Math.round(Number(units) || 0));
  if (!u) return 0;
  if (cfg.mayor_desde && u >= cfg.mayor_desde && cfg.mayor_unit) return Math.round(u * cfg.mayor_unit * 100) / 100;
  const p = cfg.precios || {};
  if (p[u]) return Number(p[u]);
  const keys = Object.keys(p).map(Number).filter((k) => k <= u).sort((a, b) => b - a);
  if (!keys.length) return 0;
  return Math.round((Number(p[keys[0]]) / keys[0]) * u * 100) / 100;
}

// Celular peruano → 51XXXXXXXXX (si ya viene con código de país se respeta)
export function normPhone(s) {
  let d = String(s || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 9 && d.startsWith('9')) d = '51' + d;
  return d.length >= 8 && d.length <= 15 ? d : null;
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Lima con cobertura → contraentrega; Lima sin cobertura o provincia → según la tienda
export function modoFor({ ciudad, provincia, distrito, sede }, cfg) {
  if (sede) return 'agencia';
  const lugar = norm([provincia, ciudad].filter(Boolean).join(' '));
  const isLima = !lugar || /lima|callao/.test(lugar);
  if (!isLima) return cfg.prov_modo === 'ce_prov' ? 'ce_prov' : 'agencia';
  const d = norm(distrito);
  const sin = norm(cfg.sin_cobertura).split(/\s*,\s*/).filter(Boolean);
  if (d && sin.some((z) => d.includes(z))) return 'agencia';
  return 'lima';
}

export function cleanItems(items, cfg) {
  return (Array.isArray(items) ? items : []).slice(0, 30).map((it) => ({
    producto: clip(String(it?.producto || cfg.producto || 'Producto').trim(), 80),
    talla: clip(String(it?.talla || '').trim(), 20),
    color: clip(String(it?.color || '').trim(), 30),
    cantidad: Math.min(Math.max(Math.round(Number(it?.cantidad) || 1), 1), 999),
    ...(it?.precio != null && it.precio !== '' && Number.isFinite(Number(it.precio)) ? { precio: Math.max(0, Math.round(Number(it.precio) * 100) / 100) } : {}),
  })).filter((it) => it.producto);
}

// Arma los productos con lo que guardó el bot: «talla M · Negro y Beige · 3»
export function itemsFromVars(v, cfg) {
  const talla = tallaOf(v.talla) || clip(v.talla || '', 20);
  const cols = colorsOf(v.colores);
  let qty = parseInt(String(v.cantidad || '').replace(/\D/g, ''), 10);
  if (!qty || qty > 100) qty = cols.length || 1;
  if (!cols.length) return [{ producto: cfg.producto, talla, color: '', cantidad: qty }];
  const each = cols.map(() => 1);
  each[0] += Math.max(0, qty - cols.length);
  const map = new Map();
  cols.forEach((c, i) => map.set(c, (map.get(c) || 0) + each[i]));
  return [...map.entries()].map(([color, cantidad]) => ({ producto: cfg.producto, talla, color, cantidad }));
}

export const units = (items) => items.reduce((a, it) => a + (Number(it.cantidad) || 0), 0);

export function shape(o) {
  if (!o) return o;
  let items = [];
  try {
    items = JSON.parse(o.items || '[]');
  } catch {}
  return { ...o, items, estado: ESTADOS[o.status] || o.status, modo_label: MODOS[o.modo] || o.modo, saldo: Math.max(0, (o.total || 0) - (o.adelanto || 0)) };
}

const money = (n) => `S/${Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
export const itemsText = (items) => items.map((it) => `${it.cantidad} × ${[it.producto, it.talla && `talla ${it.talla}`, it.color].filter(Boolean).join(' · ')}`).join('\n');

// Texto de «Copiar orden» para pegar en el grupo de reporte
export function orderText(o, { horario = 'entre 2 y 8 p.m.' } = {}) {
  const x = Array.isArray(o.items) ? o : shape(o);
  const head = `✅ AGENDADO · Pedido #${x.number}${x.ext_name ? ` (Shopify ${x.ext_name})` : ''}`;
  const prods = `🛍️ ${itemsText(x.items).split('\n').join('\n🛍️ ')}`;
  if (x.modo === 'agencia') {
    return [head, `👤 Nombre: ${x.nombre || ''}`, `🪪 DNI: ${x.dni || ''}`, `📱 Celular: ${x.celular || ''}`, `🏢 Sede Shalom: ${x.sede || ''}${x.ciudad ? ` (${x.ciudad})` : ''}`, prods,
      `💰 Total: ${money(x.total)} · Adelanto: ${money(x.adelanto)} · Saldo: ${money(x.saldo)}`, x.notas ? `📝 ${x.notas}` : ''].filter(Boolean).join('\n');
  }
  return [head, `👤 Nombre: ${x.nombre || ''}`, `📱 Celular: ${x.celular || ''}`, `📍 Distrito: ${x.distrito || ''}${x.modo === 'ce_prov' && x.ciudad ? ` · ${x.ciudad}` : ''}`,
    `🏠 Dirección: ${x.direccion || ''}${x.referencia ? ` (Ref: ${x.referencia})` : ''}`, prods, x.adelanto > 0 ? `💰 Total: ${money(x.total)} · Adelanto: ${money(x.adelanto)} · Paga al recibir: ${money(x.saldo)}` : `💰 Total: ${money(x.total)} (paga al recibir)`,
    `⏰ Entrega: ${x.entrega ? x.entrega.split('-').reverse().join('/') : ''} ${horario}`.trim(), x.notas ? `📝 ${x.notas}` : ''].filter(Boolean).join('\n');
}

const FIELDS = { nombre: 80, celular: 20, dni: 12, distrito: 60, direccion: 200, referencia: 200, ciudad: 60, sede: 160, notas: 1000, ad_id: 40, guia: 20, guia_codigo: 12, guia_qr: 200, courier: 10, rem: 20 };

export function cleanOrder(b, cfg, cur = null) {
  const out = {};
  for (const [k, n] of Object.entries(FIELDS)) if (k in b) out[k] = clip(String(b[k] ?? '').trim(), n) || null;
  if ('celular' in out && out.celular) out.celular = normPhone(out.celular) || out.celular;
  if (out.guia) out.guia = out.guia.replace(/\s+/g, '');
  if (out.guia_codigo) out.guia_codigo = out.guia_codigo.replace(/\s+/g, '').toUpperCase();
  if ('courier' in out) out.courier = out.courier === 'olva' ? 'olva' : 'shalom';
  if ('enviado_at' in b) out.enviado_at = Number(b.enviado_at) > 0 ? Math.round(Number(b.enviado_at)) : null;
  if ('modo' in b) {
    if (!MODOS[b.modo]) fail(400, 'Elige el tipo de envío: Lima, provincia o agencia.');
    out.modo = b.modo;
  }
  const modo = out.modo || cur?.modo || 'lima';
  if ('status' in b) {
    if (!FLUJO[modo].includes(b.status)) fail(400, `Ese estado no existe para ${MODOS[modo]}.`);
    out.status = b.status;
  } else if (out.modo && cur && !FLUJO[out.modo].includes(cur.status)) out.status = firstStatus(out.modo);
  if ('items' in b) {
    const items = cleanItems(b.items, cfg);
    if (!items.length) fail(400, 'El pedido necesita al menos un producto.');
    out.items = JSON.stringify(items);
    out.unidades = units(items);
    if (!('total' in b)) out.total = priceFor(out.unidades, cfg);
  }
  if ('total' in b) out.total = Math.max(0, Math.round((Number(b.total) || 0) * 100) / 100);
  if ('adelanto' in b) out.adelanto = Math.max(0, Math.round((Number(b.adelanto) || 0) * 100) / 100);
  if ('entrega' in b) out.entrega = /^\d{4}-\d{2}-\d{2}$/.test(b.entrega || '') ? b.entrega : null;
  return out;
}

// Día de entrega por defecto (Lima): HOY o el siguiente día hábil según la hora de corte
export async function defaultEntrega(env, store) {
  const s = await loadSettings(env, store.id);
  const t = entregaDia(now(), s.timezone, s);
  const add = t === 'HOY' ? 0 : t.startsWith('MAÑANA') ? 1 : 2;
  return { dia: localDay(now() + add * 864e5, s.timezone), horario: s.entrega_horario };
}

export async function addEvent(env, orderId, kind, detail, userId = null) {
  await env.DB.prepare('INSERT INTO order_events (order_id, kind, detail, user_id, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(orderId, kind, clip(String(detail || ''), 500), userId, now()).run();
}

export async function getOrder(env, id) {
  return env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(Number(id)).first();
}

// Crea el pedido con número correlativo por tienda
export async function insertOrder(env, store, data, { userId = null, source = 'manual' } = {}) {
  const cfg = cfgOf(store);
  const clean = cleanOrder(data, cfg);
  const modo = clean.modo || 'lima';
  if (!clean.items) {
    clean.items = JSON.stringify([{ producto: cfg.producto, talla: '', color: '', cantidad: 1 }]);
    clean.unidades = 1;
    if (!('total' in clean)) clean.total = priceFor(1, cfg);
  }
  if (!('adelanto' in clean)) clean.adelanto = modo === 'agencia' ? Number(cfg.adelanto) || 0 : 0;
  if (!clean.entrega && modo !== 'agencia') clean.entrega = (await defaultEntrega(env, store)).dia;
  const t = now();
  const row = {
    ...clean,
    modo,
    status: clean.status || firstStatus(modo),
    chat_id: data.chat_id || null,
    source,
    ext_id: data.ext_id || null,
    ext_name: data.ext_name || null,
    checkout_token: data.checkout_token || null,
    created_by: userId,
  };
  const keys = Object.keys(row);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await env.DB.prepare(
        `INSERT INTO orders (store_id, number, ${keys.join(', ')}, created_at, updated_at, status_at)
         VALUES (?, (SELECT COALESCE(MAX(number), 0) + 1 FROM orders WHERE store_id = ?), ${keys.map(() => '?').join(', ')}, ?, ?, ?)`
      ).bind(store.id, store.id, ...keys.map((k) => row[k] ?? null), t, t, t).run();
      const id = r.meta.last_row_id;
      await addEvent(env, id, 'creado', `${source === 'shopify' ? 'Llegó de Shopify' : source === 'ia' ? 'Lo creó la IA' : 'Creado'} · ${ESTADOS[row.status]}`, userId);
      await env.DB.prepare('UPDATE stores SET rev = rev + 1 WHERE id = ?').bind(store.id).run();
      return getOrder(env, id);
    } catch (e) {
      if (/UNIQUE/.test(String(e.message)) && /ext/.test(String(e.message))) return null; // ya existía (Shopify reenvió)
      if (!/UNIQUE/.test(String(e.message)) || attempt === 2) throw e;
    }
  }
}

// Borrador desde la conversación: lo que guardó el bot + el chat
export function draftFromChat(chat, store) {
  const cfg = cfgOf(store);
  let v = {};
  try {
    v = JSON.parse(chat.bot_vars || '{}') || {};
  } catch {}
  const items = itemsFromVars(v, cfg);
  const modo = modoFor({ distrito: v.distrito, ciudad: v.destino && !/lima/i.test(v.destino) ? v.destino : '', provincia: '', sede: v.sede_shalom }, cfg);
  const u = units(items);
  return {
    chat_id: chat.id,
    modo,
    nombre: v.nombre || chat.name || chat.profile_name || '',
    celular: normPhone(v.celular) || chat.wa_id,
    dni: v.dni || '',
    distrito: v.distrito || '',
    direccion: v.direccion || '',
    ciudad: modo !== 'lima' ? v.destino || '' : '',
    sede: v.sede_shalom || '',
    items,
    total: priceFor(u, cfg),
    adelanto: modo === 'agencia' ? Number(cfg.adelanto) || 0 : 0,
    ad_id: chat.ad_id || null,
  };
}
