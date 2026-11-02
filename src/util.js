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
  ['✅ LIMA', '--t-green', 0],
  ['✅ PROVINCIA', '--t-blue', 0],
  ['🔥 URGENTE', '--t-wine', 0],
];

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
