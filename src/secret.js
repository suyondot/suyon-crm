// Cifra en la base de datos los tokens que Meta da a cada tienda (Registro insertado).
// La llave es el secreto TOKEN_KEY de Cloudflare; si no existe, se usa META_APP_SECRET.
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));
const keys = new Map();

async function keyFor(env, src) {
  const raw = src === 'k' ? env.TOKEN_KEY : env.META_APP_SECRET;
  if (!raw) throw new Error(src === 'k' ? 'Falta el secreto TOKEN_KEY en Cloudflare.' : 'Falta el secreto META_APP_SECRET en Cloudflare.');
  const id = src + ':' + raw;
  if (!keys.has(id)) {
    const base = await crypto.subtle.importKey('raw', enc.encode(raw), 'HKDF', false, ['deriveKey']);
    keys.set(id, await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('control-total'), info: enc.encode('tokens-v1') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']));
  }
  return keys.get(id);
}

export async function sealText(env, text) {
  const src = env.TOKEN_KEY ? 'k' : 'a';
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFor(env, src), enc.encode(String(text))));
  return `v1${src}:${b64(iv)}:${b64(ct)}`;
}

export async function openText(env, sealed) {
  const m = /^v1([ka]):([^:]+):(.+)$/.exec(String(sealed || ''));
  if (!m) throw new Error('El token guardado no se puede leer.');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(m[2]) }, await keyFor(env, m[1]), unb64(m[3]));
  return dec.decode(pt);
}
