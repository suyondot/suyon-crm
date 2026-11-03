// Prueba de punta a punta con un WhatsApp simulado.
// Uso: npm test   (levanta wrangler dev con una base de datos temporal y un "Meta" falso)
import { spawn } from 'node:child_process';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const PORT = 8790;
const META_PORT = 9998;
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = 'appsecret-test';
const PHONE_ID = '111222333444555';
const WABA_ID = '999888777666';

/* ---------- Meta falso ---------- */
const calls = [];
const iaCalls = [];
let seq = 0;
const IMG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');
const meta = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  const raw = Buffer.concat(chunks);
  const url = new URL(req.url, 'http://x');
  const p = url.pathname.replace(/^\//, '');
  const auth = req.headers.authorization;
  const json = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  let body = null;
  if ((req.headers['content-type'] || '').includes('json')) body = JSON.parse(raw.toString());
  calls.push({ method: req.method, path: p, body, ctype: req.headers['content-type'], size: raw.length });
  if (p === 'v1/messages') {
    // IA falsa (Anthropic): responde según lo que escribió la clienta
    iaCalls.push(body);
    if (req.headers['x-api-key'] !== 'ia-test-key') return json(401, { error: { message: 'bad key' } });
    const last = body.messages[body.messages.length - 1];
    const txt = typeof last.content === 'string' ? last.content : last.content.map((x) => x.text || '').join(' ');
    if (/falla/i.test(txt)) return json(500, { error: { message: 'overloaded' } });
    const all = body.messages.map((m) => (typeof m.content === 'string' ? m.content : m.content.map((x) => x.text || '').join(' '))).join('\n');
    if (/siempre raro/i.test(all)) return json(200, { content: [{ type: 'text', text: 'Claro amiga, te paso: {"mensajes": [roto' }], usage: { input_tokens: 10, output_tokens: 10 } });
    if (/rarito/i.test(txt)) return json(200, { content: [{ type: 'text', text: '¡Hola! Te cuento los precios 😊' }], usage: { input_tokens: 10, output_tokens: 10 } });
    if (/cuenta bcp/i.test(txt)) return json(200, { content: [{ type: 'text', text: JSON.stringify({ mensajes: [{ texto: 'Cuenta BCP: [FALTA BCP]' }], caso: null, datos: {} }) }], usage: { input_tokens: 10, output_tokens: 10 } });
    const out = /yape/i.test(txt)
      ? { mensajes: [{ texto: '¡Perfecto! 📦 Sede: Av. Brasil. Mi compañera valida tu pago 💕', archivo: null }], caso: 'yape_sede', datos: { sede_shalom: 'Av. Brasil' } }
      : { mensajes: [{ texto: '¡Lindo! 😍 1 pantalón Negro talla S: S/89', archivo: null }, { texto: '¿A qué ciudad o distrito te lo enviamos? 😊', archivo: 'tabla-tallas' }], caso: null, datos: { colores: 'Negro', cantidad: '1' } };
    return json(200, { content: [{ type: 'text', text: JSON.stringify(out) }], usage: { input_tokens: 5000, output_tokens: 120 } });
  }
  if (auth !== 'Bearer test-token') return json(401, { error: { code: 190, message: 'Invalid OAuth access token' } });
  if (p.startsWith('file/')) { res.writeHead(200, { 'content-type': 'image/jpeg' }); return res.end(IMG); }
  if (req.method === 'GET' && p === PHONE_ID) return json(200, { display_phone_number: '+51 924 000 111', verified_name: 'Porte Perú', quality_rating: 'GREEN', id: PHONE_ID });
  if (req.method === 'POST' && p === `${WABA_ID}/subscribed_apps`) return json(200, { success: true });
  if (req.method === 'POST' && p.endsWith('/subscribed_apps')) return json(400, { error: { code: 100, message: 'Unsupported post request. Object does not exist' } });
  if (req.method === 'GET' && p === 'debug_token') return json(200, { data: { granular_scopes: [{ scope: 'whatsapp_business_management', target_ids: ['555', WABA_ID] }] } });
  if (req.method === 'GET' && p === '555/phone_numbers') return json(200, { data: [{ id: '777' }] });
  if (req.method === 'GET' && p === `${WABA_ID}/phone_numbers`) return json(200, { data: [{ id: PHONE_ID }] });
  if (req.method === 'POST' && p === `${PHONE_ID}/register`) return json(200, { success: body?.pin === '123456' });
  if (req.method === 'POST' && p === `${PHONE_ID}/media`) return json(200, { id: 'up_media_' + ++seq });
  if (req.method === 'POST' && p === `${PHONE_ID}/messages`) {
    if (body.status === 'read') return json(200, { success: true });
    if (body.to === '51900000000') return json(400, { error: { code: 131047, message: 'Re-engagement message' } });
    return json(200, { messaging_product: 'whatsapp', messages: [{ id: 'wamid.OUT' + ++seq }] });
  }
  if (req.method === 'GET' && p.startsWith('MEDIA_')) return json(200, { url: `http://127.0.0.1:${META_PORT}/file/${p}`, mime_type: 'image/jpeg', file_size: IMG.length, id: p });
  json(404, { error: { code: 100, message: 'Unknown path ' + p } });
});

/* ---------- Ayudantes ---------- */
let cookie = '';
async function call(method, p, data, { raw, headers = {}, keepCookie = true, form } = {}) {
  const h = { 'x-crm': '1', ...headers };
  if (cookie && keepCookie) h.cookie = cookie;
  let b;
  if (form) b = form;
  else if (data !== undefined) { h['content-type'] = 'application/json'; b = JSON.stringify(data); }
  const res = await fetch(BASE + p, { method, headers: h, body: b, signal: AbortSignal.timeout(15000) });
  const sc = res.headers.get('set-cookie');
  if (sc && keepCookie) cookie = sc.split(';')[0];
  if (raw) return res;
  const j = await res.json().catch(() => ({}));
  return { status: res.status, ...j };
}
function sign(bodyStr, secret = SECRET) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(bodyStr).digest('hex');
}
async function hook(value, field = 'messages', secret) {
  const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: WABA_ID, changes: [{ field, value }] }] });
  const res = await fetch(BASE + '/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(payload, secret) }, body: payload });
  return res.status;
}
const md = (extra = {}) => ({ messaging_product: 'whatsapp', metadata: { display_phone_number: '51924000111', phone_number_id: PHONE_ID }, ...extra });
const ts = () => String(Math.floor(Date.now() / 1000));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
async function step(name, fn) {
  try { await fn(); passed++; console.log('  ✓', name); }
  catch (e) { console.log('  ✗', name); throw e; }
}

/* ---------- Arranque ---------- */
const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'scrm-'));
await new Promise((r) => meta.listen(META_PORT, '127.0.0.1', r));
const VARS = {
  GRAPH_API: `http://127.0.0.1:${META_PORT}`, ANTHROPIC_API: `http://127.0.0.1:${META_PORT}`, TEST_MODE: '1',
  WA_TOKEN: 'test-token', WA_VERIFY_TOKEN: 'verifica123', META_APP_SECRET: SECRET, SETUP_CODE: 'inicio-prueba', ANTHROPIC_API_KEY: 'ia-test-key',
};
const wd = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--persist-to', persist, ...Object.entries(VARS).flatMap(([k, v]) => ['--var', `${k}:${v}`]), '--show-interactive-dev-session=false'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
let log = '';
wd.stdout.on('data', (d) => (log += d));
wd.stderr.on('data', (d) => (log += d));
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(BASE + '/api/state')).ok) break; } catch {}
  await wait(500);
}

try {
  console.log('Cuenta y sesión');
  await step('pide configuración inicial', async () => {
    const s = await call('GET', '/api/state');
    assert.equal(s.setup, true);
  });
  await step('rechaza clave de inicio incorrecta', async () => {
    const r = await call('POST', '/api/setup', { code: 'mal', email: 'jordan@test.pe', password: '12345678', name: 'Jordan', company: 'Porte Perú' });
    assert.equal(r.status, 403);
  });
  await step('rechaza POST sin encabezado x-crm', async () => {
    const r = await fetch(BASE + '/api/setup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 403);
  });
  await step('crea dueño + empresa', async () => {
    const r = await call('POST', '/api/setup', { code: 'inicio-prueba', email: 'Jordan@Test.pe', password: 'clave-segura-1', name: 'Jordan', company: 'Porte Perú' });
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.equal(r.user.email, 'jordan@test.pe');
    assert.equal(r.companies[0].role, 'dueno');
  });
  await step('setup no se puede repetir', async () => {
    const r = await call('POST', '/api/setup', { code: 'inicio-prueba', email: 'x@test.pe', password: '12345678' }, { keepCookie: false });
    assert.equal(r.status, 409);
  });
  await step('logout y login', async () => {
    await call('POST', '/api/logout');
    cookie = '';
    assert.equal((await call('GET', '/api/me')).status, 401);
    assert.equal((await call('POST', '/api/login', { email: 'jordan@test.pe', password: 'mala' })).status, 401);
    const r = await call('POST', '/api/login', { email: 'JORDAN@test.pe', password: 'clave-segura-1' });
    assert.equal(r.status, 200);
  });

  console.log('Tiendas');
  let store, store2;
  await step('crea tienda con etiquetas por defecto', async () => {
    const me = await call('GET', '/api/me');
    const r = await call('POST', `/api/companies/${me.companies[0].id}/stores`, { name: 'Pantalón de rayas', color: '#2D5BA8', phone_number_id: PHONE_ID, waba_id: WABA_ID });
    assert.equal(r.status, 200, JSON.stringify(r));
    store = r.stores.find((s) => s.id === r.store_id);
    assert.equal(store.status, 'pendiente');
    const l = await call('GET', `/api/stores/${store.id}/labels`);
    assert.equal(l.labels.length, 12);
    const r2 = await call('POST', `/api/companies/${me.companies[0].id}/stores`, { name: 'Leggings cargo' });
    store2 = r2.stores.find((s) => s.id === r2.store_id);
  });
  await step('no deja repetir el mismo número', async () => {
    const me = await call('GET', '/api/me');
    const r = await call('POST', `/api/companies/${me.companies[0].id}/stores`, { name: 'Otra', phone_number_id: PHONE_ID });
    assert.equal(r.status, 409);
  });
  await step('no deja enviar si la tienda no está conectada', async () => {
    await hook(md({ contacts: [{ profile: { name: 'Antes' }, wa_id: '51922222222' }], messages: [{ from: '51922222222', id: 'wamid.PRE', timestamp: ts(), type: 'text', text: { body: 'hola' } }] }));
    const pre = (await call('GET', `/api/stores/${store.id}/chats`)).chats.find((c) => c.wa_id === '51922222222');
    const r = await call('POST', `/api/chats/${pre.id}/messages`, { text: 'hola' });
    assert.equal(r.status, 409);
    assert.match(r.error, /no está conectado/);
  });
  await step('no deja guardar dos identificadores iguales', async () => {
    const r = await call('PATCH', `/api/stores/${store.id}`, { phone_number_id: PHONE_ID, waba_id: PHONE_ID });
    assert.equal(r.status, 400);
  });
  await step('conecta con la cuenta equivocada: la encuentra sola', async () => {
    await call('PATCH', `/api/stores/${store.id}`, { phone_number_id: PHONE_ID, waba_id: '123456' });
    const r = await call('POST', `/api/stores/${store.id}/connect`);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.stores.find((x) => x.id === store.id).waba_id, WABA_ID);
  });
  await step('conecta el número (prueba token + suscribe la app)', async () => {
    const r = await call('POST', `/api/stores/${store.id}/connect`);
    assert.equal(r.ok, true, JSON.stringify(r));
    const s = r.stores.find((x) => x.id === store.id);
    assert.equal(s.status, 'activo');
    assert.equal(s.verified_name, 'Porte Perú');
    assert.ok(calls.some((c) => c.path === `${WABA_ID}/subscribed_apps`));
  });
  await step('activar número con PIN de 6 dígitos', async () => {
    assert.equal((await call('POST', `/api/stores/${store.id}/register`, { pin: '12' })).status, 400);
    const r = await call('POST', `/api/stores/${store.id}/register`, { pin: '123456' });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.ok(calls.some((c) => c.path === `${PHONE_ID}/register` && c.body?.messaging_product === 'whatsapp'));
  });
  await step('salud muestra URL del webhook y secretos', async () => {
    const h = await call('GET', `/api/stores/${store.id}/health`);
    assert.equal(h.webhook_url, `${BASE}/webhook`);
    assert.equal(h.secrets.WA_TOKEN, true);
    assert.equal(h.secrets.META_APP_SECRET, true);
  });

  console.log('Webhook');
  await step('verificación de Meta', async () => {
    const ok = await fetch(`${BASE}/webhook?hub.mode=subscribe&hub.verify_token=verifica123&hub.challenge=777`);
    assert.equal(await ok.text(), '777');
    const bad = await fetch(`${BASE}/webhook?hub.mode=subscribe&hub.verify_token=nop&hub.challenge=777`);
    assert.equal(bad.status, 403);
  });
  await step('rechaza firma falsa', async () => {
    assert.equal(await hook(md({ messages: [] }), 'messages', 'otro-secreto'), 401);
  });
  let chatId;
  await step('mensaje de texto desde anuncio crea el chat', async () => {
    const st = await hook(md({
      contacts: [{ profile: { name: 'María López' }, wa_id: '51987654321' }],
      messages: [{ from: '51987654321', id: 'wamid.IN1', timestamp: ts(), type: 'text', text: { body: 'Hola, quiero info del pantalón' },
        referral: { source_url: 'https://fb.me/x', source_id: '120210000000001', source_type: 'ad', headline: 'Pantalón formal stretch', body: 'Envío gratis', ctwa_clid: 'clid123' } }],
    }));
    assert.equal(st, 200);
    const r = await call('GET', `/api/stores/${store.id}/chats`);
    assert.equal(r.chats.length, 2);
    const c = r.chats.find((x) => x.wa_id === '51987654321');
    chatId = c.id;
    assert.equal(c.profile_name, 'María López');
    assert.equal(c.unread, 1);
    assert.equal(c.ad_id, '120210000000001');
    assert.equal(c.last_preview, 'Hola, quiero info del pantalón');
  });
  await step('Meta reenvía el mismo aviso: no se duplica', async () => {
    await hook(md({ contacts: [{ profile: { name: 'María López' }, wa_id: '51987654321' }],
      messages: [{ from: '51987654321', id: 'wamid.IN1', timestamp: ts(), type: 'text', text: { body: 'Hola, quiero info del pantalón' } }] }));
    const m = await call('GET', `/api/chats/${chatId}/messages`);
    assert.equal(m.messages.length, 1);
  });
  await step('foto entrante se baja a R2 y se puede ver', async () => {
    await hook(md({ contacts: [{ profile: { name: 'María López' }, wa_id: '51987654321' }],
      messages: [{ from: '51987654321', id: 'wamid.IN2', timestamp: ts(), type: 'image', image: { id: 'MEDIA_IMG1', mime_type: 'image/jpeg', caption: 'así lo quiero' } }] }));
    let m;
    for (let i = 0; i < 20; i++) {
      m = (await call('GET', `/api/chats/${chatId}/messages`)).messages.find((x) => x.wamid === 'wamid.IN2');
      if (m.media_status === 'ok') break;
      await wait(200);
    }
    assert.equal(m.media_status, 'ok');
    assert.equal(m.body, 'así lo quiero');
    const f = await call('GET', `/api/media/${m.id}`, undefined, { raw: true });
    assert.equal(f.status, 200);
    assert.equal(f.headers.get('content-type'), 'image/jpeg');
    assert.equal(Buffer.from(await f.arrayBuffer()).length, IMG.length);
    const part = await call('GET', `/api/media/${m.id}`, undefined, { raw: true, headers: { range: 'bytes=0-9' } });
    assert.equal(part.status, 206);
    assert.equal(Buffer.from(await part.arrayBuffer()).length, 10);
  });
  await step('audio, video, ubicación y botón se guardan', async () => {
    await hook(md({ contacts: [{ profile: { name: 'María López' }, wa_id: '51987654321' }], messages: [
      { from: '51987654321', id: 'wamid.IN3', timestamp: ts(), type: 'audio', audio: { id: 'MEDIA_AUD', mime_type: 'audio/ogg; codecs=opus', voice: true } },
      { from: '51987654321', id: 'wamid.IN4', timestamp: ts(), type: 'location', location: { latitude: -12.0, longitude: -77.0, name: 'Casa', address: 'Los Olivos' } },
      { from: '51987654321', id: 'wamid.IN5', timestamp: ts(), type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'b1', title: 'Talla M' } } },
      { from: '51987654321', id: 'wamid.IN6', timestamp: ts(), type: 'unsupported', errors: [{ code: 131051 }] },
    ] }));
    const m = (await call('GET', `/api/chats/${chatId}/messages`)).messages;
    assert.equal(m.find((x) => x.wamid === 'wamid.IN4').body, 'Casa · Los Olivos');
    assert.equal(m.find((x) => x.wamid === 'wamid.IN4').extra.location.latitude, -12);
    assert.equal(m.find((x) => x.wamid === 'wamid.IN5').body, 'Talla M');
    assert.equal(m.find((x) => x.wamid === 'wamid.IN3').extra.voice, true);
    assert.equal(m.length, 6);
  });
  await step('número desconocido queda registrado para revisar', async () => {
    const payload = { messaging_product: 'whatsapp', metadata: { phone_number_id: '000', display_phone_number: '51911' }, messages: [] };
    assert.equal(await hook(payload), 200);
    const h = await call('GET', `/api/stores/${store.id}/health`);
    assert.ok(h.log.some((l) => l.kind === 'tienda_desconocida'));
  });

  console.log('Enviar');
  let outId;
  await step('envía texto', async () => {
    const r = await call('POST', `/api/chats/${chatId}/messages`, { text: 'Hola María 👋' });
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.equal(r.message.status, 'sent');
    assert.match(r.message.wamid, /^wamid\.OUT/);
    assert.equal(r.message.user_name, 'Jordan');
    outId = r.message.wamid;
    const last = calls.filter((c) => c.path === `${PHONE_ID}/messages`).pop();
    assert.equal(last.body.to, '51987654321');
    assert.equal(last.body.text.body, 'Hola María 👋');
    const c = (await call('GET', `/api/chats/${chatId}`)).chat;
    assert.equal(c.last_dir, 'out');
    assert.ok(c.first_reply_at);
  });
  await step('estados entregado → leído (no retrocede)', async () => {
    await hook(md({ statuses: [{ id: outId, status: 'read', timestamp: ts(), recipient_id: '51987654321' }] }));
    await hook(md({ statuses: [{ id: outId, status: 'delivered', timestamp: ts(), recipient_id: '51987654321', pricing: { billable: false, category: 'referral_conversion', type: 'free_entry_point' } }] }));
    const m = (await call('GET', `/api/chats/${chatId}/messages`)).messages.find((x) => x.wamid === outId);
    assert.equal(m.status, 'read');
  });
  await step('reacción de la clienta queda en el mensaje', async () => {
    await hook(md({ messages: [{ from: '51987654321', id: 'wamid.R1', timestamp: ts(), type: 'reaction', reaction: { message_id: outId, emoji: '❤️' } }] }));
    const m = (await call('GET', `/api/chats/${chatId}/messages`)).messages.find((x) => x.wamid === outId);
    assert.equal(m.extra.reaction, '❤️');
  });
  await step('envía foto con texto', async () => {
    const form = new FormData();
    form.append('file', new Blob([IMG], { type: 'image/jpeg' }), 'colores.jpg');
    form.append('caption', 'Colores en talla M');
    const r = await call('POST', `/api/chats/${chatId}/media`, undefined, { form });
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.equal(r.message.type, 'image');
    assert.equal(r.message.status, 'sent');
    const sent = calls.filter((c) => c.path === `${PHONE_ID}/messages`).pop();
    assert.equal(sent.body.type, 'image');
    assert.match(sent.body.image.id, /^up_media_/);
    assert.equal(sent.body.image.caption, 'Colores en talla M');
    const f = await call('GET', `/api/media/${r.message.id}`, undefined, { raw: true });
    assert.equal(f.status, 200);
  });
  await step('archivo no compatible se manda como documento', async () => {
    const form = new FormData();
    form.append('file', new Blob([Buffer.from('%PDF-1.4 hola')], { type: 'application/pdf' }), 'catalogo.pdf');
    const r = await call('POST', `/api/chats/${chatId}/media`, undefined, { form });
    assert.equal(r.message.type, 'document');
    const sent = calls.filter((c) => c.path === `${PHONE_ID}/messages`).pop();
    assert.equal(sent.body.document.filename, 'catalogo.pdf');
  });
  await step('foto de más de 5 MB pide mandarla como documento', async () => {
    const form = new FormData();
    form.append('file', new Blob([Buffer.alloc(5 * 1024 * 1024 + 10)], { type: 'image/png' }), 'grande.png');
    const r = await call('POST', `/api/chats/${chatId}/media`, undefined, { form });
    assert.equal(r.status, 413);
    assert.equal(r.can_document, true);
  });
  await step('error de Meta se muestra en palabras simples y se puede reintentar', async () => {
    await hook(md({ contacts: [{ profile: { name: 'Ana' }, wa_id: '51900000000' }], messages: [{ from: '51900000000', id: 'wamid.ANA1', timestamp: ts(), type: 'text', text: { body: 'hola' } }] }));
    const list = await call('GET', `/api/stores/${store.id}/chats`);
    const ana = list.chats.find((c) => c.wa_id === '51900000000');
    const r = await call('POST', `/api/chats/${ana.id}/messages`, { text: 'Hola Ana' });
    assert.equal(r.message.status, 'failed');
    assert.match(r.message.error, /24 h/);
    const rr = await call('POST', `/api/messages/${r.message.id}/retry`);
    assert.equal(rr.message.status, 'failed');
  });
  await step('ventana de 24 h cerrada: no deja enviar', async () => {
    await hook(md({ contacts: [{ profile: { name: 'Vieja' }, wa_id: '51911111111' }], messages: [{ from: '51911111111', id: 'wamid.OLD', timestamp: String(Math.floor(Date.now() / 1000) - 26 * 3600), type: 'text', text: { body: 'hola' } }] }));
    const list = await call('GET', `/api/stores/${store.id}/chats`);
    const old = list.chats.find((c) => c.wa_id === '51911111111');
    const r = await call('POST', `/api/chats/${old.id}/messages`, { text: 'hola' });
    assert.equal(r.status, 409);
  });
  await step('primer mensaje con fecha real (no la de hoy)', async () => {
    const list = await call('GET', `/api/stores/${store.id}/chats`);
    const old = list.chats.find((c) => c.wa_id === '51911111111');
    assert.ok(Date.now() - old.created_at > 25 * 3600e3);
  });
  await step('mensaje enviado desde el celular (coexistencia) aparece', async () => {
    await hook(md({ message_echoes: [{ from: '51924000111', to: '51987654321', id: 'wamid.ECHO1', timestamp: ts(), type: 'text', text: { body: 'Te mando la guía 📦' } }] }), 'smb_message_echoes');
    const m = (await call('GET', `/api/chats/${chatId}/messages`)).messages.find((x) => x.wamid === 'wamid.ECHO1');
    assert.equal(m.sender, 'cel');
    assert.equal(m.direction, 'out');
  });

  console.log('Leído, etiquetas, sincronización');
  await step('abrir chat lo marca leído y avisa a WhatsApp', async () => {
    await hook(md({ contacts: [{ profile: { name: 'María López' }, wa_id: '51987654321' }], messages: [{ from: '51987654321', id: 'wamid.IN7', timestamp: ts(), type: 'text', text: { body: 'ok gracias' } }] }));
    const before = calls.length;
    await call('POST', `/api/chats/${chatId}/read`);
    await wait(300);
    assert.ok(calls.slice(before).some((c) => c.body?.status === 'read' && c.body?.message_id === 'wamid.IN7'));
    const c = (await call('GET', `/api/chats/${chatId}`)).chat;
    assert.equal(c.unread, 0);
  });
  await step('poner y quitar etiquetas, filtrar por etiqueta', async () => {
    const { labels } = await call('GET', `/api/stores/${store.id}/labels`);
    const lima = labels.find((l) => l.name === 'LIMA PENDIENTE');
    const urg = labels.find((l) => l.name === '🔥 URGENTE');
    await call('PUT', `/api/chats/${chatId}/labels/${lima.id}`);
    await call('PUT', `/api/chats/${chatId}/labels/${urg.id}`);
    let r = await call('GET', `/api/stores/${store.id}/chats?labels=${lima.id},${urg.id}`);
    assert.deepEqual(r.chats.map((c) => c.id), [chatId]);
    await call('DELETE', `/api/chats/${chatId}/labels/${urg.id}`);
    r = await call('GET', `/api/stores/${store.id}/chats?labels=${lima.id},${urg.id}`);
    assert.equal(r.chats.length, 0);
    r = await call('GET', `/api/stores/${store.id}/chats?labels=${lima.id}`);
    assert.equal(r.chats.length, 1);
    assert.deepEqual(r.chats[0].labels, [lima.id]);
  });
  await step('crear, renombrar y borrar etiqueta; las automáticas están protegidas', async () => {
    assert.equal((await call('POST', `/api/stores/${store.id}/labels`, { name: 'VIP', color: '--t-blue' })).status, 200);
    assert.equal((await call('POST', `/api/stores/${store.id}/labels`, { name: 'VIP' })).status, 409);
    const { labels } = await call('GET', `/api/stores/${store.id}/labels`);
    const vip = labels.find((l) => l.name === 'VIP');
    assert.equal((await call('PATCH', `/api/labels/${vip.id}`, { name: 'Clienta VIP' })).status, 200);
    assert.equal((await call('DELETE', `/api/labels/${vip.id}`)).status, 200);
    const auto = labels.find((l) => l.name === 'ASESOR');
    assert.equal((await call('DELETE', `/api/labels/${auto.id}`)).status, 400);
    assert.equal((await call('PATCH', `/api/labels/${auto.id}`, { name: 'otro' })).status, 400);
  });
  await step('sync: rev cambia con mensajes nuevos y cuenta no leídos', async () => {
    const s1 = await call('GET', '/api/sync');
    const r1 = s1.stores.find((s) => s.id === store.id).rev;
    await hook(md({ contacts: [{ profile: { name: 'Lucía' }, wa_id: '51955555555' }], messages: [{ from: '51955555555', id: 'wamid.L1', timestamp: ts(), type: 'text', text: { body: 'precio?' } }] }));
    const s2 = await call('GET', '/api/sync');
    const st = s2.stores.find((s) => s.id === store.id);
    assert.ok(st.rev > r1);
    assert.ok(st.unread >= 1);
    const inc = await call('GET', `/api/stores/${store.id}/chats?after=${s1.t}`);
    assert.ok(inc.chats.some((c) => c.wa_id === '51955555555'));
    const msgs = await call('GET', `/api/chats/${chatId}/messages?after=${s2.t + 5000}`);
    assert.equal(msgs.messages.length, 0);
  });
  await step('buscar por nombre y por número', async () => {
    assert.equal((await call('GET', `/api/stores/${store.id}/chats?q=lucí`)).chats.length, 1);
    assert.equal((await call('GET', `/api/stores/${store.id}/chats?q=987654`)).chats.length, 1);
    assert.equal((await call('GET', `/api/stores/${store.id}/chats?filter=unread`)).chats.every((c) => c.unread > 0), true);
  });

  console.log('Equipo y permisos');
  const ownerCookie = cookie;
  let inviteLink;
  await step('invita a una asesora solo a una tienda', async () => {
    const me = await call('GET', '/api/me');
    const r = await call('POST', `/api/companies/${me.companies[0].id}/invites`, { email: 'jade@test.pe', role: 'asesora', all_stores: false, store_ids: [store.id] });
    assert.equal(r.status, 200, JSON.stringify(r));
    inviteLink = r.link;
    assert.match(inviteLink, /\/invitacion\//);
  });
  await step('la asesora acepta y entra', async () => {
    cookie = '';
    const token = inviteLink.split('/invitacion/')[1];
    const info = await call('GET', `/api/invites/${token}`);
    assert.equal(info.email, 'jade@test.pe');
    assert.equal(info.has_account, false);
    const r = await call('POST', `/api/invites/${token}/accept`, { name: 'Jade', password: 'jade-clave-1' });
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.equal(r.stores.length, 1);
    assert.equal(r.stores[0].role, 'asesora');
    assert.equal(r.stores[0].phone_number_id, undefined, 'la asesora no ve datos técnicos');
    assert.equal((await call('GET', `/api/invites/${token}`)).status, 404, 'la invitación no se reutiliza');
  });
  await step('asesora: ve chats, envía, pone etiquetas; no configura', async () => {
    assert.equal((await call('GET', `/api/stores/${store.id}/chats`)).status, 200);
    const r = await call('POST', `/api/chats/${chatId}/messages`, { text: 'Soy Jade' });
    assert.equal(r.message.user_name, 'Jade');
    assert.equal((await call('GET', `/api/stores/${store2.id}/chats`)).status, 404);
    assert.equal((await call('GET', `/api/stores/${store.id}/health`)).status, 403);
    assert.equal((await call('POST', `/api/stores/${store.id}/labels`, { name: 'X' })).status, 403);
    assert.equal((await call('PATCH', `/api/stores/${store.id}`, { name: 'X' })).status, 403);
    const me = await call('GET', '/api/me');
    assert.equal((await call('GET', `/api/companies/${me.companies[0].id}/team`)).status, 403);
  });
  await step('despacho no ve chats', async () => {
    cookie = ownerCookie;
    const me = await call('GET', '/api/me');
    const r = await call('POST', `/api/companies/${me.companies[0].id}/invites`, { email: 'nicole@test.pe', role: 'despacho', all_stores: true });
    cookie = '';
    await call('POST', `/api/invites/${r.link.split('/invitacion/')[1]}/accept`, { name: 'Nicole', password: 'nicole-clave' });
    assert.equal((await call('GET', `/api/stores/${store.id}/chats`)).status, 403);
  });
  await step('dueño: cambia rol, genera enlace de clave y quita del equipo', async () => {
    cookie = ownerCookie;
    const me = await call('GET', '/api/me');
    const coId = me.companies[0].id;
    const team = await call('GET', `/api/companies/${coId}/team`);
    assert.equal(team.members.length, 3);
    const jade = team.members.find((m) => m.email === 'jade@test.pe');
    assert.deepEqual(jade.store_ids, [store.id]);
    assert.equal((await call('PATCH', `/api/companies/${coId}/members/${jade.id}`, { role: 'asesora', all_stores: true })).status, 200);
    const reset = await call('POST', `/api/companies/${coId}/members/${jade.id}/reset`);
    cookie = '';
    const tok = reset.link.split('/clave/')[1];
    assert.equal((await call('GET', `/api/resets/${tok}`)).email, 'jade@test.pe');
    const rr = await call('POST', `/api/resets/${tok}`, { password: 'nueva-clave-9' });
    assert.equal(rr.stores.length, 2);
    cookie = ownerCookie;
    const nicole = team.members.find((m) => m.email === 'nicole@test.pe');
    assert.equal((await call('DELETE', `/api/companies/${coId}/members/${nicole.id}`)).status, 200);
    const owner = team.members.find((m) => m.role === 'dueno');
    assert.equal((await call('DELETE', `/api/companies/${coId}/members/${owner.id}`)).status, 400, 'no puede quedar sin dueño');
  });
  await step('recuperar cuenta de administrador con la clave de inicio', async () => {
    cookie = '';
    assert.equal((await call('POST', '/api/recover', { code: 'mal', email: 'jordan@test.pe', password: 'otra-clave-123' })).status, 403);
    const r = await call('POST', '/api/recover', { code: 'inicio-prueba', email: 'jordan@test.pe', password: 'otra-clave-123' });
    assert.equal(r.status, 200);
    assert.equal((await call('GET', '/api/me', undefined, { headers: { cookie: ownerCookie }, keepCookie: false })).status, 401, 'cierra sesiones viejas');
  });
  await step('segunda empresa (Orión) separada', async () => {
    const r = await call('POST', '/api/companies', { name: 'Orión' });
    assert.equal(r.companies.length, 2);
  });
  await step('borrar tienda pide escribir su nombre', async () => {
    assert.equal((await call('DELETE', `/api/stores/${store2.id}`, { confirm: 'nop' })).status, 400);
    const r = await call('DELETE', `/api/stores/${store2.id}`, { confirm: 'leggings cargo' });
    assert.equal(r.status, 200);
    assert.ok(!r.stores.some((s) => s.id === store2.id));
  });

  console.log('Bot Suyon AI');
  const until = async (fn, ms = 12000) => {
    const t0 = Date.now();
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() - t0 > ms) throw new Error('Se acabó el tiempo esperando al bot');
      await wait(300);
    }
  };
  const msgsOf = async (id) => (await call('GET', `/api/chats/${id}/messages`)).messages;
  const chatOf = async (wa) => (await call('GET', `/api/stores/${store.id}/chats?limit=200`)).chats.find((c) => c.wa_id === wa);
  const inbound = (wa, id, text, extra = {}) => hook(md({ contacts: [{ profile: { name: 'Prueba ' + wa.slice(-3) }, wa_id: wa }], messages: [{ from: wa, id, timestamp: ts(), type: 'text', text: { body: text }, ...extra }] }));
  let flowId, botChat;
  await step('reconocer talla sin IA (frases de Botcake y números de jean)', async () => {
    const { recognize, fitWindow, parseReply } = await import('../src/bot.js');
    const { TALLAS } = await import('../src/bot-template.js');
    const cases = { 'M': 'M', 'talla m': 'M', 'Soy M': 'M', '32': 'M', 'mediano': 'M', 'uso talla 30 porfa': 'S', 'small': 'S', '26': 'XS', 'XL': 'XL', '42': 'XL', 'xxl': 'XL', 'largue': 'L', '28 o 31': 'M', 'Hola, quiero info': null, 'sí, me gusta': null, 'precio?': null };
    for (const [t, v] of Object.entries(cases)) assert.equal(recognize(t, TALLAS), v, t);
    const t = Date.UTC(2026, 10, 3, 4, 0); // 11 p. m. en Lima
    assert.equal(new Date(fitWindow(t, 8, 22) - 5 * 3600e3).getUTCHours(), 8);
    assert.equal(fitWindow(t, 8, 22), Date.UTC(2026, 10, 3, 13, 0), 'Lima: 8 a. m. = 13:00 UTC');
    assert.equal(fitWindow(Date.UTC(2026, 10, 3, 12, 0), 8, 22, 'America/Mexico_City'), Date.UTC(2026, 10, 3, 14, 0), 'México: 6 a. m. → 8 a. m.');
    assert.equal(fitWindow(Date.UTC(2026, 10, 3, 15, 0), 8, 22, 'America/Bogota'), Date.UTC(2026, 10, 3, 15, 0), 'dentro del horario no cambia');
    const { localDay } = await import('../src/util.js');
    assert.equal(localDay(Date.UTC(2026, 10, 3, 3, 0)), '2026-11-02', 'el día es el de Lima');
    assert.equal(parseReply('hola').valid, false, 'texto suelto no se manda');
    assert.equal(parseReply('Te paso: {"mensajes": [roto').valid, false);
    const ok = parseReply('```json\n{"mensajes":[{"texto":"Hola"},{"texto":"{\\"caso\\": 1}"}],"caso":"inventado","datos":{"talla":"M","x":{"y":1}}}\n```', ['yape_sede']);
    assert.equal(ok.valid, true);
    assert.deepEqual(ok.mensajes.map((m) => m.texto), ['Hola'], 'restos de JSON no llegan a la clienta');
    assert.equal(ok.caso, null, 'caso que no existe se ignora');
    assert.deepEqual(ok.datos, { talla: 'M' });
  });
  await step('crea el flujo «Ventas pantalón» desde la plantilla', async () => {
    await call('POST', '/api/login', { email: 'jordan@test.pe', password: 'clave-segura-1' });
    const r = await call('POST', `/api/stores/${store.id}/bot/flows`, { template: 'pantalon' });
    assert.equal(r.status, 200, JSON.stringify(r));
    flowId = r.id;
    const f = await call('GET', `/api/bot/flows/${flowId}`);
    assert.equal(f.flow.active, 0);
    assert.ok(f.flow.graph.nodes.some((n) => n.type === 'ia' && n.cases.length === 4));
    const b = await call('GET', `/api/stores/${store.id}/bot`);
    assert.equal(b.settings.bot_on, 0);
    assert.match(b.settings.ia_prompt, /\{yape\}/);
    assert.ok(!/928 576/.test(b.settings.ia_prompt), 'los datos de pago no vienen en el código');
    assert.equal(b.template_assets.length, 14);
  });
  await step('sube archivos del bot', async () => {
    for (const key of ['precios', 'colores-S']) {
      const fd = new FormData();
      fd.append('key', key);
      fd.append('file', new Blob([IMG], { type: 'image/jpeg' }), key + '.jpg');
      const r = await call('POST', `/api/stores/${store.id}/bot/assets`, undefined, { form: fd });
      assert.equal(r.status, 200, JSON.stringify(r));
    }
    const fd = new FormData();
    fd.append('key', 'mal clave');
    fd.append('file', new Blob([IMG], { type: 'image/jpeg' }), 'x.jpg');
    assert.equal((await call('POST', `/api/stores/${store.id}/bot/assets`, undefined, { form: fd })).status, 400);
  });
  await step('enciende el bot solo para el número de prueba', async () => {
    const r = await call('PATCH', `/api/stores/${store.id}/bot/settings`, { bot_on: true, audience: 'equipo', test_numbers: '911111111', ia_delay_s: 0, pay_yape: '999 111 222', pay_titular: 'Prueba Titular' });
    assert.equal(r.settings.bot_on, 1);
    assert.equal((await call('PUT', `/api/bot/flows/${flowId}`, { active: true })).flow.active, 1);
  });
  await step('número que no es de prueba: el bot no responde', async () => {
    await inbound('51955500011', 'wamid.B0', 'Hola', { referral: { source_id: '120', source_type: 'ad', ctwa_clid: 'x' } });
    await wait(1500);
    const c = await chatOf('51955500011');
    assert.equal((await msgsOf(c.id)).filter((m) => m.direction === 'out').length, 0);
  });
  await step('clienta nueva por anuncio: foto + precios + pregunta de talla, sin IA', async () => {
    await inbound('51911111111', 'wamid.B1', 'Deseo mis pantalones formales', { referral: { source_id: '120249329319630533', source_type: 'ad', ctwa_clid: 'abc' } });
    botChat = await until(async () => { const c = await chatOf('51911111111'); return c?.bot_node === 'talla' && c.bot_wait === 1 ? c : null; });
    const out = (await msgsOf(botChat.id)).filter((m) => m.direction === 'out');
    assert.deepEqual(out.map((m) => m.type), ['image', 'text', 'text']);
    assert.ok(out.every((m) => m.sender === 'bot' && m.status === 'sent'));
    assert.match(out[2].body, /Qué talla usas/);
    const l = await call('GET', `/api/stores/${store.id}/labels`);
    assert.ok(l.labels.some((x) => x.name === 'pantalón prod'));
  });
  await step('responde «uso talla 30»: etiqueta Talla S y foto de colores S', async () => {
    await inbound('51911111111', 'wamid.B2', 'uso talla 30 porfa');
    const c = await until(async () => { const c = await chatOf('51911111111'); return c?.bot_node === 'colores' ? c : null; });
    assert.equal(JSON.parse(c.bot_vars).talla, 'S');
    const labels = (await call('GET', `/api/stores/${store.id}/labels`)).labels;
    assert.ok(c.labels.includes(labels.find((x) => x.name === 'Talla S').id));
    const out = (await msgsOf(c.id)).filter((m) => m.direction === 'out');
    assert.match(out[out.length - 1].body, /tu talla S/);
  });
  await step('elige color: entra la IA con el prompt copiado y los datos de pago', async () => {
    await inbound('51911111111', 'wamid.B3', 'me gusta el negro');
    const c = await until(async () => { const c = await chatOf('51911111111'); return c?.bot_node === 'bucle' && c.bot_wait === 1 ? c : null; });
    const sys = iaCalls[iaCalls.length - 1].system;
    assert.match(sys, /Eres la asesora de ventas de Porte Perú/);
    assert.match(sys, /999 111 222/);
    assert.match(sys, /ETIQUETAS DE ESTA CLIENTA: .*Talla S/);
    const ia = (await msgsOf(c.id)).filter((m) => m.sender === 'ia');
    assert.equal(ia.length, 2);
    assert.equal(JSON.parse(c.bot_vars).colores, 'Negro');
    const av = await call('GET', `/api/stores/${store.id}/avisos`);
    assert.ok(av.events.some((e) => /tabla-tallas/.test(e.title)), 'avisa que falta un archivo');
  });
  await step('caso especial Yape + sede: pasa a asesora con COMPRÓ y aviso', async () => {
    await inbound('51911111111', 'wamid.B4', 'ya te yapee, sede Shalom Av Brasil');
    const c = await until(async () => { const c = await chatOf('51911111111'); return c?.bot_paused === 1 ? c : null; });
    assert.equal(c.handler, 'asesora');
    const names = (await call('GET', `/api/stores/${store.id}/labels`)).labels.filter((l) => c.labels.includes(l.id)).map((l) => l.name);
    assert.ok(names.includes('ASESOR') && names.includes('COMPRÓ'), names.join(','));
    const av = await call('GET', `/api/stores/${store.id}/avisos`);
    assert.ok(av.pending.asesora.some((x) => x.id === c.id));
    assert.ok(av.events.some((e) => e.kind === 'asesora' && e.chat_id === c.id));
    const sync = await call('GET', '/api/sync');
    assert.ok(sync.stores.find((s) => s.id === store.id).avisos > 0);
  });
  await step('números por bloque', async () => {
    const f = await call('GET', `/api/bot/flows/${flowId}`);
    assert.equal(f.stats.precios.sent, 1);
    assert.equal(f.stats.talla.replied, 1);
    assert.ok(f.stats.reconocer.entered >= 1);
  });
  await step('seguimiento: si no responde sale el mensaje de 15 min; falta el audio y avisa', async () => {
    await call('PATCH', `/api/stores/${store.id}/bot/settings`, { test_numbers: '911111111, 911111112' });
    await inbound('51911111112', 'wamid.C1', 'hola', { referral: { source_id: '1', source_type: 'ad', ctwa_clid: 'y' } });
    const c = await until(async () => { const c = await chatOf('51911111112'); return c?.bot_node === 'talla' ? c : null; });
    await call('POST', '/__test/jobs?shift=' + 41 * 60e3);
    const seq = (await msgsOf(c.id)).filter((m) => m.direction === 'out' && /Si no la sabes/.test(m.body || ''));
    assert.equal(seq.length, 1);
    const av = await call('GET', `/api/stores/${store.id}/avisos`);
    assert.ok(av.events.some((e) => /audio-talla/.test(e.title)));
  });
  await step('si la asesora escribe a mano, el bot se pausa; se puede reanudar', async () => {
    const c = await chatOf('51911111112');
    await call('POST', `/api/chats/${c.id}/messages`, { text: 'Hola, soy la asesora' });
    let x = await chatOf('51911111112');
    assert.equal(x.bot_paused, 1);
    await call('POST', `/api/chats/${c.id}/bot`, { action: 'resume' });
    x = await chatOf('51911111112');
    assert.equal(x.bot_paused, 0);
  });
  await step('si la IA falla: «Estamos validando…» y pasa a asesora', async () => {
    await call('PATCH', `/api/stores/${store.id}/bot/settings`, { test_numbers: '911111111, 911111112, 911111113' });
    await inbound('51911111113', 'wamid.D1', 'hola', { referral: { source_id: '1', source_type: 'ad', ctwa_clid: 'z' } });
    await until(async () => (await chatOf('51911111113'))?.bot_node === 'talla');
    await inbound('51911111113', 'wamid.D2', 'no sé, falla');
    const c = await until(async () => { const c = await chatOf('51911111113'); return c?.bot_paused === 1 ? c : null; });
    assert.ok((await msgsOf(c.id)).some((m) => /Estamos validando/.test(m.body || '')));
    const av = await call('GET', `/api/stores/${store.id}/avisos`);
    assert.ok(av.events.some((e) => e.kind === 'ia'));
    await call('POST', `/api/stores/${store.id}/avisos/read`, {});
    assert.ok((await call('GET', `/api/stores/${store.id}/avisos`)).events.every((e) => e.read_at));
  });
  await step('IA responde raro: reintenta y nunca manda texto suelto', async () => {
    await call('PATCH', `/api/stores/${store.id}/bot/settings`, { test_numbers: '911111111, 911111112, 911111113, 911111114, 911111115' });
    await inbound('51911111114', 'wamid.E1', 'hola', { referral: { source_id: '1', source_type: 'ad', ctwa_clid: 'r' } });
    await until(async () => (await chatOf('51911111114'))?.bot_node === 'talla');
    await inbound('51911111114', 'wamid.E2', 'rarito, cuánto cuesta');
    let c = await until(async () => { const c = await chatOf('51911111114'); return c?.bot_node === 'bucle' && c.bot_wait === 1 ? c : null; });
    let ia = (await msgsOf(c.id)).filter((m) => m.sender === 'ia');
    assert.equal(ia.length, 2, 'al reintentar responde bien');
    assert.ok(!ia.some((m) => /Te cuento los precios/.test(m.body || '')));
    // Siempre raro: no manda nada de la IA, pasa a asesora con aviso
    await inbound('51911111115', 'wamid.F1', 'hola', { referral: { source_id: '1', source_type: 'ad', ctwa_clid: 's' } });
    await until(async () => (await chatOf('51911111115'))?.bot_node === 'talla');
    await inbound('51911111115', 'wamid.F2', 'siempre raro');
    c = await until(async () => { const c = await chatOf('51911111115'); return c?.bot_paused === 1 ? c : null; });
    const ms = await msgsOf(c.id);
    assert.ok(!ms.some((m) => m.sender === 'ia' && /mensajes|roto|Claro amiga/.test(m.body || '')), 'no manda el texto raro');
    assert.ok(ms.some((m) => /Estamos validando/.test(m.body || '')));
    const av = await call('GET', `/api/stores/${store.id}/avisos`);
    assert.ok(av.events.some((e) => /no se puede mandar/.test(e.title) && e.chat_id === c.id));
  });
  let simCalls;
  await step('simulador: prueba el flujo como clienta sin WhatsApp', async () => {
    simCalls = calls.length;
    await call('PATCH', `/api/stores/${store.id}/bot/settings`, { bot_on: false });
    let s = await call('POST', `/api/stores/${store.id}/sim/reset`, { flow_id: flowId });
    assert.equal(s.status, 200, JSON.stringify(s));
    assert.deepEqual(s.messages.filter((m) => m.direction === 'out').map((m) => m.type), ['image', 'text', 'text']);
    assert.equal(s.chat.node, 'talla');
    assert.equal(s.chat.wait, 1);
    assert.ok(s.jobs.length >= 1 && /Seguimiento talla · mensaje 1/.test(s.jobs[0].label), JSON.stringify(s.jobs));
    s = await call('POST', `/api/stores/${store.id}/sim/send`, { text: 'soy M' });
    assert.equal(s.chat.vars.talla, 'M');
    assert.ok(s.labels.some((l) => l.name === 'Talla M'));
    assert.ok(s.messages.some((m) => m.sender === 'sys' && /colores-M/.test(m.body)), 'el aviso sale dentro del simulador');
    assert.equal(s.jobs.length, 0, 'al responder se cancela el seguimiento');
    s = await call('POST', `/api/stores/${store.id}/sim/send`, { text: 'me gusta el negro' });
    assert.equal(s.messages.filter((m) => m.sender === 'ia').length, 2);
    assert.equal(s.chat.node, 'bucle');
    s = await call('POST', `/api/stores/${store.id}/sim/send`, { text: 'pásame la cuenta bcp' });
    assert.ok(!s.messages.some((m) => m.sender === 'ia' && /FALTA/.test(m.body || '')), 'no manda [FALTA …]');
    assert.ok(s.messages.some((m) => m.sender === 'sys' && /datos de pago/.test(m.body)));
    assert.equal(s.chat.paused, 1);
  });
  await step('simulador: adelantar seguimiento, foto, y no ensucia bandeja ni números', async () => {
    let s = await call('POST', `/api/stores/${store.id}/sim/reset`, { flow_id: flowId });
    assert.equal(s.messages.filter((m) => m.direction === 'in').length, 0, 'empieza de cero');
    s = await call('POST', `/api/stores/${store.id}/sim/next`);
    assert.ok(s.messages.some((m) => /Si no la sabes/.test(m.body || '')));
    const fd = new FormData();
    fd.append('file', new Blob([IMG], { type: 'image/jpeg' }), 'yape.jpg');
    s = await call('POST', `/api/stores/${store.id}/sim/send`, undefined, { form: fd });
    const pic = s.messages.find((m) => m.direction === 'in' && m.type === 'image');
    assert.ok(pic?.media);
    assert.equal((await call('GET', `/api/media/${pic.id}`, undefined, { raw: true })).status, 200);
    assert.ok(!calls.slice(simCalls).some((x) => x.path.startsWith(PHONE_ID)), 'no llama a WhatsApp');
    const list = (await call('GET', `/api/stores/${store.id}/chats?limit=200`)).chats;
    assert.ok(!list.some((c) => c.wa_id.startsWith('sim')), 'no sale en la bandeja');
    const av = await call('GET', `/api/stores/${store.id}/avisos`);
    assert.ok(!av.events.some((e) => !e.read_at && /colores-M|datos de pago/.test(e.title)), 'los avisos del simulador no van a Avisos');
    const f = await call('GET', `/api/bot/flows/${flowId}`);
    assert.equal(f.stats.precios.sent, 5, 'los números por bloque no cuentan el simulador');
    assert.equal((await call('POST', `/api/stores/${store.id}/sim/send`, { text: '' })).status, 400);
    await call('PATCH', `/api/stores/${store.id}/bot/settings`, { bot_on: true });
  });
  await step('Configuración General: zona horaria, país, moneda e idioma', async () => {
    let me = await call('GET', '/api/me');
    let st = me.stores.find((s) => s.id === store.id);
    assert.equal(st.timezone, 'America/Lima');
    assert.equal(st.currency, 'PEN');
    assert.ok(me.general.countries.some((c) => c.id === 'MX'));
    assert.equal((await call('PATCH', `/api/stores/${store.id}`, { timezone: 'Marte/Base' })).status, 400);
    assert.equal((await call('PATCH', `/api/stores/${store.id}`, { language: 'xx' })).status, 400);
    me = await call('PATCH', `/api/stores/${store.id}`, { country: 'MX', timezone: 'America/Mexico_City', currency: 'MXN', language: 'en', hour12: false });
    st = me.stores.find((s) => s.id === store.id);
    assert.deepEqual([st.country, st.timezone, st.currency, st.language, st.hour12], ['MX', 'America/Mexico_City', 'MXN', 'en', 0]);
    const n = iaCalls.length;
    await call('POST', `/api/stores/${store.id}/sim/reset`, { flow_id: flowId });
    await call('POST', `/api/stores/${store.id}/sim/send`, { text: 'soy M' });
    await call('POST', `/api/stores/${store.id}/sim/send`, { text: 'me gusta el negro' });
    const sys = iaCalls.slice(n).pop().system;
    assert.match(sys, /IDIOMA: escribe los "texto" siempre en inglés/);
    assert.ok(!/a\. m\.|p\. m\./.test(sys.match(/AHORA[^\n]*/)?.[0] || ''), 'hora en 24 h');
    me = await call('PATCH', `/api/stores/${store.id}`, { country: 'PE', timezone: 'America/Lima', currency: 'PEN', language: 'es', hour12: true });
    assert.equal(me.stores.find((s) => s.id === store.id).timezone, 'America/Lima');
  });
  await step('guardar el lienzo valida los bloques', async () => {
    const f = await call('GET', `/api/bot/flows/${flowId}`);
    const g = f.flow.graph;
    g.nodes.find((n) => n.id === 'precios').x = 500;
    assert.equal((await call('PUT', `/api/bot/flows/${flowId}`, { graph: g })).flow.graph.nodes.find((n) => n.id === 'precios').x, 500);
    assert.equal((await call('PUT', `/api/bot/flows/${flowId}`, { graph: { nodes: [{ id: 'a', type: 'raro' }] } })).status, 400);
  });
  await step('franja de llamadas: pendientes por día y resultado', async () => {
    const labels = (await call('GET', `/api/stores/${store.id}/labels`)).labels;
    const lima = labels.find((l) => l.name === 'LIMA PENDIENTE');
    const c = await chatOf('51911111112');
    await call('PUT', `/api/chats/${c.id}/labels/${lima.id}`);
    let r = await call('GET', `/api/stores/${store.id}/llamadas`);
    const row = r.calls.find((x) => x.id === c.id && x.label === 'LIMA PENDIENTE');
    assert.ok(row && !row.last_result && row.tries === 0);
    await call('POST', `/api/chats/${c.id}/llamada`, { result: 'no_contesto', label: 'LIMA PENDIENTE' });
    r = await call('GET', `/api/stores/${store.id}/llamadas`);
    assert.equal(r.calls.find((x) => x.id === c.id).last_result, 'no_contesto');
    assert.equal(r.calls.find((x) => x.id === c.id).tries, 1);
    await call('POST', `/api/chats/${c.id}/llamada`, { result: 'cerro', label: 'LIMA PENDIENTE' });
    r = await call('GET', `/api/stores/${store.id}/llamadas`);
    assert.ok(!r.calls.some((x) => x.id === c.id));
    const after = await chatOf('51911111112');
    assert.ok(after.labels.includes(labels.find((l) => l.name === '✅ LIMA').id));
    assert.equal((await call('POST', `/api/chats/${c.id}/llamada`, { result: 'raro' })).status, 400);
  });
  await step('páginas para Meta', async () => {
    for (const p of ['/privacidad', '/eliminar-datos', '/terminos']) assert.equal((await fetch(BASE + p)).status, 200);
    const app = await fetch(BASE + '/invitacion/abc');
    assert.equal(app.status, 200, 'la app web carga en rutas propias');
  });
  console.log(`\nTodo bien: ${passed} pruebas pasaron.`);
} catch (e) {
  console.error('\nFALLÓ:', e.message);
  console.error(log.split('\n').filter((l) => /error|Error|✘/.test(l)).slice(-15).join('\n'));
  process.exitCode = 1;
} finally {
  try { process.kill(-wd.pid, 'SIGTERM'); } catch {}
  meta.close();
  fs.rmSync(persist, { recursive: true, force: true });
}
