// API de Envíos (provincia: Shalom / Olva)
import { Hono } from 'hono';
import { now, fail, localDay } from './util.js';
import { storeFor, requireUser } from './auth.js';
import { getOrder, addEvent, shape } from './orders.js';
import { setOrderStatus } from './automations.js';
import { trackOrder } from './rastreo.js';
import { envCfg, cleanEnvCfg, saveEnvCfg, addForms, crossGuide, readGuides, findPicked, importArtifact, compact, ENVIO_COLS } from './envios.js';

const r = new Hono();
const body = async (c) => {
  try {
    return await c.req.json();
  } catch {
    return {};
  }
};
const bump = (env, id) => env.DB.prepare('UPDATE stores SET rev = rev + 1 WHERE id = ?').bind(id).run();

r.get('/stores/:id/envios', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'any');
  const { results } = await c.env.DB.prepare(
    `SELECT ${ENVIO_COLS} FROM orders WHERE store_id = ? AND modo = 'agencia' AND status != 'cancelado' ORDER BY COALESCE(enviado_at, created_at) DESC LIMIT 6000`
  ).bind(st.id).all();
  const e = envCfg(st);
  return c.json({
    envios: results.map(compact),
    cfg: { ...e, adelanto: Number(JSON.parse(st.order_cfg || '{}').adelanto ?? 30) },
    hoy: localDay(now(), st.timezone || 'America/Lima'),
    shalom: !!c.env.SHALOM_API_KEY,
    ia: !!c.env.ANTHROPIC_API_KEY,
  });
});

r.patch('/stores/:id/envios-config', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  const e = cleanEnvCfg(await body(c), envCfg(st));
  return c.json({ cfg: await saveEnvCfg(c.env, st, e) });
});

// Registro: pegar uno o varios formularios
r.post('/stores/:id/envios/formularios', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'any');
  const u = await requireUser(c);
  const b = await body(c);
  return c.json({ resultados: await addForms(c.env, st, b, u.id) });
});

// Cruzar la guía (código + DNI + nro. de orden) con su pedido del Registro
r.post('/stores/:id/envios/cruzar', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'any');
  const u = await requireUser(c);
  const b = await body(c);
  const res = await crossGuide(c.env, st, b, u.id);
  if (res.ok && res.track && c.env.SHALOM_API_KEY) {
    c.executionCtx.waitUntil(getOrder(c.env, res.id).then((o) => trackOrder(c.env, st, o, u.id)).catch((e) => console.error('rastreo', e)));
  }
  return c.json(res);
});

// Fotos de guías: la IA lee orden, código, DNI y fecha; luego se cruzan solas
r.post('/stores/:id/envios/fotos', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'any');
  const u = await requireUser(c);
  const form = await c.req.formData();
  const files = form.getAll('fotos').filter((f) => f && typeof f !== 'string' && f.size);
  if (!files.length) fail(400, 'Elige al menos una foto.');
  if (files.length > 10) fail(400, 'Máximo 10 fotos por vez.');
  const qrs = files.map((_, i) => String(form.get(`qr${i}`) || '').slice(0, 200));
  const leidas = await readGuides(c.env, st, files);
  const out = [];
  for (const [i, g] of leidas.entries()) {
    if (g.tipo === 'otro' && !g.orden && !g.dni) {
      out.push({ ok: false, text: `${g.archivo}: no parece una guía de Shalom u Olva.` });
      continue;
    }
    const res = await crossGuide(c.env, st, { codigo: g.codigo, dni: g.dni, orden: g.orden, qr: qrs[i] || null, fecha: g.fecha, courier: g.tipo === 'olva' ? 'olva' : 'shalom', nombre: g.nombre, destino: g.destino }, u.id);
    if (res.ok && res.track && c.env.SHALOM_API_KEY) c.executionCtx.waitUntil(getOrder(c.env, res.id).then((o) => trackOrder(c.env, st, o, u.id)).catch(() => {}));
    out.push({ ...res, leido: g });
  }
  return c.json({ resultados: out });
});

// «Ya recogió»: buscar y luego marcar
r.post('/stores/:id/envios/buscar', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'any');
  const b = await body(c);
  if (!String(b.text || '').trim()) fail(400, 'Pega primero los formularios, códigos o DNI.');
  return c.json({ resultados: await findPicked(c.env, st, b.text) });
});

r.post('/stores/:id/envios/recogido', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'any');
  const u = await requireUser(c);
  const b = await body(c);
  const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Boolean).slice(0, 200);
  let n = 0;
  for (const id of ids) {
    const o = await getOrder(c.env, id);
    if (!o || o.store_id !== st.id || o.modo !== 'agencia' || ['recogido', 'cancelado'].includes(o.status)) continue;
    await setOrderStatus(c.env, st, o, 'recogido', u.id, 'marcado en «Ya recogió»');
    n++;
  }
  await bump(c.env, st.id);
  return c.json({ marcados: n });
});

// Acciones rápidas de la tarjeta: seguimiento del día, no quiere recoger, remitente
r.post('/pedidos/:id/envio', async (c) => {
  const o = await getOrder(c.env, c.req.param('id'));
  if (!o || o.modo !== 'agencia') fail(404, 'Ese envío no existe.');
  const st = await storeFor(c, o.store_id, 'any');
  const u = await requireUser(c);
  const b = await body(c);
  let seg = [];
  try {
    seg = JSON.parse(o.seg || '[]') || [];
  } catch {}
  const sets = {};
  if (b.accion === 'seg_add') {
    seg.push(now());
    sets.seg = JSON.stringify(seg.slice(-30));
    await addEvent(c.env, o.id, 'nota', `Seguimiento día ${seg.length}`, u.id);
  } else if (b.accion === 'seg_pop') {
    seg.pop();
    sets.seg = seg.length ? JSON.stringify(seg) : null;
  } else if (b.accion === 'no_quiere') {
    sets.no_quiere = o.no_quiere ? 0 : 1;
    await addEvent(c.env, o.id, 'nota', sets.no_quiere ? 'La clienta no quiere recoger' : 'Se quitó «no quiere recoger»', u.id);
  } else if (b.accion === 'rem') {
    sets.rem = String(b.rem || '').slice(0, 20) || null;
  } else if (b.accion === 'datos') {
    if ('dni' in b) sets.dni = String(b.dni || '').replace(/\D/g, '').slice(0, 12) || null;
    if ('celular' in b) sets.celular = String(b.celular || '').replace(/\D/g, '').slice(-11) || null;
  } else fail(400, 'Acción desconocida.');
  const keys = Object.keys(sets);
  await c.env.DB.prepare(`UPDATE orders SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).bind(...keys.map((k) => sets[k]), now(), o.id).run();
  await bump(c.env, st.id);
  return c.json({ envio: compact(await getOrder(c.env, o.id)) });
});

// Cambio rápido de estado desde la tarjeta
r.post('/pedidos/:id/envio-estado', async (c) => {
  const o = await getOrder(c.env, c.req.param('id'));
  if (!o || o.modo !== 'agencia') fail(404, 'Ese envío no existe.');
  const st = await storeFor(c, o.store_id, 'any');
  const u = await requireUser(c);
  const b = await body(c);
  const ok = ['por_pagar', 'validado', 'enviado', 'en_camino', 'en_agencia', 'falta_abonar', 'recogido', 'no_recogido', 'cancelado'];
  if (!ok.includes(b.status)) fail(400, 'Ese estado no existe.');
  const cur = await setOrderStatus(c.env, st, o, b.status, u.id);
  return c.json({ envio: compact(cur), pedido: shape(cur) });
});

// Pasar los datos del artifact «Guías Shalom» (se puede repetir: no duplica)
r.post('/stores/:id/envios/importar', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  const u = await requireUser(c);
  let data = await body(c);
  if (typeof data.gz === 'string') {
    const bin = Uint8Array.from(atob(data.gz), (ch) => ch.charCodeAt(0));
    const txt = await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    data = JSON.parse(txt);
  }
  if (!Array.isArray(data.g) && !Array.isArray(data.r)) fail(400, 'Ese archivo no tiene guías del artifact.');
  return c.json(await importArtifact(c.env, st, data, u.id));
});

export default r;
