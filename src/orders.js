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
  reprogramado: 'Pospuso su compra',
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

// Pedido en curso del chat (no entregado/recogido ni perdido) de los últimos días: para no crear otro igual
export async function pedidoAbierto(env, chatId, dias = 3) {
  const fin = [...VENDIDO, ...PERDIDO];
  return env.DB.prepare(`SELECT * FROM orders WHERE chat_id = ? AND status NOT IN (${fin.map(() => '?').join(', ')}) AND created_at > ? ORDER BY id DESC LIMIT 1`)
    .bind(chatId, ...fin, Date.now() - dias * 864e5).first();
}

// Configuración de pedidos por tienda (precios por cantidad, adelanto, producto)
export const DEFAULT_CFG = {
  producto: 'Pantalón formal',
  precios: { 1: 89, 2: 139, 3: 175, 4: 219 },
  mayor_desde: 5,
  mayor_unit: 55,
  adelanto: 30,
  prov_modo: 'agencia', // cómo van los pedidos de provincia: agencia (Shalom con adelanto) o ce_prov
  // Entre paréntesis = cobertura parcial: hasta ahí sí llega el motorizado (la IA pregunta en qué parte está)
  sin_cobertura: 'Ancón, Santa Rosa, Carabayllo (después del km 22), Ate (después del Real Plaza Puruchuco), Jicamarca, Manchay, Chosica, Chaclacayo, Cieneguilla, Pachacámac, Lurín, Punta Hermosa, Punta Negra, San Bartolo, Santa María del Mar, Pucusana',
  recompra_dias: 20,
  carrito_min: 60,
};

export function cfgOf(store) {
  let c = {};
  try {
    c = JSON.parse(store?.order_cfg || '{}') || {};
  } catch {}
  return { ...DEFAULT_CFG, ...c, precios: c.precios && Object.keys(c.precios).length ? { ...c.precios } : { ...DEFAULT_CFG.precios } };
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

// Zonas sin cobertura: «Ate (después del Real Plaza Puruchuco)» = parcial (solo una parte va por agencia)
export function zonasSin(text) {
  return String(text || '').split(/\s*,\s*(?![^(]*\))/).map((x) => x.trim()).filter(Boolean).map((x) => {
    const m = /^([^(]+?)\s*(?:\((.*)\))?$/.exec(x) || [];
    return { name: norm(m[1] || x), parcial: !!m[2], nota: (m[2] || '').trim(), raw: x };
  });
}

// Lima con cobertura → contraentrega; Lima sin cobertura o provincia → según la tienda
// Lima Metropolitana + Callao (contra entrega) vs. provincias del departamento de Lima (van por agencia: Oyón, Huacho, Cañete…)
const LIMA_METRO = ['lima', 'cercado', 'ancon', 'ate', 'vitarte', 'barranco', 'brena', 'carabayllo', 'chaclacayo', 'chorrillos', 'cieneguilla', 'comas', 'el agustino',
  'independencia', 'jesus maria', 'la molina', 'la victoria', 'lince', 'los olivos', 'lurigancho', 'chosica', 'lurin', 'magdalena', 'miraflores', 'pachacamac',
  'pucusana', 'pueblo libre', 'puente piedra', 'punta hermosa', 'punta negra', 'rimac', 'san bartolo', 'san borja', 'san isidro', 'san juan de lurigancho', 'sjl',
  'san juan de miraflores', 'sjm', 'san luis', 'san martin de porres', 'smp', 'san miguel', 'santa anita', 'santa maria del mar', 'santa rosa', 'santiago de surco',
  'surco', 'surquillo', 'villa el salvador', 'ves', 'villa maria del triunfo', 'vmt', 'callao', 'bellavista', 'carmen de la legua', 'la perla', 'la punta',
  'ventanilla', 'mi peru', 'huaycan', 'manchay', 'canto grande', 'zarate', 'collique', 'mangomarca', 'jicamarca', 'magdalena del mar'];
const LIMA_PROV = ['barranca', 'paramonga', 'pativilca', 'supe', 'cajatambo', 'canta', 'huamantanga', 'santa rosa de quives', 'obrajillo', 'canete', 'san vicente de canete',
  'imperial', 'nuevo imperial', 'mala', 'chilca', 'asia', 'cerro azul', 'lunahuana', 'quilmana', 'huaral', 'chancay', 'aucallama', 'huaura', 'huacho', 'hualmay', 'sayan',
  'vegueta', 'carquin', 'huarochiri', 'matucana', 'san mateo', 'ricardo palma', 'santa eulalia', 'callahuanca', 'oyon', 'churin', 'andajes', 'yauyos', 'pachangara', 'naván', 'navan'];
const words = (x) => ` ${norm(x).replace(/[^a-z0-9]+/g, ' ').trim()} `;
// 'metro' | 'prov' | '?' (no lo reconoce)
export function lugarLima(distrito) {
  const t = words(distrito);
  if (!t.trim()) return 'metro';
  if (LIMA_PROV.some((n) => t.includes(` ${norm(n)} `))) return 'prov';
  if (LIMA_METRO.some((n) => t.includes(` ${n} `))) return 'metro';
  return '?';
}

export function modoFor({ ciudad, provincia, distrito, sede }, cfg) {
  if (sede) return 'agencia';
  const lugar = norm([provincia, ciudad].filter(Boolean).join(' '));
  const isLima = !lugar || /lima|callao/.test(lugar);
  const prov = cfg.prov_modo === 'ce_prov' ? 'ce_prov' : 'agencia';
  if (!isLima) return prov;
  // Departamento de Lima pero fuera de Lima Metropolitana (Oyón, Huaral, Cañete…) → provincia
  if (lugarLima(distrito) === 'prov' || lugarLima(ciudad === provincia ? '' : ciudad) === 'prov') return prov;
  const d = norm(distrito);
  // Solo las zonas sin cobertura completa; las parciales (Ate…) dependen de la dirección: se deja en Lima
  const sin = zonasSin(cfg.sin_cobertura).filter((z) => !z.parcial).map((z) => z.name);
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
// Colores propios de la tienda (los que puso en el asistente); vacío = colores de Porte
export function storeColors(store) {
  try {
    const a = JSON.parse(store?.asistente || '{}')?.respuestas?.colores || '';
    return String(a).split(/,|\n|;/).map((x) => x.trim()).filter(Boolean).slice(0, 40);
  } catch {
    return [];
  }
}

const sinTilde = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

// «2 Vino, Negro y celeste bebé» → [{color:'Vino', n:2}, {color:'Negro', n:1}, …]
export function colorQty(text, own = []) {
  const out = [];
  const ownN = own.map((c) => [sinTilde(c), c]);
  for (const part of String(text || '').split(/,|\sy\s|\+|\/|;|\n/)) {
    const raw = part.trim().replace(/\(.*?\)/g, '').trim();
    if (!raw) continue;
    const m = raw.match(/^(\d+)\s*(?:x\s*)?(?:de\s+)?(.*)$/i) || raw.match(/^(.*?)\s*(?:x\s*)?(\d+)$/i);
    let n = 1;
    let name = raw;
    if (m) {
      const num = /^\d+$/.test(m[1]) ? m[1] : m[2];
      n = Math.min(50, parseInt(num, 10) || 1);
      name = /^\d+$/.test(m[1]) ? m[2] : m[1];
    }
    const sn = sinTilde(name);
    if (!sn) continue;
    let color;
    if (ownN.length) {
      const hit = ownN.find(([k]) => k === sn) || ownN.find(([k]) => sn.includes(k) || k.includes(sn));
      color = hit ? hit[1] : name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    } else color = colorsOf(name)[0];
    if (color) out.push({ color: color.slice(0, 30), n });
  }
  return out;
}

export function itemsFromVars(v, cfg, own = []) {
  const talla = tallaOf(v.talla) || clip(v.talla || '', 20);
  const cols = colorQty(v.colores, own);
  let qty = parseInt(String(v.cantidad || '').replace(/\D/g, ''), 10);
  const sum = cols.reduce((a, c) => a + c.n, 0);
  if (!qty || qty > 100) qty = sum || 1;
  if (!cols.length) return [{ producto: cfg.producto, talla, color: '', cantidad: qty }];
  if (qty > sum) cols[0].n += qty - sum;
  const map = new Map();
  for (const c of cols) map.set(c.color, (map.get(c.color) || 0) + c.n);
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
      if (row.chat_id) await env.DB.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').bind(t, row.chat_id).run();
      await addEvent(env, id, 'creado', `${source === 'shopify' ? 'Llegó de Shopify' : source === 'ia' ? 'Lo creó la IA' : 'Creado'} · ${ESTADOS[row.status]}`, userId);
      await env.DB.prepare('UPDATE stores SET rev = rev + 1 WHERE id = ?').bind(store.id).run();
      return getOrder(env, id);
    } catch (e) {
      if (/UNIQUE/.test(String(e.message)) && /ext/.test(String(e.message))) return null; // ya existía (Shopify reenvió)
      if (!/UNIQUE/.test(String(e.message)) || attempt === 2) throw e;
    }
  }
}

// Lee un formulario que ya mandó la IA («✅ Color: Vino, Negro», «➡️ DNI: …») para completar lo que falte
export function varsFromForm(text) {
  const out = {};
  const get = (re) => {
    const m = String(text || '').match(re);
    return m ? m[1].replace(/\*/g, '').trim() : '';
  };
  const map = {
    colores: /colou?r(?:es)?\s*:\s*([^\n]+)/i,
    talla: /talla\s*:\s*([^\n]+)/i,
    cantidad: /cantidad\s*:\s*([^\n]+)/i,
    nombre: /nombre(?: y apellido)?\s*:\s*([^\n]+)/i,
    dni: /dni\s*:\s*([^\n]+)/i,
    celular: /(?:cel(?:ular)?)\s*:\s*([^\n]+)/i,
    direccion: /direcci[oó]n\s*:\s*([^\n]+)/i,
    sede_shalom: /(?:sede|shalom)\s*:\s*([^\n]*[a-z][^\n]*)/i,
  };
  for (const [k, re] of Object.entries(map)) {
    const v = get(re);
    if (v && !/^\[.*\]$/.test(v)) out[k] = v.slice(0, 200);
  }
  return out;
}

// Formulario de la clienta para copiar y pegar (mismo formato que manda la IA)
export function formText(d, cfg) {
  const prod = cfg.producto || 'Producto';
  const cant = units(d.items);
  const tallas = [...new Set(d.items.map((i) => i.talla).filter(Boolean))].join(', ');
  const cols = d.items.map((i) => (i.cantidad > 1 ? `${i.cantidad} ${i.color}` : i.color)).filter((x) => String(x).trim()).join(', ');
  const pedido = [`Pedido: ${prod} ✨`, '', `✅ Cantidad: ${cant}`, tallas ? `✅ Talla: ${tallas}` : null, cols ? `✅ Color: ${cols}` : null].filter((x) => x !== null).join('\n');
  if (d.modo === 'agencia') {
    const adel = Number(d.adelanto) || 0;
    return ['Shalom: 🚚📦', '', `➡️ Nombre: ${d.nombre || ''}`, `➡️ DNI: ${d.dni || ''}`, `➡️ CEL: ${String(d.celular || '').replace(/^51(?=9\d{8}$)/, '')}`, `➡️ Sede: ${d.sede || ''}`, '', pedido, '',
      `Monto total: ${money(d.total)}`, ...(adel ? [`Adelanto: ${money(adel)}`, `Monto restante: ${money(Math.max(0, d.total - adel))}`] : [])].join('\n');
  }
  const dest = d.modo === 'ce_prov' && d.ciudad ? d.ciudad : 'Lima';
  const lugar = [d.direccion, d.distrito, d.modo === 'ce_prov' ? d.ciudad : null].filter((x) => String(x || '').trim()).join(', ');
  return [`Envío para: ${dest} 📦`, '', `➡️ Nombre: ${d.nombre || ''}`, `➡️ CEL: ${String(d.celular || '').replace(/^51(?=9\d{8}$)/, '')}`, `➡️ Dirección: ${lugar}`, '', pedido, '', `Monto total: ${money(d.total)}`].join('\n');
}

// Borrador desde la conversación: lo que guardó el bot + el chat
export function draftFromChat(chat, store) {
  const cfg = cfgOf(store);
  let v = {};
  try {
    v = JSON.parse(chat.bot_vars || '{}') || {};
  } catch {}
  const items = itemsFromVars(v, cfg, storeColors(store));
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
