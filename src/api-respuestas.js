// Respuestas rápidas, stickers guardados y plantillas de WhatsApp (por tienda)
import { Hono } from 'hono';
import { now, fail, clip, randomToken } from './util.js';
import { storeFor } from './auth.js';
import { kindForMime, SEND_RULES, listTemplates, createTemplateFull, deleteTemplate, uploadHandle } from './whatsapp.js';
import { fetchMediaToR2 } from './webhook.js';

const r = new Hono();
const MAX_MEDIA = 6;
const MAX_QR = 300;
const MAX_STK = 120;
const DOC_MAX = 25 * 1048576;

const parse = (s, d) => {
  try {
    return JSON.parse(s) ?? d;
  } catch {
    return d;
  }
};
const shapeQR = (x) => ({ id: x.id, atajo: x.atajo, texto: x.texto || '', media: parse(x.media, []).map(({ key, ...m }) => m), uses: x.uses, sort: x.sort });
const cleanAtajo = (s) => clip(String(s || '').trim().replace(/^\/+/, '').replace(/\s+/g, ' '), 40);

async function readBody(c) {
  const ct = c.req.header('content-type') || '';
  if (ct.includes('multipart/form-data')) {
    const f = await c.req.formData();
    return { atajo: f.get('atajo'), texto: f.get('texto'), keep: parse(f.get('keep') || '[]', []), order: parse(f.get('order') || '[]', []), files: f.getAll('files').filter((x) => x && typeof x !== 'string') };
  }
  const b = await c.req.json().catch(() => ({}));
  return { ...b, keep: b.keep || [], order: b.order || [], files: [] };
}

function mimeOf(file) {
  let m = String(file.type || '').split(';')[0].toLowerCase();
  if (m === 'audio/x-m4a' || m === 'audio/m4a') m = 'audio/mp4';
  if (m === 'audio/mp3') m = 'audio/mpeg';
  return m || 'application/octet-stream';
}

// Guarda los archivos nuevos en R2 y arma la lista final (en el orden que eligió)
async function buildMedia(env, storeId, qrId, prev, keep, files, order) {
  const keepSet = new Set(keep.map(String));
  const kept = prev.filter((m) => keepSet.has(m.id));
  const added = [];
  for (const file of files) {
    const mime = mimeOf(file);
    const kind = kindForMime(mime);
    const max = kind === 'document' ? DOC_MAX : SEND_RULES[kind].max;
    if (file.size > max) fail(413, `«${file.name}» pasa de ${Math.round(max / 1048576)} MB.`);
    const id = randomToken(6);
    const key = `qr/s${storeId}/q${qrId}/${id}`;
    await env.MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: mime } });
    added.push({ id, key, kind, mime, name: clip(file.name || 'archivo', 120), size: file.size });
  }
  let all = [...kept, ...added];
  // order: lista de ids (los nuevos llegan como «new:0», «new:1»…)
  if (order.length) {
    const byId = new Map(all.map((m) => [m.id, m]));
    added.forEach((m, i) => byId.set('new:' + i, m));
    const seen = new Set();
    const sorted = [];
    for (const k of order) {
      const m = byId.get(String(k));
      if (m && !seen.has(m.id)) {
        seen.add(m.id);
        sorted.push(m);
      }
    }
    for (const m of all) if (!seen.has(m.id)) sorted.push(m);
    all = sorted;
  }
  if (all.length > MAX_MEDIA) fail(400, `Máximo ${MAX_MEDIA} archivos por respuesta rápida.`);
  // Los que quitó se borran de R2
  for (const m of prev) if (!keepSet.has(m.id)) await env.MEDIA.delete(m.key).catch(() => {});
  return all;
}

/* ---------- Respuestas rápidas ---------- */
r.get('/stores/:id/rapidas', async (c) => {
  const st = await storeFor(c, c.req.param('id'));
  const { results } = await c.env.DB.prepare('SELECT * FROM quick_replies WHERE store_id = ? ORDER BY sort, id').bind(st.id).all();
  return c.json({ rapidas: results.map(shapeQR) });
});

r.post('/stores/:id/rapidas', async (c) => {
  const st = await storeFor(c, c.req.param('id'));
  const b = await readBody(c);
  const atajo = cleanAtajo(b.atajo);
  const texto = clip(String(b.texto || '').trim(), 4096);
  if (!atajo) fail(400, 'Ponle un nombre corto (atajo), por ejemplo «precios».');
  if (!texto && !b.files.length) fail(400, 'Escribe el mensaje o agrega una foto o video.');
  const db = c.env.DB;
  const n = await db.prepare('SELECT COUNT(*) AS n, MAX(sort) AS s FROM quick_replies WHERE store_id = ?').bind(st.id).first();
  if (n.n >= MAX_QR) fail(400, `Máximo ${MAX_QR} respuestas rápidas por tienda.`);
  if (await db.prepare('SELECT 1 AS x FROM quick_replies WHERE store_id = ? AND LOWER(atajo) = LOWER(?)').bind(st.id, atajo).first()) fail(409, `Ya existe una respuesta con el atajo «${atajo}».`);
  const t = now();
  const ins = await db.prepare('INSERT INTO quick_replies (store_id, atajo, texto, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(st.id, atajo, texto || null, (n.s || 0) + 1, t, t).run();
  const id = ins.meta.last_row_id;
  try {
    const media = await buildMedia(c.env, st.id, id, [], [], b.files, b.order);
    await db.prepare('UPDATE quick_replies SET media = ? WHERE id = ?').bind(JSON.stringify(media), id).run();
  } catch (e) {
    await db.prepare('DELETE FROM quick_replies WHERE id = ?').bind(id).run();
    throw e;
  }
  const row = await db.prepare('SELECT * FROM quick_replies WHERE id = ?').bind(id).first();
  return c.json({ rapida: shapeQR(row) });
});

async function qrFor(c) {
  const row = await c.env.DB.prepare('SELECT * FROM quick_replies WHERE id = ?').bind(Number(c.req.param('qid'))).first();
  if (!row) fail(404, 'Esa respuesta rápida ya no existe.');
  const st = await storeFor(c, row.store_id);
  return { row, st };
}

r.put('/rapidas/:qid', async (c) => {
  const { row, st } = await qrFor(c);
  const b = await readBody(c);
  const atajo = cleanAtajo(b.atajo ?? row.atajo);
  const texto = clip(String(b.texto ?? row.texto ?? '').trim(), 4096);
  if (!atajo) fail(400, 'Ponle un nombre corto (atajo).');
  const db = c.env.DB;
  if (await db.prepare('SELECT 1 AS x FROM quick_replies WHERE store_id = ? AND LOWER(atajo) = LOWER(?) AND id != ?').bind(st.id, atajo, row.id).first()) fail(409, `Ya existe una respuesta con el atajo «${atajo}».`);
  const prev = parse(row.media, []);
  const media = await buildMedia(c.env, st.id, row.id, prev, b.keep, b.files, b.order);
  if (!texto && !media.length) fail(400, 'Escribe el mensaje o deja al menos una foto o video.');
  await db.prepare('UPDATE quick_replies SET atajo = ?, texto = ?, media = ?, updated_at = ? WHERE id = ?').bind(atajo, texto || null, JSON.stringify(media), now(), row.id).run();
  return c.json({ rapida: shapeQR(await db.prepare('SELECT * FROM quick_replies WHERE id = ?').bind(row.id).first()) });
});

r.delete('/rapidas/:qid', async (c) => {
  const { row } = await qrFor(c);
  for (const m of parse(row.media, [])) await c.env.MEDIA.delete(m.key).catch(() => {});
  await c.env.DB.prepare('DELETE FROM quick_replies WHERE id = ?').bind(row.id).run();
  return c.json({ ok: true });
});

// Orden de la lista (arrastrar o flechas)
r.post('/stores/:id/rapidas/orden', async (c) => {
  const st = await storeFor(c, c.req.param('id'));
  const { ids = [] } = await c.req.json().catch(() => ({}));
  const db = c.env.DB;
  await db.batch(ids.slice(0, MAX_QR).map((id, i) => db.prepare('UPDATE quick_replies SET sort = ? WHERE id = ? AND store_id = ?').bind(i + 1, Number(id), st.id)));
  return c.json({ ok: true });
});

// Copia todas las respuestas de otra tienda tuya (con sus fotos); no repite atajos
r.post('/stores/:id/rapidas/copiar', async (c) => {
  const st = await storeFor(c, c.req.param('id'));
  const { from } = await c.req.json().catch(() => ({}));
  const src = await storeFor(c, from);
  if (src.id === st.id) fail(400, 'Elige otra tienda.');
  const db = c.env.DB;
  const { results: mine } = await db.prepare('SELECT LOWER(atajo) AS a FROM quick_replies WHERE store_id = ?').bind(st.id).all();
  const have = new Set(mine.map((x) => x.a));
  const { results } = await db.prepare('SELECT * FROM quick_replies WHERE store_id = ? ORDER BY sort, id').bind(src.id).all();
  let n = 0;
  const base = (await db.prepare('SELECT MAX(sort) AS s FROM quick_replies WHERE store_id = ?').bind(st.id).first()).s || 0;
  for (const x of results) {
    if (have.has(x.atajo.toLowerCase()) || have.size + n >= MAX_QR) continue;
    const t = now();
    const ins = await db.prepare('INSERT INTO quick_replies (store_id, atajo, texto, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(st.id, x.atajo, x.texto, base + n + 1, t, t).run();
    const id = ins.meta.last_row_id;
    const media = [];
    for (const m of parse(x.media, [])) {
      const obj = await c.env.MEDIA.get(m.key);
      if (!obj) continue;
      const key = `qr/s${st.id}/q${id}/${m.id}`;
      await c.env.MEDIA.put(key, await obj.arrayBuffer(), { httpMetadata: { contentType: m.mime } });
      media.push({ ...m, key });
    }
    await db.prepare('UPDATE quick_replies SET media = ? WHERE id = ?').bind(JSON.stringify(media), id).run();
    n++;
  }
  return c.json({ copiadas: n, saltadas: results.length - n });
});

// Ver la foto/video/audio guardado de una respuesta rápida
r.get('/rapidas/:qid/media/:mid', async (c) => {
  const { row } = await qrFor(c);
  const m = parse(row.media, []).find((x) => x.id === c.req.param('mid'));
  if (!m) fail(404, 'Ese archivo ya no está.');
  return serve(c, m.key, m.mime);
});

async function serve(c, key, mime) {
  const obj = await c.env.MEDIA.get(key);
  if (!obj) fail(404, 'El archivo ya no está guardado.');
  return new Response(obj.body, { headers: { 'Content-Type': mime || 'application/octet-stream', 'Cache-Control': 'private, max-age=31536000, immutable' } });
}

/* ---------- Stickers ---------- */
// Un sticker de WhatsApp es WEBP: fijo hasta 100 KB, animado hasta 500 KB (512 × 512 px)
const isAnimated = (bytes) => {
  const b = new Uint8Array(bytes.slice(0, 4096));
  for (let i = 12; i < b.length - 4; i++) if (b[i] === 0x41 && b[i + 1] === 0x4e && b[i + 2] === 0x49 && b[i + 3] === 0x4d) return true; // «ANIM»
  return false;
};
const isWebp = (bytes) => {
  const b = new Uint8Array(bytes.slice(0, 12));
  return String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP';
};

r.get('/stores/:id/stickers', async (c) => {
  const st = await storeFor(c, c.req.param('id'));
  const { results } = await c.env.DB.prepare('SELECT id, animated, uses, last_used_at FROM stickers WHERE store_id = ? ORDER BY COALESCE(last_used_at, created_at) DESC, id DESC').bind(st.id).all();
  return c.json({ stickers: results });
});

async function saveSticker(env, st, bytes) {
  if (!isWebp(bytes)) fail(400, 'El sticker debe ser una imagen WEBP. Sube una foto y la convertimos sola.');
  const animated = isAnimated(bytes);
  const max = animated ? 500 * 1024 : 100 * 1024;
  if (bytes.byteLength > max) fail(413, animated ? 'El sticker animado pasa de 500 KB.' : 'El sticker pasa de 100 KB.');
  const db = env.DB;
  const n = await db.prepare('SELECT COUNT(*) AS n FROM stickers WHERE store_id = ?').bind(st.id).first();
  if (n.n >= MAX_STK) fail(400, `Máximo ${MAX_STK} stickers por tienda. Borra alguno.`);
  const key = `stk/s${st.id}/${randomToken(8)}.webp`;
  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: 'image/webp' } });
  const ins = await db.prepare('INSERT INTO stickers (store_id, media_key, mime, size, animated, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(st.id, key, 'image/webp', bytes.byteLength, animated ? 1 : 0, now()).run();
  return { id: ins.meta.last_row_id, animated: animated ? 1 : 0, uses: 0 };
}

// Subir uno (ya convertido a WEBP en el navegador) o guardar uno que mandó una clienta (message_id)
r.post('/stores/:id/stickers', async (c) => {
  const st = await storeFor(c, c.req.param('id'));
  const ct = c.req.header('content-type') || '';
  let bytes;
  if (ct.includes('multipart/form-data')) {
    const f = (await c.req.formData()).get('file');
    if (!f || typeof f === 'string') fail(400, 'No llegó el sticker.');
    bytes = await f.arrayBuffer();
  } else {
    const { message_id } = await c.req.json().catch(() => ({}));
    const m = await c.env.DB.prepare('SELECT id, chat_id, store_id, type, media_id, media_key, media_mime, media_name FROM messages WHERE id = ?').bind(Number(message_id)).first();
    if (!m || m.store_id !== st.id || m.type !== 'sticker') fail(404, 'Ese sticker no está en esta tienda.');
    let key = m.media_key;
    if (!key) key = await fetchMediaToR2(c.env, st, m);
    const obj = await c.env.MEDIA.get(key);
    if (!obj) fail(404, 'El sticker ya no está guardado.');
    bytes = await obj.arrayBuffer();
  }
  return c.json({ sticker: await saveSticker(c.env, st, bytes) });
});

async function stkFor(c) {
  const row = await c.env.DB.prepare('SELECT * FROM stickers WHERE id = ?').bind(Number(c.req.param('sid'))).first();
  if (!row) fail(404, 'Ese sticker ya no existe.');
  const st = await storeFor(c, row.store_id);
  return { row, st };
}

r.get('/stickers/:sid', async (c) => {
  const { row } = await stkFor(c);
  return serve(c, row.media_key, 'image/webp');
});

r.delete('/stickers/:sid', async (c) => {
  const { row } = await stkFor(c);
  await c.env.MEDIA.delete(row.media_key).catch(() => {});
  await c.env.DB.prepare('DELETE FROM stickers WHERE id = ?').bind(row.id).run();
  return c.json({ ok: true });
});

/* ---------- Plantillas de WhatsApp (las aprueba Meta; sirven para escribir fuera de las 24 h) ---------- */
export function tplShape(t, local) {
  const comp = (type) => (t.components || []).find((x) => x.type === type);
  const head = comp('HEADER');
  const body = comp('BODY')?.text || '';
  const vars = [...new Set((body.match(/\{\{(\d+)\}\}/g) || []).map((x) => Number(x.replace(/\D/g, ''))))].sort((a, b) => a - b);
  const ex = comp('BODY')?.example?.body_text?.[0] || [];
  return {
    name: t.name,
    status: t.status,
    category: t.category,
    language: t.language,
    rejected_reason: t.rejected_reason && t.rejected_reason !== 'NONE' ? t.rejected_reason : null,
    quality: t.quality_score?.score || null,
    header: head ? { format: head.format, text: head.text || '' } : null,
    body,
    vars,
    examples: ex,
    footer: comp('FOOTER')?.text || '',
    buttons: (comp('BUTTONS')?.buttons || []).map((b) => ({ type: b.type, text: b.text, url: b.url || '' })),
    has_media: !!local?.media_key,
  };
}

r.get('/stores/:id/plantillas', async (c) => {
  const st = await storeFor(c, c.req.param('id'));
  if (st.status !== 'activo' || !st.waba_id) return c.json({ plantillas: [], conectado: false });
  const list = await listTemplates(c.env, st);
  const { results } = await c.env.DB.prepare('SELECT name, media_key FROM wa_templates WHERE store_id = ?').bind(st.id).all();
  const local = new Map(results.map((x) => [x.name, x]));
  // Las de los avisos automáticos (suyon_…) también salen, marcadas
  return c.json({ conectado: true, plantillas: list.map((t) => ({ ...tplShape(t, local.get(t.name)), auto: /^suyon_/.test(t.name) })) });
});

const slug = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);

r.post('/stores/:id/plantillas', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  if (st.status !== 'activo' || !st.waba_id) fail(409, 'Primero conecta el número de WhatsApp de esta tienda.');
  const f = await c.req.formData();
  const name = slug(f.get('name'));
  if (!name) fail(400, 'Ponle un nombre a la plantilla (ej. «reactivar clientas»).');
  const category = f.get('category') === 'UTILITY' ? 'UTILITY' : 'MARKETING';
  const body = String(f.get('body') || '').trim();
  if (!body) fail(400, 'Escribe el mensaje de la plantilla.');
  if (body.length > 1024) fail(400, 'El mensaje pasa de 1,024 letras.');
  const nums = [...new Set((body.match(/\{\{(\d+)\}\}/g) || []).map((x) => Number(x.replace(/\D/g, ''))))].sort((a, b) => a - b);
  if (nums.some((n, i) => n !== i + 1)) fail(400, 'Los datos deben ir en orden: {{1}}, {{2}}, {{3}}…');
  if (/^\s*\{\{\d+\}\}/.test(body) || /\{\{\d+\}\}[\s.!?¡¿,]*$/.test(body)) fail(400, 'Meta no acepta que el mensaje empiece o termine con un dato {{n}}. Agrega una palabra antes o después.');
  const examples = parse(f.get('examples') || '[]', []).map((x) => clip(String(x || '').trim(), 200));
  if (nums.length && (examples.length < nums.length || examples.slice(0, nums.length).some((x) => !x))) fail(400, 'Escribe un ejemplo para cada dato {{n}} (Meta lo pide para revisar).');
  const hf = String(f.get('header') || '');
  let header = null;
  let mediaKey = null;
  let mediaMime = null;
  let bytes = null;
  if (hf === 'TEXT') {
    const text = clip(String(f.get('header_text') || '').trim(), 60);
    if (text && /\{\{/.test(text)) fail(400, 'El título no puede llevar datos {{n}}.');
    if (text) header = { format: 'TEXT', text };
  } else if (hf === 'IMAGE' || hf === 'VIDEO') {
    const file = f.get('file');
    if (!file || typeof file === 'string') fail(400, hf === 'IMAGE' ? 'Sube la foto de la plantilla.' : 'Sube el video de la plantilla.');
    mediaMime = String(file.type || '').split(';')[0].toLowerCase();
    if (hf === 'IMAGE' && !['image/jpeg', 'image/png'].includes(mediaMime)) fail(400, 'La foto debe ser JPG o PNG.');
    if (hf === 'VIDEO' && mediaMime !== 'video/mp4') fail(400, 'El video debe ser MP4.');
    if (file.size > (hf === 'IMAGE' ? 5 : 16) * 1048576) fail(413, hf === 'IMAGE' ? 'La foto pasa de 5 MB.' : 'El video pasa de 16 MB.');
    bytes = await file.arrayBuffer();
    const h = await uploadHandle(c.env, st, bytes, mediaMime, hf === 'IMAGE' ? (mediaMime === 'image/png' ? 'plantilla.png' : 'plantilla.jpg') : 'plantilla.mp4');
    header = { format: hf, handle: h };
  }
  const footer = clip(String(f.get('footer') || '').trim(), 60);
  const buttons = parse(f.get('buttons') || '[]', [])
    .map((b) => ({ type: b.type === 'URL' ? 'URL' : 'QUICK_REPLY', text: clip(String(b.text || '').trim(), 25), url: String(b.url || '').trim() }))
    .filter((b) => b.text && (b.type !== 'URL' || /^https:\/\/\S+$/.test(b.url)))
    .slice(0, 4);
  if (buttons.filter((b) => b.type === 'URL').length > 1) fail(400, 'Solo 1 botón con enlace.');
  const res = await createTemplateFull(c.env, st, { name, category, header, body, example: nums.length ? examples.slice(0, nums.length) : null, footer, buttons });
  if (bytes) {
    mediaKey = `tpl/s${st.id}/${name}`;
    await c.env.MEDIA.put(mediaKey, bytes, { httpMetadata: { contentType: mediaMime } });
    await c.env.DB.prepare('INSERT OR REPLACE INTO wa_templates (store_id, name, media_key, media_mime, created_at) VALUES (?, ?, ?, ?, ?)').bind(st.id, name, mediaKey, mediaMime, now()).run();
  }
  return c.json({ ok: true, name, status: res.status || 'PENDING', category: res.category || category });
});

r.delete('/stores/:id/plantillas/:name', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  const name = c.req.param('name');
  await deleteTemplate(c.env, st, name);
  const row = await c.env.DB.prepare('SELECT media_key FROM wa_templates WHERE store_id = ? AND name = ?').bind(st.id, name).first();
  if (row?.media_key) await c.env.MEDIA.delete(row.media_key).catch(() => {});
  await c.env.DB.prepare('DELETE FROM wa_templates WHERE store_id = ? AND name = ?').bind(st.id, name).run();
  return c.json({ ok: true });
});

r.get('/stores/:id/plantillas/:name/media', async (c) => {
  const st = await storeFor(c, c.req.param('id'));
  const row = await c.env.DB.prepare('SELECT media_key, media_mime FROM wa_templates WHERE store_id = ? AND name = ?').bind(st.id, c.req.param('name')).first();
  if (!row?.media_key) fail(404, 'Esta plantilla no tiene foto guardada aquí.');
  return serve(c, row.media_key, row.media_mime);
});

export default r;
