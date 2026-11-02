// Suyon CRM — punto de entrada del Worker
import { Hono } from 'hono';
import { ensureSchema } from './migrations.js';
import { HttpError, safeEqual, now } from './util.js';
import api from './api.js';
import { verifySignature, processWebhook, logWebhook } from './webhook.js';
import { privacyPage, deletionPage, termsPage } from './pages.js';

const app = new Hono();

app.use('*', async (c, next) => {
  const p = new URL(c.req.url).pathname;
  if (p.startsWith('/api/') || p === '/webhook') await ensureSchema(c.env.DB);
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'same-origin');
});

// Protección contra pedidos de otras páginas: la app manda siempre este encabezado
app.use('/api/*', async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.req.header('x-crm') !== '1') {
    return c.json({ error: 'Pedido no permitido.' }, 403);
  }
  c.header('Cache-Control', 'no-store');
  await next();
});

app.route('/api', api);

/* ---------- Webhook de Meta ---------- */

// Meta verifica la URL una sola vez al configurarla
app.get('/webhook', (c) => {
  const q = c.req.query();
  if (q['hub.mode'] === 'subscribe' && c.env.WA_VERIFY_TOKEN && safeEqual(q['hub.verify_token'], c.env.WA_VERIFY_TOKEN)) {
    return c.text(q['hub.challenge'] || '');
  }
  return c.text('Token de verificación incorrecto', 403);
});

app.post('/webhook', async (c) => {
  const raw = await c.req.arrayBuffer();
  const sig = await verifySignature(c.env, raw, c.req.header('x-hub-signature-256'));
  if (!sig.ok) {
    await logWebhook(c.env, 'firma_rechazada', null, sig.reason);
    return c.text('Firma inválida', 401);
  }
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return c.text('JSON inválido', 400);
  }
  try {
    await processWebhook(c.env, payload, c.executionCtx);
  } catch (e) {
    console.error('webhook', e);
    await logWebhook(c.env, 'error_interno', null, e.message);
    return c.text('Error', 500); // Meta lo reintentará
  }
  return c.text('OK');
});

/* ---------- Páginas públicas para Meta ---------- */

app.get('/privacidad', (c) => c.html(privacyPage(c.env)));
app.get('/eliminar-datos', (c) => c.html(deletionPage(c.env)));
app.get('/terminos', (c) => c.html(termsPage(c.env)));

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message, ...(err.extra || {}) }, err.status);
  console.error(err);
  return c.json({ error: 'Algo falló en el servidor. Intenta de nuevo.' }, 500);
});

app.notFound((c) => (c.req.path.startsWith('/api/') ? c.json({ error: 'No existe.' }, 404) : c.env.ASSETS.fetch(c.req.raw)));

export default {
  fetch: app.fetch,
  // Limpieza diaria
  async scheduled(event, env) {
    await ensureSchema(env.DB);
    const t = now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(t),
      env.DB.prepare('DELETE FROM invites WHERE expires_at < ? AND used_at IS NULL').bind(t - 30 * 864e5),
      env.DB.prepare('DELETE FROM password_resets WHERE expires_at < ?').bind(t - 864e5),
      env.DB.prepare('DELETE FROM webhook_log WHERE received_at < ?').bind(t - 14 * 864e5),
    ]);
  },
};
