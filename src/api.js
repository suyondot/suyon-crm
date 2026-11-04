// API de la app web
import { Hono } from 'hono';
import {
  now, fail, randomToken, sha256hex, hashPassword, safeEqual, cleanEmail, validEmail, clip,
  ROLES, DEFAULT_LABELS, LABEL_COLORS, HttpError, windowOpen, GENERAL, localDay,
} from './util.js';
import { createSession, destroySession, currentUser, requireUser, checkPassword, loadAccess, storeFor, companyFor, chatFor } from './auth.js';
import { sendText, uploadMedia, sendMediaById, markRead, getPhoneInfo, subscribeApp, findWaba, tokenInfo, probeFields, registerNumber, kindForMime, SEND_RULES, getProfile, setProfile, setProfilePhoto, VERTICALS } from './whatsapp.js';
import { preview, mediaKey, fetchMediaToR2 } from './webhook.js';
import botApi, { pauseForHuman, pendingCounts } from './api-bot.js';
import reportesApi from './api-reportes.js';
import pedidosApi from './api-pedidos.js';
import { signupInfo, connectSignup } from './signup.js';

const api = new Hono();
const H24 = 24 * 3600e3;

const body = async (c) => {
  try {
    return await c.req.json();
  } catch {
    return {};
  }
};
const txt = (v, max = 200) => clip(String(v ?? '').trim(), max);
const ids = (arr) => (Array.isArray(arr) ? arr.map(Number).filter((n) => Number.isInteger(n) && n > 0) : []);
const bump = (env, storeId) => env.DB.prepare('UPDATE stores SET rev = rev + 1 WHERE id = ?').bind(storeId).run();
const inList = (n) => Array(n).fill('?').join(',');

function checkPasswordRules(p) {
  if (String(p || '').length < 8) fail(400, 'La contraseña debe tener al menos 8 caracteres.');
}

function publicStore(s) {
  const out = {
    id: s.id, company_id: s.company_id, name: s.name, color: s.color, phone_display: s.phone_display,
    status: s.status, verified_name: s.verified_name, role: s.role, rev: s.rev,
    timezone: s.timezone, country: s.country, currency: s.currency, language: s.language, hour12: s.hour12, canal: s.canal || 'mensajes', connected_via: s.connected_via || null,
  };
  if (s.role === 'dueno') {
    Object.assign(out, {
      phone_number_id: s.phone_number_id, waba_id: s.waba_id, token_secret: s.token_secret,
      read_receipts: s.read_receipts, last_webhook_at: s.last_webhook_at, connect_error: s.connect_error,
    });
  }
  return out;
}

async function mePayload(c) {
  const a = await loadAccess(c);
  return {
    user: { id: a.user.id, name: a.user.name, email: a.user.email, is_admin: !!a.user.is_admin },
    companies: a.companies,
    stores: a.stores.map(publicStore),
    roles: ROLES,
    general: GENERAL,
  };
}

/* ---------------- Entrada, cuenta y sesión ---------------- */

api.get('/state', async (c) => {
  const any = await c.env.DB.prepare('SELECT id FROM users LIMIT 1').first();
  if (!any) return c.json({ setup: true, code_set: !!c.env.SETUP_CODE });
  const u = await currentUser(c);
  if (!u) return c.json({ login: true });
  return c.json(await mePayload(c));
});

// Primera cuenta (dueño y administrador). Solo funciona si no hay usuarios.
api.post('/setup', async (c) => {
  const b = await body(c);
  if (!c.env.SETUP_CODE) fail(400, 'Primero pon la clave de inicio (SETUP_CODE) como secreto en Cloudflare.');
  if (!safeEqual(String(b.code || '').trim(), c.env.SETUP_CODE)) fail(403, 'La clave de inicio no coincide.');
  const any = await c.env.DB.prepare('SELECT id FROM users LIMIT 1').first();
  if (any) fail(409, 'El sistema ya tiene cuenta de dueño. Entra con tu correo.');
  const email = cleanEmail(b.email);
  if (!validEmail(email)) fail(400, 'Escribe un correo válido.');
  checkPasswordRules(b.password);
  const name = txt(b.name, 60) || 'Dueño';
  const company = txt(b.company, 60) || 'Mi empresa';
  const { hash, salt } = await hashPassword(b.password);
  const t = now();
  const u = await c.env.DB.prepare('INSERT INTO users (email, name, pass_hash, pass_salt, is_admin, created_at) VALUES (?, ?, ?, ?, 1, ?)')
    .bind(email, name, hash, salt, t).run();
  const userId = u.meta.last_row_id;
  const co = await c.env.DB.prepare('INSERT INTO companies (name, created_at) VALUES (?, ?)').bind(company, t).run();
  await c.env.DB.prepare("INSERT INTO memberships (user_id, company_id, role, all_stores, created_at) VALUES (?, ?, 'dueno', 1, ?)")
    .bind(userId, co.meta.last_row_id, t).run();
  await createSession(c, userId);
  return c.json(await mePayload(c));
});

api.post('/login', async (c) => {
  const b = await body(c);
  const email = cleanEmail(b.email);
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  const bad = () => fail(401, 'Correo o contraseña incorrectos.');
  if (!user || user.disabled) {
    await hashPassword(String(b.password || ''), 'AAAAAAAAAAAAAAAAAAAAAA=='); // mismo tiempo de respuesta
    bad();
  }
  if (user.locked_until && user.locked_until > now()) fail(429, 'Demasiados intentos. Espera 15 minutos o pide al dueño un enlace para cambiar tu contraseña.');
  if (!(await checkPassword(user, String(b.password || '')))) {
    const n = user.failed_logins + 1;
    await c.env.DB.prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?')
      .bind(n >= 8 ? 0 : n, n >= 8 ? now() + 15 * 60e3 : null, user.id).run();
    bad();
  }
  await c.env.DB.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?').bind(user.id).run();
  await createSession(c, user.id);
  return c.json(await mePayload(c));
});

api.post('/logout', async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

// Recuperar la cuenta del administrador con la clave de inicio
api.post('/recover', async (c) => {
  const b = await body(c);
  if (!c.env.SETUP_CODE || !safeEqual(String(b.code || '').trim(), c.env.SETUP_CODE)) fail(403, 'La clave de inicio no coincide.');
  checkPasswordRules(b.password);
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ? AND is_admin = 1').bind(cleanEmail(b.email)).first();
  if (!user) fail(404, 'Ese correo no es de un administrador.');
  const { hash, salt } = await hashPassword(b.password);
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET pass_hash = ?, pass_salt = ?, failed_logins = 0, locked_until = NULL WHERE id = ?').bind(hash, salt, user.id),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
  ]);
  await createSession(c, user.id);
  return c.json(await mePayload(c));
});

api.get('/me', async (c) => c.json(await mePayload(c)));

api.patch('/me', async (c) => {
  const u = await requireUser(c);
  const b = await body(c);
  const name = txt(b.name, 60);
  if (!name) fail(400, 'Escribe tu nombre.');
  await c.env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, u.id).run();
  c.set('user', undefined);
  c.set('access', undefined);
  return c.json(await mePayload(c));
});

api.post('/me/password', async (c) => {
  const u = await requireUser(c);
  const b = await body(c);
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(u.id).first();
  if (!(await checkPassword(user, String(b.current || '')))) fail(400, 'Tu contraseña actual no coincide.');
  checkPasswordRules(b.password);
  const { hash, salt } = await hashPassword(b.password);
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET pass_hash = ?, pass_salt = ? WHERE id = ?').bind(hash, salt, u.id),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id),
  ]);
  await createSession(c, u.id);
  return c.json({ ok: true });
});

/* ---------------- Invitaciones y cambio de contraseña por enlace ---------------- */

async function findInvite(env, token) {
  const inv = await env.DB.prepare(
    `SELECT i.*, co.name AS company_name FROM invites i JOIN companies co ON co.id = i.company_id WHERE i.token_hash = ?`
  ).bind(await sha256hex(String(token || ''))).first();
  if (!inv || inv.used_at || inv.expires_at < now()) fail(404, 'Esta invitación ya no es válida. Pide una nueva al dueño.');
  return inv;
}

api.get('/invites/:token', async (c) => {
  const inv = await findInvite(c.env, c.req.param('token'));
  const exists = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(inv.email).first();
  return c.json({ email: inv.email, company: inv.company_name, role: ROLES[inv.role], has_account: !!exists });
});

api.post('/invites/:token/accept', async (c) => {
  const inv = await findInvite(c.env, c.req.param('token'));
  const b = await body(c);
  const db = c.env.DB;
  let user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(inv.email).first();
  if (user) {
    if (!(await checkPassword(user, String(b.password || '')))) fail(401, 'Ya tienes cuenta con este correo: escribe tu contraseña de siempre.');
  } else {
    checkPasswordRules(b.password);
    const name = txt(b.name, 60);
    if (!name) fail(400, 'Escribe tu nombre.');
    const { hash, salt } = await hashPassword(b.password);
    const r = await db.prepare('INSERT INTO users (email, name, pass_hash, pass_salt, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(inv.email, name, hash, salt, now()).run();
    user = { id: r.meta.last_row_id };
  }
  const stmts = [
    db.prepare(
      `INSERT INTO memberships (user_id, company_id, role, all_stores, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (user_id, company_id) DO UPDATE SET role = excluded.role, all_stores = excluded.all_stores`
    ).bind(user.id, inv.company_id, inv.role, inv.all_stores, now()),
    db.prepare('UPDATE invites SET used_at = ? WHERE id = ?').bind(now(), inv.id),
    db.prepare('DELETE FROM member_stores WHERE user_id = ? AND store_id IN (SELECT id FROM stores WHERE company_id = ?)').bind(user.id, inv.company_id),
  ];
  for (const sid of ids(JSON.parse(inv.store_ids || '[]'))) {
    stmts.push(db.prepare('INSERT OR IGNORE INTO member_stores (user_id, store_id) SELECT ?, id FROM stores WHERE id = ? AND company_id = ?').bind(user.id, sid, inv.company_id));
  }
  await db.batch(stmts);
  await createSession(c, user.id);
  return c.json(await mePayload(c));
});

async function findReset(env, token) {
  const r = await env.DB.prepare(
    `SELECT r.*, u.email, u.name FROM password_resets r JOIN users u ON u.id = r.user_id WHERE r.token_hash = ?`
  ).bind(await sha256hex(String(token || ''))).first();
  if (!r || r.used_at || r.expires_at < now()) fail(404, 'Este enlace ya no es válido. Pide uno nuevo al dueño.');
  return r;
}

api.get('/resets/:token', async (c) => {
  const r = await findReset(c.env, c.req.param('token'));
  return c.json({ email: r.email, name: r.name });
});

api.post('/resets/:token', async (c) => {
  const r = await findReset(c.env, c.req.param('token'));
  const b = await body(c);
  checkPasswordRules(b.password);
  const { hash, salt } = await hashPassword(b.password);
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET pass_hash = ?, pass_salt = ?, failed_logins = 0, locked_until = NULL WHERE id = ?').bind(hash, salt, r.user_id),
    c.env.DB.prepare('UPDATE password_resets SET used_at = ? WHERE token_hash = ?').bind(now(), r.token_hash),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(r.user_id),
  ]);
  await createSession(c, r.user_id);
  return c.json(await mePayload(c));
});

/* ---------------- Empresas y equipo ---------------- */

api.post('/companies', async (c) => {
  const u = await requireUser(c);
  if (!u.is_admin) fail(403, 'Solo el administrador puede crear empresas.');
  const name = txt((await body(c)).name, 60);
  if (!name) fail(400, 'Escribe el nombre de la empresa.');
  const r = await c.env.DB.prepare('INSERT INTO companies (name, created_at) VALUES (?, ?)').bind(name, now()).run();
  await c.env.DB.prepare("INSERT INTO memberships (user_id, company_id, role, all_stores, created_at) VALUES (?, ?, 'dueno', 1, ?)")
    .bind(u.id, r.meta.last_row_id, now()).run();
  c.set('access', undefined);
  return c.json(await mePayload(c));
});

api.patch('/companies/:id', async (c) => {
  const co = await companyFor(c, c.req.param('id'));
  const name = txt((await body(c)).name, 60);
  if (!name) fail(400, 'Escribe el nombre de la empresa.');
  await c.env.DB.prepare('UPDATE companies SET name = ? WHERE id = ?').bind(name, co.id).run();
  c.set('access', undefined);
  return c.json(await mePayload(c));
});

api.get('/companies/:id/team', async (c) => {
  const co = await companyFor(c, c.req.param('id'));
  const db = c.env.DB;
  const { results: members } = await db.prepare(
    `SELECT u.id, u.name, u.email, m.role, m.all_stores,
       (SELECT group_concat(ms.store_id) FROM member_stores ms JOIN stores s ON s.id = ms.store_id AND s.company_id = m.company_id WHERE ms.user_id = u.id) AS store_ids
     FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.company_id = ? ORDER BY m.role = 'dueno' DESC, u.name`
  ).bind(co.id).all();
  const { results: invites } = await db.prepare(
    'SELECT id, email, role, all_stores, store_ids, expires_at, created_at FROM invites WHERE company_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY id DESC'
  ).bind(co.id, now()).all();
  return c.json({
    members: members.map((m) => ({ ...m, store_ids: m.store_ids ? m.store_ids.split(',').map(Number) : [] })),
    invites: invites.map((i) => ({ ...i, store_ids: JSON.parse(i.store_ids || '[]') })),
  });
});

function checkRoleInput(b) {
  if (!ROLES[b.role]) fail(400, 'Elige un rol.');
  const all = b.role === 'dueno' || !!b.all_stores;
  const storeIds = all ? [] : ids(b.store_ids);
  if (!all && !storeIds.length) fail(400, 'Elige al menos una tienda o marca "Todas las tiendas".');
  return { role: b.role, all, storeIds };
}

api.post('/companies/:id/invites', async (c) => {
  const co = await companyFor(c, c.req.param('id'));
  const u = await requireUser(c);
  const b = await body(c);
  const email = cleanEmail(b.email);
  if (!validEmail(email)) fail(400, 'Escribe un correo válido.');
  const { role, all, storeIds } = checkRoleInput(b);
  const token = randomToken(24);
  await c.env.DB.prepare(
    'INSERT INTO invites (token_hash, company_id, email, role, all_stores, store_ids, created_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(await sha256hex(token), co.id, email, role, all ? 1 : 0, JSON.stringify(storeIds), u.id, now() + 7 * 864e5, now()).run();
  return c.json({ link: `${new URL(c.req.url).origin}/invitacion/${token}`, email, company: co.name });
});

api.delete('/companies/:id/invites/:inviteId', async (c) => {
  const co = await companyFor(c, c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM invites WHERE id = ? AND company_id = ?').bind(Number(c.req.param('inviteId')), co.id).run();
  return c.json({ ok: true });
});

async function ownersLeft(db, companyId, exceptUser) {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM memberships WHERE company_id = ? AND role = 'dueno' AND user_id != ?").bind(companyId, exceptUser).first();
  return r.n;
}

api.patch('/companies/:id/members/:userId', async (c) => {
  const co = await companyFor(c, c.req.param('id'));
  const userId = Number(c.req.param('userId'));
  const { role, all, storeIds } = checkRoleInput(await body(c));
  const db = c.env.DB;
  const m = await db.prepare('SELECT role FROM memberships WHERE user_id = ? AND company_id = ?').bind(userId, co.id).first();
  if (!m) fail(404, 'Esa persona no está en el equipo.');
  if (m.role === 'dueno' && role !== 'dueno' && !(await ownersLeft(db, co.id, userId))) fail(400, 'La empresa necesita al menos un dueño.');
  const stmts = [
    db.prepare('UPDATE memberships SET role = ?, all_stores = ? WHERE user_id = ? AND company_id = ?').bind(role, all ? 1 : 0, userId, co.id),
    db.prepare('DELETE FROM member_stores WHERE user_id = ? AND store_id IN (SELECT id FROM stores WHERE company_id = ?)').bind(userId, co.id),
  ];
  for (const sid of storeIds) stmts.push(db.prepare('INSERT OR IGNORE INTO member_stores (user_id, store_id) SELECT ?, id FROM stores WHERE id = ? AND company_id = ?').bind(userId, sid, co.id));
  await db.batch(stmts);
  return c.json({ ok: true });
});

api.delete('/companies/:id/members/:userId', async (c) => {
  const co = await companyFor(c, c.req.param('id'));
  const userId = Number(c.req.param('userId'));
  const db = c.env.DB;
  const m = await db.prepare('SELECT role FROM memberships WHERE user_id = ? AND company_id = ?').bind(userId, co.id).first();
  if (!m) fail(404, 'Esa persona no está en el equipo.');
  if (m.role === 'dueno' && !(await ownersLeft(db, co.id, userId))) fail(400, 'La empresa necesita al menos un dueño.');
  await db.batch([
    db.prepare('DELETE FROM memberships WHERE user_id = ? AND company_id = ?').bind(userId, co.id),
    db.prepare('DELETE FROM member_stores WHERE user_id = ? AND store_id IN (SELECT id FROM stores WHERE company_id = ?)').bind(userId, co.id),
  ]);
  const other = await db.prepare('SELECT 1 FROM memberships WHERE user_id = ?').bind(userId).first();
  if (!other) await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
  return c.json({ ok: true });
});

api.post('/companies/:id/members/:userId/reset', async (c) => {
  const co = await companyFor(c, c.req.param('id'));
  const me = await requireUser(c);
  const userId = Number(c.req.param('userId'));
  const m = await c.env.DB.prepare('SELECT 1 FROM memberships WHERE user_id = ? AND company_id = ?').bind(userId, co.id).first();
  if (!m) fail(404, 'Esa persona no está en el equipo.');
  const token = randomToken(24);
  await c.env.DB.prepare('INSERT INTO password_resets (token_hash, user_id, created_by, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256hex(token), userId, me.id, now() + 2 * 864e5).run();
  return c.json({ link: `${new URL(c.req.url).origin}/clave/${token}` });
});

/* ---------------- Tiendas (números de WhatsApp) ---------------- */

const CANALES = ['mensajes', 'shopify'];

function storeInput(b, partial) {
  const out = {};
  if (!partial || 'name' in b) {
    out.name = txt(b.name, 60);
    if (!out.name) fail(400, 'Escribe el nombre de la tienda.');
  }
  if ('color' in b) out.color = /^#[0-9a-fA-F]{6}$/.test(b.color) ? b.color : '#7A1F35';
  if ('phone_display' in b) out.phone_display = txt(b.phone_display, 40) || null;
  for (const k of ['phone_number_id', 'waba_id']) {
    if (k in b) {
      const v = String(b[k] || '').replace(/\D/g, '');
      out[k] = v || null;
    }
  }
  if ('token_secret' in b) {
    const v = String(b.token_secret || 'WA_TOKEN').trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{1,40}$/.test(v)) fail(400, 'El nombre del secreto del token solo puede tener letras, números y _.');
    out.token_secret = v;
  }
  if ('read_receipts' in b) out.read_receipts = b.read_receipts ? 1 : 0;
  // Ajustes generales de la tienda
  if ('timezone' in b) {
    if (!GENERAL.timezones.includes(b.timezone)) fail(400, 'Elige una zona horaria de la lista.');
    out.timezone = b.timezone;
  }
  if ('country' in b) {
    if (!GENERAL.countries.some((x) => x.id === b.country)) fail(400, 'Elige un país de la lista.');
    out.country = b.country;
  }
  if ('currency' in b) {
    if (!GENERAL.currencies.some((x) => x.id === b.currency)) fail(400, 'Elige una moneda de la lista.');
    out.currency = b.currency;
  }
  if ('language' in b) {
    if (!GENERAL.languages.some((x) => x.id === b.language)) fail(400, 'Elige un idioma de la lista.');
    out.language = b.language;
  }
  if ('hour12' in b) out.hour12 = b.hour12 ? 1 : 0;
  // Cómo vende: por mensajes de WhatsApp (bot + IA) o por su web (Shopify)
  if ('canal' in b) {
    if (!CANALES.includes(b.canal)) fail(400, 'Elige cómo vende la tienda: por mensajes o por Shopify.');
    out.canal = b.canal;
  }
  if (out.phone_number_id && out.waba_id && out.phone_number_id === out.waba_id) {
    fail(400, 'Los dos identificadores son iguales. El de la cuenta de WhatsApp Business es otro número: lo ves en la dirección del Administrador de WhatsApp (asset_id=…).');
  }
  return out;
}

api.post('/companies/:id/stores', async (c) => {
  const co = await companyFor(c, c.req.param('id'));
  const s = storeInput(await body(c), false);
  const db = c.env.DB;
  if (s.phone_number_id && (await db.prepare('SELECT 1 FROM stores WHERE phone_number_id = ?').bind(s.phone_number_id).first())) {
    fail(409, 'Ese número ya está en otra tienda.');
  }
  const r = await db.prepare(
    'INSERT INTO stores (company_id, name, color, phone_display, phone_number_id, waba_id, token_secret, canal, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(co.id, s.name, s.color || '#7A1F35', s.phone_display ?? null, s.phone_number_id ?? null, s.waba_id ?? null, s.token_secret || 'WA_TOKEN', s.canal || 'mensajes', now()).run();
  const storeId = r.meta.last_row_id;
  await db.batch(DEFAULT_LABELS.map(([name, color, auto], i) =>
    db.prepare('INSERT INTO labels (store_id, name, color, auto, sort, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(storeId, name, color, auto, i, now())
  ));
  c.set('access', undefined);
  return c.json({ ...(await mePayload(c)), store_id: storeId });
});

api.patch('/stores/:id', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  const s = storeInput(await body(c), true);
  const db = c.env.DB;
  if (s.phone_number_id && s.phone_number_id !== st.phone_number_id) {
    if (await db.prepare('SELECT 1 FROM stores WHERE phone_number_id = ? AND id != ?').bind(s.phone_number_id, st.id).first()) fail(409, 'Ese número ya está en otra tienda.');
  }
  if (('phone_number_id' in s && s.phone_number_id !== st.phone_number_id) || ('waba_id' in s && s.waba_id !== st.waba_id) || ('token_secret' in s && s.token_secret !== st.token_secret)) {
    s.status = 'pendiente';
    s.connect_error = null;
  }
  const keys = Object.keys(s);
  if (keys.length) {
    await db.prepare(`UPDATE stores SET ${keys.map((k) => `${k} = ?`).join(', ')}, rev = rev + 1 WHERE id = ?`).bind(...keys.map((k) => s[k]), st.id).run();
  }
  c.set('access', undefined);
  return c.json(await mePayload(c));
});

api.delete('/stores/:id', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  const b = await body(c);
  if (String(b.confirm || '').trim().toLowerCase() !== st.name.trim().toLowerCase()) fail(400, 'Para borrar, escribe el nombre exacto de la tienda.');
  const db = c.env.DB;
  // Borra los archivos de R2 de esta tienda
  let cursor;
  do {
    const list = await c.env.MEDIA.list({ prefix: `s${st.id}/`, cursor });
    if (list.objects.length) await c.env.MEDIA.delete(list.objects.map((o) => o.key));
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
  await db.batch([
    db.prepare('DELETE FROM chat_labels WHERE chat_id IN (SELECT id FROM chats WHERE store_id = ?)').bind(st.id),
    db.prepare('DELETE FROM messages WHERE store_id = ?').bind(st.id),
    db.prepare('DELETE FROM chats WHERE store_id = ?').bind(st.id),
    db.prepare('DELETE FROM labels WHERE store_id = ?').bind(st.id),
    db.prepare('DELETE FROM member_stores WHERE store_id = ?').bind(st.id),
    db.prepare('DELETE FROM stores WHERE id = ?').bind(st.id),
  ]);
  c.set('access', undefined);
  return c.json(await mePayload(c));
});

// Prueba el token, guarda el nombre verificado y suscribe la app a la cuenta de WhatsApp
api.post('/stores/:id/connect', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  if (!st.phone_number_id) fail(400, 'Falta el "Identificador del número de teléfono".');
  const db = c.env.DB;
  const steps = [];
  try {
    const info = await getPhoneInfo(c.env, st);
    steps.push(`Número encontrado: ${info.display_phone_number} (${info.verified_name || 'sin nombre'})`);
    try {
      const ti = await tokenInfo(c.env, st);
      steps.push(`Info del token · app: ${ti.app} · tipo: ${ti.type} · vence: ${ti.expires} · permisos: ${ti.scopes}`);
      for (const g of ti.granular) steps.push(`Info del token · ${g}`);
    } catch (e) {
      steps.push('Info del token: no se pudo leer (' + e.message + ')');
    }
    try {
      const pf = await probeFields(c.env, st, st.phone_number_id, ['status', 'name_status', 'account_mode', 'code_verification_status', 'platform_type', 'messaging_limit_tier', 'is_official_business_account']);
      steps.push('Info del número · ' + Object.entries(pf).map(([k, v]) => `${k}: ${v}`).join(' · '));
      if (st.waba_id) {
        const wf = await probeFields(c.env, st, st.waba_id, ['name', 'owner_business_info', 'ownership_type', 'account_review_status', 'business_verification_status', 'primary_funding_id']);
        steps.push('Info de la cuenta · ' + Object.entries(wf).map(([k, v]) => `${k}: ${v}`).join(' · '));
      }
    } catch {}
    if (info.quality_rating) steps.push(`Calidad del número: ${info.quality_rating}`);
    let subscribed = false;
    let subErr = null;
    if (st.waba_id) {
      try {
        await subscribeApp(c.env, st);
        subscribed = true;
      } catch (e) {
        subErr = e;
      }
    }
    if (!subscribed) {
      // El identificador de la cuenta falta o no es el correcto: se busca solo
      const rep = await findWaba(c.env, st);
      if (rep.found && rep.found !== st.waba_id) {
        st.waba_id = rep.found;
        await db.prepare('UPDATE stores SET waba_id = ? WHERE id = ?').bind(rep.found, st.id).run();
        steps.push(`Se encontró la cuenta de WhatsApp correcta: ${rep.found}`);
        try {
          await subscribeApp(c.env, st);
          subscribed = true;
        } catch (e) {
          subErr = e;
        }
      }
      if (!subscribed) {
        if (subErr) steps.push(`Cuenta ${st.waba_id || '(vacía)'}: ${subErr.message}`);
        if (rep.error) steps.push(rep.error);
        if (rep.scopes) steps.push(`Cuenta / permisos del token${rep.tokenType ? ' (' + rep.tokenType + ')' : ''}: ${rep.scopes.join(' · ') || 'ninguno'}`);
        for (const t of rep.tried) {
          steps.push(`Cuenta que ve el token: ${t.id}${t.name ? ' «' + t.name + '»' : ''} → ${t.error ? 'error: ' + t.error : t.phones.length ? 'números: ' + t.phones.join(', ') : 'sin números'}`);
        }
      }
    }
    if (!subscribed) {
      throw new HttpError(502, 'No se pudo suscribir la app a la cuenta de WhatsApp. Abajo está lo que revisó el CRM.');
    }
    steps.push('La app SUYON CRM quedó suscrita a la cuenta de WhatsApp');
    await db.prepare("UPDATE stores SET status = 'activo', connect_error = NULL, verified_name = ?, phone_display = COALESCE(?, phone_display), rev = rev + 1 WHERE id = ?")
      .bind(info.verified_name || null, info.display_phone_number || null, st.id).run();
    c.set('access', undefined);
    return c.json({ ok: true, steps, ...(await mePayload(c)) });
  } catch (e) {
    await db.prepare("UPDATE stores SET status = 'pendiente', connect_error = ? WHERE id = ?").bind(clip(e.message, 300), st.id).run();
    c.set('access', undefined);
    return c.json({ ok: false, steps, error: e.message, ...(await mePayload(c)) }, 200);
  }
});

// Conectar WhatsApp con un clic (Registro insertado de Meta)
api.get('/stores/:id/whatsapp/signup', async (c) => {
  await storeFor(c, c.req.param('id'), 'config');
  return c.json(await signupInfo(c.env, new URL(c.req.url).origin));
});

api.post('/stores/:id/whatsapp/signup', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  const b = await body(c);
  try {
    const r = await connectSignup(c.env, st, { code: b.code, phone_number_id: b.phone_number_id, waba_id: b.waba_id, coexistencia: !!b.coexistencia });
    c.set('access', undefined);
    return c.json({ ok: true, steps: r.steps, ...(await mePayload(c)) });
  } catch (e) {
    await c.env.DB.prepare('UPDATE stores SET connect_error = ? WHERE id = ?').bind(clip(e.message, 300), st.id).run();
    c.set('access', undefined);
    return c.json({ ok: false, steps: [], error: e.message, ...(await mePayload(c)) }, 200);
  }
});

api.post('/stores/:id/register', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  if (!st.phone_number_id) fail(400, 'Primero guarda el "Identificador del número de teléfono".');
  const pin = String((await body(c)).pin || '').trim();
  if (!/^\d{6}$/.test(pin)) fail(400, 'El PIN debe tener 6 números.');
  await registerNumber(c.env, st, pin);
  await bump(c.env, st.id);
  return c.json({ ok: true });
});

/* ---------------- Perfil de WhatsApp ---------------- */

function profileStore(st) {
  if (!st.phone_number_id || st.status !== 'activo') fail(409, 'Primero conecta este número a WhatsApp (Configuración → Número de WhatsApp).');
  return st;
}

api.get('/stores/:id/perfil', async (c) => {
  const st = profileStore(await storeFor(c, c.req.param('id'), 'config'));
  const p = await getProfile(c.env, st);
  return c.json({ profile: { about: p.about || '', description: p.description || '', address: p.address || '', email: p.email || '', websites: p.websites || [], vertical: p.vertical || 'UNDEFINED', photo: p.profile_picture_url || null }, verticals: VERTICALS, name: st.verified_name, phone: st.phone_display });
});

api.patch('/stores/:id/perfil', async (c) => {
  const st = profileStore(await storeFor(c, c.req.param('id'), 'config'));
  const b = await body(c);
  const out = {};
  const lim = { about: 139, description: 512, address: 256, email: 128 };
  for (const [k, n] of Object.entries(lim)) {
    if (!(k in b)) continue;
    const v = String(b[k] ?? '').trim();
    if (v.length > n) fail(400, `«${{ about: 'Info', description: 'Descripción', address: 'Dirección', email: 'Correo' }[k]}» puede tener hasta ${n} letras.`);
    if (k === 'about' && !v) fail(400, 'La «Info» no puede quedar vacía (es la frase corta debajo del nombre).');
    if (k === 'email' && v && !validEmail(v)) fail(400, 'Ese correo no es válido.');
    out[k] = v;
  }
  if ('websites' in b) {
    const w = (Array.isArray(b.websites) ? b.websites : []).map((x) => String(x || '').trim()).filter(Boolean).slice(0, 2);
    for (const u of w) if (!/^https?:\/\/[^\s]+\.[^\s]+$/i.test(u) || u.length > 256) fail(400, `«${u}» no es un enlace válido. Debe empezar con https://`);
    out.websites = w;
  }
  if ('vertical' in b) {
    if (!VERTICALS[b.vertical]) fail(400, 'Elige una categoría de la lista.');
    out.vertical = b.vertical;
  }
  if (Object.keys(out).length) await setProfile(c.env, st, out);
  return c.json({ ok: true });
});

api.post('/stores/:id/perfil/foto', async (c) => {
  const st = profileStore(await storeFor(c, c.req.param('id'), 'config'));
  const form = await c.req.formData();
  const f = form.get('file');
  if (!f || typeof f === 'string') fail(400, 'Elige una foto.');
  if (!/^image\/(jpeg|png)$/.test(f.type)) fail(400, 'La foto debe ser JPG o PNG.');
  if (f.size > 5 * 1048576) fail(413, 'La foto pasa de 5 MB.');
  await setProfilePhoto(c.env, st, await f.arrayBuffer(), f.type);
  return c.json({ ok: true });
});

api.get('/stores/:id/health', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  const { results: log } = await c.env.DB.prepare(
    'SELECT received_at, kind, phone_number_id, detail FROM webhook_log WHERE phone_number_id = ? OR kind = ? ORDER BY id DESC LIMIT 15'
  ).bind(st.phone_number_id || '-', 'tienda_desconocida').all();
  const counts = await c.env.DB.prepare(
    "SELECT COUNT(*) AS chats, SUM(CASE WHEN last_inbound_at > ? THEN 1 ELSE 0 END) AS active FROM chats WHERE store_id = ?"
  ).bind(now() - H24, st.id).first();
  return c.json({
    webhook_url: `${new URL(c.req.url).origin}/webhook`,
    privacy_url: `${new URL(c.req.url).origin}/privacidad`,
    secrets: {
      [st.token_secret || 'WA_TOKEN']: !!c.env[st.token_secret || 'WA_TOKEN'],
      WA_VERIFY_TOKEN: !!c.env.WA_VERIFY_TOKEN,
      META_APP_SECRET: !!c.env.META_APP_SECRET,
      SETUP_CODE: !!c.env.SETUP_CODE,
    },
    media_ok: !!c.env.MEDIA,
    last_webhook_at: st.last_webhook_at,
    chats: counts.chats || 0,
    active_24h: counts.active || 0,
    log,
  });
});

/* ---------------- Etiquetas ---------------- */

api.get('/stores/:id/labels', async (c) => {
  const st = await storeFor(c, c.req.param('id'));
  const { results } = await c.env.DB.prepare(
    `SELECT l.id, l.name, l.color, l.auto, l.sort, (SELECT COUNT(*) FROM chat_labels cl WHERE cl.label_id = l.id) AS n
     FROM labels l WHERE l.store_id = ? ORDER BY l.sort, l.id`
  ).bind(st.id).all();
  return c.json({ labels: results });
});

function labelInput(b, partial) {
  const out = {};
  if (!partial || 'name' in b) {
    out.name = txt(b.name, 30);
    if (!out.name) fail(400, 'Escribe el nombre de la etiqueta.');
  }
  if ('color' in b) out.color = LABEL_COLORS.includes(b.color) ? b.color : '--t-grey';
  if ('sort' in b) out.sort = Number(b.sort) || 0;
  return out;
}

api.post('/stores/:id/labels', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  const l = labelInput(await body(c), false);
  const max = await c.env.DB.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM labels WHERE store_id = ?').bind(st.id).first();
  try {
    await c.env.DB.prepare('INSERT INTO labels (store_id, name, color, auto, sort, created_at) VALUES (?, ?, ?, 0, ?, ?)')
      .bind(st.id, l.name, l.color || '--t-grey', max.s, now()).run();
  } catch {
    fail(409, 'Ya existe una etiqueta con ese nombre.');
  }
  await bump(c.env, st.id);
  return c.json({ ok: true });
});

async function labelFor(c, labelId) {
  const l = await c.env.DB.prepare('SELECT * FROM labels WHERE id = ?').bind(Number(labelId)).first();
  if (!l) fail(404, 'Esa etiqueta no existe.');
  return l;
}

api.patch('/labels/:id', async (c) => {
  const l = await labelFor(c, c.req.param('id'));
  await storeFor(c, l.store_id, 'config');
  const b = labelInput(await body(c), true);
  if (l.auto && 'name' in b && b.name !== l.name) fail(400, 'Las etiquetas automáticas no se pueden renombrar: el bot las usa por su nombre.');
  const keys = Object.keys(b);
  if (keys.length) {
    try {
      await c.env.DB.prepare(`UPDATE labels SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).bind(...keys.map((k) => b[k]), l.id).run();
    } catch {
      fail(409, 'Ya existe una etiqueta con ese nombre.');
    }
  }
  await bump(c.env, l.store_id);
  return c.json({ ok: true });
});

api.delete('/labels/:id', async (c) => {
  const l = await labelFor(c, c.req.param('id'));
  await storeFor(c, l.store_id, 'config');
  if (l.auto) fail(400, 'Las etiquetas automáticas no se pueden borrar: el bot las usa.');
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE chats SET updated_at = ? WHERE id IN (SELECT chat_id FROM chat_labels WHERE label_id = ?)').bind(now(), l.id),
    c.env.DB.prepare('DELETE FROM chat_labels WHERE label_id = ?').bind(l.id),
    c.env.DB.prepare('DELETE FROM labels WHERE id = ?').bind(l.id),
  ]);
  await bump(c.env, l.store_id);
  return c.json({ ok: true });
});

/* ---------------- Sincronización y chats ---------------- */

// Consulta liviana cada pocos segundos: si "rev" cambió, la app pide lo nuevo
api.get('/sync', async (c) => {
  const { stores } = await loadAccess(c);
  const chatStores = stores.filter((s) => s.role === 'dueno' || s.role === 'asesora');
  let unread = {};
  if (chatStores.length) {
    const { results } = await c.env.DB.prepare(
      `SELECT store_id, COUNT(*) AS n FROM chats WHERE unread > 0 AND sim = 0 AND store_id IN (${inList(chatStores.length)}) GROUP BY store_id`
    ).bind(...chatStores.map((s) => s.id)).all();
    unread = Object.fromEntries(results.map((r) => [r.store_id, r.n]));
  }
  const avisos = await pendingCounts(c.env.DB, chatStores.map((s) => s.id));
  return c.json({ t: now(), stores: stores.map((s) => ({ id: s.id, rev: s.rev, unread: unread[s.id] || 0, avisos: avisos[s.id] || 0, status: s.status })) });
});

async function attachLabels(db, chats) {
  if (!chats.length) return chats;
  const { results } = await db.prepare(`SELECT chat_id, label_id FROM chat_labels WHERE chat_id IN (${inList(chats.length)})`)
    .bind(...chats.map((x) => x.id)).all();
  const by = {};
  for (const r of results) (by[r.chat_id] ||= []).push(r.label_id);
  return chats.map((x) => ({ ...x, labels: by[x.id] || [] }));
}

const CHAT_COLS = `id, store_id, wa_id, name, profile_name, handler, unread, last_msg_at, last_preview, last_dir, last_inbound_at,
  ad_id, ad_headline, ad_source_url, referral_at, first_reply_at, notes, created_at, updated_at, bot_flow_id, bot_node, bot_wait, bot_paused, bot_vars`;

api.get('/stores/:id/chats', async (c) => {
  const st = await storeFor(c, c.req.param('id'));
  const q = c.req.query();
  const db = c.env.DB;
  const t = now();
  const limit = Math.min(Number(q.limit) || 60, 200);
  const where = ['store_id = ?', 'sim = 0'];
  const vals = [st.id];
  let order = 'COALESCE(last_msg_at, created_at) DESC';
  if (q.after) {
    where.push('updated_at > ?');
    vals.push(Number(q.after) - 3000);
    order = 'updated_at';
  } else {
    if (q.before) {
      where.push('COALESCE(last_msg_at, created_at) < ?');
      vals.push(Number(q.before));
    }
    if (q.q) {
      const like = `%${String(q.q).trim().replace(/[%_]/g, '')}%`;
      const digits = String(q.q).replace(/\D/g, '');
      where.push(digits.length >= 4 ? '(name LIKE ? OR profile_name LIKE ? OR wa_id LIKE ?)' : '(name LIKE ? OR profile_name LIKE ?)');
      vals.push(like, like);
      if (digits.length >= 4) vals.push(`%${digits}%`);
    }
    if (q.filter === 'unread') where.push('unread > 0');
    if (q.filter === 'pending') where.push("last_dir = 'in'");
    const lab = ids(String(q.labels || '').split(','));
    if (lab.length) {
      where.push(`id IN (SELECT chat_id FROM chat_labels WHERE label_id IN (${inList(lab.length)}) GROUP BY chat_id HAVING COUNT(*) = ?)`);
      vals.push(...lab, lab.length);
    }
  }
  const { results } = await db.prepare(`SELECT ${CHAT_COLS} FROM chats WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ?`)
    .bind(...vals, q.after ? 500 : limit).all();
  return c.json({ t, chats: await attachLabels(db, results), more: !q.after && results.length === limit });
});

api.get('/chats/:id', async (c) => {
  const { chat } = await chatFor(c, c.req.param('id'));
  const [x] = await attachLabels(c.env.DB, [chat]);
  delete x.referral_json;
  delete x.ctwa_clid;
  return c.json({ chat: x, referral: chat.referral_json ? JSON.parse(chat.referral_json) : null });
});

api.patch('/chats/:id', async (c) => {
  const { chat, store } = await chatFor(c, c.req.param('id'));
  const b = await body(c);
  const sets = [];
  const vals = [];
  if ('name' in b) {
    sets.push('name = ?');
    vals.push(txt(b.name, 60) || null);
  }
  if ('notes' in b) {
    sets.push('notes = ?');
    vals.push(txt(b.notes, 2000) || null);
  }
  if ('unread' in b) {
    sets.push('unread = ?');
    vals.push(b.unread ? Math.max(1, chat.unread) : 0);
  }
  if (!sets.length) return c.json({ ok: true });
  await c.env.DB.prepare(`UPDATE chats SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).bind(...vals, now(), chat.id).run();
  await bump(c.env, store.id);
  return c.json({ ok: true });
});

// Marca como leído y avisa a WhatsApp (doble check azul para la clienta)
api.post('/chats/:id/read', async (c) => {
  const { chat, store } = await chatFor(c, c.req.param('id'));
  if (chat.unread > 0) {
    await c.env.DB.prepare('UPDATE chats SET unread = 0, updated_at = ? WHERE id = ?').bind(now(), chat.id).run();
    await bump(c.env, store.id);
    if (store.read_receipts && store.status === 'activo') {
      const last = await c.env.DB.prepare(
        "SELECT wamid FROM messages WHERE chat_id = ? AND direction = 'in' AND wamid IS NOT NULL AND created_at > ? ORDER BY id DESC LIMIT 1"
      ).bind(chat.id, now() - 29 * 864e5).first();
      if (last) c.executionCtx.waitUntil(markRead(c.env, store, last.wamid).catch(() => {}));
    }
  }
  return c.json({ ok: true });
});

api.put('/chats/:id/labels/:labelId', async (c) => {
  const { chat, store } = await chatFor(c, c.req.param('id'));
  const u = await requireUser(c);
  const l = await c.env.DB.prepare('SELECT id FROM labels WHERE id = ? AND store_id = ?').bind(Number(c.req.param('labelId')), store.id).first();
  if (!l) fail(404, 'Esa etiqueta no es de esta tienda.');
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT OR IGNORE INTO chat_labels (chat_id, label_id, user_id, created_at) VALUES (?, ?, ?, ?)').bind(chat.id, l.id, u.id, now()),
    c.env.DB.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').bind(now(), chat.id),
  ]);
  await bump(c.env, store.id);
  return c.json({ ok: true });
});

api.delete('/chats/:id/labels/:labelId', async (c) => {
  const { chat, store } = await chatFor(c, c.req.param('id'));
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM chat_labels WHERE chat_id = ? AND label_id = ?').bind(chat.id, Number(c.req.param('labelId'))),
    c.env.DB.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').bind(now(), chat.id),
  ]);
  await bump(c.env, store.id);
  return c.json({ ok: true });
});

/* ---------------- Clientes ---------------- */

// Datos que guardó el bot (talla, colores, distrito…): la asesora los puede corregir o borrar
api.put('/chats/:id/datos', async (c) => {
  const { chat, store } = await chatFor(c, c.req.param('id'));
  const b = await body(c);
  if (!b.datos || typeof b.datos !== 'object' || Array.isArray(b.datos)) fail(400, 'Datos inválidos.');
  const out = {};
  for (const [k, v] of Object.entries(b.datos).slice(0, 40)) {
    const key = String(k).trim().toLowerCase().replace(/\s+/g, '_');
    if (!/^[\wáéíóúñ]{1,30}$/.test(key)) fail(400, `El nombre «${k}» no vale: usa letras, números y _.`);
    const val = clip(String(v ?? '').trim(), 200);
    if (val) out[key] = val;
  }
  await c.env.DB.prepare('UPDATE chats SET bot_vars = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(out), now(), chat.id).run();
  await bump(c.env, store.id);
  return c.json({ ok: true, datos: out });
});

async function deleteMedia(env, storeId, chatId) {
  const prefix = `s${storeId}/c${chatId}/`;
  let cursor;
  do {
    const l = await env.MEDIA.list({ prefix, cursor, limit: 1000 });
    if (l.objects.length) await env.MEDIA.delete(l.objects.map((o) => o.key));
    cursor = l.truncated ? l.cursor : undefined;
  } while (cursor);
}

// Vaciar conversación: borra mensajes y archivos, la clienta y sus datos se quedan (solo el dueño)
api.delete('/chats/:id/messages', async (c) => {
  const { chat, store } = await chatFor(c, c.req.param('id'), 'config');
  const db = c.env.DB;
  await db.batch([
    db.prepare('DELETE FROM messages WHERE chat_id = ?').bind(chat.id),
    db.prepare('UPDATE bot_jobs SET canceled_at = ? WHERE chat_id = ? AND done_at IS NULL AND canceled_at IS NULL').bind(now(), chat.id),
    db.prepare('UPDATE chats SET last_preview = NULL, unread = 0, bot_wait = 0, bot_node = NULL, updated_at = ? WHERE id = ?').bind(now(), chat.id),
  ]);
  c.executionCtx.waitUntil(deleteMedia(c.env, store.id, chat.id).catch((e) => console.error('r2', e)));
  await bump(c.env, store.id);
  return c.json({ ok: true });
});

// Borrar clienta: conversación, etiquetas, datos, llamadas y seguimientos (solo el dueño)
api.delete('/chats/:id', async (c) => {
  const { chat, store } = await chatFor(c, c.req.param('id'), 'config');
  const db = c.env.DB;
  await db.batch([
    db.prepare('DELETE FROM bot_jobs WHERE chat_id = ?').bind(chat.id),
    db.prepare('DELETE FROM calls WHERE chat_id = ?').bind(chat.id),
    db.prepare('DELETE FROM chat_labels WHERE chat_id = ?').bind(chat.id),
    db.prepare('DELETE FROM messages WHERE chat_id = ?').bind(chat.id),
    db.prepare('UPDATE notifications SET chat_id = NULL WHERE chat_id = ?').bind(chat.id),
    db.prepare('UPDATE orders SET chat_id = NULL WHERE chat_id = ?').bind(chat.id),
    db.prepare('DELETE FROM chats WHERE id = ?').bind(chat.id),
  ]);
  c.executionCtx.waitUntil(deleteMedia(c.env, store.id, chat.id).catch((e) => console.error('r2', e)));
  await bump(c.env, store.id);
  return c.json({ ok: true, deleted: chat.id });
});

// Compras de cada clienta (pedidos que no se cayeron)
const BUENOS = "o.chat_id = c.id AND o.status NOT IN ('cancelado','rechazado','no_recogido')";
const COMPRAS = `(SELECT COUNT(*) FROM orders o WHERE ${BUENOS})`;
const GASTADO = `(SELECT COALESCE(SUM(o.total), 0) FROM orders o WHERE ${BUENOS})`;
const ULTIMA = `(SELECT MAX(o.created_at) FROM orders o WHERE ${BUENOS})`;
const REACTIVAR_DIAS = 60;
// Segmentos: Nueva (no compró) · Compró 1 vez · Frecuente (2-3) · VIP (4+ o S/500+) · Para reactivar (compró y no vuelve hace 60+ días)
function segWhere(seg, cutoff) {
  switch (seg) {
    case 'nueva': return [`${COMPRAS} = 0`, []];
    case 'una': return [`${COMPRAS} = 1 AND ${ULTIMA} >= ?`, [cutoff]];
    case 'frecuente': return [`${COMPRAS} BETWEEN 2 AND 3 AND ${GASTADO} < 500 AND ${ULTIMA} >= ?`, [cutoff]];
    case 'vip': return [`(${COMPRAS} >= 4 OR ${GASTADO} >= 500) AND ${ULTIMA} >= ?`, [cutoff]];
    case 'reactivar': return [`${COMPRAS} >= 1 AND ${ULTIMA} < ?`, [cutoff]];
  }
  return null;
}

async function clientesKpis(db, storeId, cutoff) {
  const k = await db.prepare(
    `SELECT COUNT(*) AS total, COALESCE(SUM(n >= 1), 0) AS compraron, COALESCE(SUM(n >= 2), 0) AS recompra,
       COALESCE(SUM(n = 0), 0) AS nueva, COALESCE(SUM(n = 1 AND u >= ?1), 0) AS una, COALESCE(SUM(n BETWEEN 2 AND 3 AND g < 500 AND u >= ?1), 0) AS frecuente,
       COALESCE(SUM((n >= 4 OR g >= 500) AND u >= ?1), 0) AS vip, COALESCE(SUM(n >= 1 AND u < ?1), 0) AS reactivar
     FROM (SELECT ${COMPRAS} AS n, ${GASTADO} AS g, ${ULTIMA} AS u FROM chats c WHERE c.store_id = ?2 AND c.sim = 0)`
  ).bind(cutoff, storeId).first();
  const t = await db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS s FROM orders WHERE store_id = ? AND status NOT IN ('cancelado','rechazado','no_recogido')").bind(storeId).first();
  return { ...k, pedidos: t.n, ventas: t.s, ticket: t.n ? Math.round((t.s / t.n) * 100) / 100 : 0, reactivar_dias: REACTIVAR_DIAS };
}

// Lista de clientas con totales (para la sección Clientes)
api.get('/stores/:id/clientes', async (c) => {
  const st = await storeFor(c, c.req.param('id'));
  const q = c.req.query();
  const db = c.env.DB;
  const where = ['c.store_id = ?', 'c.sim = 0'];
  const vals = [st.id];
  if (q.q) {
    const like = `%${String(q.q).trim().replace(/[%_]/g, '')}%`;
    const digits = String(q.q).replace(/\D/g, '');
    where.push(digits.length >= 4 ? '(c.name LIKE ? OR c.profile_name LIKE ? OR c.bot_vars LIKE ? OR c.wa_id LIKE ?)' : '(c.name LIKE ? OR c.profile_name LIKE ? OR c.bot_vars LIKE ?)');
    vals.push(like, like, like);
    if (digits.length >= 4) vals.push(`%${digits}%`);
  }
  const lab = ids(String(q.labels || '').split(','));
  if (lab.length) {
    where.push(`c.id IN (SELECT chat_id FROM chat_labels WHERE label_id IN (${inList(lab.length)}) GROUP BY chat_id HAVING COUNT(*) = ?)`);
    vals.push(...lab, lab.length);
  }
  if (q.origen === 'anuncio') where.push('c.ad_id IS NOT NULL');
  if (q.origen === 'directo') where.push('c.ad_id IS NULL');
  const cutoff = now() - REACTIVAR_DIAS * 864e5;
  const sw = segWhere(q.seg, cutoff);
  if (sw) {
    where.push(sw[0]);
    vals.push(...sw[1]);
  }
  const limit = Math.min(Number(q.limit) || 50, 200);
  const offset = Math.max(Number(q.offset) || 0, 0);
  const w = where.join(' AND ');
  const total = (await db.prepare(`SELECT COUNT(*) AS n FROM chats c WHERE ${w}`).bind(...vals).first()).n;
  const { results } = await db.prepare(
    `SELECT c.id, c.wa_id, c.name, c.profile_name, c.ad_id, c.ad_headline, c.created_at, c.last_msg_at, c.last_inbound_at, c.notes,
       c.bot_vars, c.bot_paused, c.bot_flow_id, c.handler,
       (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.id) AS msgs,
       ${COMPRAS} AS compras, ${GASTADO} AS gastado, ${ULTIMA} AS ultima_compra
     FROM chats c WHERE ${w} ORDER BY ${q.seg && q.seg !== 'nueva' ? `${GASTADO} DESC,` : ''} COALESCE(c.last_msg_at, c.created_at) DESC LIMIT ? OFFSET ?`
  ).bind(...vals, limit, offset).all();
  const kpis = offset ? null : await clientesKpis(db, st.id, cutoff);
  return c.json({ total, clientes: await attachLabels(db, results), offset, limit, kpis });
});

// Descargar clientas en Excel (CSV) — solo el dueño
api.get('/stores/:id/clientes.csv', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  const db = c.env.DB;
  const { results } = await db.prepare(
    `SELECT c.id, c.wa_id, c.name, c.profile_name, c.ad_id, c.created_at, c.last_msg_at, c.notes, c.bot_vars,
       ${COMPRAS} AS compras, ${GASTADO} AS gastado, ${ULTIMA} AS ultima_compra,
       (SELECT GROUP_CONCAT(l.name, ' | ') FROM chat_labels cl JOIN labels l ON l.id = cl.label_id WHERE cl.chat_id = c.id) AS etiquetas
     FROM chats c WHERE c.store_id = ? AND c.sim = 0 ORDER BY c.created_at DESC LIMIT 20000`
  ).bind(st.id).all();
  const keys = ['talla', 'colores', 'cantidad', 'destino', 'distrito', 'nombre', 'celular', 'dni', 'direccion', 'sede_shalom'];
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = "'" + s; // que Excel no lo tome como fórmula
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const day = (t) => (t ? localDay(t, st.timezone) : '');
  const rows = [['Nombre', 'Nombre en WhatsApp', 'Celular', 'Etiquetas', 'Compras', 'Total comprado', 'Última compra', ...keys, 'Anuncio', 'Primer mensaje', 'Último mensaje', 'Notas'].join(',')];
  for (const r of results) {
    const v = JSON.parse(r.bot_vars || '{}');
    rows.push([r.name, r.profile_name, '+' + r.wa_id, r.etiquetas, r.compras, r.gastado, day(r.ultima_compra), ...keys.map((k) => v[k]), r.ad_id, day(r.created_at), day(r.last_msg_at), r.notes].map(cell).join(','));
  }
  return new Response('﻿' + rows.join('\r\n'), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="clientes-${st.id}-${localDay(now(), st.timezone)}.csv"` },
  });
});

/* ---------------- Mensajes ---------------- */

const MSG_COLS = `m.id, m.wamid, m.direction, m.sender, m.user_id, u.name AS user_name, m.type, m.body, m.media_mime, m.media_name, m.media_size,
  m.media_status, m.status, m.error, m.context_wamid, m.extra, m.transcript, m.created_at, m.updated_at`;

function shapeMsg(m) {
  const x = { ...m, extra: m.extra ? JSON.parse(m.extra) : null };
  if (x.extra?.referral) {
    const r = x.extra.referral;
    x.extra.referral = { headline: r.headline, body: r.body, source_id: r.source_id, source_type: r.source_type, source_url: r.source_url, media_type: r.media_type };
  }
  return x;
}

api.get('/chats/:id/messages', async (c) => {
  const { chat } = await chatFor(c, c.req.param('id'));
  const q = c.req.query();
  const t = now();
  const db = c.env.DB;
  let rows;
  if (q.after) {
    ({ results: rows } = await db.prepare(
      `SELECT ${MSG_COLS} FROM messages m LEFT JOIN users u ON u.id = m.user_id WHERE m.chat_id = ? AND m.updated_at > ? ORDER BY m.id LIMIT 300`
    ).bind(chat.id, Number(q.after) - 3000).all());
  } else {
    const limit = Math.min(Number(q.limit) || 60, 200);
    const before = Number(q.before) || Number.MAX_SAFE_INTEGER;
    ({ results: rows } = await db.prepare(
      `SELECT ${MSG_COLS} FROM messages m LEFT JOIN users u ON u.id = m.user_id WHERE m.chat_id = ? AND m.id < ? ORDER BY m.id DESC LIMIT ?`
    ).bind(chat.id, before, limit).all());
    rows.reverse();
    return c.json({ t, messages: rows.map(shapeMsg), more: rows.length === limit });
  }
  return c.json({ t, messages: rows.map(shapeMsg) });
});

async function afterSend(env, store, chat, type, bodyText) {
  const t = now();
  await env.DB.prepare(
    `UPDATE chats SET last_msg_at = ?, last_preview = ?, last_dir = 'out', unread = 0, updated_at = ?,
       first_reply_at = CASE WHEN referral_at IS NOT NULL AND first_reply_at IS NULL THEN ? ELSE first_reply_at END WHERE id = ?`
  ).bind(t, preview(type, bodyText), t, t, chat.id).run();
  await bump(env, store.id);
}

async function deliver(env, store, chat, msg) {
  try {
    let wamid;
    if (msg.type === 'text') {
      wamid = await sendText(env, store, chat.wa_id, msg.body, msg.context_wamid);
    } else {
      const obj = await env.MEDIA.get(msg.media_key);
      if (!obj) throw new HttpError(500, 'No se encontró el archivo para enviar.');
      const mediaId = await uploadMedia(env, store, await obj.arrayBuffer(), msg.media_mime, msg.media_name);
      wamid = await sendMediaById(env, store, chat.wa_id, msg.type, mediaId, { caption: msg.body, filename: msg.media_name, replyTo: msg.context_wamid });
    }
    await env.DB.prepare("UPDATE messages SET wamid = ?, status = 'sent', error = NULL, updated_at = ? WHERE id = ?").bind(wamid, now(), msg.id).run();
  } catch (e) {
    await env.DB.prepare("UPDATE messages SET status = 'failed', error = ?, updated_at = ? WHERE id = ?").bind(clip(e.message, 300), now(), msg.id).run();
  }
  await afterSend(env, store, chat, msg.type, msg.body);
  const row = await env.DB.prepare(`SELECT ${MSG_COLS} FROM messages m LEFT JOIN users u ON u.id = m.user_id WHERE m.id = ?`).bind(msg.id).first();
  return shapeMsg(row);
}

function checkCanSend(store, chat) {
  if (store.status !== 'activo') fail(409, 'Este número todavía no está conectado. El dueño debe conectarlo en Configuración → Número.');
  if (!windowOpen(chat)) fail(409, 'Pasaron más de 24 h desde el último mensaje de la clienta. Solo se puede enviar una plantilla aprobada (llega en una próxima fase).');
}

api.post('/chats/:id/messages', async (c) => {
  const { chat, store } = await chatFor(c, c.req.param('id'));
  const u = await requireUser(c);
  const b = await body(c);
  const text = String(b.text || '').trim();
  if (!text) fail(400, 'Escribe un mensaje.');
  if (text.length > 4096) fail(400, 'El mensaje es muy largo (máximo 4,096 letras).');
  checkCanSend(store, chat);
  await pauseForHuman(c.env, chat);
  const reply = b.reply_to ? await c.env.DB.prepare('SELECT wamid FROM messages WHERE id = ? AND chat_id = ?').bind(Number(b.reply_to), chat.id).first() : null;
  const t = now();
  const r = await c.env.DB.prepare(
    `INSERT INTO messages (chat_id, store_id, direction, sender, user_id, type, body, status, context_wamid, created_at, updated_at)
     VALUES (?, ?, 'out', 'ase', ?, 'text', ?, 'sending', ?, ?, ?)`
  ).bind(chat.id, store.id, u.id, text, reply?.wamid || null, t, t).run();
  const msg = { id: r.meta.last_row_id, type: 'text', body: text, context_wamid: reply?.wamid || null };
  return c.json({ message: await deliver(c.env, store, chat, msg) });
});

function normalizeMime(mime, filename) {
  let m = String(mime || '').split(';')[0].trim().toLowerCase();
  const ext = String(filename || '').split('.').pop().toLowerCase();
  if (!m || m === 'application/octet-stream') {
    m = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', opus: 'audio/ogg', aac: 'audio/aac', amr: 'audio/amr', pdf: 'application/pdf' }[ext] || 'application/octet-stream';
  }
  if (m === 'audio/x-m4a' || m === 'audio/m4a') m = 'audio/mp4';
  if (m === 'audio/mp3') m = 'audio/mpeg';
  if (m === 'audio/opus') m = 'audio/ogg';
  return m;
}

api.post('/chats/:id/media', async (c) => {
  const { chat, store } = await chatFor(c, c.req.param('id'));
  const u = await requireUser(c);
  checkCanSend(store, chat);
  await pauseForHuman(c.env, chat);
  const form = await c.req.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') fail(400, 'No llegó el archivo.');
  const caption = String(form.get('caption') || '').trim().slice(0, 1024);
  const filename = clip(file.name || 'archivo', 120);
  const mime = normalizeMime(file.type, filename);
  let kind = form.get('as') === 'document' ? 'document' : kindForMime(mime);
  const rule = SEND_RULES[kind];
  if (file.size > rule.max) {
    const mb = Math.round(rule.max / 1048576);
    if (kind !== 'document' && file.size <= SEND_RULES.document.max) fail(413, `Pasa de ${mb} MB. Envíalo como documento.`, { can_document: true });
    fail(413, `El archivo pasa de ${mb} MB.`);
  }
  const t = now();
  const r = await c.env.DB.prepare(
    `INSERT INTO messages (chat_id, store_id, direction, sender, user_id, type, body, media_mime, media_name, media_size, media_status, status, created_at, updated_at)
     VALUES (?, ?, 'out', 'ase', ?, ?, ?, ?, ?, ?, 'ok', 'sending', ?, ?)`
  ).bind(chat.id, store.id, u.id, kind, caption || null, mime, filename, file.size, t, t).run();
  const id = r.meta.last_row_id;
  const key = mediaKey(store.id, chat.id, id);
  await c.env.MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: mime } });
  await c.env.DB.prepare('UPDATE messages SET media_key = ? WHERE id = ?').bind(key, id).run();
  const msg = { id, type: kind, body: caption || null, media_key: key, media_mime: mime, media_name: filename };
  return c.json({ message: await deliver(c.env, store, chat, msg) });
});

api.post('/messages/:id/retry', async (c) => {
  const m = await c.env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(Number(c.req.param('id'))).first();
  if (!m) fail(404, 'Ese mensaje no existe.');
  const { chat, store } = await chatFor(c, m.chat_id);
  if (m.direction !== 'out' || m.status !== 'failed') fail(400, 'Solo se reintentan mensajes que fallaron.');
  checkCanSend(store, chat);
  await c.env.DB.prepare("UPDATE messages SET status = 'sending', error = NULL, updated_at = ? WHERE id = ?").bind(now(), m.id).run();
  return c.json({ message: await deliver(c.env, store, chat, m) });
});

// Sirve fotos, audios y videos (con soporte de "Range" para que el video se pueda adelantar)
api.get('/media/:id', async (c) => {
  const m = await c.env.DB.prepare('SELECT id, chat_id, media_id, media_key, media_mime, media_name FROM messages WHERE id = ?').bind(Number(c.req.param('id'))).first();
  if (!m) fail(404, 'No existe.');
  const { store } = await chatFor(c, m.chat_id);
  let key = m.media_key;
  if (!key) {
    if (!m.media_id) fail(404, 'Este mensaje no tiene archivo.');
    try {
      key = await fetchMediaToR2(c.env, store, m);
    } catch (e) {
      fail(502, 'No se pudo bajar el archivo de WhatsApp: ' + e.message);
    }
  }
  const range = c.req.header('range');
  const obj = await c.env.MEDIA.get(key, range ? { range: c.req.raw.headers } : undefined);
  if (!obj) fail(404, 'El archivo ya no está guardado.');
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('Content-Type', m.media_mime || headers.get('Content-Type') || 'application/octet-stream');
  headers.set('Cache-Control', 'private, max-age=31536000, immutable');
  headers.set('Accept-Ranges', 'bytes');
  headers.set('ETag', obj.httpEtag);
  if (m.media_name) headers.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(m.media_name)}`);
  if (range && obj.range) {
    const off = obj.range.offset ?? 0;
    const len = obj.range.length ?? obj.size - off;
    headers.set('Content-Range', `bytes ${off}-${off + len - 1}/${obj.size}`);
    headers.set('Content-Length', String(len));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set('Content-Length', String(obj.size));
  return new Response(obj.body, { headers });
});

api.route('/', botApi);
api.route('/', reportesApi);
api.route('/', pedidosApi);

export default api;
