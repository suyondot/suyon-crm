// Correos de Control Total (código de verificación al registrarse y enlace para cambiar la contraseña).
// Usa Resend: secreto RESEND_API_KEY + variable MAIL_FROM (ej. «Control Total <hola@tudominio.pe>», dominio verificado).
// Mientras no esté configurado, no se manda nada y el registro entra directo (como hasta ahora).
import { now, randomToken, sha256hex, fail } from './util.js';

export const mailReady = (env) => !!(env.RESEND_API_KEY && env.MAIL_FROM);

export async function sendMail(env, { to, subject, html, text }) {
  if (!mailReady(env)) throw new Error('El correo no está configurado.');
  const res = await fetch((env.RESEND_API || 'https://api.resend.com') + '/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, html, text, ...(env.CONTACT_EMAIL ? { reply_to: env.CONTACT_EMAIL } : {}) }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d?.message || `No se pudo enviar el correo (${res.status}).`);
  }
}

const wrap = (title, body) => `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f1a1d">
  <h2 style="color:#7A1F35;margin:0 0 12px">Control Total</h2><h3 style="margin:0 0 12px">${title}</h3>${body}
  <p style="color:#888;font-size:12px;margin-top:24px">Si no fuiste tú, ignora este correo.</p></div>`;

// Código de 6 números para confirmar el correo (vale 30 min)
export async function sendCode(env, user) {
  if (user.email_code_at && now() - user.email_code_at < 60e3) fail(429, 'Espera un minuto para pedir otro código.');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await env.DB.prepare('UPDATE users SET email_code = ?, email_code_at = ?, email_tries = 0 WHERE id = ?').bind(await sha256hex(`${user.id}:${code}`), now(), user.id).run();
  await sendMail(env, {
    to: user.email,
    subject: `Tu código de Control Total: ${code}`,
    html: wrap('Confirma tu correo', `<p>Hola ${user.name || ''}, este es tu código:</p><p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:8px 0">${code}</p><p>Escríbelo en Control Total. Vale 30 minutos.</p>`),
    text: `Tu código de Control Total es ${code}. Vale 30 minutos.`,
  });
}

export async function checkCode(env, userId, code) {
  const u = await env.DB.prepare('SELECT id, email_code, email_code_at, email_tries FROM users WHERE id = ?').bind(userId).first();
  if (!u?.email_code) fail(400, 'Pide un código nuevo.');
  if (u.email_tries >= 5) fail(429, 'Muchos intentos. Pide un código nuevo.');
  if (now() - u.email_code_at > 30 * 60e3) fail(400, 'El código venció. Pide uno nuevo.');
  if ((await sha256hex(`${u.id}:${String(code || '').replace(/\D/g, '')}`)) !== u.email_code) {
    await env.DB.prepare('UPDATE users SET email_tries = email_tries + 1 WHERE id = ?').bind(u.id).run();
    fail(400, 'Ese código no es. Revisa el correo e intenta otra vez.');
  }
  await env.DB.prepare('UPDATE users SET email_ok = 1, email_code = NULL, email_tries = 0 WHERE id = ?').bind(u.id).run();
}

// «Olvidé mi contraseña»: enlace por correo (vale 2 horas). Responde igual aunque el correo no exista.
export async function sendReset(env, origin, email) {
  const u = await env.DB.prepare('SELECT id, name, email FROM users WHERE email = ?').bind(String(email || '').trim().toLowerCase()).first();
  if (!u) return;
  const last = await env.DB.prepare('SELECT MAX(expires_at) AS e FROM password_resets WHERE user_id = ?').bind(u.id).first();
  if (last?.e && last.e - 2 * 3600e3 > now() - 60e3) return; // uno por minuto
  const token = randomToken(24);
  await env.DB.prepare('INSERT INTO password_resets (token_hash, user_id, created_by, expires_at) VALUES (?, ?, ?, ?)').bind(await sha256hex(token), u.id, u.id, now() + 2 * 3600e3).run();
  const link = `${origin}/clave/${token}`;
  await sendMail(env, {
    to: u.email,
    subject: 'Cambia tu contraseña de Control Total',
    html: wrap('Pon una contraseña nueva', `<p>Hola ${u.name || ''}, toca el botón para poner una contraseña nueva. Vale 2 horas.</p><p><a href="${link}" style="display:inline-block;background:#7A1F35;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700">Cambiar mi contraseña</a></p><p style="font-size:12px;color:#666">O copia este enlace: ${link}</p>`),
    text: `Para cambiar tu contraseña de Control Total abre: ${link} (vale 2 horas).`,
  });
}
