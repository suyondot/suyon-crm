// Conectar WhatsApp con un clic (Registro insertado de Meta).
// El navegador abre la ventana de Meta; aquí se cambia el código por el token de la tienda,
// se suscribe la app a su cuenta de WhatsApp y se activa el número.
import { now, clip, HttpError } from './util.js';
import { sealText } from './secret.js';
import { graphCall } from './whatsapp.js';

const apiVersion = (env) => (/\/(v\d+\.\d+)/.exec(env.GRAPH_API || '') || [])[1] || 'v23.0';
let appIdCache = null;

// ID de la app de Meta: variable META_APP_ID o, si no está, se lee del token principal
export async function appIdOf(env) {
  if (env.META_APP_ID) return String(env.META_APP_ID);
  if (appIdCache) return appIdCache;
  if (!env.WA_TOKEN) return null;
  try {
    const d = await graphCall(env, { token_secret: 'WA_TOKEN' }, `debug_token?input_token=${encodeURIComponent(env.WA_TOKEN)}`);
    appIdCache = d?.data?.app_id ? String(d.data.app_id) : null;
  } catch {}
  return appIdCache;
}

export async function signupInfo(env, origin) {
  const appId = await appIdOf(env);
  const configId = env.META_ES_CONFIG ? String(env.META_ES_CONFIG) : null;
  const falta = [];
  if (!appId) falta.push('app');
  if (!configId) falta.push('config');
  if (!env.META_APP_SECRET) falta.push('secret');
  return { ready: !falta.length, falta, app_id: appId, config_id: configId, version: apiVersion(env), domain: origin };
}

async function exchangeCode(env, code) {
  const appId = await appIdOf(env);
  if (!appId || !env.META_APP_SECRET) throw new HttpError(400, 'Falta configurar la app de Meta (ID de la app o su clave secreta).');
  const u = `${env.GRAPH_API}/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(env.META_APP_SECRET)}&code=${encodeURIComponent(code)}`;
  const res = await fetch(u);
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.access_token) throw new HttpError(502, `Meta no entregó el permiso de la cuenta: ${d?.error?.message || res.status}. Vuelve a tocar el botón (el código dura 30 segundos).`);
  return d.access_token;
}

// Pide los permisos con el token NUEVO de la tienda (no el de Cloudflare)
const asStore = (token, extra = {}) => ({ ...extra, token_enc: null, token_secret: '__signup__', __token: token });

export async function connectSignup(env, store, { code, phone_number_id, waba_id, coexistencia }) {
  const steps = [];
  if (!/^[\w-]{10,}$/.test(String(code || ''))) throw new HttpError(400, 'Falta el código de Meta. Vuelve a tocar el botón.');
  const token = await exchangeCode(env, String(code));
  steps.push('Meta entregó el permiso para esta cuenta de WhatsApp');
  const tenv = { ...env, __signup__: token };
  const tst = asStore(token);
  // Cuándo vence este permiso (la configuración de Meta da 30 o 60 días; 0 = no vence)
  const dbg0 = await graphCall(tenv, tst, `debug_token?input_token=${encodeURIComponent(token)}`).catch(() => null);
  const expSec = Number(dbg0?.data?.expires_at) || 0;
  const tokenExp = expSec > 0 ? expSec * 1000 : null;
  let waba = String(waba_id || '').replace(/\D/g, '');
  let phone = String(phone_number_id || '').replace(/\D/g, '');
  if (!waba || !phone) {
    // Por si la ventana no devolvió los datos: se buscan con el token
    const dbg = dbg0;
    const ids = (dbg?.data?.granular_scopes || []).find((x) => x.scope === 'whatsapp_business_management')?.target_ids || [];
    if (!waba && ids.length) waba = String(ids[0]);
    if (waba && !phone) {
      const ph = await graphCall(tenv, tst, `${waba}/phone_numbers?fields=id,display_phone_number`).catch(() => null);
      phone = String(ph?.data?.[0]?.id || '');
    }
  }
  if (!waba) throw new HttpError(400, 'Meta no devolvió la cuenta de WhatsApp. Vuelve a intentarlo y termina todos los pasos de la ventana.');
  if (!phone) throw new HttpError(400, 'La cuenta quedó conectada pero sin número. Vuelve a tocar el botón y agrega el número en la ventana de Meta.');
  const other = await env.DB.prepare('SELECT id, name FROM stores WHERE phone_number_id = ? AND id != ?').bind(phone, store.id).first();
  if (other) throw new HttpError(409, `Ese número ya está en la tienda «${other.name}».`);
  const sealed = await sealText(env, token);
  const via = coexistencia ? 'coexistencia' : 'embedded';
  await env.DB.prepare("UPDATE stores SET phone_number_id = ?, waba_id = ?, token_enc = ?, token_exp = ?, connected_via = ?, status = 'pendiente', connect_error = NULL, rev = rev + 1 WHERE id = ?")
    .bind(phone, waba, sealed, tokenExp, via, store.id).run();
  const st = { ...store, phone_number_id: phone, waba_id: waba };
  await graphCall(tenv, { ...st, ...tst }, `${waba}/subscribed_apps`, { method: 'POST' });
  steps.push('La app quedó suscrita: los mensajes de este número llegan a Control Total');
  if (!coexistencia) {
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    try {
      await graphCall(tenv, { ...st, ...tst }, `${phone}/register`, { method: 'POST', json: { messaging_product: 'whatsapp', pin } });
      await env.DB.prepare('UPDATE stores SET wa_pin_enc = ? WHERE id = ?').bind(await sealText(env, pin), store.id).run();
      steps.push('Número activado en la API (PIN de dos pasos guardado cifrado)');
    } catch (e) {
      steps.push(`Activar el número: ${e.message}`);
    }
  } else steps.push('Número de la app WhatsApp Business: sigue funcionando también en el celular');
  const info = await graphCall(tenv, { ...st, ...tst }, `${phone}?fields=display_phone_number,verified_name,quality_rating`).catch(() => ({}));
  await env.DB.prepare("UPDATE stores SET status = 'activo', connect_error = NULL, verified_name = ?, phone_display = COALESCE(?, phone_display), rev = rev + 1 WHERE id = ?")
    .bind(info.verified_name || null, info.display_phone_number || null, store.id).run();
  steps.push(`Conectado como ${info.verified_name || 'tu negocio'} · ${info.display_phone_number || phone}`);
  if (tokenExp) steps.push(`Info: el permiso de Meta vence el ${new Date(tokenExp).toLocaleDateString('es-PE', { timeZone: store.timezone || 'America/Lima', day: 'numeric', month: 'long', year: 'numeric' })}. Antes de esa fecha te avisamos para volver a tocar «Conectar WhatsApp» (mismo número, 1 minuto).`);
  return { steps, at: now(), via, phone: clip(info.display_phone_number || phone, 40) };
}

// Una vez al día: avisa a la tienda cuando su permiso de Meta está por vencer o ya venció
export async function tokenReminders(env, notify) {
  const t = now();
  const { results } = await env.DB.prepare('SELECT id, name, token_exp, timezone FROM stores WHERE token_exp IS NOT NULL AND token_enc IS NOT NULL AND token_exp < ?').bind(t + 7 * 864e5).all();
  for (const s of results) {
    const dias = Math.ceil((s.token_exp - t) / 864e5);
    const fecha = new Date(s.token_exp).toLocaleDateString('es-PE', { timeZone: s.timezone || 'America/Lima', day: 'numeric', month: 'long' });
    await notify(env, s.id, dias > 0
      ? { kind: 'aviso', title: `El permiso de WhatsApp vence en ${dias} ${dias === 1 ? 'día' : 'días'} (${fecha})`, body: 'Entra a Configuración → Número de WhatsApp y toca «Conectar WhatsApp» otra vez con el mismo número. Toma 1 minuto y no se pierde nada.', dedupe: true }
      : { kind: 'error', title: 'Venció el permiso de WhatsApp: el número dejó de mandar mensajes', body: 'Entra a Configuración → Número de WhatsApp y toca «Conectar WhatsApp» otra vez con el mismo número.', dedupe: true }).catch(() => {});
  }
}
