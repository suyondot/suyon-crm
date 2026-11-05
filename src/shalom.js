// Conector con «Shalom API Peru» (servicio de un tercero, no oficial de Shalom).
// La clave va como secreto SHALOM_API_KEY en Cloudflare. Base cambiable con la variable SHALOM_API_BASE.
import { now, fail } from './util.js';

const KEY = 'shalom';
export const DEFAULT_SHALOM = {
  agencies_path: '/v1/agencies',
  track_path: '/v1/tracking/{guia}', // {guia} y {codigo} se reemplazan
};

export const baseOf = (env) => String(env.SHALOM_API_BASE || 'https://api.shalom-api-peru.com').replace(/\/+$/, '');

export async function loadShalom(env) {
  const r = await env.DB.prepare('SELECT value FROM platform_settings WHERE key = ?').bind(KEY).first().catch(() => null);
  let v = {};
  try {
    v = r ? JSON.parse(r.value) : {};
  } catch {}
  return { ...DEFAULT_SHALOM, ...v };
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
  const dep = pick(a, ['department', 'departamento', 'departament', 'dep', 'region', 'location.department', 'ubigeo.departamento']);
  const prov = pick(a, ['province', 'provincia', 'prov', 'location.province', 'ubigeo.provincia']);
  const dist = pick(a, ['district', 'distrito', 'dist', 'location.district', 'ubigeo.distrito', 'city', 'ciudad']);
  const name = pick(a, ['name', 'nombre', 'agency', 'agencia', 'title', 'sede', 'label']) || [dist, prov].filter(Boolean).join(' · ');
  const address = pick(a, ['address', 'direccion', 'dirección', 'addr', 'location.address']);
  const ext = pick(a, ['id', 'code', 'codigo', 'agency_id', 'ter_id']);
  return { ext_id: ext || null, dep, prov, dist, name, address, search: norm([dep, prov, dist, name, address].join(' ')) };
}

export async function syncAgencies(env) {
  const cfg = await loadShalom(env);
  const r = await shalomGet(env, cfg.agencies_path);
  if (!r.ok) fail(502, `El servicio respondió ${r.status || 'sin conexión'}: ${(r.data && (r.data.error || r.data.message)) || r.text || ''}`.slice(0, 300));
  const list = listOf(r.data).map((a) => ({ ...toAgency(a), raw: JSON.stringify(a).slice(0, 2000) })).filter((a) => a.name);
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
  const { results } = await env.DB.prepare(`SELECT id, ext_id, dep, prov, dist, name, address FROM shalom_agencies WHERE ${where} ORDER BY dep, prov, dist, name LIMIT ?`)
    .bind(...words.map((w) => `%${w}%`), limit).all();
  return results;
}

export async function agencyStats(env) {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n, MAX(updated_at) AS at, COUNT(DISTINCT dep) AS deps FROM shalom_agencies').first().catch(() => null);
  return { total: r?.n || 0, departamentos: r?.deps || 0, at: r?.at || null };
}

// Rastrear una guía con la ruta configurada
export async function track(env, guia, codigo = '') {
  const g = String(guia || '').trim();
  if (!/^[\w-]{3,40}$/.test(g)) fail(400, 'Escribe un número de guía válido.');
  const c = String(codigo || '').trim();
  if (c && !/^[\w-]{1,40}$/.test(c)) fail(400, 'Código no válido.');
  const cfg = await loadShalom(env);
  let path = cfg.track_path.replace('{guia}', encodeURIComponent(g)).replace('{codigo}', encodeURIComponent(c));
  if (c && !cfg.track_path.includes('{codigo}')) path += (path.includes('?') ? '&' : '?') + `code=${encodeURIComponent(c)}`;
  const r = await shalomGet(env, path);
  const d = r.data || {};
  const flat = d.data && typeof d.data === 'object' && !Array.isArray(d.data) ? d.data : d;
  const estado = pick(flat, ['status', 'estado', 'state', 'current_status', 'situacion', 'tracking.status', 'last_event.status']);
  return { ...r, path, estado };
}
