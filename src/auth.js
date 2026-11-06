// Sesiones, usuarios y permisos por empresa/tienda
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { loadPlan, statusOf, DEFAULT_PLAN } from './billing.js';
import { now, randomToken, sha256hex, hashPassword, safeEqual, fail } from './util.js';

const COOKIE = 'sc_sess';
const SESSION_DAYS = 30;

export async function createSession(c, userId) {
  const token = randomToken(32);
  const id = await sha256hex(token);
  const exp = now() + SESSION_DAYS * 864e5;
  await c.env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at, user_agent) VALUES (?, ?, ?, ?, ?)')
    .bind(id, userId, exp, now(), (c.req.header('user-agent') || '').slice(0, 200))
    .run();
  const secure = new URL(c.req.url).protocol === 'https:';
  setCookie(c, COOKIE, token, { httpOnly: true, secure, sameSite: 'Lax', path: '/', maxAge: SESSION_DAYS * 86400 });
  // El resto de este pedido ya cuenta como sesión iniciada
  c.set('user', await c.env.DB.prepare('SELECT id, email, name, is_admin FROM users WHERE id = ?').bind(userId).first());
  c.set('access', undefined);
}

export async function destroySession(c) {
  const token = getCookie(c, COOKIE);
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256hex(token)).run();
  deleteCookie(c, COOKIE, { path: '/' });
}

export async function currentUser(c) {
  if (c.get('user') !== undefined) return c.get('user');
  const token = getCookie(c, COOKIE);
  let user = null;
  if (token) {
    const id = await sha256hex(token);
    user = await c.env.DB.prepare(
      `SELECT u.id, u.email, u.name, u.is_admin, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ? AND u.disabled = 0`
    ).bind(id, now()).first();
    // Renueva la sesión si le quedan menos de 15 días
    if (user && user.expires_at - now() < 15 * 864e5) {
      await c.env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').bind(now() + SESSION_DAYS * 864e5, id).run();
    }
  }
  c.set('user', user);
  return user;
}

export async function requireUser(c) {
  const u = await currentUser(c);
  if (!u) fail(401, 'Tu sesión terminó. Vuelve a entrar.');
  return u;
}

export async function checkPassword(user, password) {
  const { hash } = await hashPassword(password, user.pass_salt);
  return safeEqual(hash, user.pass_hash);
}

// Empresas y tiendas a las que tiene acceso el usuario
export async function loadAccess(c) {
  if (c.get('access')) return c.get('access');
  const user = await requireUser(c);
  const db = c.env.DB;
  const { results: mem } = await db.prepare(
    `SELECT m.company_id, m.role, m.all_stores, co.name AS company_name, co.plan_status, co.trial_ends_at, co.paid_until FROM memberships m
     JOIN companies co ON co.id = m.company_id WHERE m.user_id = ? ORDER BY co.id`
  ).bind(user.id).all();
  const plan = mem.some((m) => m.plan_status && m.plan_status !== 'free') ? await loadPlan(c.env) : DEFAULT_PLAN;
  const companies = mem.map((m) => {
    const b = statusOf(m, plan);
    return { id: m.company_id, name: m.company_name, role: m.role, plan: { state: b.state, blocked: b.blocked && !user.is_admin, days_left: b.days_left, until: b.until } };
  });
  const blockedCo = new Set(companies.filter((x) => x.plan.blocked).map((x) => x.id));
  let stores = [];
  if (mem.length) {
    const { results } = await db.prepare(
      `SELECT s.id, s.company_id, s.name, s.color, s.phone_display, s.phone_number_id, s.waba_id, s.status, s.verified_name,
              s.read_receipts, s.rev, s.last_webhook_at, s.connect_error, s.token_secret,
              s.timezone, s.country, s.currency, s.language, s.hour12, s.order_cfg, s.shopify_key, s.shopify_secret, s.shopify_last_at, s.canal, s.capi_on, s.capi_dataset, s.capi_last, s.token_enc, s.connected_via, s.autocorrect, s.rubro, s.setup, s.asistente
       FROM stores s JOIN memberships m ON m.company_id = s.company_id AND m.user_id = ?
       WHERE m.all_stores = 1 OR m.role = 'dueno'
          OR s.id IN (SELECT store_id FROM member_stores WHERE user_id = ?)
       ORDER BY s.company_id, s.id`
    ).bind(user.id, user.id).all();
    const roleBy = Object.fromEntries(mem.map((m) => [m.company_id, m.role]));
    stores = results.map((s) => ({ ...s, role: roleBy[s.company_id], company_blocked: blockedCo.has(s.company_id) }));
  }
  const access = { user, companies, stores };
  c.set('access', access);
  return access;
}

export async function storeFor(c, storeId, need = 'chats') {
  const { stores } = await loadAccess(c);
  const s = stores.find((x) => x.id === Number(storeId));
  if (!s) fail(404, 'No tienes acceso a esa tienda.');
  if (s.company_blocked) fail(402, PLAN_OVER);
  checkRole(s.role, need);
  return s;
}

const PLAN_OVER = 'Tu prueba gratis o tu plan de Control Total terminó. El dueño puede renovarlo en «Mi plan».';

export async function companyFor(c, companyId, need = 'config', { allowBlocked = false } = {}) {
  const { companies } = await loadAccess(c);
  const co = companies.find((x) => x.id === Number(companyId));
  if (!co) fail(404, 'No tienes acceso a esa empresa.');
  if (co.plan.blocked && !allowBlocked) fail(402, PLAN_OVER);
  checkRole(co.role, need);
  return co;
}

export async function chatFor(c, chatId, need = 'chats') {
  const chat = await c.env.DB.prepare('SELECT * FROM chats WHERE id = ?').bind(Number(chatId)).first();
  if (!chat) fail(404, 'Ese chat no existe.');
  const store = await storeFor(c, chat.store_id, need);
  return { chat, store };
}

function checkRole(role, need) {
  const ok = need === 'any' ? true : need === 'config' ? role === 'dueno' : role === 'dueno' || role === 'asesora';
  if (!ok) fail(403, 'Tu rol no tiene permiso para esto.');
}
