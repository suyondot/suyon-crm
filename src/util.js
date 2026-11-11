// Utilidades compartidas

export const now = () => Date.now();

const enc = new TextEncoder();

export function b64(bytes) {
  let s = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}

export function b64url(bytes) {
  return b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function hex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken(len = 32) {
  return b64url(crypto.getRandomValues(new Uint8Array(len)));
}

export async function sha256hex(text) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

export async function hmacSha256hex(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, typeof data === 'string' ? enc.encode(data) : data));
}

// Comparación de tiempo constante
export function safeEqual(a, b) {
  a = String(a ?? '');
  b = String(b ?? '');
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export const PBKDF2_ITER = 100000;

export async function hashPassword(password, saltB64) {
  const salt = saltB64 ? fromB64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER }, key, 256);
  return { hash: b64(bits), salt: b64(salt) };
}

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const fail = (status, message, extra) => {
  throw new HttpError(status, message, extra);
};

export function cleanEmail(e) {
  return String(e || '').trim().toLowerCase();
}

export function validEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export function clip(s, n) {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export const ROLES = {
  dueno: 'Dueño',
  asesora: 'Asesora',
  despacho: 'Despacho',
  despacho_prov: 'Despacho provincia',
};

export const can = {
  chats: (role) => role === 'dueno' || role === 'asesora',
  config: (role) => role === 'dueno',
};

// Etiquetas con las que nace cada tienda nueva (las de Pancake/Botcake)
export const DEFAULT_LABELS = [
  ['Talla XS', '--t-grey', 1],
  ['Talla S', '--t-grey', 1],
  ['Talla M', '--t-grey', 1],
  ['Talla L', '--t-grey', 1],
  ['Talla XL', '--t-grey', 1],
  ['ASESOR', '--bad', 1],
  ['COMPRÓ', '--t-green', 1],
  ['YAPE PENDIENTE', '--t-orange', 1],
  ['LIMA PENDIENTE', '--t-yellow', 0],
  ['ATENDER PENDIENTE', '--t-orange', 0],
  ['✅ LIMA', '--t-green', 0],
  ['✅ PROVINCIA', '--t-blue', 0],
  ['🔥 URGENTE', '--t-wine', 0],
];

export const RUBROS = ['ropa', 'simple'];

// Crea una tienda con sus etiquetas de inicio. setup = 1 → al entrar, el dueño ve el asistente de inicio.
export async function insertStore(db, companyId, s) {
  const r = await db.prepare(
    'INSERT INTO stores (company_id, name, color, phone_display, phone_number_id, waba_id, token_secret, canal, rubro, setup, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)'
  ).bind(companyId, s.name, s.color || '#7A1F35', s.phone_display ?? null, s.phone_number_id ?? null, s.waba_id ?? null, s.token_secret || 'WA_TOKEN', s.canal || 'mensajes', s.rubro || 'ropa', now()).run();
  const storeId = r.meta.last_row_id;
  const labels = DEFAULT_LABELS.filter(([name]) => s.rubro !== 'simple' || !name.startsWith('Talla '));
  await db.batch(labels.map(([name, color, auto], i) =>
    db.prepare('INSERT INTO labels (store_id, name, color, auto, sort, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(storeId, name, color, auto, i, now())
  ));
  return storeId;
}

export const LABEL_COLORS = ['--t-grey', '--t-yellow', '--t-orange', '--t-green', '--t-blue', '--t-wine', '--bad', '--t-purple', '--t-teal'];

// Se puede responder libremente: 24 h desde su último mensaje, o 72 h si llegó por anuncio
// y se le respondió dentro de las primeras 24 h (ventana gratis de Meta)
const H24 = 24 * 3600e3;
export function windowOpen(chat) {
  const t = now();
  if (chat.last_inbound_at && t - chat.last_inbound_at < H24) return true;
  if (chat.referral_at && t < chat.referral_at + 3 * H24) {
    return chat.first_reply_at ? chat.first_reply_at < chat.referral_at + H24 : t < chat.referral_at + H24;
  }
  return false;
}

/* ---------- Zona horaria por tienda ---------- */

export const DEFAULT_TZ = 'America/Lima';
const tzFmt = new Map();

export function validTz(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Hora local de la tienda: { y, mo, d, h, m, dow }
export function localParts(t = now(), tz = DEFAULT_TZ) {
  if (!validTz(tz)) tz = DEFAULT_TZ;
  let f = tzFmt.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short' });
    tzFmt.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, m: +p.minute, dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
}

// Diferencia (ms) entre la hora local de la tienda y UTC en ese momento
export function tzOffset(t, tz = DEFAULT_TZ) {
  const p = localParts(t, tz);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.m) - Math.floor(t / 60000) * 60000;
}

// Fecha local 'YYYY-MM-DD'
export function localDay(t = now(), tz = DEFAULT_TZ) {
  const p = localParts(t, tz);
  return `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

// Opciones de Configuración → General (país sugiere zona horaria y moneda)
export const GENERAL = {
  countries: [
    { id: 'PE', name: 'Perú', tz: 'America/Lima', currency: 'PEN' },
    { id: 'MX', name: 'México', tz: 'America/Mexico_City', currency: 'MXN' },
    { id: 'CO', name: 'Colombia', tz: 'America/Bogota', currency: 'COP' },
    { id: 'EC', name: 'Ecuador', tz: 'America/Guayaquil', currency: 'USD' },
    { id: 'CL', name: 'Chile', tz: 'America/Santiago', currency: 'CLP' },
    { id: 'BO', name: 'Bolivia', tz: 'America/La_Paz', currency: 'BOB' },
    { id: 'AR', name: 'Argentina', tz: 'America/Argentina/Buenos_Aires', currency: 'ARS' },
    { id: 'VE', name: 'Venezuela', tz: 'America/Caracas', currency: 'USD' },
    { id: 'PA', name: 'Panamá', tz: 'America/Panama', currency: 'USD' },
    { id: 'GT', name: 'Guatemala', tz: 'America/Guatemala', currency: 'GTQ' },
    { id: 'DO', name: 'República Dominicana', tz: 'America/Santo_Domingo', currency: 'DOP' },
    { id: 'ES', name: 'España', tz: 'Europe/Madrid', currency: 'EUR' },
    { id: 'US', name: 'Estados Unidos', tz: 'America/New_York', currency: 'USD' },
  ],
  timezones: [
    'America/Lima', 'America/Bogota', 'America/Guayaquil', 'America/Panama', 'America/Mexico_City', 'America/Guatemala',
    'America/La_Paz', 'America/Caracas', 'America/Santo_Domingo', 'America/Santiago', 'America/Argentina/Buenos_Aires',
    'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/Madrid',
  ],
  currencies: [
    { id: 'PEN', name: 'Sol peruano', symbol: 'S/' },
    { id: 'USD', name: 'Dólar', symbol: 'US$' },
    { id: 'MXN', name: 'Peso mexicano', symbol: 'MX$' },
    { id: 'COP', name: 'Peso colombiano', symbol: 'COL$' },
    { id: 'CLP', name: 'Peso chileno', symbol: 'CLP$' },
    { id: 'BOB', name: 'Boliviano', symbol: 'Bs' },
    { id: 'ARS', name: 'Peso argentino', symbol: 'AR$' },
    { id: 'GTQ', name: 'Quetzal', symbol: 'Q' },
    { id: 'DOP', name: 'Peso dominicano', symbol: 'RD$' },
    { id: 'EUR', name: 'Euro', symbol: '€' },
  ],
  languages: [
    { id: 'es', name: 'Español' },
    { id: 'pt', name: 'Portugués' },
    { id: 'en', name: 'Inglés' },
  ],
};
