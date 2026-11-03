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

// Datos del token para diagnosticar permisos (no expone el token)
export async function tokenInfo(env, store) {
  const token = tokenFor(env, store);
  const d = (await graph(env, store, `debug_token?input_token=${encodeURIComponent(token)}`)).data || {};
  let app = null;
  try {
    app = await graph(env, store, `${d.app_id}?fields=name`);
  } catch {}
  return {
    app: `${app?.name || '?'} (${d.app_id || '?'})`,
    type: d.type,
    valid: d.is_valid,
    expires: d.expires_at ? new Date(d.expires_at * 1000).toISOString().slice(0, 10) : 'nunca',
    scopes: (d.scopes || []).join(', '),
    granular: (d.granular_scopes || []).map((g) => `${g.scope}: ${g.target_ids ? g.target_ids.join(', ') : 'todas'}`),
  };
}

// Campos sueltos (si Meta no reconoce uno, no rompe los demás)
export async function probeFields(env, store, id, fields) {
  const out = {};
  for (const f of fields) {
    try {
      const r = await graph(env, store, `${id}?fields=${f}`);
      out[f] = r[f] === undefined ? '—' : typeof r[f] === 'object' ? JSON.stringify(r[f]) : String(r[f]);
    } catch (e) {
      out[f] = 'error';
    }
  }
  return out;
}

export async function getPhoneInfo(env, store) {
  return graph(env, store, `${store.phone_number_id}?fields=display_phone_number,verified_name,quality_rating,code_verification_status,platform_type,throughput`);
}

// Busca a qué cuenta de WhatsApp Business pertenece el número, con los permisos del token.
// Devuelve también lo que revisó, para poder explicar qué pasó si no la encuentra.
export async function findWaba(env, store) {
  const token = tokenFor(env, store);
  const report = { found: null, tried: [], error: null };
  let dbg;
  try {
    dbg = await graph(env, store, `debug_token?input_token=${encodeURIComponent(token)}`);
  } catch (e) {
    report.error = 'No se pudo leer el token: ' + e.message;
    return report;
  }
  const ids = new Set();
  if (store.waba_id) ids.add(String(store.waba_id));
  for (const sc of dbg.data?.granular_scopes || []) {
    if (/whatsapp/.test(sc.scope || '')) for (const t of sc.target_ids || []) ids.add(String(t));
  }
  report.scopes = (dbg.data?.granular_scopes || []).map((sc) => `${sc.scope}${sc.target_ids ? ' (' + sc.target_ids.length + ' cuentas)' : ' (todas)'}`);
  report.tokenType = dbg.data?.type || null;
  if (!ids.size) report.error = 'El token no muestra cuentas de WhatsApp en sus permisos.';
  for (const id of ids) {
    const item = { id, name: null, phones: [], error: null };
    try {
      const info = await graph(env, store, `${id}?fields=name`);
      item.name = info.name || null;
    } catch {}
    try {
      const r = await graph(env, store, `${id}/phone_numbers?fields=id,display_phone_number`);
      item.phones = (r.data || []).map((p) => `${p.display_phone_number || ''} (${p.id})`);
      if ((r.data || []).some((p) => String(p.id) === String(store.phone_number_id))) report.found = id;
    } catch (e) {
      item.error = e.message;
    }
    report.tried.push(item);
  }
  return report;
}

// Activa el número en la API oficial (paso final después de verificarlo por SMS en Meta).
// El PIN de 6 dígitos queda como "verificación en dos pasos" del número.
export async function registerNumber(env, store, pin) {
  return graph(env, store, `${store.phone_number_id}/register`, { method: 'POST', json: { messaging_product: 'whatsapp', pin } });
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

/* ---------- Perfil de WhatsApp (foto, info, descripción, dirección, correo, webs, categoría) ---------- */

export const VERTICALS = {
  APPAREL: 'Ropa y accesorios', BEAUTY: 'Belleza, spa y salón', RETAIL: 'Tienda / compras', EDU: 'Educación', PROF_SERVICES: 'Servicios profesionales',
  EVENT_PLAN: 'Eventos', FINANCE: 'Finanzas', GROCERY: 'Alimentos y abarrotes', HEALTH: 'Salud', RESTAURANT: 'Restaurante', TRAVEL: 'Viajes y transporte',
  AUTO: 'Vehículos', ENTERTAIN: 'Entretenimiento', HOTEL: 'Hotel y alojamiento', NONPROFIT: 'Sin fines de lucro', OTHER: 'Otro', UNDEFINED: 'Sin categoría',
};

export async function getProfile(env, store) {
  const d = await graph(env, store, `${store.phone_number_id}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`);
  return d?.data?.[0] || {};
}

export async function setProfile(env, store, fields) {
  return graph(env, store, `${store.phone_number_id}/whatsapp_business_profile`, { method: 'POST', json: { messaging_product: 'whatsapp', ...fields } });
}

// Foto de perfil: se sube con la «subida reanudable» de Meta y se usa el código que devuelve
export async function setProfilePhoto(env, store, bytes, mime) {
  const token = tokenFor(env, store);
  let appId = env.META_APP_ID;
  if (!appId) appId = (await graph(env, store, `debug_token?input_token=${encodeURIComponent(token)}`))?.data?.app_id;
  if (!appId) throw new HttpError(400, 'No se encontró el ID de la app de Meta. Ponlo en Cloudflare como variable META_APP_ID.');
  const ext = mime === 'image/png' ? 'png' : 'jpg';
  const s = await graph(env, store, `${appId}/uploads?file_name=perfil.${ext}&file_length=${bytes.byteLength}&file_type=${encodeURIComponent(mime)}`, { method: 'POST' });
  if (!s?.id) throw new HttpError(502, 'Meta no abrió la subida de la foto.');
  const res = await fetch(`${env.GRAPH_API}/${s.id}`, { method: 'POST', headers: { Authorization: `OAuth ${token}`, file_offset: '0', 'Content-Type': mime }, body: bytes });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok || !data?.h) throw new HttpError(502, friendlyMetaError(data?.error || { message: `No se pudo subir la foto (HTTP ${res.status})` }));
  await setProfile(env, store, { profile_picture_handle: data.h });
}

/* ---------- Botones, listas y plantillas ---------- */

const cut = (s, n) => String(s || '').slice(0, n);

// Hasta 3 botones de respuesta (gratis dentro de la ventana de 24 h)
export function sendButtons(env, store, to, body, buttons) {
  return sendMessage(env, store, to, {
    type: 'interactive',
    interactive: { type: 'button', body: { text: cut(body, 1024) }, action: { buttons: buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: cut(b.id, 256), title: cut(b.title, 20) } })) } },
  });
}

// Lista de hasta 10 opciones (ej. tallas o colores)
export function sendList(env, store, to, body, button, rows) {
  return sendMessage(env, store, to, {
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: cut(body, 1024) },
      action: { button: cut(button || 'Elegir', 20), sections: [{ title: cut(button || 'Opciones', 24), rows: rows.slice(0, 10).map((r) => ({ id: cut(r.id, 200), title: cut(r.title, 24), ...(r.description ? { description: cut(r.description, 72) } : {}) })) }] },
    },
  });
}

export function sendTemplate(env, store, to, name, lang, params = []) {
  const components = params.length ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: cut(p || '-', 1024) })) }] : [];
  return sendMessage(env, store, to, { type: 'template', template: { name, language: { code: lang || 'es' }, components } });
}

export async function createTemplate(env, store, { name, category, body, example, buttons }) {
  if (!store.waba_id) throw new HttpError(400, 'Falta el identificador de la cuenta de WhatsApp Business de esta tienda.');
  const components = [{ type: 'BODY', text: body, ...(example?.length ? { example: { body_text: [example] } } : {}) }];
  if (buttons?.length) components.push({ type: 'BUTTONS', buttons: buttons.map((t) => ({ type: 'QUICK_REPLY', text: cut(t, 25) })) });
  return graph(env, store, `${store.waba_id}/message_templates`, { method: 'POST', json: { name, language: 'es', category, components } });
}

export async function templateStatus(env, store, name) {
  const d = await graph(env, store, `${store.waba_id}/message_templates?name=${encodeURIComponent(name)}&fields=name,status,language,rejected_reason`);
  return (d?.data || []).find((t) => t.name === name) || null;
}
