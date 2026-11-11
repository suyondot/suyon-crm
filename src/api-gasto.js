// Gasto de WhatsApp del mes por número: Meta dice en cada mensaje enviado si se cobró y de qué tipo
// (messages.extra.pricing = {billable, category, type}). Con eso se muestra cuántos mensajes gratis quedan y cuánto va.
import { Hono } from 'hono';
import { now, localParts, tzOffset } from './util.js';
import { storeFor, chatFor } from './auth.js';

const r = new Hono();
// Precios de Meta para Perú (US$ por mensaje entregado, rate card oct 2026) y tipo de cambio. Editables en platform_settings 'wa_precios'.
export const WA_PRECIOS = { marketing: 0.0703, utility: 0.03, authentication: 0.03, service: 0.03, gratis: 1000, tc: 3.8 };
let cachePrecios = null;
async function precios(env) {
  if (cachePrecios && cachePrecios.t > Date.now() - 300e3) return cachePrecios.v;
  const row = await env.DB.prepare("SELECT value FROM platform_settings WHERE key = 'wa_precios'").first().catch(() => null);
  let v = WA_PRECIOS;
  try {
    if (row?.value) v = { ...WA_PRECIOS, ...JSON.parse(row.value) };
  } catch {}
  cachePrecios = { t: Date.now(), v };
  return v;
}

const inicioMes = (tz) => {
  const t = now();
  const p = localParts(t, tz);
  return Date.UTC(p.y, p.mo - 1, 1) - tzOffset(t, tz);
};
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Suma por tipo: cuántos mensajes y cuánto costaron
export function resumirGasto(rows, P) {
  const out = { plantillas: { marketing: 0, utility: 0, authentication: 0 }, servicio: 0, servicio_cobrado: 0, cobrados: 0, gratis_entrada: 0, usd: 0 };
  for (const x of rows) {
    const n = Number(x.n) || 0;
    const cat = String(x.cat || '');
    const bill = x.bill === 1 || x.bill === true || x.bill === 'true';
    if (cat in out.plantillas) out.plantillas[cat] += n;
    if (cat === 'service') {
      // Los de la ventana gratis de 72 h por anuncio no cuentan para los 1,000 gratis
      if (x.typ === 'free_entry_point') out.gratis_entrada += n;
      else out.servicio += n;
      if (bill) out.servicio_cobrado += n;
    }
    if (bill) {
      out.cobrados += n;
      out.usd += n * (Number(P[cat]) || 0);
    }
  }
  out.usd = Math.round(out.usd * 10000) / 10000;
  out.pen = Math.round(out.usd * (Number(P.tc) || 3.8) * 100) / 100;
  out.gratis = Number(P.gratis) || 1000;
  out.quedan = Math.max(0, out.gratis - out.servicio);
  return out;
}

const SQL = `SELECT json_extract(extra, '$.pricing.category') AS cat, json_extract(extra, '$.pricing.type') AS typ,
  json_extract(extra, '$.pricing.billable') AS bill, COUNT(*) AS n
  FROM messages WHERE %W AND direction = 'out' AND extra LIKE '%"pricing"%' GROUP BY cat, typ, bill`;

const cache = new Map();
r.get('/stores/:id/wa-gasto', async (c) => {
  const st = await storeFor(c, c.req.param('id'));
  const hit = cache.get(st.id);
  if (hit && hit.t > Date.now() - 60e3) return c.json(hit.v);
  const tz = st.timezone || 'America/Lima';
  const desde = inicioMes(tz);
  const P = await precios(c.env);
  const { results } = await c.env.DB.prepare(SQL.replace('%W', 'store_id = ? AND created_at >= ?')).bind(st.id, desde).all();
  const v = { mes: MESES[localParts(now(), tz).mo - 1], desde, ...resumirGasto(results, P), precios: P };
  cache.set(st.id, { t: Date.now(), v });
  return c.json(v);
});

// Lo que costó un chat (todo su historial)
r.get('/chats/:id/wa-gasto', async (c) => {
  const { chat } = await chatFor(c, c.req.param('id'));
  const P = await precios(c.env);
  const { results } = await c.env.DB.prepare(SQL.replace('%W', 'chat_id = ?')).bind(chat.id).all();
  return c.json(resumirGasto(results, P));
});

export default r;
