// Conector con «Shalom API Peru» (servicio de un tercero, no oficial de Shalom).
// La clave va como secreto SHALOM_API_KEY en Cloudflare. Base cambiable con la variable SHALOM_API_BASE.
import { zonasSin } from './orders.js';
import { now, fail } from './util.js';

const KEY = 'shalom';
export const DEFAULT_SHALOM = {
  agencies_path: '/v1/agencies',
  track_path: '/v1/tracking?numero={guia}&codigo={codigo}', // {guia} = nro. de orden, {codigo} = código del ticket
};

export const baseOf = (env) => String(env.SHALOM_API_BASE || 'https://api.shalom-api-peru.com').replace(/\/+$/, '');

export async function loadShalom(env) {
  const r = await env.DB.prepare('SELECT value FROM platform_settings WHERE key = ?').bind(KEY).first().catch(() => null);
  let v = {};
  try {
    v = r ? JSON.parse(r.value) : {};
  } catch {}
  const out = { ...DEFAULT_SHALOM, ...v };
  if (out.track_path === '/v1/tracking/{guia}') out.track_path = DEFAULT_SHALOM.track_path; // la ruta vieja no existía
  return out;
}

export async function saveShalom(env, patch) {
  const cur = await loadShalom(env);
  const next = { ...cur };
  for (const k of ['agencies_path', 'track_path']) {
    if (k in patch) {
      const p = String(patch[k] || '').trim();
      if (!/^\/[\w\-/{}.?=&]*$/.test(p)) fail(400, 'La ruta debe empezar con / (ej. /v1/agencies).');
      next[k] = p;
    }
  }
  await env.DB.prepare('INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
    .bind(KEY, JSON.stringify(next), now()).run();
  return next;
}

// Llamada GET al servicio. Nunca devuelve la clave.
export async function shalomGet(env, path) {
  if (!env.SHALOM_API_KEY) fail(400, 'Falta el secreto SHALOM_API_KEY en Cloudflare.');
  if (!String(path).startsWith('/') || path.includes('//') || path.includes('..')) fail(400, 'Ruta no válida.');
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(baseOf(env) + path, { headers: { 'X-API-Key': env.SHALOM_API_KEY, accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - t0, data: null, text: `No se pudo conectar: ${e.message || e}` };
  }
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}
  return { ok: res.ok, status: res.status, ms: Date.now() - t0, data, text: data ? null : text.slice(0, 2000) };
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const pick = (o, keys) => {
  for (const k of keys) {
    const v = k.split('.').reduce((a, x) => (a == null ? a : a[x]), o);
    if (v != null && v !== '' && typeof v !== 'object') return String(v).trim();
  }
  return '';
};

// Encuentra la lista dentro de la respuesta: [..] o {data:[..]} o {agencies:[..]} …
export function listOf(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const k of ['data', 'agencies', 'agencias', 'results', 'items', 'rows']) if (Array.isArray(data[k])) return data[k];
    for (const v of Object.values(data)) if (Array.isArray(v) && v.length && typeof v[0] === 'object') return v;
    for (const v of Object.values(data)) if (v && typeof v === 'object') { const l = listOf(v); if (l.length) return l; }
  }
  return [];
}

export function toAgency(a) {
  // Shalom API Peru: nombre = «DEPARTAMENTO / PROVINCIA / DISTRITO / LUGAR», lugar_over = nombre corto de la agencia
  const parts = String(a.nombre || '').split('/').map((x) => x.trim()).filter(Boolean);
  const dep = pick(a, ['departamento', 'department', 'dep', 'region']) || parts[0] || '';
  const prov = pick(a, ['provincia', 'province', 'prov']) || parts[1] || '';
  const dist = pick(a, ['distrito', 'district', 'dist']) || (parts.length >= 4 ? parts[2] : '') || pick(a, ['zona']);
  const name = pick(a, ['lugar_over', 'agencia', 'agency', 'name']) || parts[parts.length - 1] || pick(a, ['nombre']);
  const address = pick(a, ['direccion', 'address']);
  const ext = pick(a, ['id', 'code', 'codigo', 'abrebiatura']);
  const extra = [pick(a, ['abrebiatura']), pick(a, ['zona']), pick(a, ['nombre'])].join(' ');
  return { ext_id: ext || null, dep, prov, dist, name, address, search: norm([dep, prov, dist, name, address, extra].join(' ')) };
}

// Trae todas las páginas (?page=1, 2, …) hasta que no lleguen más
async function fetchAllAgencies(env, base) {
  const all = [];
  const seen = new Set();
  for (let page = 1; page <= 40; page++) {
    const r = await shalomGet(env, `${base}${base.includes('?') ? '&' : '?'}page=${page}`);
    if (!r.ok) {
      if (page === 1) fail(502, `El servicio respondió ${r.status || 'sin conexión'}: ${(r.data && (r.data.error || r.data.message)) || r.text || ''}`.slice(0, 300));
      break;
    }
    const list = listOf(r.data);
    const fresh = list.filter((a) => {
      const k = String(a.id ?? JSON.stringify(a));
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (!fresh.length) break;
    all.push(...fresh);
    const d = r.data || {};
    const pages = Number(d.total_pages ?? d.totalPages ?? d.pages ?? d.last_page ?? d.meta?.total_pages ?? 0);
    if (pages && page >= pages) break;
    if (d.has_more === false || d.hasMore === false || d.next === null) break;
  }
  return all;
}

export async function syncAgencies(env) {
  const cfg = await loadShalom(env);
  const items = await fetchAllAgencies(env, cfg.agencies_path);
  const list = items.map((a) => ({ ...toAgency(a), raw: JSON.stringify(a).slice(0, 3000) })).filter((a) => a.name);
  if (!list.length) fail(502, 'El servicio respondió, pero no encontré la lista de agencias. Revisa «Probar» para ver qué devuelve.');
  const t = now();
  const db = env.DB;
  const stmts = [db.prepare('DELETE FROM shalom_agencies')];
  for (const a of list) stmts.push(db.prepare('INSERT INTO shalom_agencies (ext_id, dep, prov, dist, name, address, search, raw, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(a.ext_id, a.dep, a.prov, a.dist, a.name, a.address, a.search, a.raw, t));
  for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80));
  return { total: list.length, sample: list.slice(0, 3).map(({ raw, search, ...x }) => x) };
}

// Buscar agencias por departamento, provincia, distrito o nombre (sin IA)
export async function findAgencies(env, q, limit = 10) {
  const words = norm(q).split(' ').filter((w) => w.length > 1).slice(0, 5);
  if (!words.length) return [];
  const where = words.map(() => 'search LIKE ?').join(' AND ');
  const { results } = await env.DB.prepare(`SELECT id, ext_id, dep, prov, dist, name, address, raw FROM shalom_agencies WHERE ${where} ORDER BY dep, prov, dist, name LIMIT 300`)
    .bind(...words.map((w) => `%${w}%`)).all();
  // Primero las que coinciden en distrito/nombre/provincia/departamento; las que solo lo mencionan en la dirección van al final
  const score = (a) => words.reduce((t, w) => t + (norm(a.dist).includes(w) ? 4 : 0) + (norm(a.name).includes(w) ? 3 : 0) + (norm(a.prov).includes(w) ? 2 : 0) + (norm(a.dep).includes(w) ? 1 : 0), 0);
  results.sort((a, b) => score(b) - score(a));
  return results.slice(0, limit).map(({ raw, ...a }) => {
    let x = {};
    try {
      x = JSON.parse(raw || '{}');
    } catch {}
    return { ...a, horario: x.horario?.hora_atencion || null, telefono: x.telefono || null, habilitado: x.habilitado !== false };
  });
}

export async function agencyStats(env) {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n, MAX(updated_at) AS at, COUNT(DISTINCT dep) AS deps FROM shalom_agencies').first().catch(() => null);
  return { total: r?.n || 0, departamentos: r?.deps || 0, at: r?.at || null };
}

// Pasos del rastreo de Shalom API Peru: status.{registrado, origen, transito, destino, reparto, entregado} + demora
export const PASOS = [
  ['registrado', 'Registrado'],
  ['origen', 'En agencia de origen'],
  ['transito', 'En tránsito'],
  ['destino', 'Llegó a la agencia de destino'],
  ['reparto', 'En reparto'],
  ['entregado', 'Entregado a la clienta'],
];
export function trackSummary(data) {
  const st = data?.status && typeof data.status === 'object' ? data.status : null;
  if (!st) return null;
  const pasos = PASOS.map(([k, label]) => ({ k, label, fecha: st[k]?.fecha || null, ok: !!st[k] && st[k].completo !== false }));
  const last = [...pasos].reverse().find((p) => p.fecha || p.ok);
  return { key: last?.k || null, estado: last?.label || 'Sin movimientos', fecha: last?.fecha || null, demora: st.demora ? (typeof st.demora === 'object' ? st.demora.motivo || st.demora.detalle || 'Con demora' : String(st.demora)) : null, pasos };
}

// Rastrear una guía (nro. de orden + código del ticket)
export async function track(env, guia, codigo = '') {
  const g = String(guia || '').trim();
  if (!/^[\w-]{3,40}$/.test(g)) fail(400, 'Escribe el número de orden de la guía.');
  const c = String(codigo || '').trim().toUpperCase();
  if (c && !/^[\w-]{1,40}$/.test(c)) fail(400, 'Código no válido.');
  const cfg = await loadShalom(env);
  let path = cfg.track_path.replace('{guia}', encodeURIComponent(g)).replace('{codigo}', encodeURIComponent(c));
  if (c && !cfg.track_path.includes('{codigo}')) path += (path.includes('?') ? '&' : '?') + `codigo=${encodeURIComponent(c)}`;
  const r = await shalomGet(env, path);
  const sum = r.ok ? trackSummary(r.data) : null;
  const err = !r.ok ? (r.data?.error?.message || r.data?.error || r.text || `Error ${r.status}`) : null;
  return { ...r, path, estado: sum?.estado || null, summary: sum, error: err ? String(err).slice(0, 300) : null };
}

/* ---------- Agencias para el bot (sin IA) ---------- */
let IDX = null; // copia en memoria: { at, rows, places }

async function index(env) {
  const st = await env.DB.prepare('SELECT COUNT(*) AS n, MAX(updated_at) AS at FROM shalom_agencies').first().catch(() => null);
  if (!st?.n) return null;
  if (IDX && IDX.at === st.at && IDX.n === st.n) return IDX;
  const { results } = await env.DB.prepare('SELECT id, dep, prov, dist, name, address, raw FROM shalom_agencies').all();
  const rows = results.map((r) => {
    let x = {};
    try {
      x = JSON.parse(r.raw || '{}');
    } catch {}
    return { id: r.id, dep: r.dep, prov: r.prov, dist: r.dist, name: r.name, address: r.address, ok: x.habilitado !== false, horario: x.horario?.hora_atencion || null, n: { dep: norm(r.dep), prov: norm(r.prov), dist: norm(r.dist) } };
  });
  // Lugares conocidos (distrito, provincia, departamento) para encontrarlos dentro del texto
  const places = new Map();
  for (const r of rows) for (const lv of ['dist', 'prov', 'dep']) if (r.n[lv] && r.n[lv].length > 2) places.set(`${lv}:${r.n[lv]}`, { lv, name: r.n[lv] });
  IDX = { at: st.at, n: st.n, rows, places: [...places.values()].sort((a, b) => b.name.length - a.name.length) };
  return IDX;
}

const isLimaDep = (d) => d === 'lima' || d === 'callao';
const W = (name) => new RegExp(`(^|[^a-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`);

// Busca un lugar de provincia en el texto y devuelve sus agencias. Lima con cobertura → null (el bot no se mete).
export async function agenciesNear(env, text, sinCobertura = '', quiereAgencia = false) {
  const t = norm(text);
  if (!t) return null;
  const ix = await index(env);
  if (!ix) return null;
  const hits = ix.places.filter((p) => W(p.name).test(t));
  if (!hits.length) return null;
  // Zonas de Lima sin cobertura completa; las parciales («Ate (después del Real Plaza…)») solo si eligió agencia
  const sin = zonasSin(sinCobertura).filter((z) => !z.parcial || quiereAgencia).map((z) => z.name);
  // Lugares de los que hay agencias según lo encontrado (distrito primero)
  const matchRows = (p) => ix.rows.filter((r) => r.ok && r.n[p.lv] === p.name);
  const deps = new Set(hits.filter((h) => h.lv === 'dep').map((h) => h.name));
  for (const lv of ['dist', 'prov', 'dep']) {
    for (const p of hits.filter((h) => h.lv === lv)) {
      let rows = matchRows(p);
      // Si dijo también un departamento, quedarse con ese (Miraflores de Arequipa ≠ Miraflores de Lima)
      const nonLimaDeps = [...deps].filter((d) => !isLimaDep(d));
      if (nonLimaDeps.length) rows = rows.filter((r) => nonLimaDeps.includes(r.n.dep));
      if (!rows.length) continue;
      const lima = rows.filter((r) => isLimaDep(r.n.dep));
      if (lima.length) {
        // Lima o Callao: solo si es una zona sin cobertura o si la clienta pidió Shalom; si hay duda, el bot no ofrece nada
        if (lima.length !== rows.length) return null;
        if (!quiereAgencia && !sin.some((z) => lima.some((r) => r.n.dist.includes(z) || z.includes(r.n.dist)))) return null;
      }
      const title = (r, k) => r[k];
      // Muchas agencias (dijo solo «Piura» o «La Libertad»): primero se pregunta la provincia o el distrito
      if (rows.length > 10 && lv !== 'dist') {
        const next = lv === 'dep' ? 'prov' : 'dist';
        const groups = new Map();
        for (const r of rows) groups.set(title(r, next), (groups.get(title(r, next)) || 0) + 1);
        const zonas = [...groups.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
        const lugar = lv === 'dep' ? rows[0].dep : `${rows[0].prov} (${rows[0].dep})`;
        return { kind: 'zonas', nivel: next === 'prov' ? 'provincia' : 'distrito', lugar, dep: rows[0].dep, total: rows.length, zonas: zonas.slice(0, 10), mas: zonas.length > 10 };
      }
      const pick = rows.slice(0, 10);
      const lugar = lv === 'dep' ? pick[0].dep : lv === 'prov' ? `${pick[0].prov} (${pick[0].dep})` : `${pick[0].dist} (${pick[0].dep})`;
      return { kind: 'agencias', lugar, total: rows.length, agencias: pick.map(({ n, ...r }) => r) };
    }
  }
  return null;
}

// Agencias de una zona que la clienta tocó de la lista (provincia o distrito de un departamento)
export async function agenciesIn(env, nivel, name, dep) {
  const ix = await index(env);
  if (!ix) return null;
  const lv = nivel === 'provincia' ? 'prov' : 'dist';
  const rows = ix.rows.filter((r) => r.ok && r.n[lv] === norm(name) && (!dep || r.n.dep === norm(dep)));
  if (!rows.length) return null;
  const pick = rows.slice(0, 10);
  const lugar = lv === 'prov' ? `${pick[0].prov} (${pick[0].dep})` : `${pick[0].dist} (${pick[0].dep})`;
  return { kind: 'agencias', lugar, total: rows.length, agencias: pick.map(({ n, ...r }) => r) };
}

// Opciones para tocar en WhatsApp: título ≤ 24 y descripción ≤ 72, títulos sin repetir
export function agencyOptions(list) {
  const used = new Set();
  const max = list.length <= 3 ? 20 : 24; // botones: 20 letras; lista: 24
  return list.map((a) => {
    let title = a.name.length > max ? `${a.name.slice(0, max - 1)}…` : a.name;
    for (let i = 2; used.has(title.toLowerCase()); i++) title = `${a.name.slice(0, max - 4)} ${i}`;
    used.add(title.toLowerCase());
    const desc = [a.address, a.dist].filter(Boolean).join(' · ');
    return { title, desc: desc.length > 72 ? `${desc.slice(0, 71)}…` : desc, full: `${a.name} — ${a.address || ''} (${[a.dist, a.prov, a.dep].filter(Boolean).join(', ')})` };
  });
}
