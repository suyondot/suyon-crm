// Planes de Control Total para alumnos: prueba gratis, precio por números y trabajadoras, pagado hasta.
import { now } from './util.js';

const DAY = 864e5;
export const DEFAULT_PLAN = {
  signup_open: 1, // registro público en /registro
  trial_days: 15,
  grace_days: 3, // días después del vencimiento en que todavía puede entrar (con aviso)
  currency: 'PEN', // siempre soles
  base: 25, // al mes: incluye 1 número + el dueño + 1 trabajadora
  per_number: 18, // cada número extra, al mes
  per_user: 18, // cada trabajadora extra, al mes
  pack_min: 2, // desde cuántos extras (números + trabajadoras) es «pack»
  // Rebajas por mes según cuántos meses paga (soles): al plan base, a cada extra suelto y a cada extra en pack
  periods: [
    { months: 1, base_off: 0, extra_off: 0, pack_off: 3 },
    { months: 3, base_off: 2, extra_off: 1, pack_off: 4 },
    { months: 6, base_off: 3, extra_off: 2, pack_off: 5 },
    { months: 12, base_off: 5, extra_off: 3, pack_off: 6 },
  ],
  included_numbers: 1,
  included_users: 1,
  pay_info: '', // cómo pagar (Yape, cuenta…): lo escribe el administrador en el Panel, no va en el código
  contact: '', // WhatsApp del administrador para avisar el pago
  legal_name: '', // titular que se muestra en /planes (lo pide la pasarela de pagos)
  ruc: '',
};

export async function loadPlan(env) {
  const r = await env.DB.prepare("SELECT value FROM platform_settings WHERE key = 'plan'").first().catch(() => null);
  let saved = {};
  try {
    saved = r ? JSON.parse(r.value) : {};
  } catch {}
  const p = { ...DEFAULT_PLAN, ...saved, currency: 'PEN' };
  if (!Array.isArray(p.periods) || !p.periods.length) p.periods = DEFAULT_PLAN.periods;
  return p;
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
  next.currency = 'PEN';
  if ('pack_min' in patch) next.pack_min = Math.round(num(patch.pack_min, cur.pack_min, 2, 50));
  if (Array.isArray(patch.periods)) {
    const off = (v) => Math.round(num(v, 0, 0, 1000) * 100) / 100;
    next.periods = [1, 3, 6, 12].map((m) => {
      const x = patch.periods.find((y) => Number(y.months) === m) || cur.periods.find((y) => y.months === m) || { months: m };
      return { months: m, base_off: off(x.base_off), extra_off: off(x.extra_off), pack_off: off(x.pack_off) };
    });
  }
  if ('pay_info' in patch) next.pay_info = String(patch.pay_info || '').slice(0, 1500);
  if ('contact' in patch) next.contact = String(patch.contact || '').replace(/[^\d+]/g, '').slice(0, 20);
  if ('legal_name' in patch) next.legal_name = String(patch.legal_name || '').trim().slice(0, 120);
  if ('ruc' in patch) next.ruc = String(patch.ruc || '').replace(/\D/g, '').slice(0, 11);
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

export const PERIODOS = [1, 3, 6, 12];
const r2 = (n) => Math.round(n * 100) / 100;
export const soles = (n) => `S/${r2(Number(n) || 0).toLocaleString('es-PE')}`;

// Precio según números, trabajadoras y cuántos meses paga de una vez.
// monthly = lo que sale al mes · total = lo que paga ahora · saving = lo que ahorra contra pagar mes a mes sin rebajas
export function priceOf(plan, usage, months = 1) {
  const xn = Math.max(0, usage.numbers - plan.included_numbers);
  const xu = Math.max(0, usage.users - plan.included_users);
  const per = (plan.periods || DEFAULT_PLAN.periods).find((p) => p.months === Number(months)) || (plan.periods || DEFAULT_PLAN.periods)[0];
  const extras = xn + xu;
  const pack = extras >= (plan.pack_min || 2);
  const off = pack ? per.pack_off : per.extra_off;
  const base = Math.max(plan.base - per.base_off, 0);
  const pn = Math.max(plan.per_number - off, 0);
  const pu = Math.max(plan.per_user - off, 0);
  const lines = [{ label: `Plan base: ${plan.included_numbers} número + el dueño + ${plan.included_users} trabajadora${per.base_off ? ` (antes ${soles(plan.base)})` : ''}`, amount: r2(base) }];
  const tag = pack ? ' · precio pack' : '';
  if (xn) lines.push({ label: `${xn} ${xn === 1 ? 'número extra' : 'números extra'} × ${soles(pn)}${off ? ` (antes ${soles(plan.per_number)})` : ''}${tag}`, amount: r2(xn * pn) });
  if (xu) lines.push({ label: `${xu} ${xu === 1 ? 'trabajadora extra' : 'trabajadoras extra'} × ${soles(pu)}${off ? ` (antes ${soles(plan.per_user)})` : ''}${tag}`, amount: r2(xu * pu) });
  const monthly = r2(lines.reduce((a, l) => a + l.amount, 0));
  const full = r2((plan.base + xn * plan.per_number + xu * plan.per_user) * per.months);
  const total = r2(monthly * per.months);
  return { months: per.months, monthly, total, full, saving: r2(full - total), pack, currency: 'PEN', lines };
}

// Las 4 opciones (1, 3, 6 y 12 meses) para mostrar juntas
export function optionsOf(plan, usage) {
  return PERIODOS.map((m) => priceOf(plan, usage, m));
}

// Texto corto de precios para la IA de ventas
export function priceText(plan) {
  const per = plan.periods || DEFAULT_PLAN.periods;
  const row = (p) => `${p.months === 1 ? '1 mes' : `${p.months} meses`}: plan base ${soles(plan.base - p.base_off)} al mes; cada extra ${soles(plan.per_number - p.extra_off)} al mes, o ${soles(plan.per_number - p.pack_off)} si lleva ${plan.pack_min || 2} o más extras (pack)`;
  return `Plan base ${soles(plan.base)} al mes (1 número de WhatsApp + el dueño + 1 trabajadora). Cada número de WhatsApp extra o trabajadora extra: ${soles(plan.per_number)} al mes. Pack: desde ${plan.pack_min || 2} extras, cada extra baja de precio. Pagando varios meses de una vez sale más barato:\n${per.map((p) => `- ${row(p)}`).join('\n')}`;
}

export async function billingOf(env, co, plan) {
  plan = plan || (await loadPlan(env));
  const usage = await usageOf(env, co.id);
  return { ...statusOf(co, plan), usage, price: priceOf(plan, usage), options: optionsOf(plan, usage), pay_info: plan.pay_info, contact: plan.contact, plan_status: co.plan_status || 'free' };
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
      .bind(co.id, Number(amount) || 0, 'PEN', m, String(method || 'manual').slice(0, 30), note ? String(note).slice(0, 300) : null, from, to, userId, t),
  ]);
  return to;
}
