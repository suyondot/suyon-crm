// Validación de pagos: capturas de Yape/Plin/transferencia que mandan las clientas, para confirmar o marcar «no llegó».
// Opcional: la app del celular (MacroDroid u otra) reenvía las notificaciones de Yape/Plin/banco a un enlace propio
// y aquí se cruzan con las capturas por monto y nombre (solo sugerencia: siempre confirma una persona).
import { Hono } from 'hono';
import { now, fail, clip, randomToken, safeEqual } from './util.js';
import { storeFor, chatFor, requireUser } from './auth.js';
import { addEvent, getOrder } from './orders.js';
import { setOrderStatus } from './automations.js';
import { addLabel } from './bot.js';
import { pedidoAlAgendar } from './agendar.js';

const r = new Hono();
const DAY = 864e5;
const body = async (c) => {
  try {
    return await c.req.json();
  } catch {
    return {};
  }
};
const bump = (env, id) => env.DB.prepare('UPDATE stores SET rev = rev + 1 WHERE id = ?').bind(id).run();
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

// «S/ 1,234.50», «S/30», «S/. 30,00» → número
export function montoDe(t) {
  const m = String(t || '').match(/S\/\.?\s*([\d][\d.,]*)/i) || String(t || '').match(/\b([\d]+(?:[.,]\d{1,2})?)\s*soles\b/i);
  if (!m) return null;
  let x = m[1].replace(/[.,]$/, '');
  if (/,\d{1,2}$/.test(x) && !/\./.test(x)) x = x.replace(',', '.');
  else x = x.replace(/,/g, '');
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

// Texto de la notificación del celular → { monto, nombre }
// Yape: «Yape! Juan Pérez te envió un pago por S/ 30» · «JUAN P. te yapeó S/ 30.00»
// Plin: «Te plinearon S/ 30.00, Juan Pérez» · Banco: «Recibiste S/ 30.00 de Juan Pérez»
export function parsePago(texto) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  const monto = montoDe(t);
  let nombre = '';
  let m = t.match(/(?:yape!?|confirmaci[oó]n de pago:?|notificaci[oó]n:?)?\s*([A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ.' ]{1,60}?)\s+te\s+(?:envi[oó]|yape[oó]|plin[eó]+|transfiri[oó]|pag[oó])/i);
  if (m) nombre = m[1];
  if (!nombre && (m = t.match(/plinearon\s+S\/\.?\s*[\d.,]+\s*,?\s*(?:de\s+)?([A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ.' ]{1,60})/i))) nombre = m[1];
  if (!nombre && (m = t.match(/recibiste\s+(?:un\s+(?:pago|yapeo)\s+(?:de|por)\s+)?S\/\.?\s*[\d.,]+\s+de\s+([A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ.' ]{1,60})/i))) nombre = m[1];
  nombre = nombre.replace(/^(yape|plin)!?\s*/i, '').replace(/[.\s]+$/, '').trim();
  return { monto, nombre: clip(nombre, 60) };
}

// Lo que se espera que pague: del pedido o del último formulario («Adelanto: S/30», «Monto total: S/209»)
function esperado(order, form) {
  const out = { adelanto: null, total: null };
  if (order) {
    out.total = Number(order.total) || null;
    out.adelanto = Number(order.adelanto) || null;
  }
  const f = String(form?.body || '');
  if (!out.total) out.total = montoDe((f.match(/Monto total:[^\n]*/i) || [''])[0]);
  if (!out.adelanto) out.adelanto = montoDe((f.match(/Adelanto:[^\n]*/i) || [''])[0]);
  return out;
}

const zonaDeForm = (f) => (/Shalom:|Sede:|Monto restante|Adelanto:/i.test(String(f || '')) ? 'provincia' : 'lima');

// Chats con un pago por revisar (pedido «Yape por validar», Lima con captura, o YAPE PENDIENTE / formulario Shalom con captura)
async function pendientes(env, st) {
  const t = now();
  const desde = t - 7 * DAY;
  const { results: chats } = await env.DB.prepare(
    `SELECT c.id, c.name, c.profile_name, c.wa_id, c.last_inbound_at FROM chats c
      WHERE c.store_id = ? AND c.sim = 0 AND COALESCE(c.last_msg_at, c.created_at) > ?
        AND (EXISTS (SELECT 1 FROM orders o WHERE o.chat_id = c.id AND o.status IN ('por_pagar', 'nuevo') AND o.created_at > ?)
          OR EXISTS (SELECT 1 FROM chat_labels cl JOIN labels l ON l.id = cl.label_id WHERE cl.chat_id = c.id AND l.name = 'YAPE PENDIENTE')
          OR EXISTS (SELECT 1 FROM messages m WHERE m.chat_id = c.id AND m.direction = 'out' AND m.created_at > ? AND m.body LIKE '%Monto restante%'))
      ORDER BY COALESCE(c.last_msg_at, c.created_at) DESC LIMIT 80`
  ).bind(st.id, desde, desde, desde).all();
  const rows = await Promise.all(chats.map(async (c) => {
    const [o, cap, form, marks] = await env.DB.batch([
      env.DB.prepare("SELECT * FROM orders WHERE chat_id = ? AND status != 'cancelado' AND created_at > ? ORDER BY id DESC LIMIT 1").bind(c.id, desde),
      env.DB.prepare("SELECT id, type, media_mime, media_name, created_at FROM messages WHERE chat_id = ? AND direction = 'in' AND type IN ('image', 'document') AND created_at > ? ORDER BY id DESC LIMIT 1").bind(c.id, desde),
      env.DB.prepare("SELECT id, body, created_at FROM messages WHERE chat_id = ? AND direction = 'out' AND body LIKE '%Pedido:%' ORDER BY id DESC LIMIT 1").bind(c.id),
      env.DB.prepare('SELECT msg_id, order_id FROM pago_marks WHERE chat_id = ?').bind(c.id),
    ]);
    const order = o.results[0] || null;
    let captura = cap.results[0] || null;
    const f = form.results[0] || null;
    // La captura tiene que ser de después del formulario (si hubo): una foto de antes suele ser otra cosa
    if (captura && f && captura.id < f.id && !(order && order.status === 'por_pagar')) captura = null;
    const mk = marks.results;
    const vista = (id, oid) => mk.some((x) => x.msg_id === id && (id || x.order_id === oid));
    const abierto = order && ['por_pagar', 'nuevo'].includes(order.status);
    if (abierto) {
      if (order.status === 'nuevo' && !captura) return null; // Lima sin captura = paga al recibir
      if (vista(captura?.id || 0, order.id)) return null;
    } else {
      if (order) return null; // ya agendado
      if (!captura || vista(captura.id, null)) return null;
    }
    return {
      chat_id: c.id,
      nombre: c.name || c.profile_name || order?.nombre || '',
      wa_id: c.wa_id,
      captura: captura ? { id: captura.id, type: captura.type, mime: captura.media_mime, name: captura.media_name, at: captura.created_at } : null,
      order: order ? { id: order.id, number: order.number, status: order.status, modo: order.modo, total: order.total, adelanto: order.adelanto, nombre: order.nombre, created_at: order.created_at } : null,
      zona: order ? (order.modo === 'lima' ? 'lima' : 'provincia') : zonaDeForm(f?.body),
      esperado: esperado(order, f),
      at: captura?.created_at || order?.created_at || c.last_inbound_at,
    };
  }));
  return rows.filter(Boolean).sort((a, b) => b.at - a.at);
}

// Sugerencia: un pago de la app del celular con el mismo monto (adelanto o total), cerca de la hora de la captura y,
// si se puede, con el nombre parecido. Cada pago se sugiere a un solo chat.
function sugerir(list, pagos) {
  const usados = new Set();
  for (const p of list) {
    const montos = [p.esperado.adelanto, p.esperado.total].filter(Boolean);
    const ref = p.captura?.at || p.at;
    const nom = norm([p.nombre, p.order?.nombre].join(' ')).split(' ').filter((w) => w.length >= 3);
    let best = null;
    for (const x of pagos) {
      if (usados.has(x.id) || x.chat_id || !x.monto) continue;
      const okMonto = montos.some((m) => Math.abs(m - x.monto) < 0.01);
      const cerca = Math.abs(x.created_at - ref) < 6 * 3600e3;
      if (!okMonto || !cerca) continue;
      const pn = norm(x.nombre);
      const score = (nom.some((w) => pn.includes(w)) ? 2 : 0) + (Math.abs(x.created_at - ref) < 3600e3 ? 1 : 0);
      if (!best || score > best.score) best = { ...x, score };
    }
    if (best) {
      usados.add(best.id);
      p.sugerido = { id: best.id, monto: best.monto, nombre: best.nombre, at: best.created_at, nombre_ok: best.score >= 2 };
    }
  }
}

r.get('/stores/:id/pagos', async (c) => {
  const st = await storeFor(c, c.req.param('id'));
  const tab = c.req.query('tab') || 'pend';
  const t = now();
  const { results: pagos } = await c.env.DB.prepare('SELECT * FROM pagos_in WHERE store_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT 200').bind(st.id, t - 2 * DAY).all();
  const pend = await pendientes(c.env, st);
  sugerir(pend, pagos);
  let marcas = [];
  if (tab === 'ok' || tab === 'no') {
    const { results } = await c.env.DB.prepare(
      `SELECT pm.*, c.name, c.profile_name, c.wa_id, o.number AS order_number, o.status AS order_status, u.name AS user_name
         FROM pago_marks pm JOIN chats c ON c.id = pm.chat_id LEFT JOIN orders o ON o.id = pm.order_id LEFT JOIN users u ON u.id = pm.user_id
        WHERE pm.store_id = ? AND pm.estado = ? AND pm.created_at > ? ORDER BY pm.created_at DESC LIMIT 100`
    ).bind(st.id, tab === 'ok' ? 'ok' : 'no_llego', t - 14 * DAY).all();
    marcas = results.map((x) => ({ ...x, nombre: x.name || x.profile_name || '' }));
  }
  const hoy = await c.env.DB.prepare("SELECT COUNT(*) n, COALESCE(SUM(monto), 0) s FROM pago_marks WHERE store_id = ? AND estado = 'ok' AND created_at > ?").bind(st.id, t - DAY).first();
  const row = await c.env.DB.prepare('SELECT pagos_key, pagos_last_at FROM stores WHERE id = ?').bind(st.id).first();
  return c.json({
    pendientes: pend,
    marcas,
    pagos: pagos.map((x) => ({ id: x.id, monto: x.monto, nombre: x.nombre, texto: x.texto, app: x.app, chat_id: x.chat_id, at: x.created_at })),
    resumen: { pend: pend.length, ok24: hoy?.n || 0, monto24: hoy?.s || 0 },
    app: { on: !!row?.pagos_key, last_at: row?.pagos_last_at || null },
  });
});

// Confirmar el pago (o «no llegó») de un chat
r.post('/chats/:id/pago', async (c) => {
  const { chat, store } = await chatFor(c, c.req.param('id'));
  const u = await requireUser(c);
  const b = await body(c);
  const accion = b.accion === 'ok' ? 'ok' : b.accion === 'no_llego' ? 'no_llego' : null;
  if (!accion) fail(400, 'Falta decir si el pago llegó o no.');
  const msgId = Number(b.msg_id) || 0;
  if (msgId) {
    const m = await c.env.DB.prepare("SELECT id FROM messages WHERE id = ? AND chat_id = ? AND direction = 'in'").bind(msgId, chat.id).first();
    if (!m) fail(400, 'Esa captura no es de este chat.');
  }
  const ya = await c.env.DB.prepare('SELECT id FROM pago_marks WHERE chat_id = ? AND msg_id = ? LIMIT 1').bind(chat.id, msgId).first();
  if (ya && msgId) fail(409, 'Este pago ya se revisó.');
  const monto = Number(b.monto) > 0 ? Math.round(Number(b.monto) * 100) / 100 : null;
  let order = await c.env.DB.prepare("SELECT * FROM orders WHERE chat_id = ? AND status != 'cancelado' AND created_at > ? ORDER BY id DESC LIMIT 1").bind(chat.id, now() - 7 * DAY).first();
  const nota = clip(String(b.nota || '').trim(), 200) || null;
  let pedido = null;
  if (accion === 'ok') {
    if (!order) {
      // Sin pedido todavía: se agenda con su último formulario (provincia → Validado, Lima → Confirmado)
      const f = await c.env.DB.prepare("SELECT body FROM messages WHERE chat_id = ? AND direction = 'out' AND body LIKE '%Pedido:%' ORDER BY id DESC LIMIT 1").bind(chat.id).first();
      const r0 = await pedidoAlAgendar(c.env, store, chat.id, zonaDeForm(f?.body), u.id);
      if (r0?.error) fail(400, 'No pude crear el pedido: ' + r0.error);
      order = await getOrder(c.env, r0.id);
      pedido = { id: order.id, num: order.number, creado: !r0.ya };
    } else if (['por_pagar', 'nuevo'].includes(order.status)) {
      order = await setOrderStatus(c.env, store, order, order.status === 'por_pagar' ? 'validado' : 'confirmado', u.id, 'Pago validado');
      pedido = { id: order.id, num: order.number, estado: order.status };
    } else pedido = { id: order.id, num: order.number };
    if (monto) {
      const adel = order.total && monto >= order.total ? order.total : monto;
      await c.env.DB.prepare('UPDATE orders SET adelanto = ?, updated_at = ? WHERE id = ?').bind(adel, now(), order.id).run();
    }
    await addEvent(c.env, order.id, 'pago', `Pago validado${monto ? ` · S/${monto}` : ''}${nota ? ` · ${nota}` : ''}`, u.id);
    await addLabel(c.env, store.id, chat.id, order.modo === 'lima' ? '✅ LIMA' : '✅ PROVINCIA');
  } else if (order) {
    await addEvent(c.env, order.id, 'pago', `El pago no llegó${monto ? ` (decía S/${monto})` : ''}${nota ? ` · ${nota}` : ''}`, u.id);
  }
  const pagoId = Number(b.pago_id) || null;
  if (pagoId && accion === 'ok') await c.env.DB.prepare('UPDATE pagos_in SET chat_id = ?, order_id = ? WHERE id = ? AND store_id = ? AND chat_id IS NULL').bind(chat.id, order?.id || null, pagoId, store.id).run();
  await c.env.DB.prepare('INSERT INTO pago_marks (store_id, chat_id, msg_id, order_id, estado, monto, nota, pago_id, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(store.id, chat.id, msgId, order?.id || null, accion, monto, nota, pagoId, u.id, now()).run();
  await c.env.DB.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').bind(now(), chat.id).run();
  await bump(c.env, store.id);
  return c.json({ ok: true, pedido });
});

// Deshacer una revisión (vuelve a «Por validar»; el estado del pedido no se toca)
r.delete('/pago-marks/:id', async (c) => {
  const m = await c.env.DB.prepare('SELECT * FROM pago_marks WHERE id = ?').bind(Number(c.req.param('id'))).first();
  if (!m) fail(404, 'No existe.');
  await storeFor(c, m.store_id);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM pago_marks WHERE id = ?').bind(m.id),
    c.env.DB.prepare('UPDATE pagos_in SET chat_id = NULL, order_id = NULL WHERE id = ?').bind(m.pago_id || 0),
  ]);
  await bump(c.env, m.store_id);
  return c.json({ ok: true });
});

/* ---------- App del celular que reenvía los pagos ---------- */

function appInfo(c, st) {
  const origin = c.env.PUBLIC_URL || new URL(c.req.url).origin;
  return { url: st.pagos_key ? `${origin}/pagos/${st.id}/${st.pagos_key}` : null, last_at: st.pagos_last_at || null };
}

r.get('/stores/:id/pagos-app', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  const row = await c.env.DB.prepare('SELECT id, pagos_key, pagos_last_at FROM stores WHERE id = ?').bind(st.id).first();
  return c.json(appInfo(c, row));
});

r.post('/stores/:id/pagos-app', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  const b = await body(c);
  const key = b.off ? null : randomToken(18);
  await c.env.DB.prepare('UPDATE stores SET pagos_key = ? WHERE id = ?').bind(key, st.id).run();
  const row = await c.env.DB.prepare('SELECT id, pagos_key, pagos_last_at FROM stores WHERE id = ?').bind(st.id).first();
  return c.json(appInfo(c, row));
});

// Enlace público: la app del celular manda el texto de la notificación (POST JSON/form/texto, o GET ?texto=)
export async function handlePagoIn(c) {
  const env = c.env;
  const st = await env.DB.prepare('SELECT id, pagos_key FROM stores WHERE id = ?').bind(Number(c.req.param('storeId'))).first();
  if (!st || !st.pagos_key || !safeEqual(st.pagos_key, c.req.param('key'))) return c.text('no', 404);
  const q = c.req.query();
  let d = { ...q };
  if (c.req.method === 'POST') {
    const ct = c.req.header('content-type') || '';
    try {
      if (ct.includes('json')) d = { ...d, ...(await c.req.json()) };
      else if (ct.includes('form')) d = { ...d, ...Object.fromEntries(await c.req.formData()) };
      else d.texto = d.texto || (await c.req.text());
    } catch {}
  }
  const texto = clip(String(d.texto || d.text || d.message || d.mensaje || [d.title, d.body].filter(Boolean).join(' ') || '').trim(), 500);
  const p = parsePago(texto);
  const monto = Number(d.monto) > 0 ? Number(d.monto) : p.monto;
  const nombre = clip(String(d.nombre || p.nombre || '').trim(), 60);
  if (!monto) return c.json({ ok: false, motivo: 'No encontré el monto (S/) en el texto.' }, 200);
  const t = now();
  // La misma notificación dos veces (la app a veces la reenvía) no se guarda dos veces
  const dup = await env.DB.prepare('SELECT id FROM pagos_in WHERE store_id = ? AND texto = ? AND created_at > ?').bind(st.id, texto, t - 5 * 60e3).first();
  if (!dup) {
    await env.DB.prepare('INSERT INTO pagos_in (store_id, monto, nombre, texto, app, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(st.id, monto, nombre, texto, clip(String(d.app || d.paquete || '').trim(), 40) || null, t).run();
  }
  await env.DB.prepare('UPDATE stores SET pagos_last_at = ?, rev = rev + 1 WHERE id = ?').bind(t, st.id).run();
  return c.json({ ok: true, monto, nombre, repetido: !!dup });
}

export default r;
