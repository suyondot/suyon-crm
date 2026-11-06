// Saldo de la IA (Claude / OpenAI) de las claves del sistema.
// Ni Anthropic ni OpenAI dan el saldo por API: el dueño escribe el saldo que ve en su consola
// y desde ahí se resta lo que el sistema va gastando (mismo precio que cobra el proveedor, sin el 18 %).
import { now, localDay } from './util.js';

const KEY = 'ia_saldo';
export const PROVIDERS = { anthropic: 'Claude', openai: 'OpenAI' };

// Suma gasto por proveedor y día (además de ia_usage por tienda)
export async function addSpend(env, provider, cost, tz = 'America/Lima') {
  if (!PROVIDERS[provider] || !(cost > 0)) return;
  await env.DB.prepare(
    `INSERT INTO ia_spend (provider, day, calls, cost) VALUES (?, ?, 1, ?)
     ON CONFLICT (provider, day) DO UPDATE SET calls = calls + 1, cost = cost + excluded.cost`
  ).bind(provider, localDay(now(), tz), cost).run().catch(() => {});
}

async function totalSpend(env, provider) {
  const r = await env.DB.prepare('SELECT COALESCE(SUM(cost), 0) AS c FROM ia_spend WHERE provider = ?').bind(provider).first().catch(() => null);
  return Number(r?.c) || 0;
}

async function loadCfg(env) {
  const r = await env.DB.prepare('SELECT value FROM platform_settings WHERE key = ?').bind(KEY).first().catch(() => null);
  try {
    return r ? JSON.parse(r.value) : {};
  } catch {
    return {};
  }
}

export async function loadSaldo(env) {
  const cfg = await loadCfg(env);
  const out = { alerta: Number(cfg.alerta ?? 2), proveedores: [] };
  const day30 = localDay(now() - 30 * 864e5, 'America/Lima');
  for (const [p, name] of Object.entries(PROVIDERS)) {
    const c = cfg[p] || null;
    const key = p === 'openai' ? !!env.OPENAI_API_KEY : !!env.ANTHROPIC_API_KEY;
    const spent = await totalSpend(env, p);
    const r30 = await env.DB.prepare('SELECT COALESCE(SUM(cost), 0) AS c FROM ia_spend WHERE provider = ? AND day >= ?').bind(p, day30).first().catch(() => null);
    const per30 = Number(r30?.c) || 0;
    const saldo = c ? c.base - (spent - c.spent_at) : null;
    out.proveedores.push({
      id: p, name, key, configurado: !!c, saldo, base: c?.base ?? null, desde: c?.at ?? null,
      gastado: c ? spent - c.spent_at : null,
      ultimos_30: per30,
      dias: saldo != null && per30 > 0 ? Math.max(0, Math.floor(saldo / (per30 / 30))) : null,
      bajo: saldo != null && saldo < out.alerta,
    });
  }
  return out;
}

export async function setSaldo(env, b) {
  const cfg = await loadCfg(env);
  if (b.provider) {
    if (!PROVIDERS[b.provider]) throw Object.assign(new Error('Proveedor desconocido.'), { status: 400 });
    const v = Number(String(b.saldo ?? '').replace(',', '.'));
    if (b.saldo === '' || b.saldo == null) delete cfg[b.provider];
    else if (!Number.isFinite(v) || v < 0 || v > 100000) throw Object.assign(new Error('Escribe el saldo en dólares, por ejemplo 10.50'), { status: 400 });
    else cfg[b.provider] = { base: Math.round(v * 100) / 100, at: now(), spent_at: await totalSpend(env, b.provider) };
  }
  if ('alerta' in b) cfg.alerta = Math.min(Math.max(Number(b.alerta) || 0, 0), 1000);
  await env.DB.prepare('INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
    .bind(KEY, JSON.stringify(cfg), now()).run();
  return loadSaldo(env);
}
