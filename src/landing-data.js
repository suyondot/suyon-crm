// Contenido editable de la página pública: video y testimonios reales (se cargan desde el Panel)
import { now, fail, randomToken } from './util.js';

const KEY = 'landing';
const VIDEO_MAX = 50 * 1024 * 1024;
const PHOTO_MAX = 3 * 1024 * 1024;

export async function loadLanding(env) {
  const r = await env.DB.prepare("SELECT value FROM platform_settings WHERE key = ?").bind(KEY).first().catch(() => null);
  let v = {};
  try {
    v = r ? JSON.parse(r.value) : {};
  } catch {}
  return { video: v.video || null, testimonios: Array.isArray(v.testimonios) ? v.testimonios : [] };
}

async function save(env, data) {
  await env.DB.prepare('INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
    .bind(KEY, JSON.stringify(data), now()).run();
  return data;
}

const ext = (mime) => ({ 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[mime];

export async function setVideo(env, file) {
  if (!file || typeof file === 'string') fail(400, 'Elige un video.');
  if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type)) fail(400, 'El video debe ser MP4, WebM o MOV.');
  if (file.size > VIDEO_MAX) fail(400, 'El video pesa más de 50 MB. Expórtalo más liviano: 1 minuto en 720p pesa unos 15 MB.');
  const d = await loadLanding(env);
  const name = `video-${randomToken(6)}.${ext(file.type)}`;
  await env.MEDIA.put(`landing/${name}`, file.stream(), { httpMetadata: { contentType: file.type } });
  if (d.video) await env.MEDIA.delete(`landing/${d.video.name}`).catch(() => {});
  d.video = { name, mime: file.type, size: file.size, at: now() };
  return save(env, d);
}

export async function removeVideo(env) {
  const d = await loadLanding(env);
  if (d.video) await env.MEDIA.delete(`landing/${d.video.name}`).catch(() => {});
  d.video = null;
  return save(env, d);
}

export async function addTestimonio(env, form) {
  const txt = (k, n) => String(form.get(k) || '').trim().replace(/\s+/g, ' ').slice(0, n);
  const t = { id: randomToken(6), name: txt('name', 60), brand: txt('brand', 60), text: String(form.get('text') || '').trim().slice(0, 500), at: now(), photo: null };
  if (!t.name) fail(400, 'Escribe el nombre de la persona.');
  if (t.text.length < 10) fail(400, 'Escribe lo que dijo (al menos una frase).');
  if (form.get('permiso') !== '1') fail(400, 'Marca que la persona te dio permiso para publicarlo.');
  const photo = form.get('photo');
  if (photo && typeof photo !== 'string' && photo.size) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type)) fail(400, 'La foto debe ser JPG, PNG o WebP.');
    if (photo.size > PHOTO_MAX) fail(400, 'La foto pesa más de 3 MB.');
    t.photo = `foto-${t.id}.${ext(photo.type)}`;
    await env.MEDIA.put(`landing/${t.photo}`, photo.stream(), { httpMetadata: { contentType: photo.type } });
  }
  const d = await loadLanding(env);
  if (d.testimonios.length >= 12) fail(400, 'Máximo 12 testimonios. Borra uno antes de agregar otro.');
  d.testimonios.push(t);
  return save(env, d);
}

export async function removeTestimonio(env, id) {
  const d = await loadLanding(env);
  const t = d.testimonios.find((x) => x.id === id);
  if (!t) fail(404, 'Ese testimonio no existe.');
  if (t.photo) await env.MEDIA.delete(`landing/${t.photo}`).catch(() => {});
  d.testimonios = d.testimonios.filter((x) => x.id !== id);
  return save(env, d);
}

// Sirve el video (con Range para poder adelantar) y las fotos
export async function serveLandingMedia(c) {
  const name = c.req.param('name');
  if (!/^[\w-]+\.(mp4|webm|mov|jpg|png|webp)$/.test(name)) return c.text('No existe', 404);
  const range = c.req.header('range');
  let opts;
  const m = range && range.match(/bytes=(\d*)-(\d*)/);
  if (m) {
    const head = await c.env.MEDIA.head(`landing/${name}`);
    if (!head) return c.text('No existe', 404);
    const start = m[1] ? Number(m[1]) : Math.max(head.size - Number(m[2] || 0), 0);
    const end = m[1] && m[2] ? Math.min(Number(m[2]), head.size - 1) : head.size - 1;
    opts = { range: { offset: start, length: end - start + 1 } };
    const obj = await c.env.MEDIA.get(`landing/${name}`, opts);
    return new Response(obj.body, {
      status: 206,
      headers: { 'content-type': head.httpMetadata?.contentType || 'application/octet-stream', 'content-range': `bytes ${start}-${end}/${head.size}`, 'content-length': String(end - start + 1), 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=86400' },
    });
  }
  const obj = await c.env.MEDIA.get(`landing/${name}`);
  if (!obj) return c.text('No existe', 404);
  return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType || 'application/octet-stream', 'content-length': String(obj.size), 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=86400' } });
}
