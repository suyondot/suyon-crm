// Cliente de la API oficial de WhatsApp (Cloud API de Meta)
import { HttpError } from './util.js';

// Mensajes de error de Meta en palabras simples
const META_ERRORS = {
  131047: 'Pasaron más de 24 h desde el último mensaje de la clienta. Solo se puede enviar una plantilla aprobada.',
  131026: 'No se pudo entregar: el número no tiene WhatsApp o su app está desactualizada.',
  131051: 'WhatsApp no acepta ese tipo de mensaje.',
  131052: 'No se pudo descargar el archivo de la clienta.',
  131053: 'WhatsApp no aceptó el archivo. Revisa el formato y el tamaño.',
  131056: 'Demasiados mensajes seguidos a esta clienta. Espera un momento.',
  130429: 'Demasiados mensajes en poco tiempo. Espera un momento.',
  131048: 'Meta frenó los envíos de este número por muchos reportes o bloqueos.',
  131049: 'Meta no entregó el mensaje para cuidar la experiencia de la clienta.',
  131031: 'La cuenta de WhatsApp está bloqueada o restringida. Revisa el Administrador de WhatsApp.',
  131042: 'Hay un problema con el método de pago de la cuenta de WhatsApp.',
  131045: 'El número no está registrado en la API.',
  131021: 'No puedes enviarte mensajes a ti mismo.',
  133010: 'El número no está registrado en la API de WhatsApp.',
  368: 'Meta bloqueó temporalmente este número por sus políticas.',
  190: 'El token de WhatsApp venció o no es válido. Hay que poner uno nuevo en Cloudflare (WA_TOKEN).',
  10: 'El token no tiene permiso sobre este número.',
  200: 'El token no tiene permiso sobre este número.',
  100: 'Meta rechazó un dato del envío.',
  4: 'Demasiadas llamadas a Meta. Espera un momento.',
  80007: 'Se llegó al límite de envíos de la cuenta. Espera un momento.',
};

export function friendlyMetaError(err) {
  if (!err) return 'Error desconocido de WhatsApp.';
  const code = err.code;
  let base = META_ERRORS[code] || err.error_data?.details || err.message || err.title || 'Error de WhatsApp.';
  // Para errores genéricos, se agrega lo que dice Meta para poder entender qué falló
  if (META_ERRORS[code] && [100, 10, 200].includes(code)) {
    const detail = err.error_user_msg || err.error_data?.details || err.message;
    if (detail) base += ` Meta dice: «${String(detail).slice(0, 200)}»`;
  }
  return code ? `${base} (código ${code})` : base;
}

export function tokenFor(env, store) {
  const name = store.token_secret || 'WA_TOKEN';
  const t = env[name];
  if (!t) throw new HttpError(400, `Falta el token de WhatsApp. Ponlo en Cloudflare como secreto "${name}".`);
  return t;
}

async function graph(env, store, path, { method = 'GET', json, form } = {}) {
  const token = tokenFor(env, store);
  const headers = { Authorization: `Bearer ${token}` };
  let body;
  if (json) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) body = form;
  const res = await fetch(`${env.GRAPH_API}/${path}`, { method, headers, body });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok || data?.error) {
    const e = new HttpError(502, friendlyMetaError(data?.error || { message: `HTTP ${res.status}` }));
    e.meta = data?.error;
    throw e;
  }
  return data;
}

export async function getPhoneInfo(env, store) {
  return graph(env, store, `${store.phone_number_id}?fields=display_phone_number,verified_name,quality_rating,code_verification_status,platform_type,throughput`);
}

// Busca a qué cuenta de WhatsApp Business pertenece el número, con los permisos del token
export async function findWaba(env, store) {
  const token = tokenFor(env, store);
  const dbg = await graph(env, store, `debug_token?input_token=${encodeURIComponent(token)}`);
  const ids = new Set();
  for (const sc of dbg.data?.granular_scopes || []) {
    if (/whatsapp/.test(sc.scope || '')) for (const t of sc.target_ids || []) ids.add(String(t));
  }
  for (const id of ids) {
    try {
      const r = await graph(env, store, `${id}/phone_numbers?fields=id,display_phone_number`);
      if ((r.data || []).some((p) => String(p.id) === String(store.phone_number_id))) return id;
    } catch {}
  }
  return null;
}

export async function subscribeApp(env, store) {
  return graph(env, store, `${store.waba_id}/subscribed_apps`, { method: 'POST' });
}

export async function sendMessage(env, store, to, payload) {
  const data = await graph(env, store, `${store.phone_number_id}/messages`, {
    method: 'POST',
    json: { messaging_product: 'whatsapp', recipient_type: 'individual', to, ...payload },
  });
  return data.messages?.[0]?.id;
}

export function sendText(env, store, to, text, replyTo) {
  const p = { type: 'text', text: { body: text, preview_url: /https?:\/\//.test(text) } };
  if (replyTo) p.context = { message_id: replyTo };
  return sendMessage(env, store, to, p);
}

export async function uploadMedia(env, store, bytes, mime, filename) {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mime);
  form.append('file', new Blob([bytes], { type: mime }), filename || 'archivo');
  const data = await graph(env, store, `${store.phone_number_id}/media`, { method: 'POST', form });
  return data.id;
}

export function sendMediaById(env, store, to, kind, mediaId, { caption, filename, replyTo } = {}) {
  const obj = { id: mediaId };
  if (caption && kind !== 'audio') obj.caption = caption;
  if (kind === 'document' && filename) obj.filename = filename;
  const p = { type: kind, [kind]: obj };
  if (replyTo) p.context = { message_id: replyTo };
  return sendMessage(env, store, to, p);
}

export async function markRead(env, store, wamid) {
  return graph(env, store, `${store.phone_number_id}/messages`, {
    method: 'POST',
    json: { messaging_product: 'whatsapp', status: 'read', message_id: wamid },
  });
}

// Descarga un archivo que mandó la clienta (Meta guarda el id ~30 días)
export async function downloadMedia(env, store, mediaId) {
  const info = await graph(env, store, mediaId);
  const res = await fetch(info.url, { headers: { Authorization: `Bearer ${tokenFor(env, store)}` } });
  if (!res.ok) throw new Error(`No se pudo descargar el archivo (HTTP ${res.status})`);
  return { body: await res.arrayBuffer(), mime: info.mime_type || res.headers.get('content-type') || 'application/octet-stream', size: info.file_size };
}

// Tipos que WhatsApp acepta para enviar y sus límites (en bytes)
export const SEND_RULES = {
  image: { mimes: ['image/jpeg', 'image/png'], max: 5 * 1024 * 1024 },
  video: { mimes: ['video/mp4', 'video/3gpp'], max: 16 * 1024 * 1024 },
  audio: { mimes: ['audio/aac', 'audio/amr', 'audio/mpeg', 'audio/mp4', 'audio/ogg'], max: 16 * 1024 * 1024 },
  document: { mimes: null, max: 100 * 1024 * 1024 },
};

export function kindForMime(mime) {
  const m = (mime || '').split(';')[0].trim().toLowerCase();
  for (const k of ['image', 'video', 'audio']) if (SEND_RULES[k].mimes.includes(m)) return k;
  if (m === 'audio/x-m4a' || m === 'audio/m4a') return 'audio';
  return 'document';
}
