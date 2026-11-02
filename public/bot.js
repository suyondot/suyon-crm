// Bot Suyon AI (Configuración → Bot Suyon AI) y Avisos
let C; // ayudantes de app.js: api, esc, toast, $, $$, S, store, goChat, fmtPhone, listTime
export function initBot(ctx) {
  C = ctx;
}
const e = (s) => C.esc(s);
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));

/* =================== Tipos de bloque =================== */
const T = {
  start: { label: 'Disparador', cls: 'k-start', desc: 'Cuándo entra una clienta al flujo' },
  send: { label: 'Enviar', cls: 'k-send', desc: 'Texto, foto, video, audio o archivo' },
  recognize: { label: 'Reconocer · sin IA', cls: 'k-free', desc: 'Talla, color o palabras clave' },
  condition: { label: 'Condición', cls: 'k-free', desc: 'Divide según dato, etiqueta o anuncio' },
  action: { label: 'Acción', cls: 'k-act', desc: 'Etiqueta, dato, seguimiento, aviso' },
  delay: { label: 'Esperar tiempo', cls: 'k-wait', desc: 'Minutos u horas, con horario' },
  ia: { label: 'IA Suyon', cls: 'k-ia', desc: 'Responde con tu prompt y casos especiales' },
  handoff: { label: 'Pasar a asesora', cls: 'k-hand', desc: 'Pausa el bot, etiqueta y avisa' },
  goto: { label: 'Ir a otro paso', cls: 'k-free', desc: 'Bucles y atajos' },
};
const PALETTE = [
  ['Mensajes', ['send']],
  ['Decidir · gratis, sin IA', ['recognize', 'condition', 'goto']],
  ['Hacer', ['action', 'delay', 'handoff']],
  ['IA', ['ia']],
];
const OPS = { add_label: 'Poner etiqueta', remove_label: 'Quitar etiqueta', set_var: 'Guardar dato', clear_var: 'Borrar dato', start_seq: 'Iniciar seguimiento', stop_seq: 'Cancelar seguimiento', notify: 'Avisar al equipo' };
const KINDS = { text: 'Texto', image: 'Foto', video: 'Video', audio: 'Audio', document: 'PDF', file: 'Archivo (según tipo)' };
const NODE_W = 240;

const B = { storeId: null, data: null, flowId: null, flow: null, stats: {}, dirty: false, sel: null, sub: 'flujo', loading: false, test: null, zoom: null };

function typeLabel(n) {
  if (n.type === 'send' && n.wait) return n.items?.length ? 'Enviar y esperar' : 'Esperar respuesta';
  return T[n.type]?.label || n.type;
}

function summary(n) {
  switch (n.type) {
    case 'start': {
      const tr = n.trigger || {};
      const a = { ads: 'solo de anuncios', organic: 'sin anuncio', list: `de ${(tr.ad_ids || []).length} anuncios` }[tr.ads] || 'con o sin anuncio';
      return [tr.new_chat ? `Clienta nueva ${a}` : '', (tr.keywords || []).length ? `palabra: «${tr.keywords[0]}»` : ''].filter(Boolean).join(' · ') || 'Sin disparador';
    }
    case 'send': {
      const it = n.items || [];
      const txt = it.find((x) => x.kind === 'text')?.text;
      const files = it.filter((x) => x.kind !== 'text').map((x) => `[${x.asset}]`);
      return [files.join(' '), txt ? `«${txt.slice(0, 60)}${txt.length > 60 ? '…' : ''}»` : ''].filter(Boolean).join(' ') || (n.wait ? `Guarda en «${n.save_to || 'respuesta'}»` : 'Sin mensajes');
    }
    case 'recognize':
      return `${(n.options || []).map((o) => o.value).join(' · ')} → dato «${n.var || 'talla'}»`;
    case 'condition':
      return `${(n.rules || []).length} regla(s)`;
    case 'action':
      return (n.ops || []).map((o) => `${OPS[o.op] || o.op} ${o.label || o.value || o.seq || o.var || ''}`.trim()).join(' · ') || 'Sin acciones';
    case 'delay':
      return `${n.minutes || 1} min${n.from_h != null ? ` · ${n.from_h}–${n.to_h} h` : ''}`;
    case 'ia':
      return `${(n.cases || []).length} casos especiales`;
    case 'handoff':
      return (n.labels || []).join(' + ') || 'Pasa a asesora';
    case 'goto':
      return `→ ${nodeTitle(n.target)}`;
  }
  return '';
}

const nodes = () => B.flow?.graph.nodes || [];
const nodeById = (id) => nodes().find((n) => n.id === id);
const nodeTitle = (id) => (id ? nodeById(id)?.title || id : '—');

function edgesOf(n) {
  const out = [];
  const add = (to, label) => to && out.push({ to, label });
  switch (n.type) {
    case 'send': add(n.next, n.wait ? 'respondió' : ''); break;
    case 'recognize':
      add(n.next, 'reconoció');
      for (const o of n.options || []) add(o.next, o.value);
      add(n.next_other, 'no reconoció');
      break;
    case 'condition': add(n.next, 'sí'); add(n.next_no, 'no'); break;
    case 'ia':
      add(n.next, 'respondió');
      for (const c of n.cases || []) add(c.next, c.label || c.id);
      add(n.next_error, 'si falla');
      break;
    case 'goto': add(n.target, 'ir a'); break;
    case 'handoff': break;
    default: add(n.next, '');
  }
  return out;
}

/* =================== Carga =================== */
async function load(keepFlow = true) {
  B.loading = true;
  B.storeId = C.S.storeId;
  B.data = await C.api('GET', `/stores/${B.storeId}/bot`);
  if (!keepFlow || !B.data.flows.some((f) => f.id === B.flowId)) B.flowId = B.data.flows[0]?.id || null;
  if (B.flowId) await loadFlow(B.flowId);
  else B.flow = null;
  B.loading = false;
}
async function loadFlow(id) {
  const r = await C.api('GET', `/bot/flows/${id}`);
  B.flow = r.flow;
  B.stats = r.stats || {};
  B.flowId = id;
  B.dirty = false;
  if (!nodeById(B.sel)) B.sel = null;
}

export async function renderBotTab(body) {
  if (B.storeId !== C.S.storeId || !B.data) {
    body.innerHTML = '<span class="spin"></span>';
    B.sel = null;
    try {
      await load(false);
    } catch (er) {
      body.innerHTML = `<div class="err">${e(er.message)}</div>`;
      return;
    }
  }
  draw(body);
}

function draw(body = C.$('#cfgbody')) {
  if (!body) return;
  const st = B.data.settings;
  const subs = [['flujo', 'Flujo'], ['seg', 'Seguimientos'], ['ia', 'IA Suyon'], ['files', 'Archivos']];
  const missing = B.data.template_assets.filter((a) => !a.ok).length;
  body.innerHTML = `
  <div class="ph"><div><h2>Bot Suyon AI</h2><p>Tu flujo de Botcake, aquí. Lo gratis (precios, talla, colores) va sin IA; la IA entra después, con tu mismo prompt.</p></div><span class="grow"></span>
    <label class="bswitch"><input type="checkbox" id="bon" ${st.bot_on ? 'checked' : ''}><span>${st.bot_on ? 'Bot encendido' : 'Bot apagado'}</span></label></div>
  <div class="card bwho"><div class="field" style="flex:1 1 220px"><label for="baud">Responde a</label>
      <select id="baud"><option value="equipo" ${st.audience !== 'todas' ? 'selected' : ''}>Solo números de prueba</option><option value="todas" ${st.audience === 'todas' ? 'selected' : ''}>Todas las clientas</option></select></div>
    <div class="field" style="flex:2 1 260px" ${st.audience === 'todas' ? 'hidden' : ''}><label for="btest">Números de prueba (separados por coma)</label><input id="btest" value="${e(st.test_numbers || '')}" placeholder="Ej: 941010752, 987654321"></div>
    <p class="note" style="flex-basis:100%;margin:0">Para probar: enciende el bot, deja tu número aquí y escríbele al número de la tienda. O abre un chat y toca «Iniciar flujo» en la ficha.</p></div>
  <div class="seg" role="tablist" style="margin:14px 0">${subs.map(([k, l]) => `<button role="tab" data-bsub="${k}" aria-pressed="${B.sub === k}">${l}${k === 'files' && missing ? ` <span class="bcnt">${missing}</span>` : ''}</button>`).join('')}</div>
  <div id="bsub"></div>`;
  const on = C.$('#bon');
  on.onchange = () => saveSettings({ bot_on: on.checked }, on.checked ? 'Bot encendido' : 'Bot apagado');
  C.$('#baud').onchange = (ev) => saveSettings({ audience: ev.target.value });
  C.$('#btest').onchange = (ev) => saveSettings({ test_numbers: ev.target.value }, 'Números de prueba guardados');
  ({ flujo: drawFlow, seg: drawSeqs, ia: drawIA, files: drawFiles })[B.sub]();
}

async function saveSettings(patch, msg = 'Guardado') {
  try {
    const r = await C.api('PATCH', `/stores/${B.storeId}/bot/settings`, patch);
    B.data.settings = r.settings;
    C.toast(msg);
    draw();
  } catch (er) {
    C.toast(er.message, 5000);
  }
}

/* =================== Flujo: lienzo =================== */
function flowBar() {
  const fl = B.data.flows;
  return `<div class="bbar">
    ${fl.length > 1 ? `<select id="bflow" aria-label="Flujo">${fl.map((f) => `<option value="${f.id}" ${f.id === B.flowId ? 'selected' : ''}>${e(f.name)}</option>`).join('')}</select>` : ''}
    <input id="bname" value="${e(B.flow.name)}" aria-label="Nombre del flujo" maxlength="60">
    <label class="bswitch sm"><input type="checkbox" id="bactive" ${B.flow.active ? 'checked' : ''}><span>${B.flow.active ? 'Flujo activo' : 'Flujo apagado'}</span></label>
    <span class="grow"></span>
    ${B.sub === 'flujo' ? `<span class="bzoom"><button data-bact="zout" aria-label="Alejar">−</button><span id="bzv">${Math.round((B.zoom || 1) * 100)}%</span><button data-bact="zin" aria-label="Acercar">+</button><button data-bact="zfit" style="font-weight:600;font-size:12.5px;padding:0 8px">Ver todo</button></span>` : ''}
    <button class="iconbtn" data-bact="newflow">+ Flujo</button>
    <button class="iconbtn" data-bact="reload">Actualizar números</button>
    <button class="send" data-bact="save" ${B.dirty ? '' : 'disabled'}>${B.dirty ? 'Guardar cambios' : 'Guardado'}</button>
  </div>`;
}

function drawFlow() {
  const box = C.$('#bsub');
  if (!B.flow) {
    box.innerHTML = `<div class="card empty" style="gap:10px"><b>Todavía no hay flujos en esta tienda</b>
      <span>La plantilla trae tu flujo «ventas pantalón» de Botcake: precios, talla (todas las frases), colores por talla, IA con tu prompt, casos especiales y los 2 seguimientos.</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><button class="send" data-bact="tpl">Crear desde «Ventas pantalón»</button><button class="iconbtn" data-bact="blank">Flujo vacío</button></div></div>`;
    return;
  }
  box.innerHTML = `${flowBar()}
  <div class="bwrap">
    <aside class="bpal" aria-label="Agregar bloque">${PALETTE.map(([g, ts]) => `<h4>${g}</h4>${ts.map((t) => `<button data-badd="${t}" title="${T[t].desc}"><i class="kdot ${T[t].cls}"></i><b>${T[t].label}</b></button>`).join('')}`).join('')}
      <span class="note">Toca para agregar · arrastra para ordenar · elige a dónde sigue cada bloque en el panel</span></aside>
    <section class="bcanvas-wrap" aria-label="Lienzo"><div class="bsizer" id="bsizer"><div class="bcanvas" id="bcanvas"></div></div></section>
    <aside class="bpanel" id="bpanel" aria-label="Bloque elegido"></aside>
  </div>`;
  const sel = C.$('#bflow');
  if (sel) sel.onchange = async () => {
    if (B.dirty && !confirm('Tienes cambios sin guardar. ¿Cambiar de flujo igual?')) return (sel.value = B.flowId);
    await loadFlow(Number(sel.value));
    drawFlow();
  };
  C.$('#bname').oninput = (ev) => {
    B.flow.name = ev.target.value;
    markDirty();
  };
  C.$('#bactive').onchange = async (ev) => {
    try {
      if (ev.target.checked && B.dirty) await saveFlow(true);
      const r = await C.api('PUT', `/bot/flows/${B.flowId}`, { active: ev.target.checked });
      B.flow.active = r.flow.active;
      B.data.flows.find((f) => f.id === B.flowId).active = r.flow.active;
      C.toast(r.flow.active ? 'Flujo activo' : 'Flujo apagado');
      if (r.flow.active && !B.data.settings.bot_on) C.toast('Ojo: el bot de la tienda está apagado (arriba).', 5000);
      drawFlow();
    } catch (er) {
      C.toast(er.message, 5000);
      ev.target.checked = !ev.target.checked;
    }
  };
  drawCanvas();
  drawPanel();
}

function markDirty() {
  B.dirty = true;
  const b = C.$('[data-bact="save"]');
  if (b) {
    b.disabled = false;
    b.textContent = 'Guardar cambios';
  }
}

function statLine(n) {
  const s = B.stats[n.id];
  if (!s) return '<span class="bst muted">Sin datos aún</span>';
  if (s.sent) {
    return `<span class="bst">Env <b>${fmt(s.sent)}</b> · Entr <b>${fmt(s.delivered)}</b> · Leí <b>${fmt(s.read)}</b> · <span class="${s.failed ? 'bad' : ''}">Fall <b>${fmt(s.failed)}</b></span> · Resp <b>${fmt(s.replied)}</b></span>`;
  }
  return `<span class="bst">Pasaron <b>${fmt(s.entered)}</b></span>`;
}

function cardHTML(n, i) {
  const t = T[n.type] || {};
  return `<div class="bnode ${t.cls} ${n.wait ? 'waits' : ''}" data-node="${e(n.id)}" style="left:${n.x}px;top:${n.y}px;width:${NODE_W}px" tabindex="0" role="button" aria-pressed="${B.sel === n.id}">
    <small>${n.type === 'start' ? '' : i + ' · '}${e(typeLabel(n))}</small><b>${e(n.title || n.id)}</b><span class="bsum">${e(summary(n))}</span>${statLine(n)}</div>`;
}

function canvasSize() {
  const ns = nodes();
  return { w: Math.max(900, ...ns.map((n) => n.x + NODE_W + 160)), h: Math.max(700, ...ns.map((n) => n.y + 260)) };
}

function applyZoom() {
  const cv = C.$('#bcanvas');
  const sz = C.$('#bsizer');
  if (!cv || !sz) return;
  const { w, h } = canvasSize();
  if (!B.zoom) {
    const wrapW = C.$('.bcanvas-wrap').clientWidth - 8;
    B.zoom = Math.max(0.75, Math.min(1, wrapW / w));
  }
  cv.style.transform = `scale(${B.zoom})`;
  sz.style.width = w * B.zoom + 'px';
  sz.style.height = h * B.zoom + 'px';
  const zv = C.$('#bzv');
  if (zv) zv.textContent = Math.round(B.zoom * 100) + '%';
}

function drawCanvas() {
  const cv = C.$('#bcanvas');
  if (!cv) return;
  const ns = nodes();
  let i = 0;
  const { w, h } = canvasSize();
  cv.style.width = w + 'px';
  cv.style.height = h + 'px';
  cv.innerHTML = `<svg class="bedges" width="${w}" height="${h}" aria-hidden="true"><defs><marker id="bah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor"/></marker></defs><g id="bpaths"></g></svg>
    ${ns.map((n) => cardHTML(n, n.type === 'start' ? 0 : ++i)).join('')}`;
  applyZoom();
  drawEdges();
  wireDrag(cv);
}

// Flechas: a la derecha/izquierda salen por el costado; hacia abajo, por la base.
// Si en el camino hay otro bloque, rodean por la izquierda.
function drawEdges() {
  const g = C.$('#bpaths');
  if (!g) return;
  const H = {};
  C.$$('#bcanvas .bnode').forEach((el) => (H[el.dataset.node] = el.offsetHeight));
  const ns = nodes();
  const hOf = (n) => H[n.id] || 100;
  const blocked = (a, b) => ns.some((m) => m !== a && m !== b && m.x < a.x + NODE_W && m.x + NODE_W > a.x && m.y > a.y + 10 && m.y < b.y - 10);
  const all = [];
  for (const n of ns) {
    const groups = { right: [], left: [], down: [], around: [] };
    for (const ed of edgesOf(n)) {
      const t = nodeById(ed.to);
      if (!t) continue;
      const side = t.x >= n.x + NODE_W + 20 ? 'right' : t.x + NODE_W + 20 <= n.x ? 'left' : t.y > n.y + hOf(n) && !blocked(n, t) ? 'down' : 'around';
      groups[side].push({ ...ed, n, t, side });
    }
    for (const list of Object.values(groups)) list.forEach((ed, k) => all.push({ ...ed, k, cnt: list.length }));
  }
  // Varias flechas que llegan al mismo costado de un bloque: se reparten para que no se tapen
  const inc = {};
  for (const ed of all) (inc[ed.t.id + ed.side] ||= []).push(ed);
  for (const list of Object.values(inc)) list.forEach((ed, j) => ((ed.j = j), (ed.jn = list.length)));
  let out = '';
  for (const ed of all) {
    const { n, t, side, k, cnt } = ed;
    const hn = hOf(n);
    const ht = hOf(t);
    const frac = (k + 1) / (cnt + 1);
    const ein = ed.jn > 1 ? 0.15 + (0.6 * ed.j) / (ed.jn - 1) : 0.3;
    let x1, y1, x2, y2, d, lx, ly, anchor = 'start';
    if (side === 'right' || side === 'left') {
      const r = side === 'right';
      x1 = r ? n.x + NODE_W : n.x;
      y1 = n.y + hn * (0.35 + 0.6 * frac);
      x2 = r ? t.x : t.x + NODE_W;
      y2 = t.y + ht * ein;
      const dx = Math.max(40, Math.abs(x2 - x1) / 2) * (r ? 1 : -1);
      d = `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
      lx = r ? x2 - 8 : x2 + 8;
      ly = y2 - 7;
      anchor = r ? 'end' : 'start';
    } else if (side === 'down') {
      x1 = n.x + NODE_W * frac;
      y1 = n.y + hn;
      x2 = t.x + NODE_W * (ed.jn > 1 ? (ed.j + 1) / (ed.jn + 1) : 0.5);
      y2 = t.y - 2;
      const dy = Math.max(30, (y2 - y1) / 2);
      d = `M${x1},${y1} C${x1},${y1 + dy} ${x2},${y2 - dy} ${x2},${y2}`;
      lx = x1 + 6;
      ly = y1 + 16;
    } else {
      x1 = n.x;
      y1 = n.y + hn * (0.4 + 0.5 * frac);
      x2 = t.x;
      y2 = t.y + ht * ein;
      const xl = Math.min(n.x, t.x) - 36 - 10 * k;
      d = `M${x1},${y1} C${xl},${y1} ${xl},${y2} ${x2},${y2}`;
      lx = xl + 4;
      ly = (y1 + y2) / 2;
    }
    const hot = B.sel === n.id || B.sel === t.id;
    out += `<path d="${d}" class="${hot ? 'hot' : ''} ${ed.label === 'si falla' ? 'err' : ''}" marker-end="url(#bah)"/>`;
    if (ed.label) out += `<text x="${lx}" y="${ly}" text-anchor="${anchor}" class="${hot ? 'hot' : ''}">${e(ed.label)}</text>`;
  }
  g.innerHTML = out;
}

function wireDrag(cv) {
  let drag = null;
  cv.onpointerdown = (ev) => {
    const el = ev.target.closest('.bnode');
    if (!el || ev.button !== 0) return;
    const n = nodeById(el.dataset.node);
    drag = { el, n, sx: ev.clientX, sy: ev.clientY, ox: n.x, oy: n.y, moved: false };
    el.setPointerCapture(ev.pointerId);
  };
  cv.onpointermove = (ev) => {
    if (!drag) return;
    const dx = (ev.clientX - drag.sx) / (B.zoom || 1);
    const dy = (ev.clientY - drag.sy) / (B.zoom || 1);
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
    drag.moved = true;
    drag.n.x = Math.max(0, Math.round((drag.ox + dx) / 10) * 10);
    drag.n.y = Math.max(0, Math.round((drag.oy + dy) / 10) * 10);
    drag.el.style.left = drag.n.x + 'px';
    drag.el.style.top = drag.n.y + 'px';
    drawEdges();
  };
  cv.onpointerup = () => {
    if (!drag) return;
    const { n, moved } = drag;
    drag = null;
    if (moved) {
      markDirty();
      drawCanvas();
    } else select(n.id);
  };
  cv.onkeydown = (ev) => {
    const el = ev.target.closest('.bnode');
    if (el && (ev.key === 'Enter' || ev.key === ' ')) {
      ev.preventDefault();
      select(el.dataset.node);
    }
  };
}

function select(id) {
  B.sel = id;
  C.$$('#bcanvas .bnode').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.node === id)));
  drawEdges();
  drawPanel();
  if (window.innerWidth <= 1180) C.$('#bpanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function refreshCard(n) {
  const el = C.$(`#bcanvas .bnode[data-node="${CSS.escape(n.id)}"]`);
  if (!el) return drawCanvas();
  const idx = n.type === 'start' ? 0 : el.querySelector('small').textContent.split(' · ')[0];
  const tmp = document.createElement('div');
  tmp.innerHTML = cardHTML(n, idx);
  el.replaceWith(tmp.firstElementChild);
  drawEdges();
}

/* ---------- Panel del bloque ---------- */
function nextSel(key, val, self, label) {
  return `<div class="field"><label>${label}</label><select data-k="${key}"><option value="">— termina aquí —</option>${nodes()
    .filter((x) => x.id !== self && x.type !== 'start')
    .map((x) => `<option value="${e(x.id)}" ${x.id === val ? 'selected' : ''}>${e(x.title || x.id)}</option>`)
    .join('')}</select></div>`;
}

function assetList() {
  const keys = new Set([...B.data.assets.map((a) => a.key), ...B.data.template_assets.map((a) => a.key)]);
  return `<datalist id="bassets">${[...keys].map((k) => `<option value="${e(k)}">`).join('')}<option value="colores-{talla}"></datalist>`;
}

function itemsEditor(items, path) {
  return `<div class="bitems" data-items="${path}">${(items || []).map((it, i) => `<div class="bitem">
      <div class="brow"><select data-ik="kind" data-i="${i}" aria-label="Tipo">${Object.entries(KINDS).map(([k, l]) => `<option value="${k}" ${it.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button class="iconbtn" data-iup="${i}" aria-label="Subir" ${i ? '' : 'disabled'}>↑</button><button class="iconbtn" data-idel="${i}" aria-label="Quitar">×</button></div>
      ${it.kind === 'text' ? `<textarea data-ik="text" data-i="${i}" rows="4" aria-label="Texto">${e(it.text || '')}</textarea>` : `<input data-ik="asset" data-i="${i}" list="bassets" value="${e(it.asset || '')}" placeholder="Clave del archivo (ej: colores-{talla})" aria-label="Archivo">${assetOk(it.asset)}`}
    </div>`).join('')}
    <div class="brow"><button class="iconbtn" data-iadd="text">+ Texto</button><button class="iconbtn" data-iadd="image">+ Foto</button><button class="iconbtn" data-iadd="video">+ Video</button><button class="iconbtn" data-iadd="audio">+ Audio</button></div>
    <p class="note" style="margin:0">Usa {talla}, {colores}, {nombre}… para poner datos guardados de la clienta.</p></div>`;
}

function assetOk(key) {
  if (!key) return '';
  if (key.includes('{')) return '<span class="note">Cambia según el dato de la clienta</span>';
  return B.data.assets.some((a) => a.key === key) ? '<span class="note ok">✓ archivo subido</span>' : '<span class="note bad">Falta subir este archivo (pestaña Archivos)</span>';
}

function statsBox(id) {
  const s = B.stats[id] || {};
  return `<div class="bstats">${[['Enviados', s.sent], ['Entregados', s.delivered], ['Leídos', s.read], ['Fallidos', s.failed], ['Respondieron', s.replied], ['Pasaron', s.entered]]
    .map(([l, v]) => `<div class="${l === 'Fallidos' && v ? 'bad' : ''}"><span>${l}</span><b>${fmt(v)}</b></div>`).join('')}</div>
    ${s.last_error ? `<div class="err" style="font-weight:500">Último error: ${e(s.last_error)}</div>` : ''}`;
}

function drawPanel() {
  const p = C.$('#bpanel');
  if (!p) return;
  const n = nodeById(B.sel);
  if (!n) {
    p.innerHTML = `<div class="empty" style="padding:20px 8px"><b>Elige un bloque</b><span>Tócalo en el lienzo para ver sus números y editarlo.</span></div>`;
    return;
  }
  let f = '';
  switch (n.type) {
    case 'start': {
      const tr = n.trigger || (n.trigger = {});
      f = `<label class="chk"><input type="checkbox" data-k="trigger.new_chat" ${tr.new_chat ? 'checked' : ''}> Clienta nueva (primer mensaje)</label>
        <div class="field"><label>De dónde viene</label><select data-k="trigger.ads">${[['all', 'Con o sin anuncio'], ['ads', 'Solo desde anuncios'], ['organic', 'Solo sin anuncio'], ['list', 'Solo estos anuncios']].map(([v, l]) => `<option value="${v}" ${(tr.ads || 'all') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        ${tr.ads === 'list' ? `<div class="field"><label>IDs de anuncio (uno por línea)</label><textarea data-k="trigger.ad_ids" data-list="1" rows="4">${e((tr.ad_ids || []).join('\n'))}</textarea></div>` : ''}
        <div class="field"><label>Palabras clave (una por línea, el mensaje las contiene)</label><textarea data-k="trigger.keywords" data-list="1" rows="3">${e((tr.keywords || []).join('\n'))}</textarea></div>
        <div class="field"><label>Etiquetas al entrar (separadas por coma)</label><input data-k="labels" data-csv="1" value="${e((n.labels || []).join(', '))}"></div>
        ${nextSel('next', n.next, n.id, 'Luego')}`;
      break;
    }
    case 'send':
      f = `${itemsEditor(n.items, 'items')}
        <label class="chk"><input type="checkbox" data-k="wait" ${n.wait ? 'checked' : ''}> Esperar su respuesta</label>
        ${n.wait ? `<div class="field"><label>Guardar lo que responda en el dato</label><input data-k="save_to" value="${e(n.save_to || 'respuesta')}"></div>` : ''}
        ${nextSel('next', n.next, n.id, n.wait ? 'Cuando responda' : 'Luego')}`;
      break;
    case 'recognize':
      f = `<div class="fields2"><div class="field"><label>Leer el dato</label><input data-k="from" value="${e(n.from || 'respuesta')}"></div><div class="field"><label>Guardar como</label><input data-k="var" value="${e(n.var || 'talla')}"></div></div>
        <div class="bopts">${(n.options || []).map((o, i) => `<div class="brow"><input data-ok="value" data-i="${i}" value="${e(o.value)}" aria-label="Valor" style="width:64px"><input data-ok="words" data-i="${i}" value="${e((o.words || []).join(', '))}" aria-label="Palabras" style="flex:1"><button class="iconbtn" data-odel="${i}" aria-label="Quitar">×</button></div>`).join('')}
          <button class="iconbtn" data-oadd="1">+ Opción</button>
          <p class="note" style="margin:0">Busca estas palabras o números dentro del mensaje («uso talla 30» → S). Si dice dos, se queda con la última de la lista (la más grande).</p></div>
        ${nextSel('next', n.next, n.id, 'Si reconoce')}${nextSel('next_other', n.next_other, n.id, 'Si no reconoce')}`;
      break;
    case 'condition':
      f = `<div class="field"><label>Se cumple si</label><select data-k="mode"><option value="all" ${n.mode !== 'any' ? 'selected' : ''}>Todas las reglas</option><option value="any" ${n.mode === 'any' ? 'selected' : ''}>Cualquiera</option></select></div>
        ${(n.rules || []).map((r, i) => `<div class="brow"><select data-rk="on" data-i="${i}"><option value="var" ${r.on !== 'label' && r.on !== 'ad' ? 'selected' : ''}>Dato</option><option value="label" ${r.on === 'label' ? 'selected' : ''}>Etiqueta</option><option value="ad" ${r.on === 'ad' ? 'selected' : ''}>Anuncio</option></select>
          ${r.on === 'label' || r.on === 'ad' ? '' : `<input data-rk="var" data-i="${i}" value="${e(r.var || '')}" placeholder="dato" style="width:90px">`}
          <select data-rk="op" data-i="${i}">${[['eq', 'es'], ['contains', 'contiene'], ['set', 'tiene algo'], ['any', 'cualquiera']].map(([v, l]) => `<option value="${v}" ${r.op === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <input data-rk="value" data-i="${i}" value="${e(r.value || '')}" placeholder="valor" style="flex:1"><button class="iconbtn" data-rdel="${i}" aria-label="Quitar">×</button></div>`).join('')}
        <button class="iconbtn" data-radd="1">+ Regla</button>
        ${nextSel('next', n.next, n.id, 'Si se cumple')}${nextSel('next_no', n.next_no, n.id, 'Si no')}`;
      break;
    case 'action': {
      const seqs = B.flow.graph.sequences || [];
      f = `${(n.ops || []).map((o, i) => `<div class="brow"><select data-pk="op" data-i="${i}">${Object.entries(OPS).map(([v, l]) => `<option value="${v}" ${o.op === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
          ${o.op === 'start_seq' || o.op === 'stop_seq'
            ? `<select data-pk="seq" data-i="${i}" style="flex:1">${seqs.map((s) => `<option value="${e(s.id)}" ${o.seq === s.id ? 'selected' : ''}>${e(s.name)}</option>`).join('')}</select>`
            : o.op === 'set_var' || o.op === 'clear_var'
              ? `<input data-pk="var" data-i="${i}" value="${e(o.var || '')}" placeholder="dato" style="width:90px">${o.op === 'set_var' ? `<input data-pk="value" data-i="${i}" value="${e(o.value || '')}" placeholder="valor" style="flex:1">` : ''}`
              : `<input data-pk="label" data-i="${i}" value="${e(o.label || '')}" placeholder="${o.op === 'notify' ? 'Texto del aviso' : 'Etiqueta (ej: Talla {talla})'}" style="flex:1">`}
          <button class="iconbtn" data-pdel="${i}" aria-label="Quitar">×</button></div>`).join('')}
        <button class="iconbtn" data-padd="1">+ Acción</button>${nextSel('next', n.next, n.id, 'Luego')}`;
      break;
    }
    case 'delay':
      f = `<div class="fields2"><div class="field"><label>Minutos</label><input type="number" min="1" data-k="minutes" data-num="1" value="${n.minutes || 1}"></div>
        <div class="field"><label>Solo de / a (hora Lima)</label><div class="brow"><input type="number" min="0" max="23" data-k="from_h" data-num="1" value="${n.from_h ?? ''}" placeholder="8"><input type="number" min="1" max="24" data-k="to_h" data-num="1" value="${n.to_h ?? ''}" placeholder="22"></div></div></div>
        <label class="chk"><input type="checkbox" data-k="cancel_on_reply" ${n.cancel_on_reply ? 'checked' : ''}> Cancelar si la clienta responde</label>${nextSel('next', n.next, n.id, 'Luego')}`;
      break;
    case 'ia':
      f = `<p class="note" style="margin:0">Usa el prompt, los archivos y los datos de pago de la pestaña <b>IA Suyon</b>. Responde, guarda los datos de la clienta y vuelve a esperar.</p>
        <h4 class="bh">Casos especiales</h4><p class="note" style="margin:0">Si la clienta está en uno de estos casos, el flujo sigue por otro camino.</p>
        ${(n.cases || []).map((cs, i) => `<div class="bcase"><div class="brow"><input data-ck="label" data-i="${i}" value="${e(cs.label || '')}" placeholder="Nombre corto" style="flex:1"><button class="iconbtn" data-cdel="${i}" aria-label="Quitar">×</button></div>
          <textarea data-ck="when" data-i="${i}" rows="3" aria-label="Cuándo">${e(cs.when || '')}</textarea>
          <label class="chk"><input type="checkbox" data-ck="send_reply" data-i="${i}" ${cs.send_reply !== false ? 'checked' : ''}> Mandar igual la respuesta de la IA</label>
          <div class="field"><label>Luego</label><select data-ck="next" data-i="${i}"><option value="">— termina —</option>${nodes().filter((x) => x.id !== n.id && x.type !== 'start').map((x) => `<option value="${e(x.id)}" ${x.id === cs.next ? 'selected' : ''}>${e(x.title || x.id)}</option>`).join('')}</select></div></div>`).join('')}
        <button class="iconbtn" data-cadd="1">+ Caso especial</button>
        ${nextSel('next', n.next, n.id, 'Después de responder')}${nextSel('next_error', n.next_error, n.id, 'Si la IA falla')}
        <h4 class="bh">Probar la IA (no manda nada a WhatsApp)</h4>
        <div class="brow"><input id="btesttxt" placeholder="Escribe como si fueras la clienta" style="flex:1"><button class="send" data-bact="testia" style="height:auto">Probar</button></div>
        <div id="btestout">${B.test ? testHTML(B.test) : ''}</div>`;
      break;
    case 'handoff':
      f = `<div class="field"><label>Etiquetas (separadas por coma)</label><input data-k="labels" data-csv="1" value="${e((n.labels || []).join(', '))}"></div>
        <div class="field"><label>Motivo del aviso</label><input data-k="reason" value="${e(n.reason || '')}" placeholder="Ej: Compró: validar pago"></div>
        <div class="field"><label>Mensaje a la clienta (opcional)</label><textarea data-k="message" rows="2">${e(n.message || '')}</textarea></div>
        <p class="note" style="margin:0">Pausa el bot y la IA en ese chat, lo marca no leído y sale en Avisos → Asesora pendiente.</p>`;
      break;
    case 'goto':
      f = nextSel('target', n.target, n.id, 'Ir a');
      break;
  }
  p.innerHTML = `${assetList()}<div class="bphead"><span class="kpill ${T[n.type].cls}">${e(typeLabel(n))}</span><span class="grow"></span>${n.type !== 'start' ? `<button class="iconbtn" data-bact="dup">Duplicar</button><button class="iconbtn" data-bact="del" aria-label="Borrar bloque">${'Borrar'}</button>` : ''}</div>
    <div class="field"><label>Título</label><input data-k="title" value="${e(n.title || '')}" maxlength="80"></div>
    ${statsBox(n.id)}
    <div class="bform">${f}</div>`;
  wirePanel(p, n);
}

function testHTML(r) {
  if (r.error) return `<div class="err">${e(r.error)}</div>`;
  return `<div class="btest">${(r.mensajes || []).map((m) => `${m.archivo ? `<span class="bfile">[archivo: ${e(m.archivo)}]</span>` : ''}${m.texto ? `<span class="bbub">${e(m.texto)}</span>` : ''}`).join('')}
    <span class="note">Caso: <b>${e(r.caso || 'ninguno')}</b>${Object.keys(r.datos || {}).length ? ' · Datos: ' + e(Object.entries(r.datos).map(([k, v]) => `${k}=${v}`).join(', ')) : ''}</span></div>`;
}

function setPath(obj, path, val) {
  const parts = path.split('.');
  let o = obj;
  for (const k of parts.slice(0, -1)) o = o[k] ||= {};
  o[parts[parts.length - 1]] = val;
}

function wirePanel(p, n) {
  const redrawPanel = () => {
    markDirty();
    refreshCard(n);
    drawPanel();
  };
  p.oninput = p.onchange = (ev) => {
    const t = ev.target;
    const d = t.dataset;
    const i = Number(d.i);
    let v = t.type === 'checkbox' ? t.checked : t.value;
    if (d.k) {
      if (d.list) v = v.split('\n').map((x) => x.trim()).filter(Boolean);
      else if (d.csv) v = v.split(',').map((x) => x.trim()).filter(Boolean);
      else if (d.num) v = v === '' ? null : Number(v);
      else if (t.tagName === 'SELECT' && v === '') v = null;
      setPath(n, d.k, v);
      markDirty();
      refreshCard(n);
      if (ev.type === 'change' && (t.type === 'checkbox' || t.tagName === 'SELECT')) drawPanel();
      return;
    }
    if (d.ik) {
      n.items[i][d.ik] = v;
      if (d.ik === 'kind') {
        if (v === 'text') n.items[i] = { kind: 'text', text: '' };
        else n.items[i] = { kind: v, asset: n.items[i].asset || '' };
        return redrawPanel();
      }
      markDirty();
      refreshCard(n);
      if (d.ik === 'asset' && ev.type === 'change') drawPanel();
      return;
    }
    if (d.ok) {
      n.options[i][d.ok] = d.ok === 'words' ? v.split(',').map((x) => x.trim()).filter(Boolean) : v.trim().toUpperCase();
      markDirty();
      return refreshCard(n);
    }
    if (d.rk) {
      n.rules[i][d.rk] = v;
      markDirty();
      if (ev.type === 'change' && t.tagName === 'SELECT') drawPanel();
      return;
    }
    if (d.pk) {
      n.ops[i][d.pk] = v;
      if (d.pk === 'op' && (v === 'start_seq' || v === 'stop_seq') && !n.ops[i].seq) n.ops[i].seq = B.flow.graph.sequences?.[0]?.id;
      markDirty();
      refreshCard(n);
      if (ev.type === 'change' && t.tagName === 'SELECT') drawPanel();
      return;
    }
    if (d.ck) {
      n.cases[i][d.ck] = d.ck === 'next' ? v || null : v;
      markDirty();
      refreshCard(n);
    }
  };
  p.onclick = async (ev) => {
    const t = ev.target.closest('button');
    if (!t) return;
    const d = t.dataset;
    if (d.iadd) {
      (n.items ||= []).push(d.iadd === 'text' ? { kind: 'text', text: '' } : { kind: d.iadd, asset: '' });
      return redrawPanel();
    }
    if (d.idel) {
      n.items.splice(Number(d.idel), 1);
      return redrawPanel();
    }
    if (d.iup) {
      const i = Number(d.iup);
      [n.items[i - 1], n.items[i]] = [n.items[i], n.items[i - 1]];
      return redrawPanel();
    }
    if (d.oadd) {
      (n.options ||= []).push({ value: 'NUEVO', words: [] });
      return redrawPanel();
    }
    if (d.odel) {
      n.options.splice(Number(d.odel), 1);
      return redrawPanel();
    }
    if (d.radd) {
      (n.rules ||= []).push({ on: 'var', var: 'respuesta', op: 'contains', value: '' });
      return redrawPanel();
    }
    if (d.rdel) {
      n.rules.splice(Number(d.rdel), 1);
      return redrawPanel();
    }
    if (d.padd) {
      (n.ops ||= []).push({ op: 'add_label', label: '' });
      return redrawPanel();
    }
    if (d.pdel) {
      n.ops.splice(Number(d.pdel), 1);
      return redrawPanel();
    }
    if (d.cadd) {
      (n.cases ||= []).push({ id: 'caso' + Date.now().toString(36).slice(-4), label: 'Caso nuevo', when: '', send_reply: true, next: null });
      return redrawPanel();
    }
    if (d.cdel) {
      if (!confirm('¿Quitar este caso especial?')) return;
      n.cases.splice(Number(d.cdel), 1);
      return redrawPanel();
    }
  };
}

function newNode(type) {
  const wrap = C.$('.bcanvas-wrap');
  const id = type + '_' + Date.now().toString(36).slice(-5);
  const z = B.zoom || 1;
  const n = { id, type, title: T[type].label, x: Math.round(((wrap?.scrollLeft || 0) / z + 40) / 10) * 10, y: Math.round(((wrap?.scrollTop || 0) / z + 40) / 10) * 10, next: null };
  if (type === 'send') n.items = [{ kind: 'text', text: '' }];
  if (type === 'recognize') Object.assign(n, { from: 'respuesta', var: 'dato', options: [{ value: 'SI', words: ['si', 'sí', 'claro', 'ok'] }], next_other: null });
  if (type === 'condition') Object.assign(n, { mode: 'all', rules: [{ on: 'label', op: 'eq', value: '' }], next_no: null });
  if (type === 'action') n.ops = [{ op: 'add_label', label: '' }];
  if (type === 'delay') n.minutes = 30;
  if (type === 'ia') Object.assign(n, { cases: [], next_error: null });
  if (type === 'handoff') Object.assign(n, { labels: ['ASESOR'], reason: 'Pasó a asesora' });
  return n;
}

async function saveFlow(quiet = false) {
  const r = await C.api('PUT', `/bot/flows/${B.flowId}`, { name: B.flow.name, graph: B.flow.graph });
  B.flow.graph = r.flow.graph;
  B.flow.name = r.flow.name;
  const f = B.data.flows.find((x) => x.id === B.flowId);
  if (f) f.name = r.flow.name;
  B.dirty = false;
  if (!quiet) C.toast('Flujo guardado');
}

/* =================== Seguimientos =================== */
function drawSeqs() {
  const box = C.$('#bsub');
  if (!B.flow) return (box.innerHTML = '<div class="card empty"><b>Primero crea un flujo</b><span>Los seguimientos son parte de cada flujo.</span></div>');
  const seqs = (B.flow.graph.sequences ||= []);
  const unit = (m) => (m % 60 ? `${m} min` : `${m / 60} h`);
  box.innerHTML = `${flowBar()}${assetList()}
    <p class="note">Se envían solos si la clienta se queda callada. El tiempo cuenta desde que empieza el seguimiento (lo inicia un bloque «Acción»). Si un mensaje falla, sale en rojo con el motivo y en Avisos.</p>
    ${seqs.map((s, si) => `<div class="card bseq" data-seq="${si}">
      <div class="brow"><input data-sk="name" value="${e(s.name)}" aria-label="Nombre" style="flex:1;font-weight:700"><label class="note" style="display:flex;gap:6px;align-items:center;white-space:nowrap">Se cancela si
        <select data-sk="cancel_on"><option value="reply" ${s.cancel_on === 'reply' ? 'selected' : ''}>responde algo</option><option value="image" ${s.cancel_on === 'image' ? 'selected' : ''}>manda una foto (captura)</option><option value="none" ${s.cancel_on === 'none' ? 'selected' : ''}>nunca</option></select></label>
        <button class="iconbtn" data-sdel="${si}">Borrar</button></div>
      ${(s.steps || []).map((st, i) => {
        const k = B.stats[`seq:${s.id}:${i}`] || {};
        return `<div class="bstep ${k.sent && k.failed === k.sent ? 'allfail' : ''}" data-step="${i}">
          <div class="brow"><span class="bt">${unit(st.after_min)}</span>
            <label class="note">Después de <input type="number" min="1" data-tk="after_min" value="${st.after_min}" style="width:76px"> min</label>
            <label class="note">Solo de <input type="number" min="0" max="23" data-tk="from_h" value="${st.from_h ?? ''}" placeholder="—" style="width:52px"> a <input type="number" min="1" max="24" data-tk="to_h" value="${st.to_h ?? ''}" placeholder="—" style="width:52px"> h</label>
            <span class="grow"></span><button class="iconbtn" data-tdel="${i}">Quitar</button></div>
          <div class="bstepstats">${k.sent ? `Env <b>${fmt(k.sent)}</b> · Entregados <b>${fmt(k.delivered)}</b> · Leídos <b>${fmt(k.read)}</b> · <span class="${k.failed ? 'bad' : ''}">Fallidos <b>${fmt(k.failed)}</b></span> · Respondieron <b>${fmt(k.replied)}</b>` : 'Sin envíos todavía'}${k.last_error ? `<br><span class="bad">Último error: ${e(k.last_error)}</span>` : ''}</div>
          ${itemsEditor(st.items, `seq:${si}:${i}`)}</div>`;
      }).join('')}
      <button class="iconbtn" data-tadd="${si}">+ Mensaje</button></div>`).join('')}
    <button class="iconbtn" data-bact="addseq">+ Seguimiento nuevo</button>`;
  box.oninput = box.onchange = (ev) => {
    const t = ev.target;
    const card = t.closest('[data-seq]');
    if (!card) return;
    const s = seqs[Number(card.dataset.seq)];
    const stepEl = t.closest('[data-step]');
    const st = stepEl ? s.steps[Number(stepEl.dataset.step)] : null;
    const d = t.dataset;
    if (d.sk) s[d.sk] = t.value;
    else if (d.tk && st) st[d.tk] = t.value === '' ? null : Number(t.value);
    else if (d.ik && st) {
      const i = Number(d.i);
      if (d.ik === 'kind') st.items[i] = t.value === 'text' ? { kind: 'text', text: '' } : { kind: t.value, asset: st.items[i].asset || '' };
      else st.items[i][d.ik] = t.value;
      if (d.ik === 'kind') return markDirty(), drawSeqs();
    } else return;
    markDirty();
  };
  box.onclick = (ev) => {
    const t = ev.target.closest('button');
    if (!t) return;
    const card = t.closest('[data-seq]');
    const s = card ? seqs[Number(card.dataset.seq)] : null;
    const stepEl = t.closest('[data-step]');
    const st = stepEl && s ? s.steps[Number(stepEl.dataset.step)] : null;
    const d = t.dataset;
    let ch = true;
    if (d.sdel) {
      if (!confirm(`¿Borrar el seguimiento «${s.name}»?`)) return;
      seqs.splice(Number(d.sdel), 1);
    } else if (d.tadd) s.steps.push({ after_min: 60, items: [{ kind: 'text', text: '' }] });
    else if (d.tdel) s.steps.splice(Number(d.tdel), 1);
    else if (d.iadd && st) st.items.push(d.iadd === 'text' ? { kind: 'text', text: '' } : { kind: d.iadd, asset: '' });
    else if (d.idel && st) st.items.splice(Number(d.idel), 1);
    else if (d.iup && st) {
      const i = Number(d.iup);
      [st.items[i - 1], st.items[i]] = [st.items[i], st.items[i - 1]];
    } else ch = false;
    if (ch) {
      markDirty();
      drawSeqs();
    }
  };
  wireFlowBar();
}

function wireFlowBar() {
  const n = C.$('#bname');
  if (n) n.oninput = (ev) => ((B.flow.name = ev.target.value), markDirty());
  const sel = C.$('#bflow');
  if (sel) sel.onchange = async () => {
    await loadFlow(Number(sel.value));
    draw();
  };
  const a = C.$('#bactive');
  if (a) a.onchange = async (ev) => {
    try {
      const r = await C.api('PUT', `/bot/flows/${B.flowId}`, { active: ev.target.checked });
      B.flow.active = r.flow.active;
      draw();
    } catch (er) {
      C.toast(er.message, 5000);
    }
  };
}

/* =================== IA Suyon =================== */
function drawIA() {
  const s = B.data.settings;
  const model = B.data.models.find((m) => m.id === s.ia_model) || B.data.models[0];
  const keyOk = B.data.secrets[s.ia_secret];
  const u = B.data.usage.find((x) => x.day === B.data.today);
  const box = C.$('#bsub');
  box.innerHTML = `<form id="biaf" class="grid" style="gap:14px">
    <div class="card"><h3>Modelo y gasto</h3><div class="fields3">
      <div class="field"><label for="bm">Modelo</label><select id="bm" name="ia_model">${B.data.models.map((m) => `<option value="${m.id}" ${m.id === s.ia_model ? 'selected' : ''}>${e(m.name)} · US$${m.in} / ${m.out} por millón</option>`).join('')}</select></div>
      <div class="field"><label for="bcap">Tope de gasto por día (US$)</label><input id="bcap" name="ia_daily_cap" type="number" step="0.5" min="0" value="${s.ia_daily_cap}"></div>
      <div class="field"><label>Hoy</label><div class="mono" style="padding:8px 0">${u ? `US$${u.cost.toFixed(3)} · ${u.calls} respuestas` : 'US$0 · 0 respuestas'}</div></div></div>
      <div class="${keyOk ? 'okbox' : 'warnbox'}">${keyOk ? `✓ Clave de IA lista (secreto «${e(s.ia_secret)}»).` : `<b>Falta la clave de ${e(model.provider === 'openai' ? 'OpenAI' : 'Anthropic')}.</b> Sin clave, cuando toque la IA la clienta pasa a la asesora.
        <ol><li>Saca una clave en ${model.provider === 'openai' ? 'platform.openai.com → API keys' : 'console.anthropic.com → API Keys'} (con tu tarjeta y un tope de gasto).</li>
        <li>En Cloudflare: Workers → suyon-crm → Configuración → Variables y secretos → Agregar.</li>
        <li>Tipo «Secreto», nombre <b class="mono">${e(s.ia_secret)}</b>, pega la clave y guarda. No la pegues en este chat ni aquí.</li></ol>`}</div>
      <div class="field"><label for="bsec">Nombre del secreto en Cloudflare</label><input id="bsec" name="ia_secret" value="${e(s.ia_secret)}" class="mono"></div></div>
    <div class="card"><h3>Datos de pago</h3><p class="sub">El prompt los usa en {yape}, {titular}, {bcp} y {cci}. Se guardan solo en la base de datos de esta tienda.</p><div class="fields3">
      <div class="field"><label for="py">Yape / Plin</label><input id="py" name="pay_yape" value="${e(s.pay_yape || '')}"></div>
      <div class="field"><label for="pt">A nombre de</label><input id="pt" name="pay_titular" value="${e(s.pay_titular || '')}"></div>
      <div class="field"><label for="pb">Cuenta BCP</label><input id="pb" name="pay_bcp" value="${e(s.pay_bcp || '')}"></div>
      <div class="field"><label for="pc">CCI</label><input id="pc" name="pay_cci" value="${e(s.pay_cci || '')}"></div></div></div>
    <div class="card"><h3>Comportamiento</h3><div class="fields3">
      <div class="field"><label for="bd">Esperar antes de responder (seg)</label><input id="bd" name="ia_delay_s" type="number" min="0" max="20" value="${s.ia_delay_s}"></div>
      <div class="field"><label for="bh">Memoria del chat (mensajes)</label><input id="bh" name="ia_history" type="number" min="4" max="100" value="${s.ia_history}"></div>
      <div class="field"><label for="bf">Si no contesta, seguir a los (min, 0 = no)</label><input id="bf" name="ia_follow_min" type="number" min="0" value="${s.ia_follow_min}"></div></div>
      <div class="field"><label for="bft">Mensaje de ese seguimiento</label><input id="bft" name="ia_follow_text" value="${e(s.ia_follow_text || '')}"></div>
      <p class="note" style="margin:6px 0 0">La IA manda cada mensaje por separado, como en tu prompt («3 mensajes separados»). Las fotos de la clienta las puede ver; las notas de voz todavía no.</p></div>
    <div class="card"><div class="brow"><h3 style="flex:1">Prompt (copiado de tu Botcake)</h3><span class="note mono" id="bpc">${(s.ia_prompt || '').length.toLocaleString('en-US')} caracteres</span><button type="button" class="iconbtn" data-bact="resetprompt">Restaurar el de Botcake</button></div>
      <p class="sub">Para otro producto, copia este y cambia solo lo del producto (precios, tallas, colores, stock, archivos). {ahora} y {etiquetas} se llenan solos.</p>
      <textarea name="ia_prompt" id="bprompt" class="bcode" rows="22">${e(s.ia_prompt || '')}</textarea></div>
    <div class="card"><h3>Conocimiento (tus 2 archivos de Botcake)</h3><textarea name="ia_knowledge" class="bcode" rows="12">${e(s.ia_knowledge || '')}</textarea></div>
    <div class="savebar"><span class="note" id="biast"></span><button class="send" type="submit">Guardar IA Suyon</button></div>
    ${B.data.usage.length ? `<div class="card"><h3>Gasto de los últimos días</h3><table class="btable"><thead><tr><th>Día</th><th>Respuestas</th><th>Tokens entrada</th><th>Tokens salida</th><th>US$</th></tr></thead><tbody>${B.data.usage.map((x) => `<tr><td>${x.day}</td><td>${fmt(x.calls)}</td><td>${fmt(x.in_tokens)}</td><td>${fmt(x.out_tokens)}</td><td>${x.cost.toFixed(3)}</td></tr>`).join('')}</tbody></table></div>` : ''}
  </form>`;
  const f = C.$('#biaf');
  C.$('#bprompt').oninput = (ev) => (C.$('#bpc').textContent = ev.target.value.length.toLocaleString('en-US') + ' caracteres');
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    await saveSettings(d, 'IA Suyon guardada');
  };
}

/* =================== Archivos =================== */
function drawFiles() {
  const box = C.$('#bsub');
  const by = Object.fromEntries(B.data.assets.map((a) => [a.key, a]));
  const extra = B.data.assets.filter((a) => !B.data.template_assets.some((t) => t.key === a.key));
  const row = (key, desc) => {
    const a = by[key];
    const prev = !a ? '<span class="bthumb none">Falta</span>' : a.mime.startsWith('image/') ? `<img class="bthumb" src="/api/bot/assets/${a.id}" alt="" loading="lazy">` : a.mime.startsWith('video/') ? '<span class="bthumb">Video</span>' : a.mime.startsWith('audio/') ? '<span class="bthumb">Audio</span>' : '<span class="bthumb">PDF</span>';
    return `<div class="bfrow">${prev}<div style="min-width:0;flex:1"><b class="mono">${e(key)}</b><span class="note" style="display:block">${e(desc || a?.name || '')}${a ? ` · ${e(a.name)}` : ''}</span>
      ${a && a.mime.startsWith('audio/') ? `<audio controls preload="none" src="/api/bot/assets/${a.id}"></audio>` : ''}${a && a.mime.startsWith('video/') ? `<video controls preload="none" src="/api/bot/assets/${a.id}" style="max-width:220px;border-radius:8px"></video>` : ''}</div>
      <button class="iconbtn" data-up="${e(key)}">${a ? 'Cambiar' : 'Subir'}</button>${a && !B.data.template_assets.some((t) => t.key === key) ? `<button class="iconbtn" data-adel="${a.id}" aria-label="Borrar">×</button>` : ''}</div>`;
  };
  box.innerHTML = `<p class="note">El bot y la IA mandan estos archivos por su clave. Fotos JPG/PNG (5 MB), videos MP4 (16 MB), audios MP3/M4A/OGG (16 MB). Bájalos de tu Botcake o de tu celular y súbelos aquí.</p>
    <div class="card">${B.data.template_assets.map((t) => row(t.key, t.desc)).join('')}${extra.map((a) => row(a.key, '')).join('')}</div>
    <div class="card"><h3>Archivo con otra clave</h3><div class="brow" style="margin-top:8px"><input id="bnewkey" placeholder="Clave (ej: colores-cargo-M)" style="flex:1" class="mono"><button class="send" data-up="__new" style="height:auto">Elegir archivo</button></div></div>`;
  box.onclick = async (ev) => {
    const t = ev.target.closest('button');
    if (!t) return;
    if (t.dataset.up) {
      let key = t.dataset.up;
      if (key === '__new') {
        key = C.$('#bnewkey').value.trim();
        if (!/^[\w-]{1,40}$/.test(key)) return C.toast('La clave solo puede tener letras, números y guiones.');
      }
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/jpeg,image/png,video/mp4,audio/*,application/pdf';
      inp.onchange = async () => {
        const file = inp.files[0];
        if (!file) return;
        const fd = new FormData();
        fd.append('key', key);
        fd.append('file', file);
        t.disabled = true;
        t.textContent = 'Subiendo…';
        try {
          await C.api('POST', `/stores/${B.storeId}/bot/assets`, fd);
          await load();
          C.toast(`Archivo «${key}» listo`);
          draw();
        } catch (er) {
          C.toast(er.message, 5000);
          t.disabled = false;
          t.textContent = 'Subir';
        }
      };
      inp.click();
    }
    if (t.dataset.adel) {
      if (!confirm('¿Borrar este archivo?')) return;
      await C.api('DELETE', `/bot/assets/${t.dataset.adel}`).catch((er) => C.toast(er.message));
      await load();
      draw();
    }
  };
}

/* =================== Clics generales =================== */
document.addEventListener('click', async (ev) => {
  const t = ev.target.closest('[data-bsub],[data-badd],[data-bact]');
  if (!t || !C) return;
  const d = t.dataset;
  if (d.bsub) {
    B.sub = d.bsub;
    return draw();
  }
  if (d.badd) {
    const n = newNode(d.badd);
    B.flow.graph.nodes.push(n);
    markDirty();
    drawCanvas();
    return select(n.id);
  }
  try {
    switch (d.bact) {
      case 'zin':
      case 'zout':
        B.zoom = Math.min(1.5, Math.max(0.4, (B.zoom || 1) + (d.bact === 'zin' ? 0.1 : -0.1)));
        return applyZoom();
      case 'zfit':
        B.zoom = null;
        return applyZoom();
      case 'tpl':
      case 'blank': {
        const r = await C.api('POST', `/stores/${B.storeId}/bot/flows`, { template: d.bact === 'tpl' ? 'pantalon' : null });
        B.flowId = r.id;
        await load();
        C.toast('Flujo creado. Está apagado hasta que lo actives.');
        return draw();
      }
      case 'newflow': {
        const tpl = confirm('¿Crear desde la plantilla «Ventas pantalón»? (Cancelar = flujo vacío)');
        const r = await C.api('POST', `/stores/${B.storeId}/bot/flows`, { template: tpl ? 'pantalon' : null });
        B.flowId = r.id;
        await load();
        return draw();
      }
      case 'save':
        t.disabled = true;
        await saveFlow();
        return draw();
      case 'reload':
        if (B.dirty && !confirm('Tienes cambios sin guardar. ¿Descartarlos?')) return;
        await load();
        C.toast('Números al día');
        return draw();
      case 'del': {
        const n = nodeById(B.sel);
        if (!confirm(`¿Borrar el bloque «${n.title}»?`)) return;
        B.flow.graph.nodes = nodes().filter((x) => x.id !== n.id);
        B.sel = null;
        markDirty();
        drawCanvas();
        return drawPanel();
      }
      case 'dup': {
        const n = JSON.parse(JSON.stringify(nodeById(B.sel)));
        n.id = n.type + '_' + Date.now().toString(36).slice(-5);
        n.x += 30;
        n.y += 30;
        n.title += ' (copia)';
        B.flow.graph.nodes.push(n);
        markDirty();
        drawCanvas();
        return select(n.id);
      }
      case 'addseq':
        (B.flow.graph.sequences ||= []).push({ id: 'seq' + Date.now().toString(36).slice(-5), name: 'Seguimiento nuevo', cancel_on: 'reply', steps: [{ after_min: 30, items: [{ kind: 'text', text: '' }] }] });
        markDirty();
        return drawSeqs();
      case 'resetprompt':
        if (!confirm('¿Volver al prompt copiado de Botcake? Se pierden tus cambios al prompt.')) return;
        await saveSettings({ ia_prompt: null });
        return;
      case 'testia': {
        const txt = C.$('#btesttxt').value.trim();
        if (!txt) return;
        t.disabled = true;
        t.textContent = 'Pensando…';
        if (B.dirty) await saveFlow(true);
        try {
          B.test = (await C.api('POST', `/bot/flows/${B.flowId}/test-ia`, { node: B.sel, text: txt })).reply;
        } catch (er) {
          B.test = { error: er.message };
        }
        t.disabled = false;
        t.textContent = 'Probar';
        C.$('#btestout').innerHTML = testHTML(B.test);
        return;
      }
    }
  } catch (er) {
    C.toast(er.message, 5000);
  }
});

window.addEventListener('beforeunload', (ev) => {
  if (B.dirty) {
    ev.preventDefault();
    ev.returnValue = '';
  }
});

export function botDirty() {
  return B.dirty;
}
export function resetBot() {
  B.data = null;
  B.storeId = null;
}

/* =================== Ficha del chat =================== */
export function botFicha(c) {
  let vars = {};
  try {
    vars = JSON.parse(c.bot_vars || '{}');
  } catch {}
  const st = c.bot_paused ? 'Pausado: lo atiende la asesora' : c.bot_node ? (c.bot_wait === 2 ? 'La IA está respondiendo' : `Esperando en «${c.bot_node}»`) : c.handler === 'bot' ? 'Terminó el flujo' : 'Sin bot';
  const kv = Object.entries(vars).filter(([k, v]) => v && k !== 'respuesta');
  return `<div class="sec"><h3>Bot Suyon AI</h3><p class="note" style="margin:0 0 8px"><b style="color:${c.bot_paused ? 'var(--warn)' : c.bot_node ? 'var(--ok)' : 'var(--muted)'}">${e(st)}</b></p>
    ${kv.length ? `<dl class="kv" style="margin-bottom:8px">${kv.map(([k, v]) => `<dt>${e(k)}</dt><dd>${e(v)}</dd>`).join('')}</dl>` : ''}
    <div style="display:flex;gap:6px;flex-wrap:wrap">${c.bot_paused ? `<button class="iconbtn" data-cbot="resume">Reanudar bot</button>` : c.bot_node ? `<button class="iconbtn" data-cbot="pause">Pausar bot</button>` : ''}<button class="iconbtn" data-cbot="start">Iniciar flujo desde el inicio</button></div></div>`;
}

document.addEventListener('click', async (ev) => {
  const t = ev.target.closest('[data-cbot]');
  if (!t || !C) return;
  const id = C.S.openId;
  const act = t.dataset.cbot;
  if (act === 'start' && !confirm('El bot le mandará el flujo desde el inicio a este chat. ¿Seguir?')) return;
  try {
    await C.api('POST', `/chats/${id}/bot`, { action: act });
    const c = C.S.chats.get(id);
    if (c) {
      if (act === 'pause') c.bot_paused = 1;
      if (act === 'resume') c.bot_paused = 0;
    }
    C.toast({ start: 'Flujo iniciado', pause: 'Bot pausado', resume: 'Bot reanudado' }[act]);
    C.renderFicha();
  } catch (er) {
    C.toast(er.message, 5000);
  }
});

/* =================== Avisos =================== */
const KIND = { error: ['Error de envío', 'bad'], ia: ['IA', 'info'], asesora: ['Asesora', 'warn'], archivo: ['Falta archivo', 'warn'], aviso: ['Aviso', 'info'] };

export async function renderAvisos(content) {
  content.innerHTML = '<div class="page"><span class="spin"></span></div>';
  let r;
  try {
    r = await C.api('GET', `/stores/${C.S.storeId}/avisos`);
  } catch (er) {
    content.innerHTML = `<div class="page"><div class="err">${e(er.message)}</div></div>`;
    return;
  }
  const chatRow = (c) => `<button class="avrow" data-avchat="${c.id}"><b>${e(c.name || c.profile_name || C.fmtPhone(c.wa_id))}</b><span class="note">${e(c.last_preview || '')}</span><span class="note mono">${e(C.listTime(c.last_msg_at || c.since))}</span></button>`;
  const col = (title, sub, list, cls) => `<div class="card avcol ${cls}"><h3>${title} <span class="bcnt">${list.length}</span></h3><p class="sub">${sub}</p>${list.map(chatRow).join('') || '<p class="note">Nada pendiente 🎉</p>'}</div>`;
  const unread = r.events.filter((x) => !x.read_at).length;
  content.innerHTML = `<div class="page full">
    <div class="ph"><div><h2>Avisos</h2><p>Lo que necesita a alguien del equipo. Toca un chat para abrirlo.</p></div></div>
    <div class="avgrid">
      ${col('Asesora pendiente', 'Pasaron a asesora (etiqueta ASESOR) y nadie respondió todavía.', r.pending.asesora, 'k-hand')}
      ${col('Yape pendiente', 'Dijeron que yapean más tarde (YAPE PENDIENTE).', r.pending.yape, 'k-wait')}
      ${col('Lima por agendar', 'Pedidos de Lima por confirmar (LIMA PENDIENTE).', r.pending.agendar, 'k-send')}
    </div>
    <div class="card" style="margin-top:16px"><div class="brow"><h3 style="flex:1">Errores y avisos del bot ${unread ? `<span class="bcnt">${unread}</span>` : ''}</h3>${unread ? '<button class="iconbtn" data-avread="all">Marcar todo como leído</button>' : ''}</div>
      ${r.events.map((x) => `<div class="avev ${x.read_at ? 'read' : ''}"><span class="kpill ${KIND[x.kind]?.[1] || 'info'}">${e(KIND[x.kind]?.[0] || x.kind)}</span>
        <div style="min-width:0;flex:1"><b>${e(x.title)}</b>${x.body ? `<span class="note" style="display:block">${e(x.body)}</span>` : ''}<span class="note mono">${e(C.listTime(x.created_at))}</span></div>
        ${x.chat_id ? `<button class="iconbtn" data-avchat="${x.chat_id}">Abrir chat</button>` : ''}${x.read_at ? '' : `<button class="iconbtn" data-avread="${x.id}">Leído</button>`}</div>`).join('') || '<p class="note">Sin avisos.</p>'}</div></div>`;
}

document.addEventListener('click', async (ev) => {
  const t = ev.target.closest('[data-avchat],[data-avread]');
  if (!t || !C) return;
  if (t.dataset.avchat) return C.goChat(Number(t.dataset.avchat));
  const id = t.dataset.avread;
  await C.api('POST', `/stores/${C.S.storeId}/avisos/read`, id === 'all' ? {} : { id: Number(id) }).catch((er) => C.toast(er.message));
  C.refreshAvisos();
});
