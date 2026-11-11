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
    if (/Corrige la ortografía/.test(body.system || '')) {
      const raw = String(body.messages[0].content).replace(/<\/?mensaje>/g, '').trim();
      const fixed = /cambia palabra/.test(raw) ? 'Otra cosa distinta' : raw.charAt(0).toUpperCase() + raw.slice(1).replace(/\besta listo\b/, 'está listo').replace(/\bque color\b/, '¿qué color') + (/que color/.test(raw) ? '?' : '');
      return json(200, { content: [{ type: 'text', text: fixed }], usage: { input_tokens: 80, output_tokens: 20 } });
    }
    iaCalls.push(body);
    if (req.headers['x-api-key'] !== 'ia-test-key') return json(401, { error: { message: 'bad key' } });
    const last = body.messages[body.messages.length - 1];
    const txt = typeof last.content === 'string' ? last.content : last.content.map((x) => x.text || '').join(' ');
    // Como la IA real: no acepta que la conversación termine en un mensaje suyo
    if (last.role === 'assistant') return json(400, { error: { message: 'This model does not support assistant message prefill. The conversation must end with a user message.' } });
    if (/sobrecarga/i.test(txt) && !globalThis.__sobre) { globalThis.__sobre = 1; return json(529, { error: { message: 'Overloaded' } }); }
    if (/falla/i.test(txt)) return json(500, { error: { message: 'overloaded' } });
    if (/lento/i.test(txt)) await new Promise((r) => setTimeout(r, 2500)); // la IA demora: la clienta escribe mientras piensa
    if (/guías de envío peruanas/.test(txt)) return json(200, { content: [{ type: 'text', text: 'Aquí está: ' + JSON.stringify([{ foto: 1, tipo: 'shalom', orden: '30000002', codigo: 'qwer', dni: '70000002', nombre: 'LUZ PEREZ', destino: 'Piura', fecha: '2026-11-04T18:00:00' }]) }], usage: { input_tokens: 1500, output_tokens: 80 } });
    const all = body.messages.map((m) => (typeof m.content === 'string' ? m.content : m.content.map((x) => x.text || '').join(' '))).join('\n');
    if (/siempre raro/i.test(all)) return json(200, { content: [{ type: 'text', text: 'Claro amiga, te paso: {"mensajes": [roto' }], usage: { input_tokens: 10, output_tokens: 10 } });
    if (/rarito/i.test(txt)) return json(200, { content: [{ type: 'text', text: '¡Hola! Te cuento los precios 😊' }], usage: { input_tokens: 10, output_tokens: 10 } });
    if (/formshalom/i.test(txt)) return json(200, { content: [{ type: 'text', text: JSON.stringify({ mensajes: [{ texto: 'Revisa tus datos 👇\nShalom: 🚚📦\nMonto total: S/109\nAdelanto: S/30\nMonto restante: S/79' }], caso: null, datos: {} }) }], usage: { input_tokens: 10, output_tokens: 10 } });
    if (/cuenta bcp/i.test(txt)) return json(200, { content: [{ type: 'text', text: JSON.stringify({ mensajes: [{ texto: 'Cuenta BCP: [FALTA BCP]' }], caso: null, datos: {} }) }], usage: { input_tokens: 10, output_tokens: 10 } });
    if (/juliaca|miraflores|ancón|ancon|terminal|libertad|trujillo/i.test(txt)) {
      const sede = /terminal/i.test(txt) ? { sede_shalom: 'Juliaca Terminal' } : {};
      return json(200, { content: [{ type: 'text', text: JSON.stringify({ mensajes: [{ texto: /terminal/i.test(txt) ? '¡Listo! Anotado 💕' : '¡Sí enviamos! 📦 Va por Shalom, ¿qué agencia te queda mejor?' }], caso: null, datos: sede }) }], usage: { input_tokens: 10, output_tokens: 10 } });
    }
    const out = /yape/i.test(txt)
      ? { mensajes: [{ texto: '¡Perfecto! 📦 Sede: Av. Brasil. Mi compañera valida tu pago 💕', archivo: null }], caso: 'yape_sede', datos: { sede_shalom: 'Av. Brasil' } }
      : { mensajes: [{ texto: '¡Lindo! 😍 1 pantalón Negro talla S: S/89', archivo: null }, { texto: '¿A qué ciudad o distrito te lo enviamos? 😊', archivo: 'tabla-tallas' }], caso: null, datos: { colores: 'Negro', cantidad: '1' } };
    return json(200, { content: [{ type: 'text', text: JSON.stringify(out) }], usage: { input_tokens: 5000, output_tokens: 120 } });
  }
  if (req.method === 'POST' && p === 'upload:abc123') {
    if (auth !== 'OAuth test-token' || req.headers.file_offset !== '0' || !raw.length) return json(400, { error: { code: 100, message: 'bad upload' } });
    return json(200, { h: 'HANDLE1' });
  }
  if (p.startsWith('shalom/')) {
    // «Shalom API Peru» falso
    if (req.headers['x-api-key'] !== 'sh-test-key') return json(401, { error: 'API key inválida' });
    if (p === 'shalom/v1/agencies') {
      // Formato real: { items: [...] } y ?page=N (100 por página)
      const all = [
        { id: 1, nombre: 'PUNO / PUNO / PUNO / PUNO CENTRO', lugar_over: 'PUNO CENTRO', departamento: 'PUNO', provincia: 'PUNO', direccion: 'Jr. Lima 123', habilitado: true, horario: { hora_atencion: 'LUNES A SÁBADO 8 AM A 8 PM' } },
        { id: 2, nombre: 'PUNO / SAN ROMÁN / JULIACA / JULIACA TERMINAL', lugar_over: 'JULIACA TERMINAL', departamento: 'PUNO', provincia: 'SAN ROMÁN', direccion: 'Av. Circunvalación 45', habilitado: true },
        { id: 3, nombre: 'AREQUIPA / AREQUIPA / CAYMA / AREQUIPA CAYMA', lugar_over: 'AREQUIPA CAYMA', departamento: 'AREQUIPA', provincia: 'AREQUIPA', direccion: 'Av. Ejército 900', habilitado: false },
        { id: 4, nombre: 'LIMA / LIMA / MIRAFLORES / AV LARCO', lugar_over: 'AV LARCO', departamento: 'LIMA', provincia: 'LIMA', direccion: 'Av. Larco 100', habilitado: true },
        { id: 5, nombre: 'LIMA / LIMA / ANCON / ANCON CENTRO', lugar_over: 'ANCON CENTRO', departamento: 'LIMA', provincia: 'LIMA', direccion: 'Jr. Ancón 5', habilitado: true },
        { id: 6, nombre: 'LIMA / LIMA / ATE-VITARTE / HUAYCAN', lugar_over: 'HUAYCAN', departamento: 'LIMA', provincia: 'LIMA', direccion: 'Av. J. C. Mariátegui 10', habilitado: true },
        // Cusco: departamento, provincia y distrito se llaman igual; Quillabamba es un pueblo (distrito Santa Ana)
        { id: 7, nombre: 'CUSCO / CUSCO / CUSCO / TICA TICA', lugar_over: 'TICA TICA', departamento: 'CUSCO', provincia: 'CUSCO', direccion: 'Av. Tica Tica 1', habilitado: true },
        { id: 8, nombre: 'CUSCO / CUSCO / SANTIAGO / SANTIAGO CENTRO', lugar_over: 'SANTIAGO CENTRO', departamento: 'CUSCO', provincia: 'CUSCO', direccion: 'Av. Antonio Lorena 2', habilitado: true },
        { id: 9, nombre: 'CUSCO / CUSCO / WANCHAQ / WANCHAQ', lugar_over: 'WANCHAQ', departamento: 'CUSCO', provincia: 'CUSCO', direccion: 'Av. Garcilaso 3', habilitado: true },
        { id: 10, nombre: 'CUSCO / LA CONVENCION / SANTA ANA / QUILLABAMBA', lugar_over: 'QUILLABAMBA', departamento: 'CUSCO', provincia: 'LA CONVENCION', direccion: 'Jr. Libertad 4', habilitado: true },
        // San Martín: «SAN MARTIN BELLAVISTA» no debe ganarle al distrito Tarapoto (pasó con una clienta real)
        { id: 11, nombre: 'SAN MARTIN / SAN MARTIN / TARAPOTO / JR. TAHUANTINSUYO', lugar_over: 'JR. TAHUANTINSUYO', departamento: 'SAN MARTIN', provincia: 'SAN MARTIN', direccion: 'Jr. Tahuantinsuyo 158', habilitado: true },
        { id: 12, nombre: 'SAN MARTIN / BELLAVISTA / BELLAVISTA / SAN MARTIN BELLAVISTA', lugar_over: 'SAN MARTIN BELLAVISTA', departamento: 'SAN MARTIN', provincia: 'BELLAVISTA', direccion: 'Jr. Bellavista 1', habilitado: true },
        // La Libertad: 12 agencias en 3 provincias (más de 10 → primero se pregunta la provincia)
        ...Array.from({ length: 12 }, (_, i) => {
          const [prov, dist] = i < 8 ? ['TRUJILLO', i < 5 ? 'TRUJILLO' : 'VICTOR LARCO'] : i < 11 ? ['PACASMAYO', 'PACASMAYO'] : ['CHEPEN', 'CHEPEN'];
          return { id: 100 + i, nombre: `LA LIBERTAD / ${prov} / ${dist} / AGENCIA ${i}`, lugar_over: `AGENCIA ${i}`, departamento: 'LA LIBERTAD', provincia: prov, direccion: `Calle ${i}`, habilitado: true };
        }),
      ];
      const page = Number(url.searchParams.get('page') || 1);
      return json(200, { items: page === 1 ? all.slice(0, 2) : page === 2 ? all.slice(2) : [] });
    }
    if (p === 'shalom/v1/tracking') {
      // Formato real (5 nov): ?numero=&codigo= → { detailed, status: { registrado, origen, transito, demora, destino, entregado, reparto } }
      const num = url.searchParams.get('numero'), cod = url.searchParams.get('codigo');
      if (!num || !cod) return json(400, { error: { code: 'bad_request', message: 'debe enviar numero+codigo, u ose_id' } });
      const llego = num === '20000001';
      return json(200, { detailed: false, status: { registrado: { fecha: '2026-10-30 19:29:17' }, origen: { fecha: '2026-10-30 19:29:17' }, transito: { fecha: '2026-10-31 10:24:35', completo: true }, demora: null, destino: llego ? { fecha: '2026-10-31 12:27:43', completo: true } : null, entregado: null, reparto: null }, degraded_reason: 'sin_credenciales' });
    }
    return json(404, { error: 'ruta no existe' });
  }
  if (p === '111222333444555/events') {
    // Meta: API de conversiones del píxel de la web
    const b = JSON.parse(raw.toString() || '{}');
    if (b.access_token !== 'px-token') return json(400, { error: { message: 'token' } });
    return json(200, { events_received: b.data?.length || 0 });
  }
  if (p === 'tiktok/event/track/') {
    if (req.headers['access-token'] !== 'tt-token') return json(200, { code: 40001, message: 'token' });
    return json(200, { code: 0, message: 'OK' });
  }
  if (p === 'v1/audio/transcriptions') {
    // OpenAI falso: pasa la nota de voz a texto
    if (auth !== 'Bearer oa-test-key') return json(401, { error: { message: 'bad key' } });
    if (!String(req.headers['content-type'] || '').includes('multipart/form-data') || !raw.includes(Buffer.from('gpt-4o-mini-transcribe'))) return json(400, { error: { message: 'falta archivo o modelo' } });
    return json(200, { text: 'Hola, soy talla M y quiero el negro para Los Olivos' });
  }
  if (p === 'oauth/access_token') {
    // Registro insertado: el código de la ventana de Meta se cambia por el token de la tienda
    if (url.searchParams.get('client_id') !== 'APP123' || url.searchParams.get('client_secret') !== SECRET) return json(400, { error: { message: 'bad app' } });
    // Código que Meta solo acepta con el mismo redirect_uri de la ventana (la raíz del dominio)
    if (url.searchParams.get('code') === 'es-code-redirect00') {
      const ru = url.searchParams.get('redirect_uri');
      if (!ru || !/^http:\/\/(localhost|127\.0\.0\.1):\d+\/$/.test(ru)) return json(400, { error: { code: 100, error_subcode: 36008, message: 'Error validating verification code. Please make sure your redirect_uri is identical to the one you used in the OAuth dialog request' } });
      return json(200, { access_token: 'es-token-1', token_type: 'bearer' });
    }
    if (url.searchParams.get('code') !== 'es-code-1234567890') return json(400, { error: { message: 'This authorization code has expired' } });
    return json(200, { access_token: 'es-token-1', token_type: 'bearer' });
  }
  if (auth === 'Bearer es-token-1') {
    if (req.method === 'POST' && p === '770000000001/subscribed_apps') return json(200, { success: true });
    if (req.method === 'POST' && p === '880000000001/register') return json(200, { success: /^\d{6}$/.test(body?.pin || '') });
    if (req.method === 'GET' && p === '880000000001') return json(200, { display_phone_number: '+51 955 000 001', verified_name: 'Tienda Alumna', quality_rating: 'GREEN', id: '880000000001' });
    if (req.method === 'GET' && p === 'debug_token') return json(200, { data: { app_id: 'APP123', expires_at: Math.floor(Date.now() / 1000) + 60 * 86400 } });
    return json(404, { error: { code: 100, message: 'Unknown path ' + p } });
  }
  if (auth !== 'Bearer test-token') return json(401, { error: { code: 190, message: 'Invalid OAuth access token' } });
  if (req.method === 'POST' && p === `${WABA_ID}/dataset`) return json(200, { id: 'DS777' });
  if (req.method === 'POST' && p === 'DS777/events') return json(200, { events_received: body?.data?.length || 0 });
  if (req.method === 'POST' && p === 'APP123/uploads') return json(200, { id: 'upload:abc123' });
  if (req.method === 'GET' && p === `${PHONE_ID}/whatsapp_business_profile`) return json(200, { data: [{ about: 'Hola', vertical: 'APPAREL', websites: ['https://instagram.com/x'], messaging_product: 'whatsapp' }] });
  if (req.method === 'POST' && p === `${PHONE_ID}/whatsapp_business_profile`) return json(200, { success: true });
  if (req.method === 'POST' && p === `${WABA_ID}/message_templates`) return json(200, { id: 'tpl_' + ++seq, status: 'PENDING', category: body.category });
  if (req.method === 'GET' && p === `${WABA_ID}/message_templates` && !url.searchParams.get('name')) {
    return json(200, { data: [
      { name: 'reactivar_clientas', status: 'APPROVED', category: 'MARKETING', language: 'es', components: [{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: 'Hola {{1}} 👋 volvió el color {{2}}. ¿Te lo separo?', example: { body_text: [['María', 'vino']] } }, { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Sí, quiero' }] }] },
      { name: 'en_revision', status: 'PENDING', category: 'UTILITY', language: 'es', components: [{ type: 'BODY', text: 'Tu pedido va en camino.' }] },
    ] });
  }
  if (req.method === 'DELETE' && p === `${WABA_ID}/message_templates`) return json(200, { success: true });
  if (req.method === 'GET' && p === `${WABA_ID}/message_templates`) return json(200, { data: [{ name: url.searchParams.get('name'), status: 'APPROVED', language: 'es' }] });
  if (p.startsWith('file/')) { res.writeHead(200, { 'content-type': 'image/jpeg' }); return res.end(IMG); }
  if (req.method === 'GET' && p === PHONE_ID) return json(200, { display_phone_number: '+51 924 000 111', verified_name: 'Porte Perú', quality_rating: 'GREEN', id: PHONE_ID });
  if (req.method === 'POST' && p === `${WABA_ID}/subscribed_apps`) return json(200, { success: true });
  if (req.method === 'POST' && p.endsWith('/subscribed_apps')) return json(400, { error: { code: 100, message: 'Unsupported post request. Object does not exist' } });
  if (req.method === 'GET' && p === 'debug_token') return json(200, { data: { app_id: 'APP123', granular_scopes: [{ scope: 'whatsapp_business_management', target_ids: ['555', WABA_ID] }] } });
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
  WA_TOKEN: 'test-token', WA_VERIFY_TOKEN: 'verifica123', META_APP_SECRET: SECRET, SETUP_CODE: 'inicio-prueba', ANTHROPIC_API_KEY: 'ia-test-key', SHOPIFY_SECRET: 'shp-secret',
  OPENAI_API: `http://127.0.0.1:${META_PORT}`, OPENAI_API_KEY: 'oa-test-key', META_APP_ID: 'APP123', META_ES_CONFIG: 'CFG1',
  SHALOM_API_BASE: `http://127.0.0.1:${META_PORT}/shalom`, SHALOM_API_KEY: 'sh-test-key',
  META_PIXEL_TOKEN: 'px-token', TIKTOK_EVENTS_TOKEN: 'tt-token', TIKTOK_API: `http://127.0.0.1:${META_PORT}/tiktok`,
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
    assert.equal(l.labels.length, 13);
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
    // Al comprar (COMPRÓ / ✅ PROVINCIA) se quita YAPE PENDIENTE sola
    const yape = labels.find((l) => l.name === 'YAPE PENDIENTE');
    const compro = labels.find((l) => l.name === 'COMPRÓ');
    await call('PUT', `/api/chats/${chatId}/labels/${yape.id}`);
    await call('PUT', `/api/chats/${chatId}/labels/${compro.id}`);
    let lb = (await call('GET', `/api/chats/${chatId}`)).chat.labels;
    assert.ok(lb.includes(compro.id) && !lb.includes(yape.id), 'COMPRÓ quita YAPE PENDIENTE');
    await call('DELETE', `/api/chats/${chatId}/labels/${compro.id}`);
    // Quién está por agendar (etiqueta automática)
    const { pendienteDe } = await import('../src/bot.js');
    const st0 = { order_cfg: '{}' };
    assert.equal(pendienteDe(st0, { destino: 'Lima', distrito: 'San Juan de Lurigancho' }, ''), 'LIMA PENDIENTE');
    assert.equal(pendienteDe(st0, { destino: 'Los Olivos' }, ''), 'LIMA PENDIENTE');
    assert.equal(pendienteDe(st0, { destino: 'Arequipa', distrito: 'Miraflores' }, ''), null, 'Miraflores de Arequipa no es Lima');
    assert.equal(pendienteDe(st0, { destino: 'Lima', distrito: 'Lurín' }, ''), null, 'sin cobertura va por Shalom');
    assert.equal(pendienteDe(st0, { destino: 'Lima' }, ''), null, 'falta el distrito');
    assert.equal(pendienteDe(st0, {}, 'Shalom: 🚚📦\n➡️ Sede: X\nPedido: Leggings\nMonto restante: S/179'), 'YAPE PENDIENTE');
    assert.equal(pendienteDe(st0, {}, 'Envío para: Lima 📦\n➡️ Dirección: Av. 1\nPedido: Leggings'), 'LIMA PENDIENTE');
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
    const cases = { 'M': 'M', 'talla m': 'M', 'Soy M': 'M', '32': 'M', 'mediano': 'M', 'uso talla 30 porfa': 'S', 'small': 'S', '26': 'XS', 'XL': 'XL', '42': 'XL', 'xxl': 'XL', 'largue': 'L', '28 o 31': 'M', 'Hola, quiero info': null, 'sí, me gusta': null, 'precio?': null, 'Kieroven esmol': 'S', 'midium': 'M' };
    for (const [t, v] of Object.entries(cases)) assert.equal(recognize(t, TALLAS), v, t);
    // Seguimiento de la IA según el paso
    const { followText } = await import('../src/bot.js');
    const fx = { ia_follow_text: '¿Te quedó alguna duda, bella?' };
    assert.match(followText(fx, {}), /talla/);
    assert.match(followText(fx, { talla: 'M' }), /colores/);
    assert.match(followText(fx, { talla: 'M', colores: 'Negro' }), /distrito o ciudad/);
    assert.match(followText(fx, { talla: 'M', colores: 'Negro', destino: 'Piura' }), /Nombre y apellido/);
    assert.match(followText(fx, { talla: 'L', destino: 'Huancavelica' }), /colores/, 'sin colores pregunta colores aunque ya dijo su ciudad');
    assert.match(followText(fx, { talla: 'L', colores: 'Negro', destino: 'Lima' }), /En qué distrito/);
    assert.match(followText(fx, { talla: 'L', colores: 'Negro', distrito: 'Comas' }), /Dirección/);
    assert.match(followText(fx, { destino: 'Piura', nombre: 'Ana', dni: '12345678', sede_shalom: 'X' }), /adelanto/);
    assert.equal(followText({ ...fx, ia_follow_auto: 0 }, {}), fx.ia_follow_text);
    assert.equal(followText(fx, {}, { ropa: false }), fx.ia_follow_text);
    const t = Date.UTC(2026, 10, 3, 4, 0); // 11 p. m. en Lima
    assert.equal(new Date(fitWindow(t, 8, 22) - 5 * 3600e3).getUTCHours(), 8);
    assert.equal(fitWindow(t, 8, 22), Date.UTC(2026, 10, 3, 13, 0), 'Lima: 8 a. m. = 13:00 UTC');
    assert.equal(fitWindow(Date.UTC(2026, 10, 3, 12, 0), 8, 22, 'America/Mexico_City'), Date.UTC(2026, 10, 3, 14, 0), 'México: 6 a. m. → 8 a. m.');
    assert.equal(fitWindow(Date.UTC(2026, 10, 3, 15, 0), 8, 22, 'America/Bogota'), Date.UTC(2026, 10, 3, 15, 0), 'dentro del horario no cambia');
    const { entregaDia } = await import('../src/bot.js');
    const L = (d, h) => Date.UTC(2026, 10, d, h + 5, 0); // hora de Lima → UTC
    assert.equal(entregaDia(L(3, 10), 'America/Lima'), 'HOY', 'martes 10 a. m.');
    assert.equal(entregaDia(L(3, 14), 'America/Lima'), 'MAÑANA', 'martes 2 p. m.');
    assert.equal(entregaDia(L(6, 15), 'America/Lima'), 'MAÑANA', 'viernes 3 p. m. → sábado');
    assert.equal(entregaDia(L(7, 10), 'America/Lima'), 'HOY', 'sábado 10 a. m.');
    assert.equal(entregaDia(L(7, 14), 'America/Lima'), 'el LUNES', 'sábado 2 p. m.');
    assert.equal(entregaDia(L(8, 10), 'America/Lima'), 'MAÑANA lunes', 'domingo');
    assert.equal(entregaDia(L(3, 14), 'America/Lima', { corte_h: 15 }), 'HOY', 'corte a las 3 p. m.');
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
    // la pregunta de talla va como texto, sin botones (como en su Botcake: a las clientas no les gustan los botones)
    assert.match(out[2].body, /XS, S, M, L, XL o tu talla de jean/);
    assert.ok(!out[2].extra?.opciones, 'sin botones');
    assert.ok(!calls.some((x) => x.path === `${PHONE_ID}/messages` && x.body?.to === '51911111111' && x.body?.type === 'interactive'));
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
    assert.ok(!/\{(entrega|ahora|etiquetas|yape)\}/.test(sys), 'las llaves se llenan');
    assert.match(sys, /escribe exactamente: (HOY|MAÑANA|MAÑANA lunes|el LUNES) \(/);
    assert.match(sys, /AHORA MISMO/);
    const ia = (await msgsOf(c.id)).filter((m) => m.sender === 'ia');
    assert.equal(ia.length, 2);
    assert.equal(JSON.parse(c.bot_vars).colores, 'Negro');
    const av = await call('GET', `/api/stores/${store.id}/avisos`);
    assert.ok(av.events.some((e) => /tabla-tallas/.test(e.title)), 'avisa que falta un archivo');
  });
  await step('caso especial Yape + sede: pasa a asesora con COMPRÓ y aviso', async () => {
    // Sin captura del pago ni datos: «Yape + sede» no pasa a la asesora
    const c0 = await chatOf('51911111111');
    const nOut = (await call('GET', `/api/chats/${c0.id}/messages`)).messages.length;
    await inbound('51911111111', 'wamid.B3b', 'ya te yapee, sede Shalom Av Brasil');
    await until(async () => ((await call('GET', `/api/chats/${c0.id}/messages`)).messages.length > nOut + 1 ? true : null));
    assert.equal((await chatOf('51911111111')).bot_paused, 0, 'sin captura ni datos sigue el bot');
    // Con datos y la captura: ahora sí pasa a la asesora con COMPRÓ
    await call('PUT', `/api/chats/${c0.id}/datos`, { datos: { ...JSON.parse((await chatOf('51911111111')).bot_vars || '{}'), nombre: 'Ana Pérez', dni: '70000003', sede_shalom: 'Av. Brasil' } });
    await hook(md({ contacts: [{ profile: { name: 'Prueba 111' }, wa_id: '51911111111' }], messages: [{ from: '51911111111', id: 'wamid.B3c', timestamp: ts(), type: 'image', image: { id: 'MEDIA_IMG1', mime_type: 'image/jpeg' } }] }));
    await wait(1500);
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
  await step('dos mensajes seguidos: una sola respuesta de la IA (sin «Estamos validando») y talla reconocida', async () => {
    await call('PATCH', `/api/stores/${store.id}/bot/settings`, { test_numbers: '911111111, 911111112, 911111113, 911111114, 911111115, 911111116' });
    await inbound('51911111116', 'wamid.G1', 'hola', { referral: { source_id: '1', source_type: 'ad', ctwa_clid: 'g' } });
    await until(async () => (await chatOf('51911111116'))?.bot_node === 'talla');
    const n = iaCalls.length;
    await inbound('51911111116', 'wamid.G2', 'pecio, lento');
    await new Promise((r) => setTimeout(r, 900));
    await inbound('51911111116', 'wamid.G3', 'M');
    let c = await until(async () => { const c = await chatOf('51911111116'); return c?.bot_node === 'bucle' && c.bot_wait === 1 ? c : null; });
    await new Promise((r) => setTimeout(r, 3000));
    c = await chatOf('51911111116');
    const ms = await msgsOf(c.id);
    assert.ok(!ms.some((m) => /Estamos validando/.test(m.body || '')), 'no se cruzan las respuestas');
    assert.equal(c.bot_paused, 0);
    const rounds = iaCalls.slice(n);
    assert.ok(rounds.some((b) => !/TALLA YA/.test(b.system)) && /TALLA YA/.test(rounds[rounds.length - 1].system), 'la primera respuesta se descarta y se piensa de nuevo con los dos mensajes');
    const iaMsgs = ms.filter((m) => m.sender === 'ia').map((m) => m.body);
    assert.equal(new Set(iaMsgs).size, iaMsgs.length, 'responde una sola vez: ' + JSON.stringify(iaMsgs));
    const sys = iaCalls[iaCalls.length - 1].system;
    assert.match(sys, /TALLA YA ELEGIDA: M/);
    assert.match(sys, /esta vez son 2/);
    assert.equal(JSON.parse(c.bot_vars).talla, 'M');
    // «Seguir»: con el bot en pausa la clienta escribe; al tocar Seguir, la IA contesta lo pendiente
    await call('POST', `/api/chats/${c.id}/bot`, { action: 'pause' });
    await inbound('51911111116', 'wamid.G4', '¿hacen envíos a provincia?');
    await new Promise((r) => setTimeout(r, 1200));
    const before = (await msgsOf(c.id)).filter((m) => m.sender === 'ia').length;
    const r = await call('POST', `/api/chats/${c.id}/bot`, { action: 'resume' });
    assert.equal(r.respondio, true, JSON.stringify(r));
    await until(async () => (await msgsOf(c.id)).filter((m) => m.sender === 'ia').length > before);
    assert.equal((await chatOf('51911111116')).bot_paused, 0);
    await until(async () => { const x = await chatOf('51911111116'); return x?.bot_wait === 1; });
    await new Promise((r) => setTimeout(r, 2500)); // que termine de mandar antes de la siguiente prueba
  });
  await step('la clienta escribe justo entre dos burbujas de la IA: se le responde (sin «Estamos validando»); IA saturada se reintenta', async () => {
    await call('PATCH', `/api/stores/${store.id}/bot/settings`, { test_numbers: '911111111, 911111112, 911111113, 911111114, 911111115, 911111116, 911111119' });
    await inbound('51911111119', 'wamid.Z1', 'hola', { referral: { source_id: '1', source_type: 'ad', ctwa_clid: 'w' } });
    let c = await until(async () => { const x = await chatOf('51911111119'); return x?.bot_node === 'talla' ? x : null; });
    await inbound('51911111119', 'wamid.Z2', 'M');
    await until(async () => (await chatOf('51911111119'))?.bot_wait === 1);
    const n = iaCalls.length;
    await inbound('51911111119', 'wamid.Z3', 'quiero el negro lento');
    // apenas sale la 1a burbuja de la IA, la clienta escribe otra vez
    const ia0 = (await msgsOf(c.id)).filter((m) => m.sender === 'ia').length;
    for (let t = 0; t < 200 && (await msgsOf(c.id)).filter((m) => m.sender === 'ia').length <= ia0; t++) await new Promise((r) => setTimeout(r, 40));
    await inbound('51911111119', 'wamid.Z4', 'Sede verdad');
    await new Promise((r) => setTimeout(r, 6000));
    console.log('    (entre burbujas:', iaCalls.slice(n).some((b) => /escribió mientras le respondías/.test(JSON.stringify(b.messages))), ')');
    c = await chatOf('51911111119');
    const ms = await msgsOf(c.id);
    assert.ok(!ms.some((m) => /Estamos validando/.test(m.body || '')), 'no sale «Estamos validando»: ' + JSON.stringify(ms.map((m) => m.body)));
    assert.equal(c.bot_paused, 0);
    assert.ok(iaCalls.slice(n).every((b) => b.messages[b.messages.length - 1].role === 'user'), 'la conversación siempre termina en la clienta');
    // IA saturada (529) una vez: se reintenta solo y responde
    const before = (await msgsOf(c.id)).filter((m) => m.sender === 'ia').length;
    await inbound('51911111119', 'wamid.Z5', 'sobrecarga ¿llega mañana?');
    await until(async () => (await msgsOf(c.id)).filter((m) => m.sender === 'ia').length > before);
    assert.ok(!(await msgsOf(c.id)).some((m) => /Estamos validando/.test(m.body || '')));
    await new Promise((r) => setTimeout(r, 2500));
  });
  await step('la clienta escribe mientras el bot manda la foto y los precios: no se pierde su mensaje', async () => {
    await call('PATCH', `/api/stores/${store.id}/bot/settings`, { test_numbers: '911111111, 911111112, 911111113, 911111114, 911111115, 911111116, 911111120' });
    const n = iaCalls.length;
    await inbound('51911111120', 'wamid.Y1', 'hola', { referral: { source_id: '1', source_type: 'ad', ctwa_clid: 'y' } });
    await new Promise((r) => setTimeout(r, 250));
    await inbound('51911111120', 'wamid.Y2', 'cuanto cuesta 3??');
    await until(async () => iaCalls.slice(n).some((b) => /cuanto cuesta 3/.test(JSON.stringify(b.messages))), 20000);
    const c = await until(async () => { const x = await chatOf('51911111120'); return x?.bot_node === 'bucle' && x.bot_wait === 1 ? x : null; });
    const ms = await msgsOf(c.id);
    assert.equal(ms.filter((m) => /Qué talla usas/.test(m.body || '')).length, 1, 'la pregunta de talla sale una vez');
    assert.equal(iaCalls.slice(n).filter((b) => /cuanto cuesta 3/.test(JSON.stringify(b.messages))).length >= 1, true);
    await new Promise((r) => setTimeout(r, 1500));
  });
  await step('clienta que vuelve por un anuncio nuevo: el bot la atiende otra vez; talla en el 1er mensaje; Yape tras el formulario', async () => {
    await call('PATCH', `/api/stores/${store.id}/bot/settings`, { test_numbers: '911111111, 911111112, 911111113, 911111114, 911111115, 911111116, 911111117, 911111118' });
    const ad = { referral: { source_id: '2', source_type: 'ad', ctwa_clid: 'v' } };
    await inbound('51911111117', 'wamid.V1', 'hola', ad);
    let c = await until(async () => { const x = await chatOf('51911111117'); return x?.bot_node === 'talla' ? x : null; });
    await call('POST', `/api/chats/${c.id}/bot`, { action: 'pause' });
    // Vuelve desde otro anuncio sin haber avanzado: empieza de nuevo (antes, en Botcake, nadie le contestaba)
    await inbound('51911111117', 'wamid.V2', 'Deseo mis pantalones formales', ad);
    c = await until(async () => { const x = await chatOf('51911111117'); return x?.bot_paused === 0 && x.bot_node === 'talla' ? x : null; });
    const prec = (await msgsOf(c.id)).filter((m) => m.sender === 'bot' && /Pantalón Formal Stretch/.test(m.body || ''));
    assert.equal(prec.length, 2, 'se le vuelve a presentar el producto');
    // Avanza (talla M), la asesora la pausa y vuelve desde otro anuncio: la IA la retoma con lo que ya eligió
    await inbound('51911111117', 'wamid.V3', 'M');
    await until(async () => (await chatOf('51911111117'))?.bot_node === 'colores');
    await call('POST', `/api/chats/${c.id}/bot`, { action: 'pause' });
    const n = iaCalls.length;
    await inbound('51911111117', 'wamid.V4', 'Deseo mis pantalones formales', ad);
    await until(async () => iaCalls.length > n);
    assert.match(iaCalls[iaCalls.length - 1].system, /VOLVIÓ DESDE UN ANUNCIO NUEVO/);
    c = await until(async () => { const x = await chatOf('51911111117'); return x?.bot_wait === 1 && x.bot_node === 'bucle' ? x : null; });
    assert.equal(c.bot_paused, 0);
    assert.ok(!('__volvio' in JSON.parse(c.bot_vars)), 'la marca temporal no queda en sus datos');
    // Formulario de Shalom sin Yape: el sistema agrega el mensaje de pago
    await inbound('51911111117', 'wamid.V5', 'formshalom');
    await until(async () => (await msgsOf(c.id)).some((m) => /999 111 222/.test(m.body || '')));
    const pago = (await msgsOf(c.id)).filter((m) => /999 111 222/.test(m.body || ''));
    assert.equal(pago.length, 1);
    assert.match(pago[0].body, /Prueba Titular/);
    // El primer mensaje ya trae la talla: no se le pregunta, pasa directo a sus colores
    await inbound('51911111118', 'wamid.W1', 'precio y colores en talla L', ad);
    const w = await until(async () => { const x = await chatOf('51911111118'); return x?.bot_node === 'colores' ? x : null; });
    assert.equal(JSON.parse(w.bot_vars).talla, 'L');
    assert.ok(!(await msgsOf(w.id)).some((m) => /Qué talla usas/.test(m.body || '')), 'no se pregunta la talla');
    await new Promise((r) => setTimeout(r, 1500));
    await call('POST', `/api/stores/${store.id}/avisos/read`, {}); // avisos de archivos que faltan en esta prueba
    // 👍 al mensaje de la IA mientras el bot espera su respuesta = «sí»
    const ia = (await msgsOf(c.id)).filter((m) => m.sender === 'ia' && m.wamid).pop();
    const nIA = iaCalls.length;
    await hook(md({ messages: [{ from: '51911111117', id: 'wamid.RX1', timestamp: ts(), type: 'reaction', reaction: { message_id: ia.wamid, emoji: '👍' } }] }));
    await until(async () => iaCalls.length > nIA);
    assert.ok((await msgsOf(c.id)).some((m) => m.direction === 'in' && m.body === 'Sí 👍'), 'la reacción entra como «Sí 👍»');
    await until(async () => (await chatOf('51911111117'))?.bot_wait === 1);
    // Embudo: cuenta las conversaciones nuevas y hasta dónde llegaron
    const hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
    const emb = await call('GET', `/api/stores/${store.id}/embudo?desde=${hoy}&hasta=${hoy}`);
    assert.equal(emb.etapas[0].key, 'llegaron');
    assert.ok(emb.etapas[0].n >= 2, JSON.stringify(emb.etapas.map((x) => [x.key, x.n])));
    assert.ok(emb.etapas.find((x) => x.key === 'talla').n >= 2, 'las que dieron talla');
    assert.ok(emb.etapas.every((x, i, a) => !i || x.n <= a[i - 1].n), 'el embudo nunca sube');
    const st = emb.etapas.find((x) => x.quedaron);
    assert.ok(st.chats.length, 'muestra los chats que se quedaron');
    assert.ok(Array.isArray(emb.seguimientos));
    const soloAd = await call('GET', `/api/stores/${store.id}/embudo?desde=${hoy}&hasta=${hoy}&ad=sin`);
    assert.ok(soloAd.etapas[0].n < emb.etapas[0].n, 'filtra por anuncio');
  });
  await step('plantilla «Ventas leggings cargo»: talla 38+ es L y su prompt reemplaza al de pantalón', async () => {
    const { flowCargo, PROMPT_CARGO, TALLAS_CARGO } = await import('../src/bot-template.js');
    const { recognize } = await import('../src/bot.js');
    assert.equal(recognize('talla 40', TALLAS_CARGO), 'L');
    assert.equal(recognize('mi talla de jean es 33', TALLAS_CARGO), 'M');
    assert.equal(recognize('T 30', TALLAS_CARGO), 'S');
    assert.equal(recognize('talla 27', TALLAS_CARGO), 'XS');
    assert.equal(recognize('31', TALLAS_CARGO), 'M');
    assert.equal(recognize('mi jean es 34', TALLAS_CARGO), 'L');
    assert.equal(recognize('XS', TALLAS_CARGO), 'XS');
    assert.equal(recognize('S', TALLAS_CARGO), 'S');
    assert.ok(!/pantal[oó]n(?! formal stretch)/i.test(PROMPT_CARGO.replace(/Pantalón Formal/g, '')), 'el prompt del cargo no habla de pantalón');
    assert.match(PROMPT_CARGO, /\{yape\}/);
    assert.match(PROMPT_CARGO, /Confírmame con un \*SÍ\* si tus datos están correctos/);
    assert.match(PROMPT_CARGO, /Mensaje 1: "¡Genial! 🛵 A \[distrito\] te lo llevamos \[HOY\/MAÑANA\] con nuestro motorizado, entre 2 y 8 p\.m\."\nMensaje 2: "Delivery GRATIS/);
    assert.ok(!/\d{3} \d{3} \d{3}/.test(PROMPT_CARGO), 'sin números de pago en el código');
    const g = flowCargo();
    assert.deepEqual(g.nodes.find((x) => x.id === 'inicio').trigger.keywords, ['Deseo mis Leggins Cargo', 'Deseo mis Leggings Cargo']);
    const prec = g.nodes.find((x) => x.id === 'precios').items.find((i) => i.text).text;
    assert.match(prec, /3 leggings: S\/209\n⭐ La más elegida/);
    assert.ok(!/69\.67/.test(prec), 'sin precio por unidad en la línea de 3');
    const antes = (await call('GET', `/api/stores/${store.id}/bot`)).settings?.ia_prompt;
    const r = await call('POST', `/api/stores/${store.id}/bot/flows`, { template: 'cargo' });
    assert.ok(r.id, JSON.stringify(r));
    const f = await call('GET', `/api/bot/flows/${r.id}`);
    assert.equal(f.flow.name, 'Ventas leggings cargo');
    assert.equal(f.flow.active, 0, 'nace apagado');
    await call('DELETE', `/api/bot/flows/${r.id}`);
    await call('PATCH', `/api/stores/${store.id}/bot/settings`, { ia_prompt: antes ?? null });
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
    assert.ok(s.jobs.length && s.jobs.every((j) => /Seguimiento colores/.test(j.label)), 'al responder se cancela el de talla y empieza el de colores: ' + JSON.stringify(s.jobs));
    s = await call('POST', `/api/stores/${store.id}/sim/send`, { text: 'me gusta el negro' });
    assert.ok(!s.jobs.some((j) => /Seguimiento colores/.test(j.label)), 'eligió colores: se cancela el seguimiento de colores');
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
    assert.equal(f.stats.precios.sent, 10, 'los números por bloque no cuentan el simulador');
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
  await step('entregas en Lima: hora de corte y días se guardan', async () => {
    const r = await call('PATCH', `/api/stores/${store.id}/bot/settings`, { corte_h: 14, entrega_sab: false, entrega_horario: 'de 3 a 9 p.m.' });
    assert.equal(r.settings.corte_h, 14);
    assert.equal(r.settings.entrega_sab, 0);
    assert.equal(r.settings.entrega_horario, 'de 3 a 9 p.m.');
    const b = await call('GET', `/api/stores/${store.id}/bot`);
    assert.ok(b.prompt_vars.some(([k]) => k === 'entrega'));
    assert.match(b.entrega_ahora, /HOY|MAÑANA|LUNES|MARTES/);
    await call('PATCH', `/api/stores/${store.id}/bot/settings`, { corte_h: 13, entrega_sab: true, entrega_horario: 'entre 2 y 8 p.m.' });
  });
  console.log('Pedidos y Shopify');
  const shopHook = async (topic, obj, secret = 'shp-secret', url) => {
    const raw = JSON.stringify(obj);
    const h = crypto.createHmac('sha256', secret).update(raw).digest('base64');
    return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-shopify-topic': topic, 'x-shopify-hmac-sha256': h }, body: raw });
  };
  let shopUrl, limaOrder;
  await step('la IA dejó el pedido armado cuando la clienta yapeó (agencia)', async () => {
    const c = await chatOf('51911111111');
    const r = await call('GET', `/api/chats/${c.id}/pedidos`);
    assert.equal(r.pedidos.length, 1, JSON.stringify(r));
    const o = r.pedidos[0];
    assert.equal(o.source, 'ia');
    assert.equal(o.modo, 'agencia');
    assert.equal(o.status, 'por_pagar');
    assert.equal(o.sede, 'Av. Brasil');
    assert.equal(o.adelanto, 30);
    assert.equal(o.items[0].talla, 'S');
    assert.equal(o.items[0].color, 'Negro');
  });
  await step('pedido manual de Lima: precio por cantidad, día de entrega y copiar orden', async () => {
    const c = await chatOf('51911111112');
    const d = await call('GET', `/api/chats/${c.id}/pedido-borrador`);
    assert.equal(d.borrador.celular, '51911111112');
    // Ficha del chat: «Copiar formulario» arma el formulario completo
    const fm = await call('GET', `/api/chats/${c.id}/formulario`);
    assert.equal(fm.status, 200, JSON.stringify(fm));
    assert.match(fm.texto, /➡️ Nombre:/);
    assert.match(fm.texto, /Monto total:/);
    const { varsFromForm, colorQty, itemsFromVars, formText } = await import('../src/orders.js');
    const vf = varsFromForm('Shalom: 🚚📦\n\n➡️ Nombre: Ana Ruiz\n➡️ DNI: 45678912\n➡️ CEL: 912345678\n➡️ Sede: [sede elegida]\n\nPedido: Vestido ✨\n✅ Cantidad: 3\n✅ Talla: M\n✅ Color: 2 Vino, Celeste bebé');
    assert.equal(vf.dni, '45678912');
    assert.equal(vf.colores, '2 Vino, Celeste bebé');
    assert.equal(vf.sede_shalom, undefined, 'un hueco [..] no es dato');
    assert.deepEqual(colorQty('2 Vino, celeste bebe', ['Negro', 'Vino', 'Celeste bebé']), [{ color: 'Vino', n: 2 }, { color: 'Celeste bebé', n: 1 }], 'colores propios de la tienda y cantidades');
    const its = itemsFromVars({ colores: '2 Vino y Negro', talla: 'M' }, { producto: 'Vestido' });
    assert.deepEqual(its.map((i) => [i.color, i.cantidad]), [['Vino', 2], ['Negro', 1]]);
    assert.match(formText({ modo: 'agencia', nombre: 'Ana', dni: '1', celular: '51912345678', sede: 'X', items: its, total: 175, adelanto: 30 }, { producto: 'Vestido' }), /Color: 2 Vino, Negro[\s\S]*Adelanto: S\/30[\s\S]*Monto restante: S\/145/);
    let r = await call('POST', `/api/stores/${store.id}/pedidos`, { chat_id: c.id, modo: 'lima', nombre: 'Ana Pérez', celular: '911111112', distrito: 'Surco', direccion: 'Av. Primavera 123', items: [{ talla: 'M', color: 'Negro', cantidad: 1 }, { talla: 'M', color: 'Vino', cantidad: 1 }] });
    assert.equal(r.status, 200, JSON.stringify(r));
    limaOrder = r.pedido;
    assert.equal(limaOrder.total, 139);
    assert.equal(limaOrder.status, 'nuevo');
    assert.equal(limaOrder.celular, '51911111112');
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(limaOrder.entrega));
    assert.equal(limaOrder.number, 2);
    r = await call('GET', `/api/pedidos/${limaOrder.id}`);
    assert.ok(r.texto, JSON.stringify(r));
    assert.match(r.texto, /✅ AGENDADO · Pedido #2/);
    assert.match(r.texto, /Surco/);
    assert.equal((await call('PATCH', `/api/pedidos/${limaOrder.id}`, { status: 'recogido' })).status, 400, 'estado de agencia no vale en Lima');
  });
  await step('Compra a Meta: se avisa con el anuncio de origen, una sola vez', async () => {
    let r = await call('PATCH', `/api/stores/${store.id}/capi`, { on: true });
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.equal(r.capi.on, true);
    assert.equal(r.capi.dataset, 'DS777');
    // clienta que llegó por anuncio (tiene ctwa_clid) → Purchase con su valor
    r = await call('POST', `/api/stores/${store.id}/pedidos`, { chat_id: botChat.id, modo: 'lima', nombre: 'Prueba Meta', distrito: 'Lince', direccion: 'Av. 1', items: [{ talla: 'S', color: 'Negro', cantidad: 1 }], forzar: true });
    const ev = await until(async () => calls.find((x) => x.path === 'DS777/events' && x.body?.data?.[0]?.custom_data?.value === r.pedido.total));
    const d = ev.body.data[0];
    assert.equal(d.event_name, 'Purchase');
    assert.equal(d.action_source, 'business_messaging');
    assert.equal(d.messaging_channel, 'whatsapp');
    assert.equal(d.user_data.ctwa_clid, 'abc');
    assert.equal(d.user_data.whatsapp_business_account_id, WABA_ID);
    assert.equal(d.custom_data.currency, 'PEN');
    await until(async () => (await call('GET', `/api/pedidos/${r.pedido.id}`)).events.some((e) => /Compra avisada a Meta/.test(e.detail)));
    // clienta sin anuncio → no se manda
    const before = calls.filter((x) => x.path === 'DS777/events').length;
    const c2 = (await call('GET', `/api/stores/${store.id}/chats?limit=200`)).chats.find((x) => !x.ad_id);
    const r2 = await call('POST', `/api/stores/${store.id}/pedidos`, { chat_id: c2.id, modo: 'lima', nombre: 'Sin anuncio', distrito: 'Lince', direccion: 'Av. 2', items: [{ talla: 'S', color: 'Negro', cantidad: 1 }], forzar: true });
    await until(async () => (await call('GET', `/api/pedidos/${r2.pedido.id}`)).events.some((e) => /no llegó por un anuncio/.test(e.detail)));
    assert.equal(calls.filter((x) => x.path === 'DS777/events').length, before);
    const cfg = await call('GET', `/api/stores/${store.id}/pedidos-config`);
    assert.equal(cfg.capi.last.ok, true);
    // se borran para no cambiar las cuentas de las pruebas siguientes
    for (const id of [r.pedido.id, r2.pedido.id]) assert.equal((await call('DELETE', `/api/pedidos/${id}`)).ok, true);
    assert.equal((await call('PATCH', `/api/stores/${store.id}/capi`, { on: false })).capi.on, false);
  });
  await step('mensajes por estado: apagados no salen; encendidos salen gratis en la ventana', async () => {
    const before = calls.filter((x) => x.path === `${PHONE_ID}/messages`).length;
    await call('PATCH', `/api/pedidos/${limaOrder.id}`, { status: 'confirmado' });
    assert.equal(calls.filter((x) => x.path === `${PHONE_ID}/messages`).length, before, 'apagado no manda');
    const a = await call('PATCH', `/api/stores/${store.id}/autos/en_ruta`, { on: true });
    assert.equal(a.auto.on, true);
    const r = await call('PATCH', `/api/pedidos/${limaOrder.id}`, { status: 'en_ruta' });
    assert.equal(r.pedido.status, 'en_ruta');
    const sent = calls.filter((x) => x.path === `${PHONE_ID}/messages`).pop();
    assert.equal(sent.body.type, 'text');
    assert.match(sent.body.text.body, /en camino/);
    assert.match(sent.body.text.body, /S\/139/);
    const ev = await call('GET', `/api/pedidos/${limaOrder.id}`);
    assert.ok(ev.events.some((e) => /Se mandó «En ruta»/.test(e.detail)));
    const dup = await call('POST', `/api/pedidos/${limaOrder.id}/duplicar`);
    assert.equal(dup.pedido.number, 3);
    assert.equal(dup.pedido.status, 'nuevo');
    assert.match(dup.pedido.notas, /Recompra del pedido #2/);
    const list = await call('GET', `/api/stores/${store.id}/pedidos?grupo=lima`);
    assert.ok(list.pedidos.length >= 2 && list.dias.length === 14);
    assert.equal(list.estados.en_ruta.n, 1);
  });
  await step('Shopify: enlace, firma y pedido que entra solo (Lima → confirmar)', async () => {
    // tienda por mensajes: no hay enlace de Shopify; se cambia a «Por Shopify» en General
    const me0 = await call('GET', '/api/me');
    assert.equal(me0.stores.find((x) => x.id === store.id).canal, 'mensajes');
    assert.equal((await call('POST', `/api/stores/${store.id}/shopify/enlace`)).status, 400);
    assert.equal((await call('PATCH', `/api/stores/${store.id}`, { canal: 'web' })).status, 400);
    const ch = await call('PATCH', `/api/stores/${store.id}`, { canal: 'shopify' });
    assert.equal(ch.stores.find((x) => x.id === store.id).canal, 'shopify');
    const r = await call('POST', `/api/stores/${store.id}/shopify/enlace`);
    shopUrl = r.shopify.url.replace(/^https?:\/\/[^/]+/, BASE);
    assert.ok(r.shopify.secret_ok);
    await call('PATCH', `/api/stores/${store.id}/autos/confirmar`, { on: true });
    const order = { id: 5551, name: '#1001', total_price: '175.00', phone: '+51 917 777 777', note: 'Tocar timbre', checkout_token: 'ck1',
      shipping_address: { first_name: 'Rosa', last_name: 'Díaz', phone: '917777777', address1: 'Jr. Lima 456', city: 'Miraflores', province: 'Lima', company: '45678912' },
      line_items: [{ title: 'Pantalón formal', variant_title: 'L / Gris oscuro', quantity: 3, price: '58.33' }] };
    assert.equal((await shopHook('orders/create', order, 'mala', shopUrl)).status, 401);
    assert.equal((await shopHook('orders/create', order, 'shp-secret', shopUrl)).status, 200);
    const o = await until(async () => (await call('GET', `/api/stores/${store.id}/pedidos?q=Rosa`)).pedidos[0]);
    assert.equal(o.source, 'shopify');
    assert.equal(o.ext_name, '#1001');
    assert.equal(o.modo, 'lima');
    assert.equal(o.distrito, 'Miraflores');
    assert.equal(o.celular, '51917777777');
    assert.deepEqual([o.items[0].talla, o.items[0].color, o.items[0].cantidad], ['L', 'Gris oscuro', 3]);
    assert.equal(o.total, 175);
    await shopHook('orders/create', order, 'shp-secret', shopUrl);
    await wait(800);
    assert.equal((await call('GET', `/api/stores/${store.id}/pedidos?q=Rosa`)).pedidos.length, 1, 'no se duplica');
    // Clienta nueva: ventana cerrada y sin plantilla → aviso, no se manda nada
    await wait(1500);
    const avx = await call('GET', `/api/stores/${store.id}/avisos`);
    assert.ok(avx.events.some((e) => /No se mandó «Confirmar pedido contra entrega \(Lima\)» del pedido/.test(e.title)), JSON.stringify(avx.events.slice(0, 4).map((e) => e.title + ' :: ' + e.body)));
  });
  await step('plantilla de Meta: se pide, se aprueba y el siguiente pedido sale con plantilla', async () => {
    let r = await call('POST', `/api/stores/${store.id}/autos/confirmar/plantilla`);
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.equal(r.auto.tpl_status, 'PENDING');
    const created = calls.filter((x) => x.path === `${WABA_ID}/message_templates` && x.method === 'POST').pop();
    assert.equal(created.body.category, 'UTILITY');
    assert.match(created.body.components[0].text, /\{\{1\}\}/);
    assert.deepEqual(created.body.components[1].buttons.map((b) => b.text), ['Sí, confirmo', 'No']);
    r = await call('POST', `/api/stores/${store.id}/autos/sync`);
    assert.equal(r.autos.find((a) => a.key === 'confirmar').tpl_status, 'APPROVED');
    await shopHook('orders/create', { id: 5552, name: '#1002', total_price: '89.00', shipping_address: { first_name: 'Luz', phone: '912345678', address1: 'Calle 1', city: 'Comas', province: 'Lima' }, line_items: [{ title: 'Pantalón formal', variant_title: 'S / Negro', quantity: 1 }] }, 'shp-secret', shopUrl);
    const sent = await until(() => calls.filter((x) => x.path === `${PHONE_ID}/messages` && x.body?.type === 'template').pop());
    assert.equal(sent.body.to, '51912345678');
    assert.equal(sent.body.template.name, created.body.name);
    assert.ok(sent.body.template.components[0].parameters.some((p) => p.text === 'Luz'), JSON.stringify(sent.body.template.components[0].parameters));
    assert.ok(sent.body.template.components[0].parameters.every((p) => String(p.text).trim()), 'sin variables vacías');
    // Meta la rechaza por el pago (131042) → «Reintentar» vuelve a mandar la MISMA plantilla aunque la ventana esté cerrada
    const lc = await until(async () => (await call('GET', `/api/stores/${store.id}/chats?q=Luz`)).chats?.[0]);
    const tmsg = await until(async () => (await call('GET', `/api/chats/${lc.id}/messages?limit=20`)).messages.find((m) => m.extra?.template && m.wamid));
    await hook(md({ statuses: [{ id: tmsg.wamid, status: 'failed', timestamp: ts(), recipient_id: '51912345678', errors: [{ code: 131042, title: 'Business eligibility payment issue' }] }] }));
    await until(async () => (await call('GET', `/api/chats/${lc.id}/messages?limit=20`)).messages.find((m) => m.id === tmsg.id && m.status === 'failed'));
    const nTpl = calls.filter((x) => x.path === `${PHONE_ID}/messages` && x.body?.type === 'template').length;
    const rr = await call('POST', `/api/messages/${tmsg.id}/retry`);
    assert.equal(rr.message.status, 'sent', JSON.stringify(rr));
    assert.equal(calls.filter((x) => x.path === `${PHONE_ID}/messages` && x.body?.type === 'template').length, nTpl + 1, 'se volvió a mandar la plantilla');
    // Pedir otra plantilla (texto nuevo): mientras Meta la revisa, los avisos siguen saliendo con la aprobada
    const oldTpl = rr.message.extra?.template || tmsg.extra.template;
    const np = await call('POST', `/api/stores/${store.id}/autos/confirmar/plantilla`);
    assert.equal(np.auto.tpl_status, 'PENDING');
    assert.equal(np.auto.tpl_prev?.name, oldTpl);
    const newTpl = calls.filter((x) => x.path === `${WABA_ID}/message_templates` && x.method === 'POST').pop();
    assert.ok(/\n\n\*¿Confirmas que te llegue \{\{\d+\}\} de 2 a 8 p\.m\.\?\*/.test(newTpl.body.components[0].text), newTpl.body.components[0].text);
    await hook(md({ statuses: [{ id: (await call('GET', `/api/chats/${lc.id}/messages?limit=20`)).messages.find((m) => m.id === tmsg.id).wamid, status: 'failed', timestamp: ts(), recipient_id: '51912345678', errors: [{ code: 131042 }] }] }));
    await until(async () => (await call('GET', `/api/chats/${lc.id}/messages?limit=20`)).messages.find((m) => m.id === tmsg.id && m.status === 'failed'));
    const rr2 = await call('POST', `/api/messages/${tmsg.id}/retry`);
    assert.equal(rr2.message.status, 'sent', JSON.stringify(rr2));
    assert.equal(calls.filter((x) => x.path === `${PHONE_ID}/messages` && x.body?.type === 'template').pop().body.template.name, oldTpl, 'usa la aprobada mientras la nueva está en revisión');
    await call('POST', `/api/stores/${store.id}/autos/sync`);
  });
  await step('la clienta toca «Sí, confirmo» y el pedido queda Confirmado', async () => {
    const o = (await call('GET', `/api/stores/${store.id}/pedidos?q=Luz`)).pedidos[0];
    assert.equal(o.status, 'nuevo');
    // compra confirmada a los píxeles de Meta y TikTok (solo al quedar 100% confirmado)
    const bad = await call('PATCH', `/api/stores/${store.id}/conversiones`, { meta_pixel: 'abc' });
    assert.equal(bad.status, 400);
    const cv = await call('PATCH', `/api/stores/${store.id}/conversiones`, { meta_pixel: '111222333444555', tiktok_pixel: 'CABC123DEF456GHI789' });
    assert.equal(cv.conv.meta_token, true);
    assert.equal(calls.filter((x) => x.path === '111222333444555/events').length, 0, 'al crear el pedido todavía no');
    await hook(md({ contacts: [{ profile: { name: 'Luz' }, wa_id: '51912345678' }], messages: [{ from: '51912345678', id: 'wamid.BTN1', timestamp: ts(), type: 'button', button: { text: 'Sí, confirmo', payload: 'Sí, confirmo' } }] }));
    const ok = await until(async () => { const x = (await call('GET', `/api/stores/${store.id}/pedidos?q=Luz`)).pedidos[0]; return x.status === 'confirmado' ? x : null; });
    assert.equal(ok.status, 'confirmado');
    const pe = await until(() => calls.find((x) => x.path === '111222333444555/events'));
    assert.equal(pe.body.data[0].event_name, 'CompraConfirmada');
    assert.equal(pe.body.data[0].custom_data.value, 89);
    assert.ok(/^[0-9a-f]{64}$/.test(pe.body.data[0].user_data.ph[0]));
    const te = await until(() => calls.find((x) => x.path === 'tiktok/event/track/'));
    assert.equal(te.body.event_source_id, 'CABC123DEF456GHI789');
    assert.equal(te.body.data[0].properties.currency, 'PEN');
    assert.ok((await until(async () => (await call('GET', `/api/stores/${store.id}/pedidos-config`)).conv.last)).ok);
    // y con el botón del mensaje gratis (ord:edit) pasa a asesora
    await hook(md({ contacts: [{ profile: { name: 'Luz' }, wa_id: '51912345678' }], messages: [{ from: '51912345678', id: 'wamid.BTN2', timestamp: ts(), type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: `ord:edit:${ok.id}`, title: 'Cambiar algo' } } }] }));
    const c = await until(async () => { const x = await chatOf('51912345678'); return x?.bot_paused === 1 ? x : null; });
    assert.equal(c.handler, 'asesora');
  });
  await step('Shopify: si dijo «No» y luego toca «Sí», no se confirma solo (lo revisa el equipo)', async () => {
    await shopHook('orders/create', { id: 5554, name: '#1004', total_price: '169.00', shipping_address: { first_name: 'Carmen', last_name: 'Calsin', phone: '967856123', address1: 'Urb. María Auxiliadora', city: 'San Juan de Miraflores', province: 'Lima' }, line_items: [{ title: 'Leggings Cargo', variant_title: 'M / Negro', quantity: 2 }] }, 'shp-secret', shopUrl);
    const o = await until(async () => (await call('GET', `/api/stores/${store.id}/pedidos?q=Carmen`)).pedidos[0]);
    await until(() => calls.some((x) => x.path === `${PHONE_ID}/messages` && x.body?.to === '51967856123' && x.body?.type === 'template'));
    const btn = (id, text) => hook(md({ contacts: [{ profile: { name: 'Carmen' }, wa_id: '51967856123' }], messages: [{ from: '51967856123', id, timestamp: ts(), type: 'button', button: { text, payload: text } }] }));
    await btn('wamid.CN1', 'No');
    await until(async () => (await chatOf('51967856123'))?.bot_paused === 1);
    await btn('wamid.CN2', 'Sí, confirmo');
    await until(() => calls.some((x) => x.body?.to === '51967856123' && /asesora revisa tu pedido/.test(x.body?.text?.body || '')));
    const x = (await call('GET', `/api/pedidos/${o.id}`)).pedido;
    assert.equal(x.status, 'nuevo', 'no se confirmó solo');
    await shopHook('orders/cancelled', { id: 5554, cancelled_at: new Date().toISOString() }, 'shp-secret', shopUrl);
    await until(async () => (await call('GET', `/api/pedidos/${o.id}`)).pedido.status === 'cancelado');
  });
  await step('Shopify provincia: confirma con botones y el bot pide DNI → agencia → adelanto; captura a Pagos; gasto de WhatsApp', async () => {
    await call('PATCH', `/api/stores/${store.id}/autos/confirmar_agencia`, { on: true });
    let r = await call('POST', `/api/stores/${store.id}/autos/confirmar_agencia/plantilla`);
    assert.equal(r.status, 200, JSON.stringify(r));
    const created = calls.filter((x) => x.path === `${WABA_ID}/message_templates` && x.method === 'POST').pop();
    assert.deepEqual(created.body.components[1].buttons.map((b) => b.text), ['Sí, confirmo', 'No']);
    await call('POST', `/api/stores/${store.id}/autos/sync`);
    // video del adelanto (opcional): si existe, el adelanto va como video con el texto debajo
    const fdv = new FormData();
    fdv.append('key', 'video-adelanto');
    fdv.append('file', new Blob([IMG], { type: 'video/mp4' }), 'adelanto.mp4');
    assert.equal((await call('POST', `/api/stores/${store.id}/bot/assets`, undefined, { form: fdv })).status, 200);
    await shopHook('orders/create', { id: 5560, name: '#1010', total_price: '139.00', shipping_address: { first_name: 'Rosa', last_name: 'Quispe', phone: '915555555', address1: 'Jr. Lima 120', city: 'Piura', province: 'Piura' }, line_items: [{ title: 'Pantalón formal', variant_title: 'M / Negro', quantity: 2 }] }, 'shp-secret', shopUrl);
    const o = await until(async () => (await call('GET', `/api/stores/${store.id}/pedidos?q=Rosa`)).pedidos[0]);
    assert.equal(o.modo, 'agencia');
    const tpl = await until(() => calls.filter((x) => x.path === `${PHONE_ID}/messages` && x.body?.to === '51915555555' && x.body?.type === 'template').pop());
    assert.equal(tpl.body.template.name, created.body.name);
    const said = (id, body) => hook(md({ contacts: [{ profile: { name: 'Rosa' }, wa_id: '51915555555' }], messages: [{ from: '51915555555', id, timestamp: ts(), type: 'text', text: { body } }] }));
    const lastText = () => calls.filter((x) => x.path === `${PHONE_ID}/messages` && x.body?.to === '51915555555' && x.body?.type === 'text').pop()?.body.text.body || '';
    // «Sí» escrito (no con el botón) también vale porque lo último que le mandamos fue el «¿Tus datos están correctos?»
    await said('wamid.PV1', 'Sí 👍');
    await until(() => /DNI/.test(lastText()));
    await said('wamid.PV2', 'mi dni es 41 085 894');
    await until(async () => (await call('GET', `/api/pedidos/${o.id}`)).pedido.dni === '41085894');
    await until(() => /agencia Shalom|Elige la agencia/i.test(lastText()) || calls.some((x) => x.body?.to === '51915555555' && x.body?.type === 'interactive'));
    if (!calls.some((x) => x.body?.to === '51915555555' && x.body?.type === 'interactive')) await said('wamid.PV3', 'Agencia Piura Centro');
    else {
      const lst = calls.filter((x) => x.body?.to === '51915555555' && x.body?.type === 'interactive').pop();
      const row = lst.body.interactive.action.sections[0].rows[0];
      await hook(md({ contacts: [{ profile: { name: 'Rosa' }, wa_id: '51915555555' }], messages: [{ from: '51915555555', id: 'wamid.PV3', timestamp: ts(), type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: row.id, title: row.title } } }] }));
    }
    const o2 = await until(async () => { const x = (await call('GET', `/api/pedidos/${o.id}`)).pedido; return x.sede ? x : null; });
    assert.ok(o2.sede);
    // «Copiar formulario» del chat sale del pedido de Shopify, con el formato Shalom de siempre
    const chf = await chatOf('51915555555');
    const fm = await call('GET', `/api/chats/${chf.id}/formulario`);
    assert.ok(/^Shalom: 🚚📦/.test(fm.texto) && /➡️ DNI: 41085894/.test(fm.texto) && /➡️ Sede: \S/.test(fm.texto) && /Monto total: S\/139/.test(fm.texto), fm.texto);
    assert.equal(fm.pedido, o.number);
    const vid = () => calls.filter((x) => x.path === `${PHONE_ID}/messages` && x.body?.to === '51915555555' && x.body?.type === 'video').pop();
    await until(() => /adelanto de \*S\/30\*/.test(vid()?.body.video.caption || '') || /asesora te env/i.test(lastText()));
    if (vid()) assert.ok(/Yape o Plin/.test(vid().body.video.caption) && !/adelanto de/.test(lastText()), 'el adelanto va una sola vez, con el video');
    let ch = await chatOf('51915555555');
    const labs = (await call('GET', `/api/stores/${store.id}/labels`)).labels;
    assert.ok(ch.labels.includes(labs.find((l) => l.name === 'YAPE PENDIENTE').id), 'queda YAPE PENDIENTE');
    // la captura cae en Pagos y sube a 📌
    await hook(md({ contacts: [{ profile: { name: 'Rosa' }, wa_id: '51915555555' }], messages: [{ from: '51915555555', id: 'wamid.PV4', timestamp: ts(), type: 'image', image: { id: 'MEDIA_IMG2', mime_type: 'image/jpeg' } }] }));
    const pg = await until(async () => (await call('GET', `/api/stores/${store.id}/pagos`)).pendientes.find((x) => x.chat_id === ch.id && x.captura));
    assert.equal(pg.order.id, o.id);
    assert.ok(!/Recibido/.test(lastText()), 'a la captura no se le responde nada');
    ch = await chatOf('51915555555');
    assert.ok(ch.listo_at > (ch.pin_visto || 0), 'nombre completo + DNI + captura → 📌');
    // Si pregunta algo, el bot no contesta: queda ATENDER PENDIENTE (y sale en la franja de llamadas)
    await said('wamid.PV5', '¿A qué hora abre la agencia?');
    const atl = labs.find((l) => l.name === 'ATENDER PENDIENTE') || (await call('GET', `/api/stores/${store.id}/labels`)).labels.find((l) => l.name === 'ATENDER PENDIENTE');
    await until(async () => (await chatOf('51915555555')).labels.includes(atl.id));
    assert.ok((await call('GET', `/api/stores/${store.id}/llamadas`)).calls.some((x) => x.wa_id === '51915555555' && x.label === 'ATENDER PENDIENTE'));
    // la asesora le escribe → se quita
    await call('POST', `/api/chats/${ch.id}/messages`, { text: 'Abre de 9 a 6 😊', raw: true });
    await until(async () => !(await chatOf('51915555555')).labels.includes(atl.id));
    // gasto de WhatsApp: Meta avisa que la plantilla se cobró como utilidad
    const msgs = (await call('GET', `/api/chats/${ch.id}/messages?limit=50`)).messages;
    const tm = msgs.find((m) => m.direction === 'out' && m.wamid);
    await hook(md({ statuses: [{ id: tm.wamid, status: 'delivered', timestamp: ts(), recipient_id: '51915555555', pricing: { billable: true, category: 'utility', type: 'regular' } }] }));
    const ms2 = msgs.filter((m) => m.direction === 'out' && m.wamid && m.id !== tm.id)[0];
    if (ms2) await hook(md({ statuses: [{ id: ms2.wamid, status: 'delivered', timestamp: ts(), recipient_id: '51915555555', pricing: { billable: false, category: 'service', type: 'free_customer_service' } }] }));
    const g = await until(async () => { const x = await call('GET', `/api/chats/${ch.id}/wa-gasto`); return x.cobrados ? x : null; });
    assert.equal(g.plantillas.utility, 1);
    assert.ok(g.pen > 0.1 && g.pen < 0.2, JSON.stringify(g));
    const G = await call('GET', `/api/stores/${store.id}/wa-gasto`);
    assert.equal(G.gratis, 1000);
    assert.ok(G.quedan <= 1000 && G.plantillas.utility >= 1, JSON.stringify(G));
    const { resumirGasto } = await import('../src/api-gasto.js');
    const R = resumirGasto([{ cat: 'service', typ: 'regular', bill: 0, n: 1000 }, { cat: 'service', typ: 'regular', bill: 1, n: 10 }, { cat: 'marketing', typ: 'regular', bill: 1, n: 2 }], { marketing: 0.07, utility: 0.03, service: 0.03, gratis: 1000, tc: 3.8 });
    assert.equal(R.quedan, 0);
    assert.equal(R.usd, 0.44);
    await call('DELETE', `/api/pedidos/${o.id}`);
  });
  await step('Shopify: provincia va por agencia, cancelar y carrito abandonado', async () => {
    await shopHook('orders/create', { id: 5553, name: '#1003', total_price: '139.00', shipping_address: { first_name: 'Eva', phone: '913333333', address1: 'Av. Sol 1', city: 'Cusco', province: 'Cusco' }, line_items: [{ title: 'Pantalón formal', variant_title: 'M / Perla', quantity: 2 }] }, 'shp-secret', shopUrl);
    const o = await until(async () => (await call('GET', `/api/stores/${store.id}/pedidos?q=Eva`)).pedidos[0]);
    assert.equal(o.modo, 'agencia');
    assert.equal(o.status, 'por_pagar');
    assert.equal(o.adelanto, 30);
    await shopHook('orders/cancelled', { id: 5553, cancelled_at: new Date().toISOString() }, 'shp-secret', shopUrl);
    // Departamento de Lima pero fuera de Lima Metropolitana (Oyón, Huacho, Cañete…) → provincia por agencia
    await shopHook('orders/create', { id: 5556, name: '#1006', total_price: '169.00', shipping_address: { first_name: 'Jesus', last_name: 'Espinoza', phone: '912457351', address1: 'Nuevo horizonte', city: 'Oyón', province: 'Lima' }, line_items: [{ title: 'Leggings Cargo', variant_title: 'M / Beige', quantity: 2 }] }, 'shp-secret', shopUrl);
    const oy = await until(async () => (await call('GET', `/api/stores/${store.id}/pedidos?q=Jesus`)).pedidos[0]);
    assert.equal(oy.modo, 'agencia', 'Oyón es provincia');
    await shopHook('orders/cancelled', { id: 5556, cancelled_at: new Date().toISOString() }, 'shp-secret', shopUrl);
    await until(async () => (await call('GET', `/api/pedidos/${oy.id}`)).pedido.status === 'cancelado');
    await until(async () => (await call('GET', `/api/stores/${store.id}/pedidos?q=Eva`)).pedidos[0]?.status === 'cancelado');
    await call('PATCH', `/api/stores/${store.id}/autos/carrito`, { on: true, delay_min: 30 });
    await shopHook('checkouts/create', { token: 'ck-abc', total_price: '89.00', shipping_address: { first_name: 'Noa', phone: '914444444' }, line_items: [{ title: 'Pantalón formal', variant_title: 'XS / Vino', quantity: 1 }] }, 'shp-secret', shopUrl);
    await wait(800);
    await call('POST', '/__test/jobs?shift=' + 31 * 60e3);
    await until(async () => (await call('GET', `/api/stores/${store.id}/avisos`)).events.some((e) => /No se mandó «Carrito abandonado/.test(e.title)));
    // sección Carritos: la clienta que dejó su compra a medias
    let K = await call('GET', `/api/stores/${store.id}/carritos?f=todos`);
    const kk = K.carritos.find((x) => x.nombre === 'Noa');
    assert.ok(kk, JSON.stringify(K));
    assert.equal(kk.total, 89);
    assert.equal(kk.items[0].talla, 'XS');
    assert.equal(K.aviso.on, true);
    assert.ok(K.resumen.total >= 1);
    assert.equal((await call('GET', `/api/stores/${store.id}/carritos?q=noa`)).carritos.length, 1);
    const sendNow = await call('POST', `/api/carritos/${kk.id}/aviso`);
    assert.equal(sendNow.status, 400, 'el número de prueba no está conectado: explica el motivo');
    assert.ok(sendNow.error);
    // reporte de tiendas Shopify: pedidos de la web, cancelados y carritos
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
    const W = await call('GET', `/api/stores/${store.id}/reporte-web?desde=${today}&hasta=${today}`);
    assert.ok(W.totales.web >= 1, JSON.stringify(W.totales));
    assert.ok(W.totales.cancelados >= 1);
    assert.ok(W.carritos.abandonados >= 1);
    assert.ok(W.productos.some((x) => /Pantalón/i.test(x.name)));
    assert.equal(W.series.length, 24);
    // si la tienda vuelve a «por mensajes», lo que mande Shopify no crea pedidos
    await call('PATCH', `/api/stores/${store.id}`, { canal: 'mensajes' });
    const before = (await call('GET', `/api/stores/${store.id}/pedidos?vista=pendientes`)).pedidos.length;
    const res = await shopHook('orders/create', { id: 7777, name: '#1099', total_price: '89.00', phone: '+51 913 333 333', shipping_address: { first_name: 'Eva', phone: '913333333', city: 'Lince', province: 'Lima' }, line_items: [{ title: 'Pantalón formal', variant_title: 'M / Negro', quantity: 1 }] }, 'shp-secret', shopUrl);
    assert.equal(res.status, 200);
    assert.equal((await call('GET', `/api/stores/${store.id}/pedidos?vista=pendientes`)).pedidos.length, before);
    assert.ok((await call('GET', `/api/stores/${store.id}/avisos`)).events.some((e) => /no se guardó/.test(e.title)));
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
  await step('Reportes: mensajes, ventas, Lima/provincia, tallas, colores y anuncios', async () => {
    const { colorsOf, tallaOf } = await import('../src/api-reportes.js');
    assert.deepEqual(colorsOf('negro, plomo claro y guinda'), ['Negro', 'Gris claro', 'Vino']);
    assert.deepEqual(colorsOf('2 azul + blanco'), ['Azul noche', 'Perla']);
    assert.equal(tallaOf('m'), 'M');
    assert.equal(tallaOf('30'), 'S');
    const r = await call('GET', `/api/stores/${store.id}/reporte`);
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.ok(r.oneDay && r.series.length === 24);
    assert.ok(r.totales.mensajes > 0 && r.totales.chats > 0);
    // la tienda ya tiene pedidos: las ventas salen de Pedidos (sin cancelados)
    assert.equal(r.fuente, 'pedidos');
    assert.equal(r.totales.ventas, 5, JSON.stringify(r.totales));
    assert.equal(r.totales.lima, 4);
    assert.equal(r.totales.provincia, 1);
    assert.equal(r.totales.monto, 631);
    assert.equal(r.tallas.reduce((a, x) => a + x.value, 0), r.totales.unidades);
    assert.ok(r.tallas.some((x) => x.name === 'S'));
    assert.ok(r.colores.some((x) => x.name === 'Negro'));
    assert.ok(r.anuncios.some((a) => a.ventas > 0));
    assert.equal(r.llamadas.cerro, 1);
    assert.equal(r.series.reduce((a, x) => a + x.ventas, 0), 5);
    const w = await call('GET', `/api/stores/${store.id}/reporte?desde=2026-01-01&hasta=2026-01-07`);
    assert.equal(w.series.length, 7);
    assert.equal(w.totales.ventas, 0);
    assert.equal((await call('GET', `/api/stores/${store.id}/reporte?desde=2026-02-01&hasta=2026-01-01`)).status, 400);
  });
  await step('Clientes: lista, buscar por datos, editar datos, borrar lo del bot', async () => {
    let r = await call('GET', `/api/stores/${store.id}/clientes?limit=200`);
    assert.ok(r.total >= 5 && r.clientes.every((c) => !c.wa_id.startsWith('sim')), 'el simulador no sale');
    const c = r.clientes.find((x) => x.wa_id === '51911111111');
    assert.ok(c.msgs > 0 && Array.isArray(c.labels));
    // números y segmentos (salen de los pedidos)
    assert.ok(r.kpis && r.kpis.compraron >= 1 && r.kpis.pedidos >= 5 && r.kpis.ticket > 0, JSON.stringify(r.kpis));
    assert.equal(r.kpis.total, r.total);
    assert.equal(r.kpis.nueva + r.kpis.una + r.kpis.frecuente + r.kpis.vip + r.kpis.reactivar, r.kpis.total);
    const buyer = r.clientes.find((x) => x.compras > 0);
    assert.ok(buyer && buyer.gastado > 0);
    const seg = await call('GET', `/api/stores/${store.id}/clientes?seg=nueva&limit=200`);
    assert.equal(seg.total, r.kpis.nueva);
    assert.ok(seg.clientes.every((x) => x.compras === 0));
    const one = await call('GET', `/api/stores/${store.id}/clientes?seg=una&limit=200`);
    assert.ok(one.clientes.every((x) => x.compras === 1));
    r = await call('GET', `/api/stores/${store.id}/clientes?q=Negro`);
    assert.ok(r.clientes.some((x) => x.id === c.id), 'busca dentro de los datos del bot');
    assert.equal((await call('PUT', `/api/chats/${c.id}/datos`, { datos: { 'mal dato!': 'x' } })).status, 400);
    r = await call('PUT', `/api/chats/${c.id}/datos`, { datos: { talla: 'L', distrito: 'Los Olivos', vacio: '' } });
    assert.deepEqual(r.datos, { talla: 'L', distrito: 'Los Olivos' });
    assert.equal(JSON.parse((await call('GET', `/api/chats/${c.id}`)).chat.bot_vars).distrito, 'Los Olivos');
    const csv = await (await call('GET', `/api/stores/${store.id}/clientes.csv`, undefined, { raw: true })).text();
    assert.match(csv, /Celular/);
    assert.match(csv, /Los Olivos/);
    await call('POST', `/api/chats/${c.id}/bot`, { action: 'clear' });
    const after = (await call('GET', `/api/chats/${c.id}`)).chat;
    assert.equal(after.bot_vars, null);
    assert.equal(after.bot_flow_id, null);
  });
  await step('notas de voz: se pasan a texto y se ven en el chat', async () => {
    const wa = '51933333333';
    await hook(md({ contacts: [{ profile: { name: 'Voz' }, wa_id: wa }], messages: [{ from: wa, id: 'wamid.VOZ1', timestamp: ts(), type: 'audio', audio: { id: 'MEDIA_AUD1', mime_type: 'audio/ogg; codecs=opus', voice: true } }] }));
    const c = await until(async () => chatOf(wa));
    const m = await until(async () => (await msgsOf(c.id)).find((x) => x.type === 'audio' && x.transcript));
    assert.match(m.transcript, /talla M/);
    assert.match((await chatOf(wa)).last_preview, /^🎤 Hola, soy talla M/);
    // apagado: llega el audio sin texto
    await call('PATCH', `/api/stores/${store.id}/bot/settings`, { voz_on: false });
    await hook(md({ contacts: [{ profile: { name: 'Voz' }, wa_id: wa }], messages: [{ from: wa, id: 'wamid.VOZ2', timestamp: ts(), type: 'audio', audio: { id: 'MEDIA_AUD2', mime_type: 'audio/ogg', voice: true } }] }));
    const m2 = await until(async () => (await msgsOf(c.id)).find((x) => x.wamid === 'wamid.VOZ2' && x.media_status === 'ok'));
    await wait(500);
    assert.equal((await msgsOf(c.id)).find((x) => x.id === m2.id).transcript, null);
    assert.equal((await call('PATCH', `/api/stores/${store.id}/bot/settings`, { voz_on: true })).settings.voz_on, 1);
  });
  await step('Clientes: vaciar conversación y borrar clienta', async () => {
    const c = await chatOf('51911111114');
    assert.ok((await msgsOf(c.id)).length > 0);
    assert.equal((await call('DELETE', `/api/chats/${c.id}/messages`)).ok, true);
    assert.equal((await msgsOf(c.id)).length, 0);
    assert.ok(await chatOf('51911111114'), 'la clienta se queda');
    const d = await chatOf('51911111115');
    assert.equal((await call('DELETE', `/api/chats/${d.id}`)).ok, true);
    assert.equal(await chatOf('51911111115'), undefined);
    assert.equal((await call('GET', `/api/chats/${d.id}`)).status, 404);
  });
  await step('Perfil de WhatsApp: leer, guardar y cambiar foto', async () => {
    let r = await call('GET', `/api/stores/${store.id}/perfil`);
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.equal(r.profile.about, 'Hola');
    assert.equal(r.profile.vertical, 'APPAREL');
    assert.ok(r.verticals.APPAREL);
    assert.equal((await call('PATCH', `/api/stores/${store.id}/perfil`, { about: 'x'.repeat(140) })).status, 400);
    assert.equal((await call('PATCH', `/api/stores/${store.id}/perfil`, { websites: ['instagram.com/x'] })).status, 400);
    assert.equal((await call('PATCH', `/api/stores/${store.id}/perfil`, { vertical: 'RARO' })).status, 400);
    r = await call('PATCH', `/api/stores/${store.id}/perfil`, { about: 'Pantalones formales', description: 'Envío gratis', websites: ['https://instagram.com/porte', ''], vertical: 'APPAREL', email: 'hola@porte.pe' });
    assert.equal(r.ok, true);
    const sent = calls.filter((x) => x.method === 'POST' && x.path === `${PHONE_ID}/whatsapp_business_profile`).pop();
    assert.equal(sent.body.messaging_product, 'whatsapp');
    assert.deepEqual(sent.body.websites, ['https://instagram.com/porte']);
    const fd = new FormData();
    fd.append('file', new Blob([IMG], { type: 'image/jpeg' }), 'perfil.jpg');
    r = await call('POST', `/api/stores/${store.id}/perfil/foto`, undefined, { form: fd });
    assert.equal(r.ok, true, JSON.stringify(r));
    const pic = calls.filter((x) => x.method === 'POST' && x.path === `${PHONE_ID}/whatsapp_business_profile`).pop();
    assert.equal(pic.body.profile_picture_handle, 'HANDLE1');
  });
  await step('conectar WhatsApp con un clic (Registro insertado)', async () => {
    const me = await call('GET', '/api/me');
    const n = await call('POST', `/api/companies/${me.companies[0].id}/stores`, { name: 'Alumna', canal: 'mensajes' });
    const sid = n.store_id;
    const info = await call('GET', `/api/stores/${sid}/whatsapp/signup`);
    assert.equal(info.ready, true, JSON.stringify(info));
    assert.equal(info.app_id, 'APP123');
    assert.equal(info.config_id, 'CFG1');
    // código vencido → no se conecta y queda el error
    let r = await call('POST', `/api/stores/${sid}/whatsapp/signup`, { code: 'es-code-expired000', phone_number_id: '880000000001', waba_id: '770000000001' });
    assert.equal(r.ok, false);
    assert.match(r.error, /30 segundos/);
    // Meta pide el mismo redirect_uri de la ventana (subcódigo 36008): se prueba hasta dar con el correcto
    const { redirectCandidates } = await import('../src/signup.js');
    assert.deepEqual(redirectCandidates('https://x.com/config?a=1', 'https://x.com'), [null, 'https://x.com/config', 'https://x.com/', 'https://x.com', '']);
    const xd = 'https://staticxx.facebook.com/x/connect/xd_arbiter/?version=46#cb=f1&domain=x.com';
    assert.equal(redirectCandidates('https://x.com/', 'https://x.com', xd)[0], xd, 'primero la dirección que usó la ventana de Meta');
    assert.equal(redirectCandidates('https://x.com/', 'https://x.com', 'https://malo.com/x')[0], null, 'nunca una dirección de otro sitio');
    const nr = calls.length;
    r = await call('POST', `/api/stores/${sid}/whatsapp/signup`, { code: 'es-code-redirect00', phone_number_id: '880000000001', waba_id: '770000000001', page_url: `${BASE}/configuracion` });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.ok(calls.slice(nr).filter((x) => x.path === 'oauth/access_token').length >= 2, 'reintentó con otro redirect_uri');
    r = await call('POST', `/api/stores/${sid}/whatsapp/signup`, { code: 'es-code-1234567890', phone_number_id: '880000000001', waba_id: '770000000001' });
    assert.equal(r.ok, true, JSON.stringify(r));
    const st = r.stores.find((x) => x.id === sid);
    assert.equal(st.status, 'activo');
    assert.equal(st.connected_via, 'embedded');
    assert.equal(st.verified_name, 'Tienda Alumna');
    assert.ok(st.token_exp > Date.now() + 59 * 864e5, 'guarda cuándo vence el permiso de Meta (60 días)');
    assert.ok(r.steps.some((x) => /vence el/.test(x)));
    const { tokenReminders } = await import('../src/signup.js');
    assert.equal(typeof tokenReminders, 'function');
    const reg = calls.filter((x) => x.path === '880000000001/register').pop();
    assert.ok(/^\d{6}$/.test(reg.body.pin));
    // el token quedó guardado cifrado y se usa después (Probar conexión)
    const before = calls.length;
    await call('POST', `/api/stores/${sid}/connect`);
    assert.ok(calls.slice(before).some((x) => x.path === '880000000001'), 'usa el token de la tienda');
    // el mismo número no puede ir en otra tienda
    const n2 = await call('POST', `/api/companies/${me.companies[0].id}/stores`, { name: 'Alumna 2' });
    r = await call('POST', `/api/stores/${n2.store_id}/whatsapp/signup`, { code: 'es-code-1234567890', phone_number_id: '880000000001', waba_id: '770000000001' });
    assert.equal(r.ok, false);
    assert.match(r.error, /ya está en la tienda/);
    assert.equal((await call('DELETE', `/api/stores/${sid}`, { confirm: 'Alumna' })).status, 200);
    assert.equal((await call('DELETE', `/api/stores/${n2.store_id}`, { confirm: 'Alumna 2' })).status, 200);
  });
  await step('alumnos: registro con prueba gratis, precio, Panel Suyon y bloqueo', async () => {
    const { statusOf, priceOf, DEFAULT_PLAN } = await import('../src/billing.js');
    const T = Date.now();
    assert.equal(statusOf({ plan_status: 'trial', trial_ends_at: T - 1 }, DEFAULT_PLAN, T).state, 'trial_over');
    assert.equal(statusOf({ plan_status: 'trial', trial_ends_at: T - 1 }, DEFAULT_PLAN, T).blocked, true);
    assert.equal(statusOf({ plan_status: 'active', paid_until: T - 864e5 }, DEFAULT_PLAN, T).state, 'grace');
    assert.equal(statusOf({ plan_status: 'active', paid_until: T - 5 * 864e5 }, DEFAULT_PLAN, T).blocked, true);
    assert.equal(priceOf(DEFAULT_PLAN, { numbers: 2, users: 3 }).total, 60, 'base + 1 número en pack (S/15) + 2 trabajadoras (S/10)');
    // las empresas de Jordan quedan sin cobro
    let me = await call('GET', '/api/me');
    assert.ok(me.companies.every((x) => x.plan.state === 'free'));
    // un alumno se registra solo (con su propia sesión)
    let jar = '';
    const as = async (method, path, data) => {
      const res = await fetch(BASE + path, { method, headers: { 'x-crm': '1', 'content-type': 'application/json', ...(jar ? { cookie: jar } : {}) }, body: data ? JSON.stringify(data) : undefined });
      const sc = res.headers.get('set-cookie');
      if (sc) jar = sc.split(';')[0];
      return { status: res.status, ...(await res.json().catch(() => ({}))) };
    };
    assert.equal((await as('GET', '/api/registro')).open, true);
    assert.equal((await as('POST', '/api/registro', { name: 'Ana', email: 'ana@alumna.pe', password: 'corta', company: 'Ana Store' })).status, 400);
    let r = await as('POST', '/api/registro', { name: 'Ana', email: 'ana@alumna.pe', password: 'clave-segura-9', company: 'Ana Store', phone: '999 111 222', canal: 'mensajes', rubro: 'simple' });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal((await as('POST', '/api/registro', { name: 'Ana', email: 'ana@alumna.pe', password: 'clave-segura-9', company: 'Otra' })).status, 409);
    me = await as('GET', '/api/me');
    const co = me.companies[0];
    assert.equal(co.role, 'dueno');
    assert.equal(co.plan.state, 'trial');
    assert.equal(co.plan.days_left, 15);
    assert.equal(me.user.is_admin, false);
    // su primera tienda nace sola con lo que eligió, y con el asistente pendiente
    assert.equal(me.stores.length, 1);
    const s1 = { store_id: me.stores[0].id };
    assert.equal(me.stores[0].rubro, 'simple');
    assert.equal(me.stores[0].canal, 'mensajes');
    assert.equal(me.stores[0].setup, 1);
    assert.equal(me.stores[0].name, 'Ana Store');
    const lb = await as('GET', `/api/stores/${s1.store_id}/labels`);
    assert.ok(!lb.labels.some((l) => l.name.startsWith('Talla ')), 'sin variantes: sin etiquetas de talla');
    // asistente: preguntas → bot, IA y precios
    const pre = await as('GET', `/api/stores/${s1.store_id}/bot`);
    assert.doesNotMatch(pre.settings.ia_prompt, /Porte/, 'sin el prompt de Porte');
    assert.ok(!pre.template_assets.some((x) => x.key === 'colores-XS'), 'sin la lista de archivos de Porte');
    let A = await as('GET', `/api/stores/${s1.store_id}/asistente`);
    assert.equal(A.respuestas, null);
    assert.equal((await as('POST', `/api/stores/${s1.store_id}/asistente`, { producto: 'Cápsulas', precios: {} })).status, 400);
    A = await as('POST', `/api/stores/${s1.store_id}/asistente`, {
      marca: 'Ana Store', producto: 'Cápsulas de colágeno', descripcion: '60 cápsulas, 1 mes', beneficios: 'Piel\nUñas',
      precios: { 1: '59', 2: '99', 3: '129.90' }, lima: true, provincia: true, adelanto: 20, faq: '¿Cuántas al día? → 2', trato: 'cercano', palabra: 'Quiero colágeno',
    });
    assert.ok(A.flow_id, JSON.stringify(A));
    assert.equal(A.respuestas.producto, 'Cápsulas de colágeno');
    assert.deepEqual(A.assets.map((x) => x.key), ['precios', 'producto', 'audio-seguimiento', 'video-producto', 'fotos-pedidos', 'confianza-lima', 'video-envios', 'confianza-provincia', 'foto-despacho']);
    assert.equal(A.assets[0].need, 'si');
    // antes del asistente, la tienda de una alumna NO trae el prompt ni la plantilla de las marcas de Jordan
    assert.equal((await as('POST', `/api/stores/${s1.store_id}/bot/flows`, { template: 'pantalon' })).status, 403);
    const clave = await call('POST', `/api/admin/empresas/${co.id}`, { action: 'clave' });
    assert.match(clave.link, /\/clave\/[\w-]+$/);
    assert.equal(clave.email, 'ana@alumna.pe');
    let bot = await as('GET', `/api/stores/${s1.store_id}/bot`);
    assert.match(bot.settings.ia_prompt, /Vendes Cápsulas de colágeno\./);
    assert.match(bot.settings.ia_prompt, /S\/129\.90/);
    assert.match(bot.settings.ia_prompt, /separas con S\/20/);
    assert.match(bot.settings.ia_knowledge, /Cuántas al día/);
    assert.equal(bot.rubro, 'simple');
    assert.deepEqual(bot.template_assets.map((x) => x.key), A.assets.map((x) => x.key));
    let fl = await as('GET', `/api/bot/flows/${A.flow_id}`);
    assert.equal(fl.flow.active, 0, 'nace apagado');
    assert.equal(fl.flow.name, 'Ventas Cápsulas de colágeno');
    const g = fl.flow.graph;
    assert.deepEqual(g.sequences[0].steps.map((x) => x.after_min), [15, 40, 180, 900], 'mismo orden que el abordaje de Jordan');
    assert.ok(g.sequences[0].steps[1].items[0].opcional, 'el audio es opcional');
    assert.deepEqual(g.nodes.find((n) => n.type === 'ia').cases.map((c) => c.id), ['yape_sede', 'lima_ok', 'persona', 'yape_luego']);
    assert.deepEqual(g.nodes.find((n) => n.id === 'inicio').trigger.keywords, ['Quiero colágeno']);
    // probar en el simulador: precios (falta la foto → aviso) y la pregunta con botones
    let sm = await as('POST', `/api/stores/${s1.store_id}/sim/reset`, { flow_id: A.flow_id });
    sm = await as('POST', `/api/stores/${s1.store_id}/sim/send`, { text: 'hola' });
    const outs = sm.messages.filter((m) => m.direction === 'out').map((m) => m.body || '');
    assert.ok(outs.some((t) => /Cápsulas de colágeno/.test(t) && /S\/99/.test(t)), JSON.stringify(outs));
    assert.ok(outs.some((t) => /Cuántas unidades/.test(t)), JSON.stringify(outs));
    // la segunda vez, el asistente actualiza el mismo flujo (no crea otro)
    const A2 = await as('POST', `/api/stores/${s1.store_id}/asistente`, { ...A.respuestas, precios: { 1: 49 }, provincia: false });
    assert.equal(A2.flow_id, A.flow_id);
    assert.ok(!A2.assets.some((x) => x.key === 'foto-despacho'), 'sin provincia no pide foto de despacho');
    bot = await as('GET', `/api/stores/${s1.store_id}/bot`);
    assert.equal(bot.flows.length, 1);
    assert.doesNotMatch(bot.settings.ia_prompt, /FORMULARIO SHALOM/);
    // billetera de IA: regalo de la prueba, consumo, recarga y sin saldo → la IA no responde
    me = await as('GET', '/api/me');
    assert.ok(me.companies[0].ia_saldo > 0 && me.companies[0].ia_saldo <= 5, String(me.companies[0].ia_saldo));
    let pl = await as('GET', `/api/companies/${co.id}/plan`);
    assert.equal(pl.ia.usa, true);
    assert.equal(pl.ia.recargas.at(-1).method, 'regalo');
    const bw = await call('GET', '/api/admin/billetera');
    assert.ok(bw.empresas.some((x) => x.id === co.id));
    assert.equal((await call('GET', '/api/me')).companies[0].ia_saldo, null, 'las empresas de Jordan no usan billetera');
    await call('POST', `/api/admin/empresas/${co.id}`, { action: 'recarga', amount: -100, method: 'ajuste' });
    sm = await as('POST', `/api/stores/${s1.store_id}/sim/send`, { text: 'quiero 2' });
    assert.ok(!sm.messages.slice(-3).some((m) => m.sender === 'ia' && m.direction === 'out'), 'sin saldo no responde la IA');
    assert.ok(sm.messages.some((m) => m.sender === 'sys' && /saldo de IA/.test(m.body || '')), JSON.stringify(sm.messages.slice(-3)));
    await call('POST', `/api/admin/empresas/${co.id}`, { action: 'recarga', amount: 120, method: 'yape' });
    pl = await as('GET', `/api/companies/${co.id}/plan`);
    assert.ok(pl.ia.saldo > 0);
    assert.equal((await call('PATCH', '/api/admin/billetera', { margen: 40 })).wallet.margen, 40);
    assert.equal((await fetch(BASE + '/api/correo/clave', { method: 'POST', headers: { 'x-crm': '1', 'content-type': 'application/json' }, body: '{"email":"ana@alumna.pe"}' })).status, 400, 'sin correo configurado');
    assert.equal((await as('POST', `/api/stores/${s1.store_id}/asistente/listo`)).ok, true);
    me = await as('GET', '/api/me');
    assert.equal(me.stores[0].setup, 0);
    let plan = await as('GET', `/api/companies/${co.id}/plan`);
    assert.equal(plan.plan.price.total, 25);
    assert.equal(plan.plan.price.currency, 'PEN');
    assert.deepEqual(plan.plan.options.map((o) => o.total), [25, 69, 132, 240], 'base sola: 1, 3, 6 y 12 meses');
    await as('POST', `/api/companies/${co.id}/stores`, { name: 'Ana · Blusas' });
    plan = await as('GET', `/api/companies/${co.id}/plan`);
    assert.equal(plan.plan.price.total, 43, '1 número extra suelto = S/18');
    await as('POST', `/api/companies/${co.id}/stores`, { name: 'Ana · Polos' });
    plan = await as('GET', `/api/companies/${co.id}/plan`);
    assert.equal(plan.plan.price.monthly, 55, '2 extras = pack a S/15');
    assert.ok(plan.plan.price.pack);
    assert.deepEqual(plan.plan.options.map((o) => o.monthly), [55, 51, 48, 44]);
    assert.equal(plan.plan.options[3].total, 528);
    assert.equal(plan.plan.options[3].saving, 204);
    assert.equal((await as('GET', '/api/admin/empresas')).status, 403, 'solo el administrador');
    // Panel Suyon
    let pn = await call('GET', '/api/admin/empresas');
    const row = pn.empresas.find((x) => x.id === co.id);
    assert.equal(row.state, 'trial');
    assert.equal(row.owner_email, 'ana@alumna.pe');
    assert.equal(row.monthly, 55);
    assert.equal(row.options.find((o) => o.months === 3).total, 153);
    assert.ok(pn.resumen.prueba >= 1);
    // pausar acceso → la alumna no entra a su tienda (402), pero ve su plan
    await call('POST', `/api/admin/empresas/${co.id}`, { action: 'bloquear' });
    assert.equal((await as('GET', `/api/stores/${s1.store_id}/chats`)).status, 402);
    assert.equal((await as('GET', `/api/companies/${co.id}/plan`)).status, 200);
    assert.equal((await as('GET', '/api/me')).companies[0].plan.blocked, true);
    // pagó por Yape → 1 mes activo
    await call('POST', `/api/admin/empresas/${co.id}`, { action: 'pagado', months: 1, amount: 12, method: 'yape' });
    me = await as('GET', '/api/me');
    assert.equal(me.companies[0].plan.state, 'active');
    assert.ok(me.companies[0].plan.days_left >= 29);
    // sin monto: se calcula el precio de 3 meses y suma 90 días
    await call('POST', `/api/admin/empresas/${co.id}`, { action: 'pagado', months: 3, method: 'yape' });
    plan = await as('GET', `/api/companies/${co.id}/plan`);
    assert.equal(plan.pagos[0].amount, 153);
    assert.equal(plan.pagos[0].currency, 'PEN');
    assert.ok(plan.plan.days_left >= 119);
    assert.equal((await as('GET', `/api/stores/${s1.store_id}/chats`)).status, 200);
    plan = await as('GET', `/api/companies/${co.id}/plan`);
    assert.equal(plan.pagos.length, 2);
    assert.equal(plan.pagos[1].amount, 12);
    // rebajas por meses editables
    const per = await call('PATCH', '/api/admin/plan', { periods: [{ months: 12, base_off: 4, extra_off: 3, pack_off: 7 }], currency: 'USD' });
    assert.equal(per.plan.currency, 'PEN', 'siempre soles');
    assert.equal(per.plan.periods.find((x) => x.months === 12).pack_off, 7);
    assert.equal(per.plan.periods.find((x) => x.months === 3).pack_off, 4, 'los demás no cambian');
    await call('PATCH', '/api/admin/plan', { periods: [{ months: 12, base_off: 5, extra_off: 3, pack_off: 6 }] });
    assert.equal((await call('GET', '/api/admin/plan')).plan.per_user, 10, 'trabajadora extra S/10');
    // precios y registro cerrado
    const cfg = await call('PATCH', '/api/admin/plan', { base: 9, signup_open: false, pay_info: 'Yape al 999 000 111', contact: '51999000111' });
    assert.equal(cfg.plan.base, 9);
    assert.equal((await fetch(BASE + '/api/registro', { method: 'POST', headers: { 'x-crm': '1', 'content-type': 'application/json' }, body: JSON.stringify({ name: 'X', email: 'x@y.pe', password: 'clave-segura-1', company: 'X' }) })).status, 403);
    assert.equal((await call('GET', '/api/state', undefined, { keepCookie: false })).signup_open, false);
    await call('PATCH', '/api/admin/plan', { base: 25, signup_open: true });
  });
  await step('página pública y agenda de demos', async () => {
    const home = await (await fetch(BASE + '/inicio')).text();
    assert.match(home, /Vende ropa por WhatsApp/);
    assert.match(home, /S\/25/);
    assert.ok(!/US\$/.test(home), 'nada en dólares');
    assert.ok(!/IA Suyon/.test(home), 'la página pública no dice IA Suyon');
    const ag = await call('PATCH', '/api/admin/agenda', { days: [0, 1, 2, 3, 4, 5, 6], from: '00:00', to: '23:30', pausa_from: '', min_hours: 0, max_days: 3, dur_min: 30, slot_min: 30 });
    assert.equal(ag.agenda.days.length, 7);
    const pub = await call('GET', '/api/agenda', undefined, { keepCookie: false });
    assert.equal(pub.on, true);
    const t = pub.days[pub.days.length - 1].slots[0].t;
    const anon = (d) => call('POST', '/api/agenda', d, { keepCookie: false });
    assert.equal((await anon({ t, name: 'Ana', phone: '12' })).status, 400, 'pide WhatsApp válido');
    const ok = await anon({ t, name: 'Ana Prueba', phone: '987 654 321', brand: 'Mi marca', sells: 'polos', volume: '20 a 50' });
    assert.equal(ok.status, 200);
    assert.match(ok.demo.gcal, /calendar\.google\.com/);
    assert.equal((await anon({ t, name: 'Otra', phone: '987000111' })).status, 409, 'horario ocupado');
    const t2 = pub.days[pub.days.length - 1].slots[3].t;
    assert.equal((await anon({ t: t2, name: 'Ana', phone: '51987654321' })).status, 409, 'una demo pendiente por número');
    assert.equal((await anon({ t: t2, name: 'Robot', phone: '987000222', website: 'x' })).status, 400, 'trampa para robots');
    const again = await call('GET', '/api/agenda', undefined, { keepCookie: false });
    assert.ok(!again.days.some((d) => d.slots.some((s) => s.t === t)), 'el horario ya no sale');
    assert.equal((await call('GET', '/api/admin/demos', undefined, { keepCookie: false })).status, 401);
    let list = await call('GET', '/api/admin/demos');
    assert.equal(list.nuevas, 1);
    assert.equal(list.demos[0].phone, '51987654321');
    assert.equal((await call('GET', '/api/me')).demos_nuevas, 1);
    await call('PATCH', `/api/admin/demos/${list.demos[0].id}`, { status: 'cancelada' });
    list = await call('GET', '/api/admin/demos');
    assert.equal(list.nuevas, 0);
    assert.ok((await call('GET', '/api/agenda', undefined, { keepCookie: false })).days.some((d) => d.slots.some((s) => s.t === t)), 'cancelar libera el horario');
    await call('PATCH', '/api/admin/agenda', { on: false });
    assert.equal((await anon({ t, name: 'Ana', phone: '987654333' })).status, 403);
  });
  await step('página pública: video, testimonios y comparación', async () => {
    let home = await (await fetch(BASE + '/inicio')).text();
    assert.match(home, /Herramientas sueltas/);
    assert.ok(!/id="video"/.test(home) && !/id="testimonios"/.test(home), 'sin video ni testimonios no salen');
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array(4000).fill(7)], { type: 'video/mp4' }), 'demo.mp4');
    const up = await call('POST', '/api/admin/landing/video', undefined, { form: fd });
    assert.equal(up.status, 200, JSON.stringify(up));
    const vname = up.landing.video.name;
    const part = await fetch(BASE + `/inicio/media/${vname}`, { headers: { range: 'bytes=0-99' } });
    assert.equal(part.status, 206);
    assert.equal((await part.arrayBuffer()).byteLength, 100);
    const bad = new FormData();
    bad.append('name', 'Carla');
    bad.append('text', 'Me ahorra horas cada día');
    assert.equal((await call('POST', '/api/admin/landing/testimonios', undefined, { form: bad })).status, 400, 'pide permiso');
    bad.append('permiso', '1');
    bad.append('brand', 'Carla Store');
    const tt = await call('POST', '/api/admin/landing/testimonios', undefined, { form: bad });
    assert.equal(tt.landing.testimonios.length, 1);
    home = await (await fetch(BASE + '/inicio')).text();
    assert.match(home, /id="video"/);
    assert.match(home, /Me ahorra horas cada día/);
    await call('DELETE', `/api/admin/landing/testimonios/${tt.landing.testimonios[0].id}`);
    const rm = await call('DELETE', '/api/admin/landing/video');
    assert.equal(rm.landing.video, null);
    assert.equal((await fetch(BASE + `/inicio/media/${vname}`)).status, 404);
  });
  await step('plantilla «Ventas Control Total»: precios del plan en el prompt', async () => {
    const me = await call('GET', '/api/me');
    const r = await call('POST', `/api/companies/${me.companies[0].id}/stores`, { name: 'Control Total · Ventas' });
    const sid = r.store_id;
    const f = await call('POST', `/api/stores/${sid}/bot/flows`, { template: 'ventas_ct' });
    const flow = await call('GET', `/api/bot/flows/${f.id}`);
    assert.equal(flow.flow.name, 'Ventas Control Total');
    assert.ok(flow.flow.graph.nodes.some((n) => n.type === 'ia'));
    assert.match(JSON.stringify(flow.flow.graph.sequences), /\/inicio#demo/);
    const bot = await call('GET', `/api/stores/${sid}/bot`);
    assert.match(bot.settings.ia_prompt, /asistente de ventas de Control Total/);
    const n = iaCalls.length;
    await call('POST', `/api/stores/${sid}/sim/reset`, { flow_id: f.id });
    await call('POST', `/api/stores/${sid}/sim/send`, { text: '¿Cuánto cuesta?' });
    const sys = iaCalls.slice(n).pop()?.system || '';
    assert.match(sys, /Plan base S\/25 al mes/);
    assert.match(sys, /12 meses: plan base S\/20 al mes/);
    assert.match(sys, /\/inicio#demo/);
  });
  await step('Shalom: probar, guardar agencias, buscar y rastrear', async () => {
    const st = await call('GET', '/api/admin/shalom');
    assert.equal(st.key, true);
    assert.ok(!JSON.stringify(st).includes('sh-test-key'), 'nunca devuelve la clave');
    const pr = await call('POST', '/api/admin/shalom/probar', { path: '/v1/agencies' });
    assert.equal(pr.status, 200);
    assert.match(pr.body, /JULIACA TERMINAL/);
    assert.equal(pr.shape.items, 'lista de 2');
    assert.equal((await call('POST', '/api/admin/shalom/probar', { path: 'http://otro.com/x' })).status, 400, 'solo rutas del servicio');
    const sy = await call('POST', '/api/admin/shalom/agencias');
    assert.equal(sy.total, 24);
    let f = await call('GET', '/api/shalom/agencias?q=juliaca');
    assert.equal(f.agencias.length, 1);
    assert.equal(f.agencias[0].prov, 'SAN ROMÁN');
    assert.equal(f.agencias[0].dist, 'JULIACA');
    assert.equal(f.agencias[0].name, 'JULIACA TERMINAL');
    assert.equal((await call('GET', '/api/shalom/agencias?q=cayma')).agencias[0].habilitado, false);
    const lim = (await call('GET', '/api/shalom/agencias?q=lima')).agencias;
    assert.equal(lim[0].dep, 'LIMA');
    assert.equal(lim[lim.length - 1].dep, 'PUNO', 'solo en la dirección (Jr. Lima) también sale, pero al final');
    assert.match((await call('GET', '/api/shalom/agencias?q=puno centro')).agencias[0].horario, /LUNES/);
    f = await call('GET', '/api/shalom/agencias?q=puno');
    assert.equal(f.agencias.length, 2, 'por departamento');
    f = await call('GET', '/api/shalom/agencias?q=san roman');
    assert.equal(f.agencias.length, 1, 'sin tildes');
    const tr = await call('POST', '/api/admin/shalom/rastrear', { guia: '12345678', codigo: 'npjk' });
    assert.equal(tr.estado, 'En tránsito');
    assert.equal(tr.summary.pasos.find((x) => x.k === 'destino').ok, false);
    // Pedido de agencia con su guía: el rastreo lo pasa solo a «En agencia»
    const ped = (await call('POST', `/api/stores/${store.id}/pedidos`, { modo: 'agencia', nombre: 'Rosa', celular: '987111222', ciudad: 'Chimbote', sede: 'AV JOSE GALVEZ', items: [{ talla: 'M', color: 'Negro', cantidad: 1 }] })).pedido;
    await call('PATCH', `/api/pedidos/${ped.id}`, { status: 'validado' });
    let up = await call('PATCH', `/api/pedidos/${ped.id}`, { guia: '2000 0001', guia_codigo: 'npjk' });
    assert.equal(up.pedido.guia, '20000001');
    assert.equal(up.pedido.guia_codigo, 'NPJK');
    const rr = await call('POST', `/api/pedidos/${ped.id}/rastrear`);
    assert.equal(rr.ok, true);
    assert.equal(rr.pedido.status, 'en_agencia', 'llegó a destino → en agencia');
    assert.match(rr.pedido.guia_estado, /agencia de destino/);
    const ev = await call('GET', `/api/pedidos/${ped.id}`);
    assert.ok(ev.events.some((x) => /según el rastreo de Shalom/.test(x.detail)));
    // Sin código no rastrea; con «Yape por validar» nunca avanza solo
    const p2 = (await call('POST', `/api/stores/${store.id}/pedidos`, { modo: 'agencia', nombre: 'Ana', celular: '987111333', items: [{ talla: 'S', cantidad: 1 }], guia: '20000001', guia_codigo: 'ABCD' })).pedido;
    assert.equal((await call('POST', `/api/pedidos/${p2.id}/rastrear`)).pedido.status, 'por_pagar', 'no salta la validación del adelanto');
    assert.equal((await call('POST', '/api/admin/shalom/rastrear', { guia: 'a b' })).status, 400);
    assert.equal((await call('GET', '/api/admin/shalom', undefined, { keepCookie: false })).status, 401);
    // El bot ofrece las agencias de provincia (y nunca en Lima con cobertura)
    const me = await call('GET', '/api/me');
    const sid = (await call('POST', `/api/companies/${me.companies[0].id}/stores`, { name: 'Prueba agencias' })).store_id;
    const fl = await call('POST', `/api/stores/${sid}/bot/flows`, { template: 'ventas_ct' });
    await call('POST', `/api/stores/${sid}/sim/reset`, { flow_id: fl.id });
    let n = iaCalls.length;
    let sm = await call('POST', `/api/stores/${sid}/sim/send`, { text: 'hola' });
    const conDatos = (x) => call('PUT', `/api/chats/${x.chat.id}/datos`, { datos: { nombre: 'Ana Pérez', dni: '70000003', celular: '987654321' } });
    // Sin datos todavía: no ofrece agencias (primero nombre, DNI y celular)
    sm = await call('POST', `/api/stores/${sid}/sim/send`, { text: 'Vivo en Juliaca, ¿envían?' });
    assert.match(iaCalls.slice(n).pop().system, /AGENCIA SHALOM: TODAVÍA NO/);
    assert.ok(!sm.messages.some((m) => /Agencias Shalom en/.test(m.body || '')), 'sin datos no manda la lista');
    await conDatos(sm);
    n = iaCalls.length;
    sm = await call('POST', `/api/stores/${sid}/sim/send`, { text: 'Vivo en Juliaca, ¿envían?' });
    assert.match(iaCalls.slice(n).pop().system, /AGENCIAS SHALOM EN JULIACA[\s\S]*JULIACA TERMINAL/);
    const list = sm.messages.filter((m) => m.sender === 'bot').pop();
    assert.match(list.body, /Agencias Shalom en JULIACA/);
    assert.ok(JSON.stringify(list.extra || '').includes('JULIACA TERMINAL'), 'lista para tocar');
    sm = await call('POST', `/api/stores/${sid}/sim/send`, { text: 'JULIACA TERMINAL' });
    assert.match(sm.chat.vars.sede_shalom, /^JULIACA TERMINAL — Av\. Circunvalación 45 \(JULIACA, SAN ROMÁN, PUNO\)$/, 'queda la sede exacta');
    // Lima con cobertura: no ofrece agencias
    await call('POST', `/api/stores/${sid}/sim/reset`, { flow_id: fl.id });
    await call('POST', `/api/stores/${sid}/sim/send`, { text: 'hola' });
    n = iaCalls.length;
    sm = await call('POST', `/api/stores/${sid}/sim/send`, { text: 'soy de Miraflores, Lima' });
    assert.ok(!/AGENCIAS SHALOM/.test(iaCalls.slice(n).pop().system), 'en Lima no se mete');
    assert.ok(!sm.messages.some((m) => /Agencias Shalom en/.test(m.body || '')));
    // Lima con cobertura, pero la clienta pide Shalom: se respeta y sí se ofrecen agencias de Lima
    await conDatos(sm);
    sm = await call('POST', `/api/stores/${sid}/sim/send`, { text: 'mejor por Shalom, Miraflores' });
    assert.ok(sm.messages.some((m) => /Agencias Shalom en MIRAFLORES/.test(m.body || '')), 'pidió Shalom: ofrece agencias de Lima');
    // Celular del propio WhatsApp y candado de colores
    const { celularWa, coloresNoPedidos } = await import('../src/bot.js');
    assert.equal(celularWa('51912502934'), '912502934');
    assert.equal(celularWa('sim3'), null, 'usuario sin número: se le pide');
    assert.deepEqual(coloresNoPedidos('Vino, Negro, Celeste bebé', ['quiero rojo y negro']), ['Celeste bebé'], 'no pidió celeste');
    assert.deepEqual(coloresNoPedidos('Vino y Negro', ['rojo y negro']), [], 'rojo = vino');
    // «Ate» (cobertura parcial): sin pedir Shalom no ofrece agencias; si pide Shalom, encuentra ATE-VITARTE
    await call('POST', `/api/stores/${sid}/sim/reset`, { flow_id: fl.id });
    await conDatos(await call('POST', `/api/stores/${sid}/sim/send`, { text: 'hola' }));
    sm = await call('POST', `/api/stores/${sid}/sim/send`, { text: 'soy de Ate' });
    assert.ok(!sm.messages.some((m) => /Agencias Shalom en/.test(m.body || '')), 'Ate: primero pregunta en qué parte');
    sm = await call('POST', `/api/stores/${sid}/sim/send`, { text: 'quiero por shalom' });
    assert.ok(sm.messages.some((m) => /Agencias Shalom en ATE-VITARTE/.test(m.body || '')), 'Ate + Shalom: lista de Ate-Vitarte');
    // «Cusco» (departamento = provincia = distrito): todas las del departamento, no solo la del distrito
    await call('POST', `/api/stores/${sid}/sim/reset`, { flow_id: fl.id });
    await conDatos(await call('POST', `/api/stores/${sid}/sim/send`, { text: 'hola' }));
    sm = await call('POST', `/api/stores/${sid}/sim/send`, { text: 'soy de Cusco' });
    let cl = sm.messages.filter((m) => m.sender === 'bot').pop();
    assert.match(cl.body, /Agencias Shalom en CUSCO \(4 de 4\)|Agencias Shalom en CUSCO\./, 'Cusco: todas las del departamento');
    assert.ok(JSON.stringify(cl.extra || '').includes('QUILLABAMBA'));
    // «Quillabamba» no es distrito: se encuentra por el nombre de la agencia
    await call('POST', `/api/stores/${sid}/sim/reset`, { flow_id: fl.id });
    await conDatos(await call('POST', `/api/stores/${sid}/sim/send`, { text: 'hola' }));
    sm = await call('POST', `/api/stores/${sid}/sim/send`, { text: 'Es para Quillabamba cusco' });
    cl = sm.messages.filter((m) => m.sender === 'bot').pop();
    assert.match(cl.body, /Agencias Shalom en QUILLABAMBA \(CUSCO\)/);
    // «Tarapoto San Martín»: el distrito manda (antes salía solo «SAN MARTIN BELLAVISTA»)
    await call('POST', `/api/stores/${sid}/sim/reset`, { flow_id: fl.id });
    await conDatos(await call('POST', `/api/stores/${sid}/sim/send`, { text: 'hola' }));
    sm = await call('POST', `/api/stores/${sid}/sim/send`, { text: 'Jiménez Pimentel 922, Tarapoto San Martín' });
    cl = sm.messages.filter((m) => m.sender === 'bot').pop();
    assert.match(cl.body, /Agencias Shalom en TARAPOTO \(SAN MARTIN\)/);
    // Reglas para responder: todo junto, corto, sin «déjame confirmar»
    assert.match(iaCalls[iaCalls.length - 1].system, /CÓMO RESPONDER[\s\S]*déjame confirmar/);
    // Cobertura parcial (Ate después del Real Plaza…): no es agencia hasta saber en qué parte está
    const { zonasSin, modoFor, DEFAULT_CFG } = await import('../src/orders.js');
    assert.equal(zonasSin(DEFAULT_CFG.sin_cobertura).find((z) => z.name === 'ate').parcial, true);
    assert.equal(modoFor({ distrito: 'Ate' }, DEFAULT_CFG), 'lima');
    assert.equal(modoFor({ distrito: 'Lurín' }, DEFAULT_CFG), 'agencia');
    // Lima sin cobertura (Ancón) sí va por agencia
    await call('POST', `/api/stores/${sid}/sim/reset`, { flow_id: fl.id });
    await conDatos(await call('POST', `/api/stores/${sid}/sim/send`, { text: 'hola' }));
    sm = await call('POST', `/api/stores/${sid}/sim/send`, { text: 'es para Ancón' });
    assert.ok(sm.messages.some((m) => /Agencias Shalom en ANCON/.test(m.body || '')), 'Ancón no tiene motorizado: ofrece agencia');
    // Solo dijo el departamento y hay muchas agencias: primero pregunta la provincia
    await call('POST', `/api/stores/${sid}/sim/reset`, { flow_id: fl.id });
    await conDatos(await call('POST', `/api/stores/${sid}/sim/send`, { text: 'hola' }));
    n = iaCalls.length;
    sm = await call('POST', `/api/stores/${sid}/sim/send`, { text: 'soy de La Libertad' });
    assert.match(iaCalls.slice(n).pop().system, /Hay 12 agencias Shalom en LA LIBERTAD[\s\S]*pregúntale en qué provincia/);
    const zl = sm.messages.filter((m) => m.sender === 'bot').pop();
    assert.match(zl.body, /¿En qué provincia estás\?/);
    assert.ok(/TRUJILLO · 8 agencias/.test(JSON.stringify(zl.extra || '')), 'provincias para tocar con cuántas agencias tiene');
    sm = await call('POST', `/api/stores/${sid}/sim/send`, { text: 'TRUJILLO' });
    const al = sm.messages.filter((m) => m.sender === 'bot').pop();
    assert.match(al.body, /Agencias Shalom en TRUJILLO \(LA LIBERTAD\) \(8 de 8\)|Agencias Shalom en TRUJILLO \(LA LIBERTAD\)\./);
    assert.ok(/VICTOR LARCO/.test(JSON.stringify(al.extra || '')), 'tocó la provincia: salen todas las de la provincia, no solo el distrito');
  });
  await step('Envíos a provincia: formularios, cruzar guía, fotos, ya recogió e importar del artifact', async () => {
    const me = await call('GET', '/api/me');
    const sid = (await call('POST', `/api/companies/${me.companies[0].id}/stores`, { name: 'Prueba envíos' })).store_id;
    let aj = await call('PATCH', `/api/stores/${sid}/envios-config`, {
      productos: [{ nombre: 'Pantalón formal', precios: { 1: 89, 2: 139, 3: 175 }, colores: 'Negro, Plomo claro, Guinda', tallas: 'XS, S, M, L, XL' }, { nombre: 'Leggings cargo', precios: { 1: 109 }, colores: ['Negro', 'Celeste bebé'] }],
      extras: [{ nombre: 'Polo', precio: 25 }], remitentes: [{ nombre: 'REMITENTE UNO', dni: '11112222', cel: '999888777' }], origen: 'Lima / Comas', dias_aviso: 20, dias_devolver: 25,
    });
    assert.equal(aj.cfg.productos[0].colores[1], 'Plomo claro');
    const form = `🚚 Envío Shalom: Arequipa (Av. Ejército)\nNombre: maria lopez\nDNI: 70000001\nCel: 987 000 001\nPedido: pantalones formales\nCantidad: 3\nTalla: 2 M y 1 L\nColores: guinda, gris claro y negro\nAdelanto: 30\n\nShalom: Piura\nNombre: Luz Perez\nDNI: 70000002\nCel: 987000002\nPedido: leggings cargo\nTalla: S\nColor: celeste`;
    let fr = await call('POST', `/api/stores/${sid}/envios/formularios`, { text: form });
    assert.equal(fr.resultados.length, 2);
    assert.ok(fr.resultados.every((x) => x.ok), JSON.stringify(fr.resultados));
    assert.ok(fr.resultados.every((x) => x.envio?.id === x.id && x.envio.status === 'validado'), 'devuelve el envío creado para la pantalla');
    let L = (await call('GET', `/api/stores/${sid}/envios`)).envios;
    const maria = L.find((x) => x.nombre === 'Maria Lopez');
    assert.equal(maria.status, 'validado');
    assert.equal(maria.total, 175, 'precio por 3');
    assert.deepEqual(maria.items.map((i) => `${i.talla} ${i.color}`), ['M Guinda', 'M Plomo claro', 'L Negro'], 'colores con el nombre del producto');
    assert.equal(L.find((x) => x.nombre === 'Luz Perez').items[0].color, 'Celeste bebé');
    fr = await call('POST', `/api/stores/${sid}/envios/formularios`, { text: form.split('\n\n')[0] });
    assert.equal(fr.resultados[0].dup, true, 'no duplica a la misma clienta');
    fr = await call('POST', `/api/stores/${sid}/envios/formularios`, { text: 'Nombre: Rosa Pegada Dos\nDNI: 71112223\nCel: 912 333 444\nShalom: Piura\n\nNombre: Rosa Pegada Dos\nDNI: 71112223\nCel: 912 333 444\nShalom: Piura' });
    assert.deepEqual(fr.resultados.map((x) => !!x.ok), [true, false], 'el mismo formulario dos veces en un pegado = duplicado');
    await call('DELETE', `/api/pedidos/${fr.resultados[0].id}`);
    // Cruzar a mano (código + DNI + orden)
    let cg = await call('POST', `/api/stores/${sid}/envios/cruzar`, { codigo: 'npjk', dni: '70000001', orden: '2000 0001' });
    assert.equal(cg.ok, true, cg.text);
    cg = await call('POST', `/api/stores/${sid}/envios/cruzar`, { codigo: 'npjk', dni: '70000001', orden: '20000001' });
    assert.equal(cg.ok, false, 'la misma guía no se registra dos veces');
    assert.equal((await call('POST', `/api/stores/${sid}/envios/cruzar`, { codigo: 'zzzz', dni: '11112222', orden: '1' })).ok, false, 'el DNI del remitente no cruza');
    // Fotos: la IA lee la guía y se cruza sola
    const fd = new FormData();
    fd.append('fotos', new Blob([IMG], { type: 'image/jpeg' }), 'guia1.jpg');
    const ft = await call('POST', `/api/stores/${sid}/envios/fotos`, undefined, { form: fd });
    assert.equal(ft.resultados[0].ok, true, JSON.stringify(ft));
    await wait(400);
    L = (await call('GET', `/api/stores/${sid}/envios`)).envios;
    const m2 = L.find((x) => x.nombre === 'Maria Lopez');
    assert.equal(m2.guia, '20000001');
    assert.ok(['enviado', 'en_camino', 'en_agencia'].includes(m2.status), m2.status);
    const luz = L.find((x) => x.nombre === 'Luz Perez');
    assert.equal(luz.guia_codigo, 'QWER');
    assert.equal(luz.enviado_at, Date.parse('2026-11-04T18:00:00-05:00'));
    // Seguimiento y no quiere recoger
    let ac = await call('POST', `/api/pedidos/${luz.id}/envio`, { accion: 'seg_add' });
    assert.equal(ac.envio.seg.length, 1);
    ac = await call('POST', `/api/pedidos/${luz.id}/envio`, { accion: 'no_quiere' });
    assert.equal(ac.envio.no_quiere, true);
    ac = await call('POST', `/api/pedidos/${luz.id}/envio-estado`, { status: 'falta_abonar' });
    assert.equal(ac.envio.status, 'falta_abonar');
    // Ya recogió: pegar código y DNI
    const bs = await call('POST', `/api/stores/${sid}/envios/buscar`, { text: 'QWER\n70000001\nXXXX' });
    assert.equal(bs.resultados[0].items[0].id, luz.id);
    assert.equal(bs.resultados[1].how, 'DNI');
    assert.equal(bs.resultados[2].items.length, 0);
    const ids = bs.resultados.flatMap((r) => r.items.filter((i) => i.ck).map((i) => i.id));
    assert.equal((await call('POST', `/api/stores/${sid}/envios/recogido`, { ids })).marcados, 2);
    // Importar del artifact (repetible, sin duplicar)
    const art = { pr: { 'Pantalón formal': { 1: 89 } }, remitentes: [{ id: 'x', nombre: 'OTRO', dni: '1', cel: '2' }],
      g: [{ o: '96000001', c: 'ab12', n: 'Rocio Diaz', d: 'Chiclayo (J. L. Ortiz)', e: '2026-09-01T10:00:00-05:00', s: 'age', q: '965/document/1/', p: 'Pantalón formal', pr: 2, cl: ['Negro', 'Guinda'], tl: ['M', 'M'], t: 139, a: 30, dni: '70000009', wf: '987000009', sg: ['2026-09-20T10:00:00-05:00'], po: [{ k: 'Polo', c: 'Lila', t: 'M', v: 25 }] },
        { o: '96000002', c: 'cd34', n: 'Ana Ruiz', d: 'Piura', e: '2026-08-01T10:00:00-05:00', s: 'rec', p: 'Pantalón formal', pr: 1, cl: ['Negro'], tl: ['S'], t: 89, a: 30 }],
      r: [{ id: 'r50', n: 'Eva Sol', d: 'Tacna', dni: '70000010', cel: '987000010', p: 'Pantalón formal', pr: 1, cl: ['Perla'], tl: ['L'], t: 89, a: 30, f: '2026-11-03T19:00:00-05:00' }] };
    let im = await call('POST', `/api/stores/${sid}/envios/importar`, art);
    assert.equal(im.guias, 2);
    assert.equal(im.registro, 1);
    im = await call('POST', `/api/stores/${sid}/envios/importar`, { ...art, g: [{ ...art.g[0], s: 'rec' }, art.g[1]], r: [] });
    assert.equal(im.nuevos, 0, 'no duplica');
    assert.equal(im.actualizados, 1);
    assert.equal(im.quitados, 1, 'el del registro que ya tiene guía en el artifact se quita');
    const E = await call('GET', `/api/stores/${sid}/envios`);
    const roc = E.envios.find((x) => x.nombre === 'Rocio Diaz');
    assert.equal(roc.status, 'recogido');
    assert.equal(roc.guia_codigo, 'AB12');
    assert.equal(roc.items.find((i) => i.producto === 'Polo').color, 'Lila');
    assert.equal(roc.seg.length, 1);
    assert.equal(E.cfg.remitentes[0].nombre, 'REMITENTE UNO', 'no pisa los ajustes que ya había');
    // El rastreo que llega a destino deja un aviso
    const p3 = (await call('POST', `/api/stores/${sid}/pedidos`, { modo: 'agencia', nombre: 'Aviso Test', items: [{ talla: 'M', cantidad: 1 }] })).pedido;
    await call('PATCH', `/api/pedidos/${p3.id}`, { status: 'validado', guia: '20000001', guia_codigo: 'ZZZZ' });
    await call('POST', `/api/pedidos/${p3.id}/rastrear`);
    const av = await call('GET', `/api/stores/${sid}/avisos`);
    assert.ok(JSON.stringify(av).includes('Llegó a la agencia: Aviso Test'), 'aviso de llegada');
  });
  await step('chats: «Por confirmar» cuando la clienta tiene un pedido nuevo o con Yape por validar', async () => {
    const me = await call('GET', '/api/me');
    const st = me.stores[0];
    const chats = (await call('GET', `/api/stores/${st.id}/chats`)).chats;
    const ch = chats[0];
    const before = (await call('GET', `/api/stores/${st.id}/chats?filter=confirmar`)).chats.length;
    const o = (await call('POST', `/api/stores/${st.id}/pedidos`, { chat_id: ch.id, modo: 'lima', nombre: 'Por Confirmar', distrito: 'Lince', items: [{ talla: 'M', color: 'Negro', cantidad: 1 }] })).pedido;
    let L = (await call('GET', `/api/stores/${st.id}/chats?filter=confirmar`)).chats;
    assert.ok(L.some((x) => x.id === ch.id && x.por_confirmar > 0), 'sale en Por confirmar');
    const sync = (await call('GET', `/api/stores/${st.id}/chats?after=${Date.now() - 5000}`)).chats;
    assert.ok(sync.some((x) => x.id === ch.id), 'el chat se actualiza en la bandeja al crear el pedido');
    await call('PATCH', `/api/pedidos/${o.id}`, { status: 'confirmado' });
    L = (await call('GET', `/api/stores/${st.id}/chats?filter=confirmar`)).chats;
    assert.ok(!L.some((x) => x.id === ch.id && x.por_confirmar > 0) || before > 0, 'al confirmar sale de la lista');
    await call('DELETE', `/api/pedidos/${o.id}`);
  });
  await step('✅ PROVINCIA crea el pedido con el formulario de la asesora; la lista solo muestra ASESOR cuando falta responder', async () => {
    const me = await call('GET', '/api/me');
    const st = me.stores[0];
    await inbound('51911111130', 'wamid.AG1', 'Tarapoto');
    const ch = await until(async () => (await call('GET', `/api/stores/${st.id}/chats?q=911111130`)).chats?.[0]);
    const form = 'Shalom:  JR TAHUANTINSUYO Tarapoto San Martín 🚚📦\n\n➡️ Nombre: Adelmith García\n➡️ DNI: 41085893\n➡️ CEL: 949617856\n\nPedido: Leggins Cargo ✨\n\n✅ Cantidad:4\n✅ Talla: L\n✅ Color: Negro / Beige / Celeste bebe / Azul Noche\n\nMonto total: S/265.00\nAdelanto: S/100\nMonto restante: S/165.00';
    await call('POST', `/api/chats/${ch.id}/messages`, { text: form });
    const labels = (await call('GET', `/api/stores/${st.id}/labels`)).labels;
    const prov = labels.find((l) => /✅\s*PROVINCIA/i.test(l.name));
    const r = await call('PUT', `/api/chats/${ch.id}/labels/${prov.id}`);
    assert.ok(r.pedido?.id, JSON.stringify(r));
    const o = (await call('GET', `/api/pedidos/${r.pedido.id}`)).pedido;
    assert.equal(o.modo, 'agencia');
    assert.equal(o.status, 'validado');
    assert.equal(o.adelanto, 100);
    assert.match(o.sede || '', /TAHUANTINSUYO/);
    assert.equal(o.dni, '41085893');
    const items = typeof o.items === 'string' ? JSON.parse(o.items) : o.items;
    assert.equal(items.reduce((a, i) => a + i.cantidad, 0), 4, JSON.stringify(items));
    // Volver a poner la etiqueta no crea otro pedido
    await call('DELETE', `/api/chats/${ch.id}/labels/${prov.id}`);
    const r2 = await call('PUT', `/api/chats/${ch.id}/labels/${prov.id}`);
    assert.equal(r2.pedido?.ya, true);
    // La bandeja trae quién escribió lo último (para mostrar ASESOR solo si falta responder)
    const row = (await call('GET', `/api/stores/${st.id}/chats?q=911111130`)).chats[0];
    assert.equal(row.last_sender, 'ase');
    await call('DELETE', `/api/pedidos/${o.id}`);
    // 🟡 Terminar de agendar: pedido que dejó la IA en «Yape por validar» → ✅ PROVINCIA lo pasa a Validado
    await inbound('51911111131', 'wamid.AG2', 'Ya yapeé');
    const ch2 = await until(async () => (await call('GET', `/api/stores/${st.id}/chats?q=911111131`)).chats?.[0]);
    const np = await call('POST', `/api/stores/${st.id}/pedidos`, { chat_id: ch2.id, modo: 'agencia', nombre: 'Rosa Q', dni: '41085894', celular: '949617857', ciudad: 'Piura', sede: 'Piura Centro', items: [{ talla: 'M', color: 'Negro', cantidad: 1 }] });
    assert.equal(np.pedido.status, 'por_pagar');
    assert.equal((await call('GET', `/api/stores/${st.id}/chats?q=911111131`)).chats[0].por_confirmar, 1);
    const r3 = await call('PUT', `/api/chats/${ch2.id}/labels/${prov.id}`);
    assert.equal(r3.pedido?.estado, 'validado', JSON.stringify(r3));
    assert.equal((await call('GET', `/api/pedidos/${np.pedido.id}`)).pedido.status, 'validado');
    await call('DELETE', `/api/pedidos/${np.pedido.id}`);
  });
  await step('validación de pagos: captura + pago de la app del celular → confirmar crea el pedido agendado', async () => {
    const me = await call('GET', '/api/me');
    const st = me.stores[0];
    await inbound('51911111132', 'wamid.PG1', 'Soy de Piura');
    const ch = await until(async () => (await call('GET', `/api/stores/${st.id}/chats?q=911111132`)).chats?.[0]);
    const form = 'Shalom: 🚚📦\n\n➡️ Nombre: Ana Ruiz\n➡️ DNI: 41085895\n➡️ CEL: 949617858\n➡️ Sede: Piura Centro\n\nPedido: Leggins Cargo ✨\n\n✅ Cantidad: 3\n✅ Talla: M\n✅ Color: Negro, Beige, Azul noche\n\nMonto total: S/209\nAdelanto: S/30\nMonto restante: S/179';
    await call('POST', `/api/chats/${ch.id}/messages`, { text: form });
    let r = await call('GET', `/api/stores/${st.id}/pagos`);
    assert.ok(!r.pendientes.some((p) => p.chat_id === ch.id), 'sin captura no hay nada que validar');
    await hook(md({ contacts: [{ profile: { name: 'Ana Ruiz' }, wa_id: '51911111132' }], messages: [{ from: '51911111132', id: 'wamid.PG2', timestamp: ts(), type: 'image', image: { id: 'MEDIA_IMG1', mime_type: 'image/jpeg' } }] }));
    const p = await until(async () => (await call('GET', `/api/stores/${st.id}/pagos`)).pendientes.find((x) => x.chat_id === ch.id));
    assert.ok(p.captura?.id, JSON.stringify(p));
    // 📌 Nombre completo + DNI + captura → arriba hasta que alguien abre el chat
    let rowL = (await call('GET', `/api/stores/${st.id}/chats?q=911111132`)).chats[0];
    assert.ok(rowL.listo_at > (rowL.pin_visto || 0), 'la captura con todos los datos lo sube');
    await call('POST', `/api/chats/${ch.id}/read`);
    rowL = (await call('GET', `/api/stores/${st.id}/chats?q=911111132`)).chats[0];
    assert.ok(rowL.pin_visto >= rowL.listo_at, 'abrirlo lo baja');
    const { marcarListo } = await import('../src/bot.js');
    assert.equal(typeof marcarListo, 'function');
    assert.equal(p.esperado.adelanto, 30);
    assert.equal(p.esperado.total, 209);
    assert.equal(p.zona, 'provincia');
    // La app del celular manda la notificación de Yape
    const app = await call('POST', `/api/stores/${st.id}/pagos-app`, {});
    const url = app.url.replace(/^https?:\/\/[^/]+/, BASE);
    assert.equal((await fetch(url.replace(/\/[^/]+$/, '/malo'), { method: 'POST', body: 'x' })).status, 404, 'enlace con clave mala');
    const pr = await (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto: 'Yape! Ana Ruiz te envió un pago por S/ 30. El cód. de seguridad es: 123' }) })).json();
    assert.equal(pr.monto, 30);
    assert.equal(pr.nombre, 'Ana Ruiz');
    const dup = await (await fetch(url, { method: 'POST', body: 'Yape! Ana Ruiz te envió un pago por S/ 30. El cód. de seguridad es: 123' })).json();
    assert.equal(dup.repetido, true, 'la misma notificación no se guarda dos veces');
    r = await call('GET', `/api/stores/${st.id}/pagos`);
    const p2 = r.pendientes.find((x) => x.chat_id === ch.id);
    assert.equal(p2.sugerido?.monto, 30, JSON.stringify(p2));
    assert.equal(p2.sugerido.nombre_ok, true);
    assert.equal(r.app.on, true);
    // Confirmar: se crea el pedido ya validado, con el adelanto, y el chat queda ✅ PROVINCIA
    const ok = await call('POST', `/api/chats/${ch.id}/pago`, { accion: 'ok', msg_id: p2.captura.id, monto: 30, pago_id: p2.sugerido.id });
    assert.equal(ok.status, 200, JSON.stringify(ok));
    const o = (await call('GET', `/api/pedidos/${ok.pedido.id}`)).pedido;
    assert.equal(o.status, 'validado');
    assert.equal(o.adelanto, 30);
    const labels = (await call('GET', `/api/stores/${st.id}/labels`)).labels;
    const row = (await call('GET', `/api/stores/${st.id}/chats?q=911111132`)).chats[0];
    assert.ok(row.labels.includes(labels.find((l) => /✅\s*PROVINCIA/.test(l.name)).id));
    r = await call('GET', `/api/stores/${st.id}/pagos?tab=ok`);
    assert.ok(!r.pendientes.some((x) => x.chat_id === ch.id));
    const mk = r.marcas.find((x) => x.chat_id === ch.id);
    assert.equal(mk.monto, 30);
    assert.equal(r.pagos.find((x) => x.monto === 30).chat_id, ch.id, 'el pago de la app quedó cruzado');
    assert.equal((await call('POST', `/api/chats/${ch.id}/pago`, { accion: 'ok', msg_id: p2.captura.id })).status, 409, 'no se valida dos veces');
    // No se duplica el pedido a mano si el chat ya tiene uno en curso (salvo que sea otra compra)
    const dupP = await call('POST', `/api/stores/${st.id}/pedidos`, { chat_id: ch.id, modo: 'agencia', nombre: 'Ana Ruiz', items: [{ talla: 'M', color: 'Negro', cantidad: 1 }] });
    assert.equal(dupP.status, 409, JSON.stringify(dupP));
    assert.equal(dupP.abierto.id, ok.pedido.id);
    const otra = await call('POST', `/api/stores/${st.id}/pedidos`, { chat_id: ch.id, modo: 'agencia', nombre: 'Ana Ruiz', items: [{ talla: 'M', color: 'Negro', cantidad: 1 }], forzar: true });
    assert.equal(otra.status, 200);
    await call('DELETE', `/api/pedidos/${otra.pedido.id}`);
    // Deshacer vuelve a «Por validar» (el pedido ya existe y queda agendado: no reaparece)
    await call('DELETE', `/api/pago-marks/${mk.id}`);
    r = await call('GET', `/api/stores/${st.id}/pagos`);
    assert.ok(!r.pendientes.some((x) => x.chat_id === ch.id), 'con pedido ya validado no vuelve');
    r = await call('GET', `/api/stores/${st.id}/pagos?tab=ok`);
    const eq = r.marcas.find((x) => x.chat_id === ch.id);
    assert.equal(eq?.via, 'equipo', 'sin marca, la captura sale como agendada por el equipo');
    assert.equal(r.pagos.find((x) => x.monto === 30).chat_id, null);
    await call('DELETE', `/api/pedidos/${o.id}`);
    const { parsePago } = await import('../src/api-pagos.js');
    assert.deepEqual(parsePago('Te plinearon S/ 30.00, Ana Ruiz'), { monto: 30, nombre: 'Ana Ruiz' });
    assert.deepEqual(parsePago('Recibiste S/ 1,234.50 de Rosa Quispe'), { monto: 1234.5, nombre: 'Rosa Quispe' });
  });
  await step('ortografía: lo que escribe el equipo sale con mayúscula y tildes, sin cambiar palabras', async () => {
    const me = await call('GET', '/api/me');
    const st = me.stores[0];
    const ch = (await call('GET', `/api/stores/${st.id}/chats`)).chats[0];
    await hook(md({ contacts: [{ wa_id: ch.wa_id, profile: { name: 'x' } }], messages: [{ from: ch.wa_id, id: 'wamid.orto' + Date.now(), timestamp: ts(), type: 'text', text: { body: 'hola' } }] }));
    let r = await call('POST', `/api/chats/${ch.id}/messages`, { text: 'hola amiga, esta listo tu pedido' });
    assert.equal(r.message.body, 'Hola amiga, está listo tu pedido');
    r = await call('POST', `/api/chats/${ch.id}/messages`, { text: 'esto cambia palabra' });
    assert.equal(r.message.body, 'esto cambia palabra', 'si la IA cambia palabras se manda tal cual');
    r = await call('POST', `/api/chats/${ch.id}/messages`, { text: 'mira https://porte.pe/x' });
    assert.equal(r.message.body, 'mira https://porte.pe/x', 'los enlaces no se tocan');
    await call('PATCH', `/api/stores/${st.id}`, { autocorrect: false });
    r = await call('POST', `/api/chats/${ch.id}/messages`, { text: 'hola amiga, esta listo' });
    assert.equal(r.message.body, 'hola amiga, esta listo', 'apagado: tal cual');
    await call('PATCH', `/api/stores/${st.id}`, { autocorrect: true });
    // Nota de voz grabada en la app: sale como nota de voz (voice: true), no como archivo
    const fd = new FormData();
    fd.append('file', new Blob([Buffer.from('OggS fake')], { type: 'audio/ogg' }), 'nota-de-voz.ogg');
    const n0 = calls.length;
    const au = await call('POST', `/api/chats/${ch.id}/media`, undefined, { form: fd });
    assert.equal(au.message.type, 'audio');
    const sent = calls.slice(n0).find((x) => x.body?.type === 'audio');
    assert.equal(sent?.body?.audio?.voice, true, 'voice: true');
  });
  await step('respuestas rápidas, stickers y plantillas', async () => {
    const expectErr = async (p, re) => {
      const r = await p;
      assert.ok(r.status >= 400 && re.test(r.error || ''), `esperaba error ${re}: ${JSON.stringify(r).slice(0, 200)}`);
    };
    const me = await call('GET', '/api/me');
    const st = me.stores[0];
    const ch = (await call('GET', `/api/stores/${st.id}/chats`)).chats[0];
    await hook(md({ contacts: [{ wa_id: ch.wa_id, profile: { name: 'x' } }], messages: [{ from: ch.wa_id, id: 'wamid.qr' + Date.now(), timestamp: ts(), type: 'text', text: { body: 'hola' } }] }));
    // Crear: texto + 2 fotos
    let fd = new FormData();
    fd.append('atajo', '/precios');
    fd.append('texto', 'Estas son las promos 🔥');
    fd.append('files', new Blob([IMG], { type: 'image/jpeg' }), 'a.jpg');
    fd.append('files', new Blob([IMG], { type: 'image/jpeg' }), 'b.jpg');
    let r = await call('POST', `/api/stores/${st.id}/rapidas`, undefined, { form: fd });
    const q = r.rapida;
    assert.equal(q.atajo, 'precios', 'sin la barra');
    assert.equal(q.media.length, 2);
    assert.ok(!('key' in q.media[0]), 'no muestra la ruta interna');
    await expectErr(call('POST', `/api/stores/${st.id}/rapidas`, { atajo: 'Precios', texto: 'x' }), /Ya existe/);
    r = await call('POST', `/api/stores/${st.id}/rapidas`, { atajo: 'cuentas', texto: 'Yape a nombre de la tienda' });
    // Editar: quitar la 1a foto y dejar solo la 2a
    fd = new FormData();
    fd.append('atajo', 'precios');
    fd.append('texto', 'Promos de hoy');
    fd.append('keep', JSON.stringify([q.media[1].id]));
    r = await call('PUT', `/api/rapidas/${q.id}`, undefined, { form: fd });
    assert.equal(r.rapida.media.length, 1);
    assert.equal(r.rapida.media[0].id, q.media[1].id);
    let list = (await call('GET', `/api/stores/${st.id}/rapidas`)).rapidas;
    assert.deepEqual(list.map((x) => x.atajo), ['precios', 'cuentas']);
    await call('POST', `/api/stores/${st.id}/rapidas/orden`, { ids: [list[1].id, list[0].id] });
    list = (await call('GET', `/api/stores/${st.id}/rapidas`)).rapidas;
    assert.deepEqual(list.map((x) => x.atajo), ['cuentas', 'precios']);
    // Usar en el chat: 1 foto + texto → una sola burbuja con pie de foto
    let n0 = calls.length;
    r = await call('POST', `/api/chats/${ch.id}/rapida`, { id: q.id, texto: 'Hola María, promos de hoy' });
    assert.equal(r.messages.length, 1);
    assert.equal(r.messages[0].type, 'image');
    assert.equal(r.messages[0].body, 'Hola María, promos de hoy');
    const sent = calls.slice(n0).find((x) => x.body?.type === 'image');
    assert.equal(sent?.body?.image?.caption, 'Hola María, promos de hoy');
    // Borrar la respuesta no borra la foto del chat
    await call('DELETE', `/api/rapidas/${q.id}`);
    const pic = await fetch(BASE + `/api/media/${r.messages[0].id}`, { headers: { cookie } });
    assert.equal(pic.status, 200, 'la foto del chat sigue');
    // Stickers: subir un WEBP y mandarlo
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([30, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(22, 1)]);
    fd = new FormData();
    fd.append('file', new Blob([webp], { type: 'image/webp' }), 's.webp');
    r = await call('POST', `/api/stores/${st.id}/stickers`, undefined, { form: fd });
    assert.equal(r.sticker.animated, 0);
    fd = new FormData();
    fd.append('file', new Blob([IMG], { type: 'image/webp' }), 'no.webp');
    await expectErr(call('POST', `/api/stores/${st.id}/stickers`, undefined, { form: fd }), /WEBP/);
    n0 = calls.length;
    const sm = await call('POST', `/api/chats/${ch.id}/sticker`, { sticker_id: r.sticker.id });
    assert.equal(sm.message.type, 'sticker');
    assert.ok(calls.slice(n0).some((x) => x.body?.type === 'sticker' && x.body.sticker?.id), 'se mandó como sticker');
    // Guardar el sticker que llegó en el chat
    const saved = await call('POST', `/api/stores/${st.id}/stickers`, { message_id: sm.message.id });
    assert.ok(saved.sticker.id);
    assert.equal((await call('GET', `/api/stores/${st.id}/stickers`)).stickers.length, 2);
    // Plantillas: listar, crear con foto, mandar y borrar
    r = await call('GET', `/api/stores/${st.id}/plantillas`);
    assert.ok(r.conectado);
    const tp = r.plantillas.find((x) => x.name === 'reactivar_clientas');
    assert.deepEqual(tp.vars, [1, 2]);
    assert.equal(tp.header.format, 'IMAGE');
    fd = new FormData();
    fd.append('name', 'Volvió tu color');
    fd.append('category', 'MARKETING');
    fd.append('body', '{{1}} volvió');
    await expectErr(call('POST', `/api/stores/${st.id}/plantillas`, undefined, { form: fd }), /empiece o termine/);
    fd.set('body', 'Hola {{1}}, volvió tu color favorito.');
    fd.append('examples', JSON.stringify(['María']));
    fd.append('header', 'IMAGE');
    fd.append('file', new Blob([IMG], { type: 'image/jpeg' }), 'p.jpg');
    fd.append('buttons', JSON.stringify([{ type: 'QUICK_REPLY', text: 'Sí, quiero' }, { type: 'URL', text: 'Ver', url: 'https://porte.pe' }]));
    n0 = calls.length;
    r = await call('POST', `/api/stores/${st.id}/plantillas`, undefined, { form: fd });
    assert.equal(r.name, 'volvio_tu_color');
    const cr = calls.slice(n0).find((x) => x.method === 'POST' && x.path === `${WABA_ID}/message_templates`);
    assert.equal(cr.body.components[0].example.header_handle[0], 'HANDLE1');
    assert.deepEqual(cr.body.components.find((x) => x.type === 'BODY').example.body_text, [['María']]);
    assert.equal(cr.body.components.find((x) => x.type === 'BUTTONS').buttons[1].url, 'https://porte.pe');
    await expectErr(call('POST', `/api/chats/${ch.id}/plantilla`, { name: 'reactivar_clientas', params: ['María'] }), /Llena todos/);
    await expectErr(call('POST', `/api/chats/${ch.id}/plantilla`, { name: 'reactivar_clientas', params: ['María', 'vino'] }), /elige la foto/);
    fd = new FormData();
    fd.append('data', JSON.stringify({ name: 'reactivar_clientas', language: 'es', params: ['María', 'vino'] }));
    fd.append('file', new Blob([IMG], { type: 'image/jpeg' }), 'f.jpg');
    n0 = calls.length;
    r = await call('POST', `/api/chats/${ch.id}/plantilla`, undefined, { form: fd });
    assert.equal(r.message.status, 'sent');
    assert.equal(r.message.type, 'image');
    assert.ok(r.message.body.includes('Hola María 👋 volvió el color vino'));
    const tm = calls.slice(n0).find((x) => x.body?.type === 'template');
    assert.equal(tm.body.template.name, 'reactivar_clientas');
    assert.equal(tm.body.template.components[0].parameters[0].image.id.startsWith('up_media_'), true);
    assert.deepEqual(tm.body.template.components[1].parameters.map((x) => x.text), ['María', 'vino']);
    await expectErr(call('POST', `/api/chats/${ch.id}/plantilla`, { name: 'en_revision' }), /no está aprobada/);
    await call('DELETE', `/api/stores/${st.id}/plantillas/volvio_tu_color`);
  });
  await step('celular (9 dígitos, empieza con 9) vs DNI (8) vs carnet de extranjería (12)', async () => {
    const { fixIds } = await import('../src/bot.js');
    assert.deepEqual(fixIds({ celular: '73559594' }, 'Jordan Suyon 73559594'), { dni: '73559594' });
    assert.deepEqual(fixIds({ dni: '987654321' }, ''), { celular: '987654321' });
    assert.deepEqual(fixIds({}, 'JHORDAN SUYON\n73559594\n987 654 321'), { celular: '987654321', dni: '73559594' });
    assert.deepEqual(fixIds({}, 'ce 001234567890'), { dni: '001234567890' });
  });
  await step('saldo de la IA: pongo el saldo y se descuenta lo que gasta el sistema', async () => {
    let r = await call('PATCH', '/api/admin/ia-saldo', { provider: 'anthropic', saldo: '10.00' });
    assert.equal(r.proveedores.find((p) => p.id === 'anthropic').saldo, 10);
    const me = await call('GET', '/api/me');
    const st = me.stores[0];
    const ch = (await call('GET', `/api/stores/${st.id}/chats`)).chats[0];
    await call('POST', `/api/chats/${ch.id}/messages`, { text: 'hola amiga, esta listo tu pedido' });
    r = await call('GET', '/api/admin/ia-saldo');
    const a = r.proveedores.find((p) => p.id === 'anthropic');
    assert.ok(a.saldo < 10 && a.saldo > 9.99, String(a.saldo));
    assert.ok(me.ia_saldo, 'va en /api/me para el admin');
    assert.equal((await call('PATCH', '/api/admin/ia-saldo', { provider: 'anthropic', saldo: 'abc' })).status, 400);
  });
  await step('asistente de ropa y referencias del Panel', async () => {
    const { parseTallas, cleanAsistente, flowAsistente, assetsFor } = await import('../src/bot-template.js');
    const T = parseTallas('S · Jean 28-30\nM\nL · 34 a 36');
    assert.deepEqual(T.map((t) => t.value), ['S', 'M', 'L']);
    assert.ok(T[0].words.includes('29') && T[2].words.includes('35'));
    assert.deepEqual(parseTallas('S, M, L').map((t) => t.value), ['S', 'M', 'L']);
    assert.throws(() => cleanAsistente({ producto: 'Jogger', precios: { 1: 69 }, tallas: 'S', colores: '' }, 'ropa'), /colores/);
    const a = cleanAsistente({ producto: 'Jogger', precios: { 1: 69, 3: 159 }, tallas: 'S\nM', colores: 'Negro, Beige', lima: true, provincia: false }, 'ropa');
    const g = flowAsistente(a, 'ropa');
    assert.deepEqual(g.nodes.find((n) => n.type === 'recognize').options.map((o) => o.value), ['S', 'M']);
    assert.ok(!g.nodes.some((n) => n.id === 'yape_pendiente'), 'sin provincia no hay pago pendiente');
    assert.deepEqual(assetsFor('ropa', a).filter((x) => x.key.startsWith('colores-')).map((x) => x.key), ['colores-S', 'colores-M']);
    // Panel: subir un ejemplo y tomar los de una tienda
    const me = await call('GET', '/api/me');
    const st = me.stores[0];
    const fd = new FormData();
    fd.append('key', 'simple:precios');
    fd.append('file', new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], { type: 'image/jpeg' }), 'ej.jpg');
    assert.equal((await call('POST', '/api/admin/referencias', undefined, { form: fd })).ok, true);
    let R = await call('GET', '/api/admin/referencias');
    assert.equal(R.keys.find((k) => k.key === 'simple:precios').mime, 'image/jpeg');
    const img = await call('GET', '/api/referencias/simple%3Aprecios', undefined, { raw: true });
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/jpeg');
    const cp = await call('POST', '/api/admin/referencias/copiar', { store_id: st.id });
    assert.ok(cp.copiadas >= 1, JSON.stringify(cp));
    R = await call('GET', '/api/admin/referencias');
    assert.ok(R.keys.find((k) => k.key === 'ropa:precios').mime, 'la foto de precios de Porte queda como ejemplo');
    assert.equal((await call('DELETE', '/api/admin/referencias/simple%3Aprecios')).ok, true);
    assert.equal((await call('GET', '/api/referencias/simple%3Aprecios')).status, 404);
    // «Ver como» del admin: el asistente en vista previa no guarda nada
    const before = await call('GET', `/api/stores/${st.id}/bot`);
    const pv = await call('POST', `/api/stores/${st.id}/asistente?preview=1`, { rubro: 'simple', producto: 'Parlante', precios: { 1: 99 } });
    assert.equal(pv.preview, true);
    assert.equal(pv.flow_id, null);
    assert.equal(pv.rubro, 'simple');
    assert.ok(pv.assets.some((x) => x.key === 'producto'));
    const after = await call('GET', `/api/stores/${st.id}/bot`);
    assert.equal(after.settings.ia_prompt, before.settings.ia_prompt, 'su prompt no cambia');
    assert.equal(after.flows.length, before.flows.length, 'no crea flujo');
    assert.equal((await call('GET', '/api/me')).stores[0].rubro, 'ropa', 'su tienda sigue siendo de ropa');
    // una tienda nueva de ropa nace con el asistente pendiente
    const ns = await call('POST', `/api/companies/${st.company_id}/stores`, { name: 'Prueba ropa', rubro: 'ropa' });
    const nst = ns.stores.find((x) => x.id === ns.store_id);
    assert.equal(nst.rubro, 'ropa');
    assert.equal(nst.setup, 1);
    assert.equal((await call('POST', `/api/companies/${st.company_id}/stores`, { name: 'Mal', rubro: 'zapatos' })).status, 400);
    await call('DELETE', `/api/stores/${ns.store_id}`).catch(() => {});
  });
  await step('páginas para Meta', async () => {
    for (const p of ['/privacidad', '/eliminar-datos', '/terminos', '/planes']) assert.equal((await fetch(BASE + p)).status, 200);
    const planes = await (await fetch(BASE + '/planes')).text();
    assert.match(planes, /S\/25 al mes/);
    assert.match(planes, /12 meses/);
    assert.match(planes, /48 horas/);
    assert.match(planes, /Reembolsos/);
    const app = await fetch(BASE + '/invitacion/abc');
    assert.equal(app.status, 200, 'la app web carga en rutas propias');
  });
  // Para revisar pantallas con la base de prueba: SCRM_HOLD=/ruta/script.mjs npm test
  if (process.env.SCRM_HOLD) await (await import(process.env.SCRM_HOLD)).default({ BASE, cookie, call });
  console.log(`\nTodo bien: ${passed} pruebas pasaron.`);
} catch (e) {
  console.error('\nFALLÓ:', e.message, (e.stack || '').split('\n').find((l) => l.includes('e2e.mjs')));
  console.error(log.split('\n').filter((l) => /error|Error|✘/.test(l)).slice(-15).join('\n'));
  process.exitCode = 1;
} finally {
  try { process.kill(-wd.pid, 'SIGTERM'); } catch {}
  meta.close();
  fs.rmSync(persist, { recursive: true, force: true });
}
