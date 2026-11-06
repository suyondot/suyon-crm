// Billetera de IA para alumnos: cada empresa (que no es de Jordan) tiene un saldo en soles.
// La IA usa las claves del sistema; lo que cuesta cada respuesta (precio del proveedor + 18 % de impuesto)
// se pasa a soles con el tipo de cambio y se le suma el margen de Jordan. Sin saldo, la IA no responde.
import { now } from './util.js';

const KEY = 'billetera';
export const DEFAULT_WALLET = { margen: 30, tc: 3.8, regalo: 5, aviso: 3, minimo: 10 };

export async function loadWallet(env) {
  const r = await env.DB.prepare('SELECT value FROM platform_settings WHERE key = ?').bind(KEY).first().catch(() => null);
  let v = {};
  try {
    v = JSON.parse(r?.value || '{}') || {};
  } catch {}
  return { ...DEFAULT_WALLET, ...v };
}

export async function saveWallet(env, b = {}) {
  const cur = await loadWallet(env);
  const num = (x, lo, hi, d) => {
    const n = Number(String(x ?? '').replace(',', '.'));
    return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : d;
  };
  const next = {
    margen: num(b.margen ?? cur.margen, 0, 500, cur.margen),
    tc: num(b.tc ?? cur.tc, 1, 10, cur.tc),
    regalo: num(b.regalo ?? cur.regalo, 0, 200, cur.regalo),
    aviso: num(b.aviso ?? cur.aviso, 0, 500, cur.aviso),
    minimo: num(b.minimo ?? cur.minimo, 1, 1000, cur.minimo),
  };
  await env.DB.prepare('INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
    .bind(KEY, JSON.stringify(next), now()).run();
  return next;
}

// Cuánto se le cobra al alumno (en soles) por un costo del proveedor (US$, sin impuesto)
export const toSoles = (usd, w) => Math.round(usd * 1.18 * w.tc * (1 + w.margen / 100) * 10000) / 10000;

async function companyOf(env, storeId) {
  return env.DB.prepare('SELECT co.id, co.plan_status, co.ia_saldo FROM stores s JOIN companies co ON co.id = s.company_id WHERE s.id = ?').bind(storeId).first().catch(() => null);
}

const own = (co) => !co || !co.plan_status || co.plan_status === 'free'; // las empresas de Jordan no usan billetera

// ¿Puede esta tienda usar la IA ahora? (las de Jordan siempre)
export async function iaAllowed(env, storeId) {
  const co = await companyOf(env, storeId);
  if (own(co)) return { ok: true, own: true };
  return { ok: (Number(co.ia_saldo) || 0) > 0, own: false, saldo: Number(co.ia_saldo) || 0, company_id: co.id };
}

// Descuenta lo gastado del saldo de la empresa de esa tienda
export async function chargeIA(env, storeId, usd) {
  if (!storeId || !(usd > 0)) return;
  const co = await companyOf(env, storeId);
  if (own(co)) return;
  const w = await loadWallet(env);
  const s = toSoles(usd, w);
  await env.DB.prepare('UPDATE companies SET ia_saldo = ia_saldo - ?, ia_gastado = ia_gastado + ? WHERE id = ?').bind(s, s, co.id).run().catch(() => {});
}

export async function addRecarga(env, companyId, { amount, method, note, userId }) {
  const a = Math.round((Number(amount) || 0) * 100) / 100;
  if (!a) throw Object.assign(new Error('Escribe el monto de la recarga.'), { status: 400 });
  await env.DB.batch([
    env.DB.prepare('INSERT INTO ia_recargas (company_id, amount, method, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(companyId, a, String(method || 'yape').slice(0, 30), note ? String(note).slice(0, 200) : null, userId || null, now()),
    env.DB.prepare('UPDATE companies SET ia_saldo = ia_saldo + ? WHERE id = ?').bind(a, companyId),
  ]);
}

// Lo que ve el alumno en «Mi plan»
export async function walletOf(env, companyId) {
  const w = await loadWallet(env);
  const co = await env.DB.prepare('SELECT ia_saldo, ia_gastado, plan_status FROM companies WHERE id = ?').bind(companyId).first();
  const since = now() - 30 * 864e5;
  const { results: rec } = await env.DB.prepare('SELECT amount, method, created_at FROM ia_recargas WHERE company_id = ? ORDER BY id DESC LIMIT 10').bind(companyId).all();
  const u = await env.DB.prepare(
    `SELECT COALESCE(SUM(u.cost), 0) AS usd, COALESCE(SUM(u.calls), 0) AS calls FROM ia_usage u JOIN stores s ON s.id = u.store_id
     WHERE s.company_id = ? AND u.day >= ?`
  ).bind(companyId, new Date(since).toISOString().slice(0, 10)).first();
  const g30 = toSoles(Number(u?.usd) || 0, w);
  const saldo = Math.round((Number(co?.ia_saldo) || 0) * 100) / 100;
  return {
    usa: !own(co),
    saldo,
    gastado_30: Math.round(g30 * 100) / 100,
    respuestas_30: Number(u?.calls) || 0,
    dias: g30 > 0 ? Math.max(0, Math.floor(saldo / (g30 / 30))) : null,
    bajo: saldo <= w.aviso,
    minimo: w.minimo,
    recargas: rec,
  };
}
