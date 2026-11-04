// Registro de alumnos, «Mi plan» y Panel Suyon (solo administrador)
import { Hono } from 'hono';
import { now, fail, hashPassword } from './util.js';
import { requireUser, companyFor, createSession } from './auth.js';
import { loadPlan, savePlan, billingOf, statusOf, addPayment, usageOf, priceOf } from './billing.js';

const r = new Hono();
const DAY = 864e5;
const body = async (c) => {
  try {
    return await c.req.json();
  } catch {
    return {};
  }
};
const txt = (v, n) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, n);
const cleanEmail = (e) => String(e || '').trim().toLowerCase();

async function requireAdmin(c) {
  const u = await requireUser(c);
  if (!u.is_admin) fail(403, 'Solo el administrador de Control Total puede ver esto.');
  return u;
}

// Datos públicos para la pantalla de registro
r.get('/registro', async (c) => {
  const p = await loadPlan(c.env);
  return c.json({ open: !!p.signup_open, trial_days: p.trial_days, base: p.base, per_number: p.per_number, per_user: p.per_user, currency: p.currency });
});

// Un alumno crea su cuenta: empresa nueva en prueba gratis
r.post('/registro', async (c) => {
  const p = await loadPlan(c.env);
  if (!p.signup_open) fail(403, 'El registro está cerrado por ahora. Pide una invitación.');
  const b = await body(c);
  if (b.website) fail(400, 'No se pudo crear la cuenta.'); // trampa para robots
  const email = cleanEmail(b.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fail(400, 'Escribe un correo válido.');
  if (String(b.password || '').length < 8) fail(400, 'La contraseña debe tener al menos 8 caracteres.');
  const name = txt(b.name, 60);
  const company = txt(b.company, 60);
  if (!name) fail(400, 'Escribe tu nombre.');
  if (!company) fail(400, 'Escribe el nombre de tu marca o tienda.');
  const phone = String(b.phone || '').replace(/[^\d+]/g, '').slice(0, 20) || null;
  const db = c.env.DB;
  if (await db.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()) fail(409, 'Ese correo ya tiene cuenta. Entra con tu contraseña.');
  const t = now();
  const { hash, salt } = await hashPassword(b.password);
  const u = await db.prepare('INSERT INTO users (email, name, pass_hash, pass_salt, is_admin, created_at) VALUES (?, ?, ?, ?, 0, ?)').bind(email, name, hash, salt, t).run();
  const userId = u.meta.last_row_id;
  const co = await db.prepare("INSERT INTO companies (name, created_at, plan_status, trial_ends_at, owner_user_id, contact_phone, created_via) VALUES (?, ?, 'trial', ?, ?, ?, 'registro')")
    .bind(company, t, t + p.trial_days * DAY, userId, phone).run();
  await db.prepare("INSERT INTO memberships (user_id, company_id, role, all_stores, created_at) VALUES (?, ?, 'dueno', 1, ?)").bind(userId, co.meta.last_row_id, t).run();
  await createSession(c, userId);
  return c.json({ ok: true });
});

// «Mi plan» de la empresa (el dueño lo ve aunque esté vencido)
r.get('/companies/:id/plan', async (c) => {
  const co = await companyFor(c, c.req.param('id'), 'config', { allowBlocked: true });
  const row = await c.env.DB.prepare('SELECT * FROM companies WHERE id = ?').bind(co.id).first();
  const { results: pagos } = await c.env.DB.prepare('SELECT amount, currency, months, method, paid_from, paid_to, created_at FROM payments WHERE company_id = ? ORDER BY id DESC LIMIT 12').bind(co.id).all();
  return c.json({ plan: await billingOf(c.env, row), pagos });
});

/* ---------- Panel Suyon (administrador) ---------- */

r.get('/admin/plan', async (c) => {
  await requireAdmin(c);
  return c.json({ plan: await loadPlan(c.env) });
});

r.patch('/admin/plan', async (c) => {
  await requireAdmin(c);
  return c.json({ plan: await savePlan(c.env, await body(c)) });
});

r.get('/admin/empresas', async (c) => {
  await requireAdmin(c);
  const db = c.env.DB;
  const plan = await loadPlan(c.env);
  const { results } = await db.prepare(
    `SELECT co.*, u.email AS owner_email, u.name AS owner_name,
       (SELECT COUNT(*) FROM stores s WHERE s.company_id = co.id) AS numbers,
       (SELECT COUNT(*) FROM stores s WHERE s.company_id = co.id AND s.status = 'activo') AS conectados,
       (SELECT COUNT(*) FROM memberships m WHERE m.company_id = co.id AND m.role != 'dueno') AS users,
       (SELECT MAX(s.last_webhook_at) FROM stores s WHERE s.company_id = co.id) AS last_activity,
       (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.company_id = co.id) AS cobrado
     FROM companies co
     LEFT JOIN users u ON u.id = COALESCE(co.owner_user_id, (SELECT m.user_id FROM memberships m WHERE m.company_id = co.id AND m.role = 'dueno' ORDER BY m.created_at LIMIT 1))
     ORDER BY co.id DESC LIMIT 500`
  ).all();
  const empresas = results.map((x) => {
    const st = statusOf(x, plan);
    const price = priceOf(plan, { numbers: x.numbers, users: x.users });
    return {
      id: x.id, name: x.name, owner_email: x.owner_email, owner_name: x.owner_name, contact_phone: x.contact_phone, created_at: x.created_at, created_via: x.created_via,
      plan_status: x.plan_status, state: st.state, blocked: st.blocked, until: st.until, days_left: st.days_left,
      numbers: x.numbers, conectados: x.conectados, users: x.users, monthly: price.total, last_activity: x.last_activity, cobrado: x.cobrado, note: x.plan_note,
    };
  });
  const sum = (f) => empresas.filter(f).length;
  return c.json({
    plan,
    empresas,
    resumen: {
      total: empresas.length,
      prueba: sum((e) => e.state === 'trial'),
      pagando: sum((e) => e.state === 'active' || e.state === 'grace'),
      vencidas: sum((e) => e.blocked),
      gratis: sum((e) => e.state === 'free'),
      mensual: Math.round(empresas.filter((e) => e.state === 'active' || e.state === 'grace').reduce((a, e) => a + e.monthly, 0) * 100) / 100,
    },
  });
});

r.post('/admin/empresas/:id', async (c) => {
  const admin = await requireAdmin(c);
  const db = c.env.DB;
  const co = await db.prepare('SELECT * FROM companies WHERE id = ?').bind(Number(c.req.param('id'))).first();
  if (!co) fail(404, 'Esa empresa no existe.');
  const b = await body(c);
  const t = now();
  switch (b.action) {
    case 'pagado': {
      const usage = await usageOf(c.env, co.id);
      const plan = await loadPlan(c.env);
      const amount = b.amount != null && b.amount !== '' ? Number(b.amount) : priceOf(plan, usage).total * (Number(b.months) || 1);
      await addPayment(c.env, co, { months: b.months, amount, method: b.method || 'yape', note: b.note, userId: admin.id });
      break;
    }
    case 'dias': {
      const d = Math.min(Math.max(Math.round(Number(b.days) || 0), 1), 365);
      if (co.plan_status === 'trial') await db.prepare('UPDATE companies SET trial_ends_at = ? WHERE id = ?').bind(Math.max(co.trial_ends_at || t, t) + d * DAY, co.id).run();
      else await db.prepare("UPDATE companies SET plan_status = 'active', paid_until = ? WHERE id = ?").bind(Math.max(co.paid_until || t, t) + d * DAY, co.id).run();
      break;
    }
    case 'gratis':
      await db.prepare("UPDATE companies SET plan_status = 'free' WHERE id = ?").bind(co.id).run();
      break;
    case 'prueba': {
      const plan = await loadPlan(c.env);
      await db.prepare("UPDATE companies SET plan_status = 'trial', trial_ends_at = ? WHERE id = ?").bind(t + plan.trial_days * DAY, co.id).run();
      break;
    }
    case 'bloquear':
      await db.prepare("UPDATE companies SET plan_status = 'blocked' WHERE id = ?").bind(co.id).run();
      break;
    case 'nota':
      await db.prepare('UPDATE companies SET plan_note = ? WHERE id = ?').bind(String(b.note || '').slice(0, 500) || null, co.id).run();
      break;
    default:
      fail(400, 'Acción desconocida.');
  }
  return c.json({ ok: true });
});

export default r;
