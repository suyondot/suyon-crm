// Control Total — punto de entrada del Worker
import { Hono } from 'hono';
import { ensureSchema } from './migrations.js';
import { HttpError, safeEqual, now } from './util.js';
import api from './api.js';
import { verifySignature, processWebhook, logWebhook } from './webhook.js';
import { privacyPage, deletionPage, termsPage, plansPage } from './pages.js';
import { landingPage } from './landing.js';
import { loadLanding, serveLandingMedia } from './landing-data.js';
import { loadPlan } from './billing.js';
import { currentUser } from './auth.js';
import { runJobs } from './bot.js';
import { runOrderJobs } from './automations.js';
import { handleShopify } from './shopify.js';

const app = new Hono();

app.use('*', async (c, next) => {
  const p = new URL(c.req.url).pathname;
  if (p.startsWith('/api/') || p === '/webhook' || p.startsWith('/shopify/')) await ensureSchema(c.env.DB);
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

// Solo para pruebas locales: corre el cron del bot al instante
app.post('/__test/jobs', async (c) => {
  if (!c.env.TEST_MODE) return c.text('No existe', 404);
  await ensureSchema(c.env.DB);
  if (c.req.query('shift')) {
    await c.env.DB.prepare('UPDATE bot_jobs SET run_at = run_at - ? WHERE done_at IS NULL').bind(Number(c.req.query('shift'))).run();
    await c.env.DB.prepare('UPDATE order_jobs SET run_at = run_at - ? WHERE done_at IS NULL').bind(Number(c.req.query('shift'))).run();
  }
  await runJobs(c.env);
  await runOrderJobs(c.env);
  return c.json({ ok: true });
});

/* ---------- Shopify (pedidos y carritos) ---------- */
app.post('/shopify/:storeId/:key', handleShopify);

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
app.get('/planes', async (c) => c.html(plansPage(c.env, await loadPlan(c.env))));
app.get('/inicio', async (c) => {
  const logged = !!(await currentUser(c).catch(() => null));
  return c.html(landingPage(c.env, await loadPlan(c.env), { logged, extra: await loadLanding(c.env) }));
});
app.get('/inicio/media/:name', (c) => serveLandingMedia(c));

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message, ...(err.extra || {}) }, err.status);
  console.error(err);
  return c.json({ error: 'Algo falló en el servidor. Intenta de nuevo.' }, 500);
});

app.notFound((c) => (c.req.path.startsWith('/api/') ? c.json({ error: 'No existe.' }, 404) : c.env.ASSETS.fetch(c.req.raw)));

export default {
  fetch: app.fetch,
  // Cada minuto: seguimientos y esperas del bot. Una vez al día: limpieza.
  async scheduled(event, env) {
    await ensureSchema(env.DB);
    if (event.cron !== '0 8 * * *') {
      await runJobs(env);
      await runOrderJobs(env);
      return;
    }
    const t = now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(t),
      env.DB.prepare('DELETE FROM invites WHERE expires_at < ? AND used_at IS NULL').bind(t - 30 * 864e5),
      env.DB.prepare('DELETE FROM password_resets WHERE expires_at < ?').bind(t - 864e5),
      env.DB.prepare('DELETE FROM webhook_log WHERE received_at < ?').bind(t - 14 * 864e5),
      env.DB.prepare('DELETE FROM notifications WHERE created_at < ? AND read_at IS NOT NULL').bind(t - 60 * 864e5),
    ]);
  },
};
