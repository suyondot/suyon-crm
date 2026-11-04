// Planes de Control Total para alumnos: prueba gratis, precio por números y trabajadoras, pagado hasta.
import { now } from './util.js';

const DAY = 864e5;
export const DEFAULT_PLAN = {
  signup_open: 1, // registro público en /registro
  trial_days: 15,
  grace_days: 3, // días después del vencimiento en que todavía puede entrar (con aviso)
  currency: 'USD',
  base: 7, // incluye 1 número + el dueño + 1 trabajadora
  per_number: 5,
  per_user: 5,
  included_numbers: 1,
  included_users: 1,
  pay_info: '', // cómo pagar (Yape, cuenta…): lo escribe el administrador en el Panel, no va en el código
  contact: '', // WhatsApp del administrador para avisar el pago
};

export async function loadPlan(env) {
  const r = await env.DB.prepare("SELECT value FROM platform_settings WHERE key = 'plan'").first().catch(() => null);
  let saved = {};
  try {
    saved = r ? JSON.parse(r.value) : {};
  } catch {}
  return { ...DEFAULT_PLAN, ...saved };
}

export async function savePlan(env, patch) {
  const cur = await loadPlan(env);
  const num = (v, d, min = 0, max = 10000) => (Number.isFinite(Number(v)) ? Math.min(Math.max(Number(v), min), max) : d);
  const next = { ...cur };
  if ('signup_open' in patch) next.signup_open = patch.signup_open ? 1 : 0;
  if ('trial_days' in patch) next.trial_days = Math.round(num(patch.trial_days, cur.trial_days, 0, 90));
  if ('grace_days' in patch) next.grace_days = Math.round(num(patch.grace_days, cur.grace_days, 0, 30));
  if ('base' in patch) next.base = Math.round(num(patch.base, cur.base) * 100) / 100;
  if ('per_number' in patch) next.per_number = Math.round(num(patch.per_number, cur.per_number) * 100) / 100;
  if ('per_user' in patch) next.per_user = Math.round(num(patch.per_user, cur.per_user) * 100) / 100;
  if ('currency' in patch) next.currency = ['USD', 'PEN'].includes(patch.currency) ? patch.currency : cur.currency;
  if ('pay_info' in patch) next.pay_info = String(patch.pay_info || '').slice(0, 1500);
  if ('contact' in patch) next.contact = String(patch.contact || '').replace(/[^\d+]/g, '').slice(0, 20);
  await env.DB.prepare("INSERT INTO platform_settings (key, value, updated_at) VALUES ('plan', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(JSON.stringify(next), now()).run();
  return next;
}

// Estado de una empresa: libre, en prueba, pagada, en gracia o vencida
export function statusOf(co, plan = DEFAULT_PLAN, t = now()) {
  const st = co.plan_status || 'free';
  if (st === 'free') return { state: 'free', blocked: false, until: null, days_left: null };
  if (st === 'blocked') return { state: 'blocked', blocked: true, until: null, days_left: 0 };
  const until = st === 'trial' ? co.trial_ends_at : co.paid_until;
  if (until && t < until) return { state: st, blocked: false, until, days_left: Math.ceil((until - t) / DAY) };
  const graceEnd = (until || 0) + (Number(plan.grace_days) || 0) * DAY;
  if (st === 'active' && until && t < graceEnd) return { state: 'grace', blocked: false, until, days_left: 0, grace_until: graceEnd };
  return { state: st === 'trial' ? 'trial_over' : 'expired', blocked: true, until, days_left: 0 };
}

export async function usageOf(env, companyId) {
  const s = await env.DB.prepare('SELECT COUNT(*) AS n FROM stores WHERE company_id = ?').bind(companyId).first();
  const u = await env.DB.prepare("SELECT COUNT(*) AS n FROM memberships WHERE company_id = ? AND role != 'dueno'").bind(companyId).first();
  return { numbers: s.n, users: u.n };
}

export function priceOf(plan, usage) {
  const xn = Math.max(0, usage.numbers - plan.included_numbers);
  const xu = Math.max(0, usage.users - plan.included_users);
  const lines = [{ label: `Plan base: ${plan.included_numbers} número + el dueño + ${plan.included_users} trabajadora`, amount: plan.base }];
  if (xn) lines.push({ label: `${xn} ${xn === 1 ? 'número extra' : 'números extra'} × ${plan.per_number}`, amount: xn * plan.per_number });
  if (xu) lines.push({ label: `${xu} ${xu === 1 ? 'trabajadora extra' : 'trabajadoras extra'} × ${plan.per_user}`, amount: xu * plan.per_user });
  const total = Math.round(lines.reduce((a, l) => a + l.amount, 0) * 100) / 100;
  return { total, currency: plan.currency, lines };
}

export async function billingOf(env, co, plan) {
  plan = plan || (await loadPlan(env));
  const usage = await usageOf(env, co.id);
  return { ...statusOf(co, plan), usage, price: priceOf(plan, usage), pay_info: plan.pay_info, contact: plan.contact, plan_status: co.plan_status || 'free' };
}

// Para el bot y el webhook: ¿la empresa de esta tienda está vencida?
export async function storeBlocked(env, storeId) {
  const co = await env.DB.prepare('SELECT c.plan_status, c.trial_ends_at, c.paid_until FROM companies c JOIN stores s ON s.company_id = c.id WHERE s.id = ?').bind(storeId).first().catch(() => null);
  if (!co) return false;
  return statusOf(co, await loadPlan(env)).blocked;
}

// Marca un pago: suma meses desde hoy o desde el último vencimiento si todavía no venció
export async function addPayment(env, co, { months = 1, amount = 0, method = 'manual', note = null, userId = null }) {
  const t = now();
  const m = Math.min(Math.max(Math.round(Number(months) || 1), 1), 24);
  const from = co.plan_status === 'active' && co.paid_until && co.paid_until > t ? co.paid_until : t;
  const to = from + m * 30 * DAY;
  await env.DB.batch([
    env.DB.prepare("UPDATE companies SET plan_status = 'active', paid_until = ? WHERE id = ?").bind(to, co.id),
    env.DB.prepare('INSERT INTO payments (company_id, amount, currency, months, method, note, paid_from, paid_to, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(co.id, Number(amount) || 0, 'USD', m, String(method || 'manual').slice(0, 30), note ? String(note).slice(0, 300) : null, from, to, userId, t),
  ]);
  return to;
}
