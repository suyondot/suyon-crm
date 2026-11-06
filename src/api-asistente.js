// Asistente de inicio: preguntas sobre el producto → bot, IA y pedidos listos; luego pide los archivos
// mostrando las imágenes de referencia que Jordan elige en el Panel Suyon.
import { Hono } from 'hono';
import { now, fail, clip, RUBROS } from './util.js';
import { storeFor, requireUser } from './auth.js';
import { kindForMime } from './whatsapp.js';
import { saveSettings, validateGraph } from './api-bot.js';
import { cleanAsistente, promptAsistente, knowledgeAsistente, flowAsistente, assetsFor, parseTallas, REF_KEYS, REF_FROM_STORE } from './bot-template.js';
import { cfgOf } from './orders.js';
import { preguntasProducto } from './asistente-preguntas.js';

const r = new Hono();
const body = async (c) => {
  try {
    return await c.req.json();
  } catch {
    return {};
  }
};
const KEY = 'referencias';

export async function loadRefs(env) {
  const row = await env.DB.prepare('SELECT value FROM platform_settings WHERE key = ?').bind(KEY).first().catch(() => null);
  try {
    return JSON.parse(row?.value || '{}') || {};
  } catch {
    return {};
  }
}
const saveRefs = (env, refs) =>
  env.DB.prepare('INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
    .bind(KEY, JSON.stringify(refs), now()).run();

async function requireAdmin(c) {
  const u = await requireUser(c);
  if (!u.is_admin) fail(403, 'Solo el administrador de Control Total puede ver esto.');
  return u;
}

const parse = (s) => {
  try {
    return JSON.parse(s || '{}') || {};
  } catch {
    return {};
  }
};

async function payload(env, st) {
  const ans = parse(st.asistente);
  const rubro = st.rubro || 'ropa';
  const refs = await loadRefs(env);
  const { results } = await env.DB.prepare('SELECT id, key, name, mime FROM bot_assets WHERE store_id = ?').bind(st.id).all();
  const assets = assetsFor(rubro, ans.respuestas || {}).map((a) => {
    const got = results.find((x) => x.key === a.key);
    const ref = refs[a.ref];
    return { ...a, ok: !!got, asset_id: got?.id || null, asset_mime: got?.mime || null, ref_mime: ref?.mime || null };
  });
  return { rubro, canal: st.canal || 'mensajes', setup: st.setup || 0, respuestas: ans.respuestas || null, flow_id: ans.flow_id || null, assets };
}

r.get('/stores/:id/asistente', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  return c.json(await payload(c.env, st));
});

// Guarda las respuestas y arma todo. Se puede volver a correr: actualiza el mismo flujo.
r.post('/stores/:id/asistente', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  const b = await body(c);
  const rubro = RUBROS.includes(b.rubro) ? b.rubro : st.rubro || 'ropa';
  let a;
  try {
    a = cleanAsistente(b, rubro);
  } catch (er) {
    fail(400, er.message);
  }
  const db = c.env.DB;
  // Vista previa del admin («Ver como»): muestra lo que se armaría, sin guardar nada
  if (c.req.query('preview')) {
    const refs = await loadRefs(c.env);
    return c.json({
      rubro, canal: st.canal || 'mensajes', setup: st.setup || 0, respuestas: { ...a, rubro }, flow_id: null, preview: true,
      assets: assetsFor(rubro, a).map((x) => ({ ...x, ok: false, asset_id: null, asset_mime: null, ref_mime: refs[x.ref]?.mime || null })),
    });
  }
  const prev = parse(st.asistente);
  // 1) IA: prompt y conocimiento
  await saveSettings(c.env, st.id, { ia_prompt: promptAsistente(a, rubro), ia_knowledge: knowledgeAsistente(a) });
  // 2) Pedidos: producto, precios y adelanto
  const cfg = cfgOf(st);
  const newCfg = { ...parse(st.order_cfg), producto: a.producto, precios: a.precios, adelanto: a.adelanto, mayor_desde: 0, mayor_unit: 0 };
  if (!a.provincia) newCfg.prov_modo = cfg.prov_modo;
  // 3) Flujo (apagado hasta que el dueño lo encienda)
  const graph = JSON.stringify(validateGraph(flowAsistente(a, rubro)));
  const name = clip(`Ventas ${a.producto}`, 60);
  let flowId = prev.flow_id && (await db.prepare('SELECT id FROM bot_flows WHERE id = ? AND store_id = ?').bind(prev.flow_id, st.id).first())?.id;
  if (flowId) await db.prepare('UPDATE bot_flows SET name = ?, graph = ?, updated_at = ? WHERE id = ?').bind(name, graph, now(), flowId).run();
  else flowId = (await db.prepare('INSERT INTO bot_flows (store_id, name, active, graph, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?)').bind(st.id, name, graph, now(), now()).run()).meta.last_row_id;
  // 4) Etiquetas de talla según sus tallas (ropa)
  if (rubro === 'ropa') {
    for (const t of parseTallas(a.tallas)) {
      await db.prepare("INSERT INTO labels (store_id, name, color, auto, sort, created_at) SELECT ?, ?, '--t-grey', 1, 0, ? WHERE NOT EXISTS (SELECT 1 FROM labels WHERE store_id = ? AND name = ?)")
        .bind(st.id, `Talla ${t.value}`, now(), st.id, `Talla ${t.value}`).run();
    }
  }
  await db.prepare('UPDATE stores SET rubro = ?, order_cfg = ?, asistente = ?, rev = rev + 1 WHERE id = ?')
    .bind(rubro, JSON.stringify(newCfg), JSON.stringify({ respuestas: { ...a, rubro }, flow_id: flowId, at: now() }), st.id).run();
  c.set('access', undefined);
  const fresh = await storeFor(c, st.id, 'config');
  return c.json(await payload(c.env, fresh));
});

// Preguntas de su producto (paso «Detalles»): la IA las piensa según lo que vende; si no, las fijas de su tipo
r.post('/stores/:id/asistente/preguntas', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  const b = await body(c);
  const producto = clip(String(b.producto || '').trim(), 60);
  if (!producto) fail(400, 'Escribe primero qué producto vendes.');
  const rubro = RUBROS.includes(b.rubro) ? b.rubro : st.rubro || 'ropa';
  return c.json(await preguntasProducto(c.env, st, { rubro, producto, descripcion: clip(String(b.descripcion || ''), 800), tela: clip(String(b.tela || ''), 200), ya: (Array.isArray(b.ya) ? b.ya : []).slice(0, 15).map((q) => clip(String(q), 150)) }));
});

// Termina el asistente (o lo salta): ya entra al panel
r.post('/stores/:id/asistente/listo', async (c) => {
  const st = await storeFor(c, c.req.param('id'), 'config');
  await c.env.DB.prepare('UPDATE stores SET setup = 0, rev = rev + 1 WHERE id = ?').bind(st.id).run();
  return c.json({ ok: true });
});

// Imagen de referencia (cualquier usuario con sesión)
r.get('/referencias/:key', async (c) => {
  await requireUser(c);
  const ref = (await loadRefs(c.env))[c.req.param('key')];
  if (!ref) fail(404, 'No hay referencia.');
  const obj = await c.env.MEDIA.get(ref.r2);
  if (!obj) fail(404, 'No hay referencia.');
  return new Response(obj.body, { headers: { 'Content-Type': ref.mime, 'Cache-Control': 'private, max-age=3600' } });
});

/* ---------- Panel Suyon → Referencias ---------- */

r.get('/admin/referencias', async (c) => {
  await requireAdmin(c);
  const refs = await loadRefs(c.env);
  const { results: stores } = await c.env.DB.prepare('SELECT s.id, s.name, co.name AS company FROM stores s JOIN companies co ON co.id = s.company_id WHERE EXISTS (SELECT 1 FROM bot_assets a WHERE a.store_id = s.id) ORDER BY s.id').all();
  return c.json({ keys: REF_KEYS.map(([key, desc]) => ({ key, desc, mime: refs[key]?.mime || null, at: refs[key]?.at || null })), stores });
});

r.post('/admin/referencias', async (c) => {
  await requireAdmin(c);
  const form = await c.req.formData();
  const key = String(form.get('key') || '');
  const file = form.get('file');
  if (!REF_KEYS.some(([k]) => k === key)) fail(400, 'Esa referencia no existe.');
  if (!file || typeof file === 'string') fail(400, 'No llegó el archivo.');
  if (file.size > 16 * 1048576) fail(413, 'El archivo pasa de 16 MB.');
  const mime = String(file.type || '').split(';')[0].toLowerCase();
  if (!['image', 'video', 'audio'].includes(kindForMime(mime))) fail(400, 'Usa una foto, un video o un audio.');
  const r2 = `ref/${key.replace(':', '-')}-${now()}`;
  await c.env.MEDIA.put(r2, await file.arrayBuffer(), { httpMetadata: { contentType: mime } });
  const refs = await loadRefs(c.env);
  refs[key] = { r2, mime, at: now() };
  await saveRefs(c.env, refs);
  return c.json({ ok: true });
});

// Toma las referencias de los archivos del bot de una tienda (ej: Porte)
r.post('/admin/referencias/copiar', async (c) => {
  await requireAdmin(c);
  const b = await body(c);
  const storeId = Number(b.store_id);
  const { results } = await c.env.DB.prepare('SELECT key, mime, r2_key FROM bot_assets WHERE store_id = ?').bind(storeId).all();
  const refs = await loadRefs(c.env);
  let n = 0;
  for (const [ref, src] of Object.entries(REF_FROM_STORE)) {
    const a = results.find((x) => x.key === src);
    if (!a || (refs[ref] && !b.reemplazar)) continue;
    refs[ref] = { r2: a.r2_key, mime: a.mime, at: now() };
    n++;
  }
  await saveRefs(c.env, refs);
  return c.json({ ok: true, copiadas: n });
});

r.delete('/admin/referencias/:key', async (c) => {
  await requireAdmin(c);
  const refs = await loadRefs(c.env);
  delete refs[c.req.param('key')];
  await saveRefs(c.env, refs);
  return c.json({ ok: true });
});

export default r;
