// Envíos a provincia (Shalom / Olva): registro desde formularios, cruce con la guía, «ya recogió», ajustes e importación
import { now, fail, clip, localDay } from './util.js';
import { cfgOf, normPhone, priceFor, insertOrder, getOrder, addEvent, shape } from './orders.js';
import { setOrderStatus } from './automations.js';
import { strip } from './catalogo.js';

export const ABIERTOS = ['enviado', 'en_camino', 'en_agencia', 'falta_abonar'];
export const REGISTRO = ['por_pagar', 'validado'];

/* ---------------- Ajustes de envíos (dentro de stores.order_cfg) ---------------- */

export const DEFAULT_ENV = {
  productos: [], // [{ nombre, precios: {1,2,3,4}, colores: [], tallas: [] }]
  extras: [], // [{ nombre: 'Polo', precio: 25 }]
  remitentes: [], // [{ id, nombre, dni, cel }]
  origen: '',
  dias_aviso: 20,
  dias_devolver: 25,
};

export function envCfg(store) {
  const cfg = cfgOf(store);
  const e = { ...DEFAULT_ENV, ...(cfg.envios || {}) };
  if (!Array.isArray(e.productos) || !e.productos.length) {
    e.productos = [{ nombre: cfg.producto, precios: { ...cfg.precios }, colores: [], tallas: ['XS', 'S', 'M', 'L', 'XL'] }];
  }
  return e;
}

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const list = (v, n) => (Array.isArray(v) ? v : String(v || '').split(/[,\n]/)).map((x) => clip(String(x || '').trim(), 30)).filter(Boolean).slice(0, n);

export function cleanEnvCfg(b, cur) {
  const e = { ...cur };
  if (Array.isArray(b.productos)) {
    e.productos = b.productos.slice(0, 12).map((p) => {
      const precios = {};
      for (const [k, v] of Object.entries(p?.precios || {})) if (/^\d{1,2}$/.test(k) && Number(v) > 0) precios[k] = Math.round(Number(v) * 100) / 100;
      return { nombre: clip(String(p?.nombre || '').trim(), 60), precios, colores: list(p?.colores, 20), tallas: list(p?.tallas, 12) };
    }).filter((p) => p.nombre);
    if (!e.productos.length) fail(400, 'Deja al menos un producto.');
  }
  if (Array.isArray(b.extras)) {
    e.extras = b.extras.slice(0, 10).map((x) => ({ nombre: clip(String(x?.nombre || '').trim(), 30), precio: Math.max(0, num(x?.precio)) })).filter((x) => x.nombre);
  }
  if (Array.isArray(b.remitentes)) {
    e.remitentes = b.remitentes.slice(0, 6).map((x, i) => ({
      id: clip(String(x?.id || `r${i + 1}`), 20),
      nombre: clip(String(x?.nombre || '').trim(), 80),
      dni: String(x?.dni || '').replace(/\D/g, '').slice(0, 12),
      cel: String(x?.cel || '').replace(/\D/g, '').slice(-9),
    })).filter((x) => x.nombre);
  }
  if ('origen' in b) e.origen = clip(String(b.origen || '').trim(), 200);
  if ('dias_aviso' in b) e.dias_aviso = Math.min(Math.max(Math.round(num(b.dias_aviso, 20)), 3), 60);
  if ('dias_devolver' in b) e.dias_devolver = Math.min(Math.max(Math.round(num(b.dias_devolver, 25)), e.dias_aviso + 1), 90);
  return e;
}

export async function saveEnvCfg(env, store, e) {
  const cfg = cfgOf(store);
  cfg.envios = e;
  await env.DB.prepare('UPDATE stores SET order_cfg = ?, rev = rev + 1 WHERE id = ?').bind(JSON.stringify(cfg), store.id).run();
  return e;
}

/* ---------------- Lectura de formularios pegados ---------------- */

const nrm = (s) => strip(s).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const dig = (s) => String(s || '').replace(/\D/g, '');
const tcase = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase().replace(/(^|[\s(\/-])\p{L}/gu, (m) => m.toUpperCase()).replace(/\b(De|Del|La|Las|Los|Y)\b/g, (w) => w.toLowerCase()).replace(/^./, (c) => c.toUpperCase());

// Sinónimos de color: el nombre final es el que use el producto (Plomo claro o Gris claro, Guinda o Vino…)
const COLOR_GROUPS = [
  ['gris claro', 'plomo claro'],
  ['gris oscuro', 'plomo oscuro', 'plomo', 'gris'],
  ['celeste bebe', 'celeste'],
  ['azul noche', 'azul marino', 'azul', 'marino'],
  ['vino', 'guinda', 'granate', 'rojo vino'],
  ['perla', 'blanco', 'hueso', 'crema'],
  ['beige', 'nude', 'camel'],
  ['marron topo', 'marron', 'topo'],
  ['negro'],
  ['aceituna', 'oliva'],
  ['rosado pastel', 'rosado', 'rosa'],
  ['verde botella', 'verde'],
  ['lila'],
  ['naranja'],
  ['cafe claro'],
  ['cafe'],
  ['rojo intenso'],
  ['rojo'],
];

export function mapColor(word, colores = []) {
  const w = nrm(word);
  if (!w) return '';
  const own = colores.map((c) => [nrm(c), c]);
  const exact = own.find(([n]) => n === w);
  if (exact) return exact[1];
  const g = COLOR_GROUPS.find((grp) => grp.some((x) => new RegExp(`(^| )${x}( |$)`).test(w)));
  if (g) {
    const hit = own.find(([n]) => g.includes(n));
    if (hit) return hit[1];
    return tcase(g[0]);
  }
  return tcase(w).slice(0, 24);
}

export function productoDe(texto, productos) {
  const t = nrm(texto);
  if (!t) return null;
  let best = null;
  let score = 0;
  for (const p of productos) {
    const toks = nrm(p.nombre).split(' ').filter((x) => x.length >= 4);
    let s = toks.reduce((a, k) => a + (t.includes(k.slice(0, Math.max(4, k.length - 1))) ? 1 : 0), 0);
    if (/\brecto\b/.test(t) && /recto/.test(nrm(p.nombre))) s += 2;
    if (s > score) [best, score] = [p, s];
  }
  return best;
}

export function splitForms(txt) {
  const parts = String(txt || '').split(/\n(?=\s*\*?\s*(?:Shalom|OLVA|Env[ií]o para)\b)/i).map((s) => s.trim()).filter((s) => /Nombre\s*:/i.test(s));
  return parts.length ? parts : [String(txt || '')];
}

export function parseForm(txt, ecfg, adelantoDef = 30) {
  const T = String(txt || '').replace(/\r/g, '');
  const L = T.split('\n').map((s) => s.trim()).filter(Boolean);
  const get = (re) => {
    for (const l of L) {
      const m = l.match(re);
      if (m) return m[1].trim();
    }
    return '';
  };
  const o = { courier: 'shalom' };
  const hd = L.find((l) => /shalom|olva|env[ií]o para/i.test(l)) || '';
  if (/olva/i.test(hd)) o.courier = 'olva';
  let dest = hd.replace(/^[^:]*:/, '').replace(/[🚚📦*]/gu, '').trim();
  const sede = get(/Sede\s*:\s*(.+)/i);
  if (!dest && sede && !/confirmar/i.test(sede)) dest = sede;
  o.destino = tcase(dest || sede || '').slice(0, 160);
  o.nombre = tcase(get(/Nombre\s*:\s*(.+)/i).split(/➡️|\bdni\b|\bcel\b/i)[0].replace(/\./g, ' ')).slice(0, 80);
  o.dni = dig(get(/DNI\s*:\s*(.+)/i).split(/cel/i)[0]).slice(0, 12);
  o.celular = dig(get(/(?:CEL|celular)[^:]*:\s*(.+)/i)).slice(-9);
  const ped = get(/Pedido\s*:\s*(.+)/i) || '';
  let cant = Number(dig(get(/Cantidad\s*:\s*(.+)/i))) || 0;
  const prod = productoDe(ped, ecfg.productos);
  o.producto = prod ? prod.nombre : tcase(ped).slice(0, 60) || ecfg.productos[0]?.nombre || 'Producto';
  if (!prod && /\d/.test(ped) && !cant) cant = Number((ped.match(/(\d+)/) || [])[1]) || 0;
  const colores = prod?.colores || [];
  const tline = get(/Talla[s]?\s*:\s*(.+)/i);
  const cline = get(/Colou?r(?:es)?\s*:\s*(.+)/i);
  const cTxt = (cline || '').replace(/\((?:XXL|XL|XS|S|M|L)\)/gi, '').replace(/\b(XXL|XL|XS|S|M|L)\b\s*[-–:/]?/g, ' ').replace(/\b\d+\s*x\b/gi, ' ');
  const cl = cTxt.split(/,|;|\/|·|\sy\s|\se\s/i).map((s) => mapColor(s, colores)).filter(Boolean);
  let tl = [];
  const rep = `${tline || ''} `.match(/(\d+)\s*x?\s*(XXL|XL|XS|S|M|L)\b/gi);
  if (rep) {
    for (const r of rep) {
      const z = r.match(/(\d+)\s*x?\s*(\S+)/i);
      for (let i = 0; i < Number(z[1]); i++) tl.push(z[2].toUpperCase());
    }
  } else {
    const R = /\b(XXL|XL|XS|S|M|L)\b/g;
    let mm;
    while ((mm = R.exec(`${tline || ''}`.toUpperCase()))) tl.push(mm[1]);
  }
  if (!tl.length && cline) {
    const R = /\b(XXL|XL|XS|S|M|L)\b/g;
    let mm;
    while ((mm = R.exec(cline))) tl.push(mm[1]);
  }
  tl = tl.map((t) => (t === 'XXL' ? 'XL' : t));
  const pr = cant || cl.length || tl.length || 1;
  if (tl.length && tl.length < pr) while (tl.length < pr) tl.push(tl[tl.length - 1]);
  if (cl.length === 1 && pr > 1) while (cl.length < pr) cl.push(cl[0]);
  o.items = unitsToItems(o.producto, pr, cl, tl);
  const money = (s) => {
    const v = String(s || '').replace(/,/g, '.').match(/\d+(\.\d+)?/);
    return v ? Number(v[0]) : undefined;
  };
  o.total = money(get(/Monto\s*total\s*:\s*(.+)/i));
  if (o.total === undefined && prod) o.total = priceFor(pr, { precios: prod.precios }) || undefined;
  o.adelanto = money(get(/Adelanto\s*:\s*(.+)/i));
  if (!o.adelanto && /pag[oó]\s*todo/i.test(T) && o.total !== undefined) o.adelanto = o.total;
  if (o.adelanto === undefined) o.adelanto = adelantoDef;
  return o;
}

// Unidades (color i, talla i) → productos agrupados
export function unitsToItems(producto, n, cl = [], tl = []) {
  const map = new Map();
  const total = Math.max(1, Math.min(Number(n) || 1, 200));
  for (let i = 0; i < total; i++) {
    const it = { producto, talla: tl[i] || tl[tl.length - 1] || '', color: cl[i] || '' };
    const k = `${it.talla}|${it.color}`;
    if (map.has(k)) map.get(k).cantidad++;
    else map.set(k, { ...it, cantidad: 1 });
  }
  return [...map.values()];
}

/* ---------------- Búsquedas ---------------- */

const OPEN_ANY = "status NOT IN ('recogido','no_recogido','cancelado')";

async function chatByPhone(env, storeId, cel) {
  const wa = normPhone(cel);
  if (!wa) return null;
  const ch = await env.DB.prepare('SELECT id, ad_id FROM chats WHERE store_id = ? AND wa_id = ? AND sim = 0').bind(storeId, wa).first().catch(() => null);
  return ch || null;
}

// ¿Ya existe un envío abierto de esta clienta? (por DNI, celular o nombre)
export async function dupOf(env, store, o) {
  const { results } = await env.DB.prepare(
    `SELECT id, number, nombre, dni, celular, status, guia, guia_codigo, created_at FROM orders WHERE store_id = ? AND modo = 'agencia' AND ${OPEN_ANY} ORDER BY id DESC LIMIT 3000`
  ).bind(store.id).all();
  const nn = nrm(o.nombre);
  const hit = results.find((x) => (o.dni && o.dni.length >= 7 && dig(x.dni) === o.dni)
    || (o.celular && o.celular.length === 9 && dig(x.celular).slice(-9) === o.celular)
    || (nn && nn.split(' ').length >= 2 && nrm(x.nombre) === nn));
  if (!hit) return null;
  return REGISTRO.includes(hit.status) ? `ya está en Registro (pedido #${hit.number})` : `ya tiene guía ${hit.guia_codigo || hit.guia || ''} (pedido #${hit.number})`;
}

/* ---------------- Registro: formularios pegados → pedidos ---------------- */

export async function addForms(env, store, { text, fecha, force }, userId) {
  if (!/Nombre\s*:/i.test(String(text || ''))) fail(400, 'No reconocí un formulario: falta la línea «Nombre:».');
  const ecfg = envCfg(store);
  const adel = Number(cfgOf(store).adelanto) || 0;
  const tz = store.timezone || 'America/Lima';
  const out = [];
  for (const fx of splitForms(text).slice(0, 30)) {
    const o = parseForm(fx, ecfg, adel);
    if (!o.nombre) {
      out.push({ ok: false, text: 'Un formulario no tiene nombre: no se agregó.' });
      continue;
    }
    const d = force ? null : await dupOf(env, store, o);
    if (d) {
      out.push({ ok: false, dup: true, nombre: o.nombre, text: `${o.nombre}: ${d}. No se agregó.`, form: fx });
      continue;
    }
    const ch = await chatByPhone(env, store.id, o.celular);
    const order = await insertOrder(env, store, {
      modo: 'agencia', status: 'validado', nombre: o.nombre, dni: o.dni, celular: o.celular, sede: o.destino, ciudad: o.destino.split(/[(,–-]/)[0].trim(),
      items: o.items, ...(o.total !== undefined ? { total: o.total } : {}), adelanto: o.adelanto, courier: o.courier,
      chat_id: ch?.id || null, ad_id: ch?.ad_id || null,
    }, { userId, source: 'manual' });
    if (fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && fecha !== localDay(now(), tz)) {
      const t = Date.parse(`${fecha}T19:00:00-05:00`);
      if (t) await env.DB.prepare('UPDATE orders SET created_at = ? WHERE id = ?').bind(t, order.id).run();
    }
    await addEvent(env, order.id, 'nota', 'Registrado desde un formulario pegado', userId);
    out.push({ ok: true, id: order.id, nombre: o.nombre, text: `${o.nombre} · ${o.items.map((i) => `${i.cantidad} ${[i.talla, i.color].filter(Boolean).join(' ')}`).join(', ')} · S/${order.total} → Registro (pedido #${order.number})` });
  }
  return out;
}

/* ---------------- Cruzar la guía con su pedido ---------------- */

const fixOrden = (s) => {
  const t = String(s || '');
  const olva = t.match(/(\d{8})\s*-\s*(\d{2})/);
  return olva ? `${olva[1]}-${olva[2]}` : dig(t).slice(0, 20);
};

export async function crossGuide(env, store, { codigo, dni, orden, qr, fecha, courier, nombre, destino }, userId) {
  const code = String(codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  const ord = fixOrden(orden);
  const isOlva = courier === 'olva' || /^\d{8}-\d{2}$/.test(ord);
  const ecfg = envCfg(store);
  const rems = ecfg.remitentes.map((r) => r.dni).filter(Boolean);
  const d = dig(dni).slice(0, 12);
  if (ord) {
    const ya = await env.DB.prepare("SELECT number, nombre FROM orders WHERE store_id = ? AND modo = 'agencia' AND guia = ?").bind(store.id, ord).first();
    if (ya) return { ok: false, text: `La guía ${code || ord} ya estaba registrada (pedido #${ya.number}, ${ya.nombre || ''}).` };
  }
  const { results: reg } = await env.DB.prepare(
    `SELECT * FROM orders WHERE store_id = ? AND modo = 'agencia' AND status IN ('por_pagar','validado') ORDER BY id LIMIT 2000`
  ).bind(store.id).all();
  let target = null;
  if (d && !rems.includes(d)) target = reg.find((x) => dig(x.dni) === d);
  if (!target && isOlva && nombre) {
    // Olva no trae DNI: se busca por nombre (puede venir recortado) y destino
    const w = nrm(nombre).split(' ').filter(Boolean);
    const dz = nrm(destino);
    const sc = (x) => {
      const nn = nrm(x.nombre).split(' ');
      let s = 0;
      if (w[0] && nn.includes(w[0])) s += 2;
      if (w[1] && nn.some((p) => p.startsWith(w[1]))) s += 2;
      if (dz && dz.split(' ').some((p) => p.length > 3 && nrm(`${x.sede} ${x.ciudad}`).includes(p))) s += 1;
      if (x.courier === 'olva') s += 1;
      return s;
    };
    const C = reg.map((x) => [sc(x), x]).filter((a) => a[0] >= 3).sort((a, b) => b[0] - a[0]);
    if (C.length && !(C[1] && C[1][0] === C[0][0])) target = C[0][1];
  }
  if (!target) {
    if (!d && !isOlva) return { ok: false, text: `Guía ${code || ord}: no se leyó el DNI. Escríbelo a mano.` };
    const g = d ? await env.DB.prepare(`SELECT number, guia, guia_codigo FROM orders WHERE store_id = ? AND modo = 'agencia' AND dni = ? AND ${OPEN_ANY} AND status NOT IN ('por_pagar','validado')`).bind(store.id, d).first() : null;
    if (g) return { ok: false, text: `El DNI ${d} ya tiene guía ${g.guia_codigo || g.guia} (pedido #${g.number}).` };
    return { ok: false, text: isOlva ? `Olva ${ord} (${nombre || '?'} · ${destino || '?'}): no encontré a quién corresponde. Crúzala a mano con el DNI.` : `Guía ${code || ord}${d ? ` · DNI ${d}` : ''}: no hay ningún pedido en Registro con ese DNI.` };
  }
  const t = Date.parse(fecha || '') || now();
  await env.DB.prepare('UPDATE orders SET guia = ?, guia_codigo = ?, guia_qr = COALESCE(?, guia_qr), courier = ?, enviado_at = ?, updated_at = ? WHERE id = ?')
    .bind(ord || null, code || null, qr ? clip(String(qr), 200) : null, isOlva ? 'olva' : 'shalom', t, now(), target.id).run();
  await addEvent(env, target.id, 'edicion', `Guía ${isOlva ? 'Olva' : 'Shalom'} registrada: ${[ord && `orden ${ord}`, code && `código ${code}`].filter(Boolean).join(' · ')}`, userId);
  const cur = await setOrderStatus(env, store, await getOrder(env, target.id), 'enviado', userId, 'se registró la guía');
  return { ok: true, id: cur.id, track: !!(cur.guia && cur.guia_codigo && !isOlva), text: `Guía ${code || ord} cruzada con ${cur.nombre} → Por cobrar (pedido #${cur.number})` };
}

/* ---------------- Leer fotos de guías con la IA ---------------- */

const READ_PROMPT = (n, rems) => `Te paso ${n} foto(s) de guías de envío peruanas, en orden (foto 1, foto 2, ...). Pueden ser tickets de SHALOM («DATOS TICKET») o boletas de OLVA COURIER. Para CADA foto devuelve un objeto. Responde SOLO un arreglo JSON, un objeto por foto en el mismo orden, con estas claves:
{"foto":1,"tipo":"shalom"|"olva"|"otro","orden":"","codigo":"","dni":"","nombre":"","destino":"","fecha":"YYYY-MM-DDTHH:MM:SS"}
Shalom: orden = NRO. ORDEN (8 a 10 dígitos); codigo = CÓDIGO (4 caracteres); dni y nombre = los del DESTINATARIO${rems ? ` (NO el remitente: nunca uses estos DNI: ${rems})` : ' (no el remitente)'}; destino = la agencia de destino con su distrito; fecha = Fecha de emisión.
Olva: orden = el número tipo 02865940-26; codigo = ""; dni = ""; nombre = el nombre que aparece (si viene recortado con *****, ponlo sin los asteriscos); destino = la línea tipo «LA LIBERTAD, CASCAS»; fecha = fecha de emisión + hora en formato 24 h.
Si un dato no se lee, pon "". No inventes nada.`;

export async function readGuides(env, store, files) {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) fail(400, 'Falta la clave de la IA (secreto ANTHROPIC_API_KEY) para leer fotos. Mientras tanto, cruza con el código y el DNI.');
  const imgs = [];
  for (const f of files.slice(0, 10)) {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(f.type)) fail(400, 'Las fotos deben ser JPG, PNG o WebP.');
    if (f.size > 4.5 * 1048576) fail(400, `La foto «${f.name}» pesa más de 4.5 MB.`);
    const bytes = new Uint8Array(await f.arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    imgs.push({ type: 'image', source: { type: 'base64', media_type: f.type, data: btoa(s) } });
  }
  const rems = envCfg(store).remitentes.map((r) => r.dni).filter(Boolean).join(', ');
  const model = 'claude-haiku-5-5';
  const res = await fetch((env.ANTHROPIC_API || 'https://api.anthropic.com') + '/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 1500, messages: [{ role: 'user', content: [...imgs, { type: 'text', text: READ_PROMPT(imgs.length, rems) }] }] }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) fail(502, `La IA no pudo leer las fotos: ${data?.error?.message || res.status}`);
  const inTok = data.usage?.input_tokens || 0;
  const outTok = data.usage?.output_tokens || 0;
  const cost = (inTok * 0.1 + outTok * 0.5) / 1e6;
  await env.DB.prepare(
    `INSERT INTO ia_usage (store_id, day, calls, in_tokens, out_tokens, cost) VALUES (?, ?, 1, ?, ?, ?)
     ON CONFLICT (store_id, day) DO UPDATE SET calls = calls + 1, in_tokens = in_tokens + excluded.in_tokens, out_tokens = out_tokens + excluded.out_tokens, cost = cost + excluded.cost`
  ).bind(store.id, localDay(now(), store.timezone || 'America/Lima'), inTok, outTok, cost).run().catch(() => {});
  const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  const a = text.indexOf('[');
  const b = text.lastIndexOf(']');
  let arr = [];
  try {
    arr = a >= 0 && b > a ? JSON.parse(text.slice(a, b + 1)) : [];
  } catch {}
  return files.slice(0, 10).map((f, k) => {
    const x = (Array.isArray(arr) && (arr.find((y) => Number(y?.foto) === k + 1) || arr[k])) || {};
    const fecha = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(x.fecha || '') ? `${String(x.fecha).slice(0, 19)}-05:00` : '';
    return {
      archivo: f.name, tipo: x.tipo === 'olva' ? 'olva' : x.tipo === 'shalom' ? 'shalom' : 'otro',
      orden: String(x.orden || '').replace(/[^\d-]/g, ''), codigo: String(x.codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8),
      dni: dig(x.dni).slice(0, 8), nombre: clip(String(x.nombre || '').replace(/\*+/g, ' ').trim(), 80), destino: clip(String(x.destino || ''), 120), fecha,
    };
  });
}

/* ---------------- «Ya recogió»: buscar guías por lo que se pegue ---------------- */

export function splitRecogio(txt) {
  if (/Nombre\s*:/i.test(txt)) return splitForms(txt);
  return String(txt || '').split(/\n+/).map((s) => s.trim()).filter(Boolean).slice(0, 200);
}

export async function findPicked(env, store, text) {
  const { results: all } = await env.DB.prepare(
    `SELECT id, number, nombre, dni, celular, sede, ciudad, guia, guia_codigo, total, adelanto, status FROM orders WHERE store_id = ? AND modo = 'agencia' AND status NOT IN ('por_pagar','validado','cancelado') ORDER BY id DESC LIMIT 5000`
  ).bind(store.id).all();
  const rems = envCfg(store).remitentes.map((r) => r.dni).filter(Boolean);
  const codes = new Set(all.map((x) => String(x.guia_codigo || '').toUpperCase()).filter(Boolean));
  const ecfg = envCfg(store);
  return splitRecogio(text).slice(0, 100).map((chunk) => {
    const T = chunk.toUpperCase();
    const toks = (T.match(/\b[0-9A-Z]{4}\b/g) || []).filter((k) => codes.has(k));
    const dnis = (chunk.match(/\b\d{8}\b/g) || []).filter((d) => !rems.includes(d));
    const cels = chunk.replace(/\s/g, '').match(/9\d{8}/g) || [];
    const ords = chunk.match(/\b\d{8,10}\b|\d{8}-\d{2}/g) || [];
    let nm = '';
    try {
      nm = /Nombre\s*:/i.test(chunk) ? parseForm(chunk, ecfg).nombre : '';
    } catch {}
    const label = nm || toks.join(', ') || dnis.join(', ') || chunk.slice(0, 40);
    let c = [];
    let how = '';
    if (ords.length) [c, how] = [all.filter((x) => ords.includes(String(x.guia))), 'orden'];
    if (!c.length && toks.length) {
      [c, how] = [all.filter((x) => toks.includes(String(x.guia_codigo || '').toUpperCase())), 'código'];
      if (c.length > 1 && dnis.length) {
        const f = c.filter((x) => dnis.includes(dig(x.dni)));
        if (f.length) c = f;
      }
    }
    if (!c.length && dnis.length) [c, how] = [all.filter((x) => dnis.includes(dig(x.dni))), 'DNI'];
    if (!c.length && cels.length) [c, how] = [all.filter((x) => cels.includes(dig(x.celular).slice(-9))), 'celular'];
    if (!c.length && nm) {
      const w = nrm(nm).split(' ').filter((z) => z.length > 2);
      const sc = all.map((x) => [x, w.filter((z) => nrm(x.nombre).includes(z)).length]).filter((a) => a[1] >= 2);
      const mx = Math.max(0, ...sc.map((a) => a[1]));
      [c, how] = [sc.filter((a) => a[1] === mx).map((a) => a[0]), 'nombre'];
    }
    c = c.slice(0, 8);
    const open = c.filter((x) => x.status !== 'recogido');
    return { label: clip(label, 80), how, items: c.map((x) => ({ id: x.id, number: x.number, nombre: x.nombre, sede: x.sede || x.ciudad || '', codigo: x.guia_codigo || x.guia || '', total: x.total, status: x.status, ck: x.status !== 'recogido' && open.length === 1 })) };
  });
}

/* ---------------- Importar desde el artifact «Guías Shalom» ---------------- */

const ST_ART = { pend: 'enviado', cam: 'en_camino', age: 'en_agencia', rfa: 'falta_abonar', rec: 'recogido', pro: 'no_recogido' };

function artItems(x, ecfg) {
  const prod = x.p || ecfg.productos[0]?.nombre || 'Producto';
  const n = Number(x.pr) || (Array.isArray(x.cl) ? x.cl.filter(Boolean).length : 0) || 1;
  const items = unitsToItems(prod, n, (x.cl || []).map((c) => String(c || '')), (x.tl || []).map((t) => String(t || '')));
  for (const q of Array.isArray(x.po) ? x.po : []) items.push({ producto: clip(q.k || 'Polo', 40), talla: clip(String(q.t || ''), 20), color: clip(String(q.c || ''), 30), cantidad: 1 });
  return items;
}

export async function importArtifact(env, store, data, userId) {
  const ecfg = envCfg(store);
  if (data.pr && typeof data.pr === 'object' && !(store.order_cfg && JSON.parse(store.order_cfg || '{}').envios?.productos?.length)) {
    ecfg.productos = Object.entries(data.pr).slice(0, 12).map(([nombre, precios]) => ({ nombre, precios, colores: (data.colores || {})[nombre] || [], tallas: (data.tallas || {})[nombre] || [] }));
  }
  if (Array.isArray(data.extras) && !ecfg.extras.length) ecfg.extras = data.extras;
  if (Array.isArray(data.remitentes) && !ecfg.remitentes.length) ecfg.remitentes = cleanEnvCfg({ remitentes: data.remitentes }, ecfg).remitentes;
  if (data.origen && !ecfg.origen) ecfg.origen = clip(String(data.origen), 200);
  await saveEnvCfg(env, store, ecfg);

  const rows = [];
  for (const x of Array.isArray(data.g) ? data.g : []) {
    if (!x?.o) continue;
    const e = Date.parse(x.e) || now();
    const notas = [x.ped && `N° pedido ${x.ped}`, x.rv && '♻ Recuperado del seguimiento'].filter(Boolean).join(' · ') || null;
    rows.push({
      ext: `g:${x.o}`, status: ST_ART[x.s] || 'enviado', created: e, enviado_at: e,
      nombre: x.n, dni: dig(x.dni) || null, celular: normPhone(x.wf || x.cel) || null, sede: x.d, ciudad: String(x.d || '').split(/[(,]/)[0].trim(),
      guia: String(x.o), guia_codigo: x.c ? String(x.c).toUpperCase() : null, guia_qr: x.q || null, courier: x.cu === 'olva' ? 'olva' : 'shalom',
      items: artItems(x, ecfg), total: Number(x.t) || 0, adelanto: Number(x.a) || 0, notas,
      seg: Array.isArray(x.sg) && x.sg.length ? JSON.stringify(x.sg.map((s) => Date.parse(s)).filter(Boolean)) : null, no_quiere: x.nq ? 1 : 0, rem: x.rm || null,
    });
  }
  for (const x of Array.isArray(data.r) ? data.r : []) {
    if (!x?.id) continue;
    rows.push({
      ext: `r:${x.id}`, status: 'validado', created: Date.parse(x.f) || now(), enviado_at: null,
      nombre: x.n, dni: dig(x.dni) || null, celular: normPhone(x.cel) || null, sede: x.d, ciudad: String(x.d || '').split(/[(,]/)[0].trim(),
      guia: null, guia_codigo: null, guia_qr: null, courier: x.cu === 'olva' ? 'olva' : 'shalom',
      items: artItems(x, ecfg), total: Number(x.t) || 0, adelanto: Number(x.a) || 0, notas: null, seg: null, no_quiere: 0, rem: null,
    });
  }
  const { results: have } = await env.DB.prepare("SELECT ext_id, status FROM orders WHERE store_id = ? AND source = 'artifact'").bind(store.id).all();
  const had = new Map(have.map((h) => [h.ext_id, h.status]));
  // Los del Registro que ya tienen guía en el artifact no se vuelven a crear
  const fresh = rows.filter((r) => !had.has(r.ext));
  const { results: chats } = await env.DB.prepare('SELECT id, wa_id, ad_id FROM chats WHERE store_id = ? AND sim = 0').bind(store.id).all();
  const byWa = new Map(chats.map((c) => [c.wa_id, c]));
  let next = ((await env.DB.prepare('SELECT COALESCE(MAX(number), 0) AS n FROM orders WHERE store_id = ?').bind(store.id).first())?.n || 0) + 1;
  fresh.sort((a, b) => a.created - b.created);
  const stmts = [];
  for (const r of fresh) {
    const ch = r.celular ? byWa.get(r.celular) : null;
    const items = JSON.stringify(r.items);
    const u = r.items.reduce((a, i) => a + i.cantidad, 0);
    stmts.push(env.DB.prepare(
      `INSERT INTO orders (store_id, number, chat_id, source, ext_id, modo, status, nombre, celular, dni, ciudad, sede, items, unidades, total, adelanto, notas, ad_id,
        guia, guia_codigo, guia_qr, courier, enviado_at, seg, no_quiere, rem, created_by, created_at, updated_at, status_at)
       VALUES (?, ?, ?, 'artifact', ?, 'agencia', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(store.id, next++, ch?.id || null, r.ext, r.status, clip(r.nombre || '', 80), r.celular, r.dni, clip(r.ciudad || '', 60) || null, clip(r.sede || '', 160) || null,
      items, u, r.total, r.adelanto, r.notas, ch?.ad_id || null, r.guia, r.guia_codigo, r.guia_qr ? clip(r.guia_qr, 200) : null, r.courier, r.enviado_at,
      r.seg, r.no_quiere, r.rem, userId, r.created, now(), r.created));
  }
  // Estados que cambiaron en el artifact desde la importación anterior (solo los que siguen abiertos aquí)
  let updated = 0;
  for (const r of rows) {
    const st = had.get(r.ext);
    if (st && st !== r.status && !['recogido', 'no_recogido', 'cancelado'].includes(st)) {
      stmts.push(env.DB.prepare("UPDATE orders SET status = ?, status_at = ?, updated_at = ?, seg = COALESCE(?, seg), no_quiere = ? WHERE store_id = ? AND source = 'artifact' AND ext_id = ?")
        .bind(r.status, now(), now(), r.seg, r.no_quiere, store.id, r.ext));
      updated++;
    }
  }
  // Registros del artifact que ya recibieron guía allá: desaparecen de su lista r (solo si se mandó la lista completa)
  const regGone = Array.isArray(data.r) ? [...had.keys()].filter((k) => k.startsWith('r:') && !rows.some((r) => r.ext === k)) : [];
  for (const k of regGone) stmts.push(env.DB.prepare("DELETE FROM orders WHERE store_id = ? AND source = 'artifact' AND ext_id = ? AND status = 'validado'").bind(store.id, k));
  for (let i = 0; i < stmts.length; i += 80) await env.DB.batch(stmts.slice(i, i + 80));
  await env.DB.prepare('UPDATE stores SET rev = rev + 1 WHERE id = ?').bind(store.id).run();
  return { nuevos: fresh.length, guias: fresh.filter((r) => r.ext.startsWith('g:')).length, registro: fresh.filter((r) => r.ext.startsWith('r:')).length, actualizados: updated, quitados: regGone.length, con_chat: fresh.filter((r) => r.celular && byWa.has(r.celular)).length };
}

/* ---------------- Lista compacta para la pantalla ---------------- */

export function compact(o) {
  const s = shape(o);
  let seg = [];
  try {
    seg = JSON.parse(o.seg || '[]') || [];
  } catch {}
  return {
    id: s.id, number: s.number, status: s.status, nombre: s.nombre, celular: s.celular, dni: s.dni, ciudad: s.ciudad, sede: s.sede, items: s.items,
    total: s.total, adelanto: s.adelanto, guia: s.guia, guia_codigo: s.guia_codigo, guia_qr: s.guia_qr, guia_estado: s.guia_estado, guia_at: s.guia_at,
    courier: s.courier || 'shalom', enviado_at: s.enviado_at, created_at: s.created_at, status_at: s.status_at, seg, no_quiere: !!s.no_quiere, rem: s.rem,
    chat_id: s.chat_id, notas: s.notas, source: s.source,
  };
}
