// Registro de alumnos, «Mi plan» y Panel Suyon (solo administrador)
import { Hono } from 'hono';
import { now, fail, hashPassword } from './util.js';
import { requireUser, companyFor, createSession } from './auth.js';
import { loadPlan, savePlan, billingOf, statusOf, addPayment, usageOf, priceOf, optionsOf } from './billing.js';
import { loadLanding, setVideo, removeVideo, addTestimonio, removeTestimonio } from './landing-data.js';
import { loadShalom, saveShalom, shalomGet, syncAgencies, findAgencies, agencyStats, track, baseOf } from './shalom.js';
import { loadAgenda, saveAgenda, freeSlots, bookDemo, dayLabel, timeLabel, gcalLink, DEMO_STATUS } from './agenda.js';

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
  return c.json({ open: !!p.signup_open, trial_days: p.trial_days, base: p.base, per_number: p.per_number, per_user: p.per_user, currency: 'PEN' });
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
      numbers: x.numbers, conectados: x.conectados, users: x.users, monthly: price.monthly, options: optionsOf(plan, { numbers: x.numbers, users: x.users }).map((o) => ({ months: o.months, total: o.total })), last_activity: x.last_activity, cobrado: x.cobrado, note: x.plan_note,
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
      const amount = b.amount != null && b.amount !== '' ? Number(b.amount) : priceOf(plan, usage, Number(b.months) || 1).total;
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

/* ---------- Agenda de demos (página pública + Panel) ---------- */

r.get('/agenda', async (c) => {
  const ag = await loadAgenda(c.env);
  const p = await loadPlan(c.env);
  return c.json({ on: !!ag.on, tz: ag.tz, dur_min: ag.dur_min, where: ag.where, contact: p.contact || null, days: await freeSlots(c.env, ag) });
});

r.post('/agenda', async (c) => {
  const ag = await loadAgenda(c.env);
  return c.json({ ok: true, demo: await bookDemo(c.env, ag, await body(c)) });
});

r.get('/admin/agenda', async (c) => {
  await requireAdmin(c);
  return c.json({ agenda: await loadAgenda(c.env) });
});

r.patch('/admin/agenda', async (c) => {
  await requireAdmin(c);
  return c.json({ agenda: await saveAgenda(c.env, await body(c)) });
});

r.get('/admin/demos', async (c) => {
  await requireAdmin(c);
  const ag = await loadAgenda(c.env);
  const t = now();
  const { results } = await c.env.DB.prepare('SELECT * FROM demos WHERE starts_at >= ? ORDER BY starts_at LIMIT 300').bind(t - 45 * DAY).all();
  const demos = results.map((d) => ({
    ...d,
    dia: dayLabel(d.starts_at, ag.tz),
    hora: timeLabel(d.starts_at, ag.tz),
    gcal: gcalLink({ title: `Demo Control Total · ${d.name}${d.brand ? ` (${d.brand})` : ''}`, start: d.starts_at, mins: d.dur_min, details: `WhatsApp: +${d.phone}\nMarca: ${d.brand || '—'}\nVende: ${d.sells || '—'}\nChats al día: ${d.volume || '—'}${d.note ? `\nNota: ${d.note}` : ''}`, where: ag.where }),
  }));
  const nuevas = demos.filter((d) => d.status === 'nueva' && d.starts_at > t).length;
  return c.json({ demos, nuevas, agenda: ag });
});

r.patch('/admin/demos/:id', async (c) => {
  await requireAdmin(c);
  const b = await body(c);
  const id = Number(c.req.param('id'));
  const d = await c.env.DB.prepare('SELECT id FROM demos WHERE id = ?').bind(id).first();
  if (!d) fail(404, 'Esa demo no existe.');
  if ('status' in b && !DEMO_STATUS.includes(b.status)) fail(400, 'Estado no válido.');
  await c.env.DB.prepare('UPDATE demos SET status = COALESCE(?, status), note = CASE WHEN ? THEN ? ELSE note END, updated_at = ? WHERE id = ?')
    .bind(b.status || null, 'note' in b ? 1 : 0, txt(b.note, 400) || null, now(), id).run();
  return c.json({ ok: true });
});

/* ---------- Página pública: video y testimonios ---------- */
const form = async (c) => {
  try {
    return await c.req.formData();
  } catch {
    fail(400, 'No llegó el archivo. Intenta de nuevo.');
  }
};
r.get('/admin/landing', async (c) => {
  await requireAdmin(c);
  return c.json({ landing: await loadLanding(c.env) });
});
r.post('/admin/landing/video', async (c) => {
  await requireAdmin(c);
  return c.json({ landing: await setVideo(c.env, (await form(c)).get('file')) });
});
r.delete('/admin/landing/video', async (c) => {
  await requireAdmin(c);
  return c.json({ landing: await removeVideo(c.env) });
});
r.post('/admin/landing/testimonios', async (c) => {
  await requireAdmin(c);
  return c.json({ landing: await addTestimonio(c.env, await form(c)) });
});
r.delete('/admin/landing/testimonios/:id', async (c) => {
  await requireAdmin(c);
  return c.json({ landing: await removeTestimonio(c.env, c.req.param('id')) });
});

/* ---------- Shalom (servicio externo «Shalom API Peru») ---------- */
const clip = (r) => {
  const out = r.data != null ? JSON.stringify(r.data, null, 2) : r.text || '';
  // Resumen de la forma de la respuesta (sirve aunque el texto se corte)
  const shape = r.data && typeof r.data === 'object' && !Array.isArray(r.data)
    ? Object.fromEntries(Object.entries(r.data).map(([k, v]) => [k, Array.isArray(v) ? `lista de ${v.length}` : v && typeof v === 'object' ? 'objeto' : v]))
    : Array.isArray(r.data) ? { lista: r.data.length } : null;
  return { ok: r.ok, status: r.status, ms: r.ms, shape, body: out.length > 30000 ? `${out.slice(0, 30000)}\n… (cortado)` : out };
};
r.get('/admin/shalom', async (c) => {
  await requireAdmin(c);
  return c.json({ key: !!c.env.SHALOM_API_KEY, base: baseOf(c.env), cfg: await loadShalom(c.env), stats: await agencyStats(c.env) });
});
r.patch('/admin/shalom', async (c) => {
  await requireAdmin(c);
  return c.json({ cfg: await saveShalom(c.env, await body(c)) });
});
r.post('/admin/shalom/probar', async (c) => {
  await requireAdmin(c);
  const b = await body(c);
  return c.json(clip(await shalomGet(c.env, String(b.path || '/v1/agencies').trim())));
});
r.post('/admin/shalom/agencias', async (c) => {
  await requireAdmin(c);
  return c.json(await syncAgencies(c.env));
});
r.post('/admin/shalom/rastrear', async (c) => {
  await requireAdmin(c);
  const b = await body(c);
  const t = await track(c.env, b.guia, b.codigo);
  return c.json({ ...clip(t), path: t.path, estado: t.estado });
});
r.get('/shalom/agencias', async (c) => {
  await requireUser(c);
  return c.json({ agencias: await findAgencies(c.env, c.req.query('q') || '', 20) });
});

export default r;
