// Respuestas rápidas, stickers y plantillas de WhatsApp: se usan desde el chat y se arman en Configuración
let H = null;
const R = { store: null, list: null, at: 0, stk: null, tpl: null, tplAt: 0, pop: null };
const e = (s) => H.esc(s ?? '');
const $ = (s, el = document) => el.querySelector(s);

export function initRespuestas(helpers) {
  H = helpers;
}

function sameStore() {
  if (R.store !== H.S.storeId) {
    R.store = H.S.storeId;
    R.list = R.stk = R.tpl = null;
  }
}
export function resetRespuestas() {
  R.store = null;
  R.list = R.stk = R.tpl = null;
}

async function loadRapidas(force = false) {
  sameStore();
  if (!force && R.list && Date.now() - R.at < 60000) return R.list;
  const sid = H.S.storeId;
  const r = await H.api('GET', `/stores/${sid}/rapidas`);
  if (sid === H.S.storeId) {
    R.list = r.rapidas;
    R.at = Date.now();
  }
  return r.rapidas;
}
async function loadStickers(force = false) {
  sameStore();
  if (!force && R.stk) return R.stk;
  const r = await H.api('GET', `/stores/${H.S.storeId}/stickers`);
  R.stk = r.stickers;
  return R.stk;
}
async function loadTpl(force = false) {
  sameStore();
  if (!force && R.tpl && Date.now() - R.tplAt < 60000) return R.tpl;
  const r = await H.api('GET', `/stores/${H.S.storeId}/plantillas`);
  R.tpl = r;
  R.tplAt = Date.now();
  return r;
}

/* ---------- Datos que se llenan solos ---------- */
function firstName(c) {
  const n = String(c?.name || c?.profile_name || '').trim();
  if (!n || /^\+?[\d\s-]+$/.test(n)) return '';
  const w = n.split(/\s+/)[0];
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}
function saludo() {
  const h = new Date().getHours();
  return h >= 5 && h < 12 ? 'Buenos días' : h >= 12 && h < 19 ? 'Buenas tardes' : 'Buenas noches';
}
export function fillVars(text, chat) {
  const n = firstName(chat);
  return String(text || '')
    .replace(/\s*\{nombre\}/gi, (m) => (n ? m.replace(/\{nombre\}/i, n) : ''))
    .replace(/\{saludo\}/gi, saludo())
    .replace(/ +([,.!?])/g, '$1');
}

const kindIcon = { image: '📷', video: '🎥', audio: '🎤', document: '📄' };
const mediaUrl = (q, m) => `/api/rapidas/${q.id}/media/${m.id}`;
function thumbs(q, max = 4) {
  return q.media
    .slice(0, max)
    .map((m) => (m.kind === 'image' ? `<img src="${mediaUrl(q, m)}" alt="" loading="lazy">` : `<span class="qrk">${kindIcon[m.kind] || '📄'}</span>`))
    .join('') + (q.media.length > max ? `<span class="qrk">+${q.media.length - max}</span>` : '');
}

/* =================== En el chat =================== */
// Escribir «/» al inicio del mensaje muestra las respuestas rápidas
export function attachSlash(ta) {
  let idx = 0;
  let items = [];
  const close = () => {
    R.pop?.remove();
    R.pop = null;
  };
  const draw = () => {
    close();
    if (!items.length) return;
    const box = ta.closest('.composer');
    if (!box) return;
    const pop = document.createElement('div');
    pop.className = 'slashpop';
    pop.setAttribute('role', 'listbox');
    pop.innerHTML = items
      .map((q, i) => `<button type="button" role="option" aria-selected="${i === idx}" data-slash="${q.id}"><b>/${e(q.atajo)}</b><span>${q.media.length ? `${kindIcon[q.media[0].kind] || '📎'} ${q.media.length > 1 ? q.media.length + ' archivos · ' : ''}` : ''}${e((q.texto || '').slice(0, 90))}</span></button>`)
      .join('');
    pop.onmousedown = (ev) => ev.preventDefault();
    pop.onclick = (ev) => {
      const b = ev.target.closest('[data-slash]');
      if (b) pick(items.find((q) => q.id === Number(b.dataset.slash)));
    };
    box.appendChild(pop);
    R.pop = pop;
  };
  const pick = (q) => {
    close();
    if (q) useRapida(q, ta);
  };
  ta.addEventListener('input', async () => {
    const m = /^\/([^\n]{0,40})$/.exec(ta.value);
    if (!m) return close();
    let list = R.list;
    if (!list || R.store !== H.S.storeId) {
      try {
        list = await loadRapidas();
      } catch {
        return;
      }
    }
    const q = m[1].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    items = list
      .filter((x) => !q || norm(x.atajo).includes(q) || norm(x.texto).includes(q))
      .sort((a, b) => (norm(b.atajo).startsWith(q) ? 1 : 0) - (norm(a.atajo).startsWith(q) ? 1 : 0))
      .slice(0, 8);
    if (!list.length) items = [];
    idx = 0;
    draw();
    if (!list.length && m[1] === '' && R.pop === null) {
      const box = ta.closest('.composer');
      const pop = document.createElement('div');
      pop.className = 'slashpop';
      pop.innerHTML = `<div class="note" style="padding:10px 12px">Todavía no tienes respuestas rápidas. ${H.canChats() ? '<button type="button" class="linkbtn" data-act="cfgrapidas">Crear la primera</button>' : ''}</div>`;
      box?.appendChild(pop);
      R.pop = pop;
    }
  });
  ta.addEventListener('keydown', (ev) => {
    if (!R.pop || !items.length) return;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      idx = (idx + (ev.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
      draw();
    } else if (ev.key === 'Enter' || ev.key === 'Tab') {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      pick(items[idx]);
    } else if (ev.key === 'Escape') close();
  });
  ta.addEventListener('blur', () => setTimeout(close, 150));
}

// Usar una respuesta: solo texto → va al cuadro para que la revises; con fotos/videos → vista previa y Enviar
export function useRapida(q, ta = $('#draft')) {
  const chatId = H.S.openId;
  const chat = H.S.chats.get(chatId);
  const text = fillVars(q.texto, chat);
  if (!q.media.length) {
    H.closeModal();
    const t = ta || $('#draft');
    if (!t) return;
    t.value = text;
    t.dispatchEvent(new Event('input'));
    t.focus();
    t.setSelectionRange(t.value.length, t.value.length);
    return;
  }
  const quitar = new Set();
  const draw = () =>
    q.media
      .map((m) => `<div class="qrm${quitar.has(m.id) ? ' off' : ''}">${m.kind === 'image' ? `<img src="${mediaUrl(q, m)}" alt="">` : m.kind === 'video' ? `<video src="${mediaUrl(q, m)}" muted playsinline preload="metadata"></video>` : `<span class="qrk">${kindIcon[m.kind] || '📄'}</span><small>${e(m.name)}</small>`}<button type="button" data-qx="${m.id}" aria-label="${quitar.has(m.id) ? 'Volver a poner' : 'Quitar'}">${quitar.has(m.id) ? '↺' : '×'}</button></div>`)
      .join('');
  H.modal(`<h3>/${e(q.atajo)} · ${e(H.chatName(chat))}</h3>
    <div class="qrmedia" id="qrm">${draw()}</div>
    <div class="field"><label for="qrtxt">Mensaje</label><textarea id="qrtxt" rows="4" maxlength="4096">${e(text)}</textarea></div>
    <p class="note" style="margin:0">${q.media.length === 1 && q.media[0].kind !== 'audio' ? 'El mensaje va como texto de la foto, en una sola burbuja.' : 'Primero van los archivos y al final el mensaje.'}</p>
    <div class="row"><button class="iconbtn" data-close>Cancelar</button><button class="send" id="qrgo">Enviar</button></div>`);
  $('#qrm').onclick = (ev) => {
    const b = ev.target.closest('[data-qx]');
    if (!b) return;
    quitar.has(b.dataset.qx) ? quitar.delete(b.dataset.qx) : quitar.add(b.dataset.qx);
    $('#qrm').innerHTML = draw();
  };
  $('#qrgo').onclick = async () => {
    const texto = $('#qrtxt').value.trim();
    if (quitar.size === q.media.length && !texto) return H.toast('No queda nada para enviar.');
    $('#qrgo').disabled = true;
    $('#qrgo').textContent = 'Enviando…';
    H.closeModal();
    if (ta && /^\//.test(ta.value)) {
      ta.value = '';
      ta.dispatchEvent(new Event('input'));
    }
    await sendRapida(chatId, q, texto, [...quitar]);
  };
}

async function sendRapida(chatId, q, texto, quitar) {
  H.touchChatAfterSend(chatId, `${kindIcon[q.media[0]?.kind] || ''} ${texto || 'Respuesta rápida'}`.trim());
  try {
    const r = await H.api('POST', `/chats/${chatId}/rapida`, { id: q.id, texto, quitar });
    for (const m of r.messages) H.replaceLocal(chatId, null, m);
    const bad = r.messages.find((m) => m.status === 'failed');
    if (bad) H.toast(bad.error || 'Algo no se envió.', 5000);
  } catch (er) {
    H.toast(er.message, 5000);
  }
}

// Botón ⚡ del chat: respuestas rápidas, stickers y plantillas
export async function openPicker(tab = 'rapidas') {
  const chatId = H.S.openId;
  if (!chatId) return;
  const w = H.windowInfo(H.S.chats.get(chatId));
  if (!w.canSend) tab = 'plantillas';
  const tabs = [
    ...(w.canSend ? [['rapidas', '⚡ Respuestas'], ['stickers', '🙂 Stickers']] : []),
    ['plantillas', '📋 Plantillas'],
  ];
  H.modal(`<div class="seg" role="tablist" style="justify-self:start">${tabs.map(([k, l]) => `<button type="button" data-ptab="${k}" aria-pressed="${k === tab}">${l}</button>`).join('')}</div>
    <div id="pbody" class="pbody"><span class="spin"></span></div>`);
  const body = $('#pbody');
  const show = async (t) => {
    document.querySelectorAll('[data-ptab]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ptab === t)));
    body.innerHTML = '<div style="padding:20px;text-align:center"><span class="spin"></span></div>';
    try {
      if (t === 'rapidas') await pickRapidas(body);
      else if (t === 'stickers') await pickStickers(body, chatId);
      else await pickPlantillas(body, chatId);
    } catch (er) {
      body.innerHTML = `<p class="note">${e(er.message)}</p>`;
    }
  };
  document.querySelectorAll('[data-ptab]').forEach((b) => (b.onclick = () => show(b.dataset.ptab)));
  show(tab);
}

async function pickRapidas(body) {
  const list = await loadRapidas(true);
  const draw = (q = '') => {
    const n = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const f = list.filter((x) => !q || n(x.atajo).includes(n(q)) || n(x.texto).includes(n(q)));
    $('#pqrl').innerHTML = f.length
      ? f.map((x) => `<button type="button" class="qri" data-pqr="${x.id}"><span class="qrt"><b>/${e(x.atajo)}</b>${x.media.length ? `<span class="qrth">${thumbs(x, 3)}</span>` : ''}</span><span class="qrx">${e(x.texto || '')}</span></button>`).join('')
      : `<p class="note" style="margin:8px 0">${list.length ? 'Ninguna coincide.' : 'Todavía no tienes respuestas rápidas.'}</p>`;
  };
  body.innerHTML = `<input class="qrsearch" id="pqrs" placeholder="Buscar respuesta…" aria-label="Buscar respuesta">
    <div class="qrlist" id="pqrl"></div>
    <div class="row" style="justify-content:space-between"><span class="note">Atajo: escribe <b>/</b> en el chat.</span><button type="button" class="iconbtn" data-act="cfgrapidas">Administrar</button></div>`;
  draw();
  $('#pqrs').oninput = (ev) => draw(ev.target.value);
  $('#pqrl').onclick = (ev) => {
    const b = ev.target.closest('[data-pqr]');
    if (b) useRapida(list.find((x) => x.id === Number(b.dataset.pqr)));
  };
  if (!H.isTouch) $('#pqrs').focus();
}

async function pickStickers(body, chatId) {
  const list = await loadStickers(true);
  body.innerHTML = `<div class="stkgrid" id="pstk">${list.map((s) => `<button type="button" data-pstk="${s.id}" aria-label="Enviar sticker"><img src="/api/stickers/${s.id}" alt="" loading="lazy"></button>`).join('')}
      <button type="button" class="stkadd" id="pstkadd" aria-label="Subir sticker">＋<small>Subir</small></button></div>
    <p class="note" style="margin:0">${list.length ? '' : 'Todavía no hay stickers. '}Guarda los que te mandan las clientas con la ⭐ al lado del sticker, o sube una foto y la convertimos.</p>`;
  $('#pstk').onclick = async (ev) => {
    if (ev.target.closest('#pstkadd')) return pickStickerFile(() => pickStickers(body, chatId));
    const b = ev.target.closest('[data-pstk]');
    if (!b) return;
    H.closeModal();
    H.touchChatAfterSend(chatId, 'Sticker');
    try {
      const r = await H.api('POST', `/chats/${chatId}/sticker`, { sticker_id: Number(b.dataset.pstk) });
      H.replaceLocal(chatId, null, r.message);
      if (r.message.status === 'failed') H.toast(r.message.error || 'No se envió el sticker.', 5000);
      R.stk = null;
    } catch (er) {
      H.toast(er.message, 5000);
    }
  };
}

/* ---------- Stickers: subir (se pasa a WEBP 512 × 512, máx 100 KB) ---------- */
const stkInput = document.createElement('input');
stkInput.type = 'file';
stkInput.accept = 'image/*';
stkInput.hidden = true;
document.body.appendChild(stkInput);
let stkAfter = null;
function pickStickerFile(after) {
  stkAfter = after;
  stkInput.click();
}
stkInput.addEventListener('change', async () => {
  const f = stkInput.files[0];
  stkInput.value = '';
  if (!f) return;
  try {
    const blob = await toSticker(f);
    const form = new FormData();
    form.append('file', blob, 'sticker.webp');
    await H.api('POST', `/stores/${H.S.storeId}/stickers`, form);
    R.stk = null;
    H.toast('Sticker guardado ⭐');
    stkAfter?.();
  } catch (er) {
    H.toast(er.message, 5000);
  }
});

async function isAnimWebp(f) {
  const b = new Uint8Array(await f.slice(0, 4096).arrayBuffer());
  for (let i = 12; i < b.length - 4; i++) if (b[i] === 0x41 && b[i + 1] === 0x4e && b[i + 2] === 0x49 && b[i + 3] === 0x4d) return true;
  return false;
}
async function toSticker(f) {
  if (f.type === 'image/webp') {
    const anim = await isAnimWebp(f);
    if (anim) {
      if (f.size > 500 * 1024) throw new Error('El sticker animado pasa de 500 KB.');
      return f;
    }
    if (f.size <= 100 * 1024) return f;
  }
  const bmp = await createImageBitmap(f);
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const g = cv.getContext('2d');
  const sc = Math.min(512 / bmp.width, 512 / bmp.height);
  const w = bmp.width * sc;
  const h = bmp.height * sc;
  g.drawImage(bmp, (512 - w) / 2, (512 - h) / 2, w, h);
  for (let q = 0.9; q >= 0.3; q -= 0.15) {
    const b = await new Promise((r) => cv.toBlob(r, 'image/webp', q));
    if (!b || b.type !== 'image/webp') throw new Error('Este navegador no puede crear stickers. Prueba desde Chrome.');
    if (b.size <= 100 * 1024) return b;
  }
  throw new Error('La imagen es muy pesada para sticker. Prueba con otra más simple.');
}

// ⭐ junto a un sticker del chat → se guarda en los stickers de la tienda
document.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-savestk]');
  if (!b || !H) return;
  b.disabled = true;
  try {
    await H.api('POST', `/stores/${H.S.storeId}/stickers`, { message_id: Number(b.dataset.savestk) });
    R.stk = null;
    H.toast('Sticker guardado ⭐ Úsalo con el botón ⚡');
  } catch (er) {
    H.toast(er.message, 5000);
  }
  b.disabled = false;
});

/* ---------- Plantillas desde el chat ---------- */
const STATUS = {
  APPROVED: ['Aprobada', 'ok'],
  PENDING: ['En revisión', 'warn'],
  IN_APPEAL: ['En apelación', 'warn'],
  REJECTED: ['Rechazada', 'bad'],
  PAUSED: ['Pausada por Meta', 'bad'],
  DISABLED: ['Desactivada', 'bad'],
  LIMIT_EXCEEDED: ['Límite de plantillas', 'bad'],
  PENDING_DELETION: ['Borrándose', 'muted'],
  DELETED: ['Borrada', 'muted'],
};
const CAT = { MARKETING: 'Marketing', UTILITY: 'Utilidad', AUTHENTICATION: 'Código' };
const COST = { MARKETING: 'aprox. US$0.08', UTILITY: 'aprox. US$0.03', AUTHENTICATION: 'aprox. US$0.03' };
const REASON = {
  INVALID_FORMAT: 'formato inválido (revisa los {{n}} y los ejemplos)',
  PROMOTIONAL: 'Meta dice que es publicidad: créala como Marketing',
  INCORRECT_CATEGORY: 'el tipo no corresponde (Marketing / Utilidad)',
  TAG_CONTENT_MISMATCH: 'el texto no corresponde al tipo elegido',
  ABUSIVE_CONTENT: 'contenido no permitido',
  SCAM: 'Meta lo vio como engaño',
};
const statusPill = (t) => {
  const [l, k] = STATUS[t.status] || [t.status, 'muted'];
  return `<span class="tps ${k}">${l}</span>`;
};

function tplPreview(t, params = [], img = '') {
  const fill = (s) => String(s || '').replace(/\{\{(\d+)\}\}/g, (m, n) => {
    const v = params[t.vars.indexOf(Number(n))];
    return v ? `<b>${e(v)}</b>` : `<mark>{{${n}}}</mark>`;
  });
  const head = t.header?.format === 'TEXT' ? `<b class="tph">${e(t.header.text)}</b>` : t.header?.format === 'IMAGE' ? (img ? `<img src="${img}" alt="">` : '<div class="tpimg">📷 Foto</div>') : t.header?.format === 'VIDEO' ? '<div class="tpimg">🎥 Video</div>' : '';
  return `<div class="tpbub">${head}<div>${fill(e(t.body)).replace(/\n/g, '<br>')}</div>${t.footer ? `<small>${e(t.footer)}</small>` : ''}${t.buttons.length ? `<div class="tpbtns">${t.buttons.map((b) => `<span>${b.type === 'URL' ? '🔗 ' : ''}${e(b.text)}</span>`).join('')}</div>` : ''}</div>`;
}

async function pickPlantillas(body, chatId) {
  const d = await loadTpl(true);
  if (!d.conectado) return (body.innerHTML = '<p class="note">El número de esta tienda no está conectado.</p>');
  const ok = d.plantillas.filter((t) => t.status === 'APPROVED').sort((a, b) => Number(a.auto) - Number(b.auto));
  const w = H.windowInfo(H.S.chats.get(chatId));
  body.innerHTML = `${w.canSend ? '' : '<p class="note" style="margin:0">Pasaron más de 24 h desde su último mensaje: solo se le puede escribir con una plantilla aprobada por Meta. Cuando ella responda, vuelves a escribir normal y gratis.</p>'}
    <div class="qrlist">${ok.map((t) => `<button type="button" class="qri" data-ptpl="${e(t.name)}" data-lang="${e(t.language)}"><span class="qrt"><b>${e(t.name.replace(/_/g, ' '))}</b><span class="pill-cat">${CAT[t.category] || t.category}${t.auto ? ' · aviso automático' : ''}</span></span><span class="qrx">${e(t.body)}</span></button>`).join('') || '<p class="note" style="margin:8px 0">No tienes plantillas aprobadas todavía.</p>'}</div>
    <div class="row" style="justify-content:flex-end">${H.owner() ? '<button type="button" class="iconbtn" data-act="cfgplantillas">Crear o ver plantillas</button>' : ''}</div>`;
  body.onclick = (ev) => {
    const b = ev.target.closest('[data-ptpl]');
    if (b) sendTplForm(chatId, ok.find((t) => t.name === b.dataset.ptpl && t.language === b.dataset.lang), store());
  };
}
const store = () => H.store();

function sendTplForm(chatId, t, st) {
  const chat = H.S.chats.get(chatId);
  const params = t.vars.map((n, i) => (i === 0 && t.examples[0] && /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/.test(t.examples[0]) && firstName(chat) ? firstName(chat) : ''));
  const media = t.header && (t.header.format === 'IMAGE' || t.header.format === 'VIDEO');
  let file = null;
  let img = t.has_media && t.header?.format === 'IMAGE' ? `/api/stores/${st.id}/plantillas/${encodeURIComponent(t.name)}/media` : '';
  H.modal(`<h3>Plantilla para ${e(H.chatName(chat))}</h3>
    <div class="tpwrap"><div id="tpv">${tplPreview(t, params, img)}</div></div>
    ${t.vars.map((n, i) => `<div class="field"><label for="tpp${i}">Dato {{${n}}}${t.examples[i] ? ` <span class="note">(ej. ${e(t.examples[i])})</span>` : ''}</label><input id="tpp${i}" data-tpp="${i}" value="${e(params[i])}" maxlength="200"></div>`).join('')}
    ${media ? `<div class="field"><label>${t.header.format === 'IMAGE' ? 'Foto' : 'Video'}</label><input type="file" id="tpf" accept="${t.header.format === 'IMAGE' ? 'image/jpeg,image/png' : 'video/mp4'}">${t.has_media ? '<span class="note">Si no eliges otra, va la que guardaste al crearla.</span>' : ''}</div>` : ''}
    <p class="note" style="margin:0">💲 Cada envío lo cobra Meta: ${CAT[t.category] || t.category} ${COST[t.category] || ''} (Perú). Necesita tarjeta en la cuenta de WhatsApp.</p>
    <div class="err" hidden></div>
    <div class="row"><button class="iconbtn" data-close>Cancelar</button><button class="send" id="tpgo">Enviar plantilla</button></div>`);
  document.querySelectorAll('[data-tpp]').forEach((inp) => {
    inp.oninput = () => {
      params[Number(inp.dataset.tpp)] = inp.value.trim();
      $('#tpv').innerHTML = tplPreview(t, params, img);
    };
  });
  const fi = $('#tpf');
  if (fi)
    fi.onchange = () => {
      file = fi.files[0] || null;
      if (file && t.header.format === 'IMAGE') {
        img = URL.createObjectURL(file);
        $('#tpv').innerHTML = tplPreview(t, params, img);
      }
    };
  $('#tpgo').onclick = async () => {
    const err = $('.modal .err');
    if (params.some((x) => !x)) {
      err.hidden = false;
      err.textContent = 'Llena todos los datos.';
      return;
    }
    if (media && !file && !t.has_media) {
      err.hidden = false;
      err.textContent = t.header.format === 'IMAGE' ? 'Elige la foto.' : 'Elige el video.';
      return;
    }
    $('#tpgo').disabled = true;
    $('#tpgo').textContent = 'Enviando…';
    const data = { name: t.name, language: t.language, params };
    let payload = data;
    if (file) {
      payload = new FormData();
      payload.append('data', JSON.stringify(data));
      payload.append('file', file, file.name);
    }
    try {
      const r = await H.api('POST', `/chats/${chatId}/plantilla`, payload);
      H.closeModal();
      H.replaceLocal(chatId, null, r.message);
      H.touchChatAfterSend(chatId, '📋 ' + t.body.slice(0, 60));
      if (r.message.status === 'failed') H.toast(r.message.error || 'No se envió la plantilla.', 6000);
      else H.toast('Plantilla enviada');
    } catch (er) {
      err.hidden = false;
      err.textContent = er.message;
      $('#tpgo').disabled = false;
      $('#tpgo').textContent = 'Enviar plantilla';
    }
  };
}
export const openPlantilla = () => openPicker('plantillas');

/* =================== Configuración → Respuestas rápidas =================== */
export async function renderRapidasCfg(body) {
  body.innerHTML = '<div class="empty" style="padding:40px"><span class="spin"></span></div>';
  let list;
  let stk;
  try {
    [list, stk] = await Promise.all([loadRapidas(true), loadStickers(true)]);
  } catch (er) {
    body.innerHTML = `<p class="note">${e(er.message)}</p>`;
    return;
  }
  const otras = H.S.me.stores.filter((s) => s.id !== H.S.storeId && (s.role === 'dueno' || s.role === 'asesora'));
  body.innerHTML = `<div class="ph"><div><h2>Respuestas rápidas</h2><p>Mensajes que tu equipo manda seguido (precios, cuentas, horarios, fotos de colores…). En el chat escribe <b>/</b> o toca <b>⚡</b>. <b>{nombre}</b> pone el nombre de la clienta y <b>{saludo}</b> pone «Buenos días / tardes / noches».</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${otras.length ? '<button class="iconbtn" id="qrcopy">Copiar de otra tienda</button>' : ''}<button class="send" id="qrnew">+ Nueva respuesta</button></div></div>
    <div class="card qrcfg">${list.length ? list.map((q, i) => `<div class="qrrow">
        <div class="qrord"><button class="iconbtn" data-qup="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Subir">▲</button><button class="iconbtn" data-qdown="${i}" ${i === list.length - 1 ? 'disabled' : ''} aria-label="Bajar">▼</button></div>
        <div style="min-width:0;flex:1"><b class="mono">/${e(q.atajo)}</b>${q.media.length ? `<span class="qrth">${thumbs(q)}</span>` : ''}<div class="qrx">${e(q.texto || '')}</div></div>
        <div class="acts"><span class="note">${q.uses ? `${q.uses} usos` : ''}</span><button class="iconbtn" data-qedit="${q.id}">Editar</button><button class="iconbtn" data-qdel="${q.id}" aria-label="Borrar">${H.ICON.trash}</button></div>
      </div>`).join('') : '<p class="note" style="margin:0">Todavía no hay. Crea la primera: por ejemplo <b>/precios</b> con la foto de precios y el texto de promociones.</p>'}</div>
    <div class="ph" style="margin-top:22px"><div><h2>Stickers</h2><p>Los stickers que guardes salen en el botón <b>⚡ → Stickers</b> del chat. Guarda los que te mandan las clientas con la <b>⭐</b> que sale al lado, o sube una foto (la pasamos a sticker de 512 × 512).</p></div><button class="iconbtn" id="stkup">+ Subir sticker</button></div>
    <div class="card"><div class="stkgrid cfg">${stk.map((s) => `<div class="stkc"><img src="/api/stickers/${s.id}" alt="" loading="lazy"><button class="iconbtn" data-sdel="${s.id}" aria-label="Borrar sticker">×</button></div>`).join('') || '<p class="note" style="margin:0">Sin stickers todavía.</p>'}</div></div>`;
  const again = () => renderRapidasCfg(body);
  $('#qrnew').onclick = () => editRapida(null, again);
  $('#stkup').onclick = () => pickStickerFile(again);
  $('#qrcopy') &&
    ($('#qrcopy').onclick = () => {
      H.modal(`<h3>Copiar respuestas rápidas</h3><p class="note" style="margin:0">Se copian todas (con sus fotos) a <b>${e(store().name)}</b>. Las que ya tengan el mismo atajo no se repiten.</p>
        <div class="field"><label for="qrfrom">De la tienda</label><select id="qrfrom">${otras.map((s) => `<option value="${s.id}">${e(s.name)}</option>`).join('')}</select></div>
        <div class="row"><button class="iconbtn" data-close>Cancelar</button><button class="send" id="qrcgo">Copiar</button></div>`);
      $('#qrcgo').onclick = async () => {
        $('#qrcgo').disabled = true;
        try {
          const r = await H.api('POST', `/stores/${H.S.storeId}/rapidas/copiar`, { from: Number($('#qrfrom').value) });
          H.closeModal();
          H.toast(`Copiadas: ${r.copiadas}${r.saltadas ? ` · ya existían: ${r.saltadas}` : ''}`);
          again();
        } catch (er) {
          H.toast(er.message, 5000);
          $('#qrcgo').disabled = false;
        }
      };
    });
  body.querySelector('.qrcfg').onclick = async (ev) => {
    const ed = ev.target.closest('[data-qedit]');
    if (ed) return editRapida(list.find((x) => x.id === Number(ed.dataset.qedit)), again);
    const del = ev.target.closest('[data-qdel]');
    if (del) {
      const q = list.find((x) => x.id === Number(del.dataset.qdel));
      if (!confirm(`¿Borrar la respuesta «/${q.atajo}»?`)) return;
      try {
        await H.api('DELETE', `/rapidas/${q.id}`);
        again();
      } catch (er) {
        H.toast(er.message);
      }
      return;
    }
    const mv = ev.target.closest('[data-qup],[data-qdown]');
    if (mv) {
      const i = Number(mv.dataset.qup ?? mv.dataset.qdown);
      const j = mv.dataset.qup != null ? i - 1 : i + 1;
      [list[i], list[j]] = [list[j], list[i]];
      await H.api('POST', `/stores/${H.S.storeId}/rapidas/orden`, { ids: list.map((x) => x.id) }).catch(() => {});
      R.list = null;
      again();
    }
  };
  body.querySelector('.stkgrid').onclick = async (ev) => {
    const b = ev.target.closest('[data-sdel]');
    if (!b || !confirm('¿Borrar este sticker?')) return;
    await H.api('DELETE', `/stickers/${b.dataset.sdel}`).catch((er) => H.toast(er.message));
    R.stk = null;
    again();
  };
}

const qrInput = document.createElement('input');
qrInput.type = 'file';
qrInput.multiple = true;
qrInput.accept = 'image/*,video/mp4,audio/*,application/pdf';
qrInput.hidden = true;
document.body.appendChild(qrInput);

function editRapida(q, after) {
  // items: { id, kind, name, url, file? } en el orden final
  let items = (q?.media || []).map((m) => ({ id: m.id, kind: m.kind, name: m.name, url: mediaUrl(q, m) }));
  let newN = 0;
  const drawMedia = () =>
    items
      .map((m, i) => `<div class="qrm">${m.kind === 'image' ? `<img src="${m.url}" alt="">` : m.kind === 'video' ? `<video src="${m.url}" muted playsinline preload="metadata"></video>` : `<span class="qrk">${kindIcon[m.kind] || '📄'}</span><small>${e(m.name)}</small>`}
        <button type="button" data-mx="${i}" aria-label="Quitar">×</button>${items.length > 1 ? `<span class="qrmv">${i ? `<button type="button" data-ml="${i}" aria-label="Antes">◀</button>` : ''}${i < items.length - 1 ? `<button type="button" data-mr="${i}" aria-label="Después">▶</button>` : ''}</span>` : ''}</div>`)
      .join('') + (items.length < 6 ? '<button type="button" class="qradd" id="qradd">＋<small>Foto, video, audio o PDF</small></button>' : '');
  H.modal(`<h3>${q ? 'Editar' : 'Nueva'} respuesta rápida</h3>
    <form id="qrf" class="grid" style="gap:12px">
      <div class="field"><label for="qra">Atajo</label><div class="qratajo"><span>/</span><input id="qra" name="atajo" required maxlength="40" placeholder="precios" value="${e(q?.atajo || '')}"></div></div>
      <div class="field"><label for="qrt">Mensaje</label><textarea id="qrt" name="texto" rows="6" maxlength="4096" placeholder="{saludo} {nombre} 😊 Estas son nuestras promociones…">${e(q?.texto || '')}</textarea>
        <div class="chips"><button type="button" class="chip" data-ins="{nombre}">+ nombre</button><button type="button" class="chip" data-ins="{saludo}">+ saludo</button></div></div>
      <div class="field"><label>Fotos, videos o audios (opcional, hasta 6)</label><div class="qrmedia" id="qrem">${drawMedia()}</div></div>
      <div class="err" hidden></div>
      <div class="row"><button type="button" class="iconbtn" data-close>Cancelar</button><button class="send" type="submit">Guardar</button></div>
    </form>`);
  const box = $('#qrem');
  const redraw = () => (box.innerHTML = drawMedia());
  box.onclick = (ev) => {
    if (ev.target.closest('#qradd')) return qrInput.click();
    const x = ev.target.closest('[data-mx]');
    if (x) {
      items.splice(Number(x.dataset.mx), 1);
      return redraw();
    }
    const l = ev.target.closest('[data-ml],[data-mr]');
    if (l) {
      const i = Number(l.dataset.ml ?? l.dataset.mr);
      const j = l.dataset.ml != null ? i - 1 : i + 1;
      [items[i], items[j]] = [items[j], items[i]];
      redraw();
    }
  };
  qrInput.onchange = async () => {
    const files = [...qrInput.files];
    qrInput.value = '';
    for (let f of files) {
      if (items.length >= 6) break;
      let kind = (f.type || '').split('/')[0];
      if (kind === 'image' && (!['image/jpeg', 'image/png'].includes(f.type) || f.size > 5 * 1048576)) {
        try {
          f = await H.toJpeg(f);
        } catch {
          H.toast('No se pudo usar esa imagen.');
          continue;
        }
      }
      if (kind === 'video' && f.type !== 'video/mp4') {
        H.toast('WhatsApp solo acepta videos MP4.');
        continue;
      }
      if (!['image', 'video', 'audio'].includes(kind)) kind = 'document';
      items.push({ id: 'new:' + newN++, kind, name: f.name, url: URL.createObjectURL(f), file: f });
    }
    redraw();
  };
  document.querySelectorAll('[data-ins]').forEach((b) => {
    b.onclick = () => {
      const ta = $('#qrt');
      const p = ta.selectionStart ?? ta.value.length;
      ta.value = ta.value.slice(0, p) + b.dataset.ins + ta.value.slice(ta.selectionEnd ?? p);
      ta.focus();
      ta.setSelectionRange(p + b.dataset.ins.length, p + b.dataset.ins.length);
    };
  });
  $('#qrf').onsubmit = async (ev) => {
    ev.preventDefault();
    const err = $('#qrf .err');
    const btn = $('#qrf [type=submit]');
    btn.disabled = true;
    btn.textContent = 'Guardando…';
    const form = new FormData();
    form.append('atajo', $('#qra').value);
    form.append('texto', $('#qrt').value);
    form.append('keep', JSON.stringify(items.filter((m) => !m.file).map((m) => m.id)));
    // Los nuevos se suben en orden; su id en «order» es new:0, new:1… según el orden de subida
    const fresh = items.filter((m) => m.file);
    fresh.forEach((m) => form.append('files', m.file, m.name));
    const order = items.map((m) => (m.file ? 'new:' + fresh.indexOf(m) : m.id));
    form.append('order', JSON.stringify(order));
    try {
      if (q) await H.api('PUT', `/rapidas/${q.id}`, form);
      else await H.api('POST', `/stores/${H.S.storeId}/rapidas`, form);
      H.closeModal();
      R.list = null;
      H.toast('Respuesta guardada');
      after?.();
    } catch (er) {
      err.hidden = false;
      err.textContent = er.message;
      btn.disabled = false;
      btn.textContent = 'Guardar';
    }
  };
  $('#qra').focus();
}

/* =================== Configuración → Plantillas de WhatsApp =================== */
export async function renderPlantillasCfg(body) {
  body.innerHTML = '<div class="empty" style="padding:40px"><span class="spin"></span></div>';
  let d;
  try {
    d = await loadTpl(true);
  } catch (er) {
    body.innerHTML = `<div class="ph"><div><h2>Plantillas de WhatsApp</h2></div></div><p class="note">${e(er.message)}</p>`;
    return;
  }
  const again = () => renderPlantillasCfg(body);
  const head = `<div class="ph"><div><h2>Plantillas de WhatsApp</h2><p>Sirven para escribirle a una clienta cuando ya pasaron más de 24 h de su último mensaje (reactivar, avisar de su pedido, novedades). Meta las revisa antes de aprobarlas (desde minutos hasta 1 día) y cobra cada envío: Marketing ${COST.MARKETING}, Utilidad ${COST.UTILITY} (Perú). Dentro de las 24 h escribe normal: es gratis.</p></div>
    ${d.conectado ? '<div style="display:flex;gap:8px"><button class="iconbtn" id="tprf">Actualizar</button><button class="send" id="tpnew">+ Nueva plantilla</button></div>' : ''}</div>`;
  if (!d.conectado) {
    body.innerHTML = head + '<p class="note">Primero conecta el número de WhatsApp de esta tienda.</p>';
    return;
  }
  const own = d.plantillas.filter((t) => !t.auto);
  const auto = d.plantillas.filter((t) => t.auto);
  const row = (t) => `<div class="tprow">
      <div style="min-width:0;flex:1"><div class="tptop"><b>${e(t.name.replace(/_/g, ' '))}</b>${statusPill(t)}<span class="pill-cat">${CAT[t.category] || t.category}</span>${t.header?.format === 'IMAGE' ? '<span class="pill-cat">📷 foto</span>' : t.header?.format === 'VIDEO' ? '<span class="pill-cat">🎥 video</span>' : ''}</div>
        <div class="qrx">${e(t.body)}</div>
        ${t.status === 'REJECTED' ? `<div class="note" style="color:var(--bad)">Motivo: ${e(REASON[t.rejected_reason] || t.rejected_reason || 'Meta no dio el motivo')}. Bórrala y créala de nuevo corregida (con otro nombre).</div>` : ''}</div>
      ${t.auto ? '<span class="note">Aviso automático</span>' : `<button class="iconbtn" data-tdel="${e(t.name)}" aria-label="Borrar">${H.ICON.trash}</button>`}
    </div>`;
  body.innerHTML = `${head}
    <div class="card">${own.map(row).join('') || '<p class="note" style="margin:0">Todavía no creaste plantillas. Ejemplo: «Hola {{1}} 👋 Volvieron los colores que te gustaron…» como Marketing.</p>'}</div>
    ${auto.length ? `<h3 style="margin:20px 0 8px">De los avisos automáticos de Pedidos</h3><div class="card">${auto.map(row).join('')}</div>` : ''}`;
  $('#tprf').onclick = () => {
    R.tpl = null;
    again();
  };
  $('#tpnew').onclick = () => newTemplate(again);
  body.onclick = async (ev) => {
    const b = ev.target.closest('[data-tdel]');
    if (!b) return;
    if (!confirm(`¿Borrar la plantilla «${b.dataset.tdel}»? Meta no deja usar el mismo nombre por 30 días.`)) return;
    try {
      await H.api('DELETE', `/stores/${H.S.storeId}/plantillas/${encodeURIComponent(b.dataset.tdel)}`);
      R.tpl = null;
      H.toast('Plantilla borrada');
      again();
    } catch (er) {
      H.toast(er.message, 5000);
    }
  };
}

function newTemplate(after) {
  const t = { name: '', category: 'MARKETING', header: null, body: '', footer: '', buttons: [], vars: [], examples: [] };
  let file = null;
  let img = '';
  const sync = () => {
    t.body = $('#tb').value;
    t.vars = [...new Set((t.body.match(/\{\{(\d+)\}\}/g) || []).map((x) => Number(x.replace(/\D/g, ''))))].sort((a, b) => a - b);
    const hf = $('#th').value;
    t.header = hf === 'TEXT' ? { format: 'TEXT', text: $('#tht').value } : hf ? { format: hf } : null;
    t.footer = $('#tf').value;
    t.buttons = [
      ...$('#tbq').value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 3).map((text) => ({ type: 'QUICK_REPLY', text })),
      ...($('#tbu').value.trim() && $('#tbl').value.trim() ? [{ type: 'URL', text: $('#tbu').value.trim(), url: $('#tbl').value.trim() }] : []),
    ];
    $('#thtw').hidden = hf !== 'TEXT';
    $('#thfw').hidden = hf !== 'IMAGE' && hf !== 'VIDEO';
    if ($('#thf')) $('#thf').accept = hf === 'VIDEO' ? 'video/mp4' : 'image/jpeg,image/png';
    const old = [...document.querySelectorAll('[data-tex]')].map((x) => x.value);
    $('#tex').innerHTML = t.vars.map((n, i) => `<div class="field"><label for="tex${i}">Ejemplo para {{${n}}}</label><input id="tex${i}" data-tex="${i}" maxlength="200" value="${e(old[i] ?? t.examples[i] ?? (i === 0 ? 'María' : ''))}" placeholder="${i === 0 ? 'María' : 'Ej. negro'}"></div>`).join('');
    t.examples = [...document.querySelectorAll('[data-tex]')].map((x) => x.value);
    $('#tpv2').innerHTML = tplPreview(t, t.examples, img);
    document.querySelectorAll('[data-tex]').forEach((x) => (x.oninput = () => ((t.examples = [...document.querySelectorAll('[data-tex]')].map((y) => y.value)), ($('#tpv2').innerHTML = tplPreview(t, t.examples, img)))));
  };
  H.modal(`<h3>Nueva plantilla</h3>
    <form id="tpf2" class="tpform">
      <div class="grid" style="gap:12px;min-width:0">
        <div class="field"><label for="tn">Nombre (solo lo ves tú)</label><input id="tn" required maxlength="60" placeholder="reactivar clientas"></div>
        <div class="field"><label for="tc">Tipo</label><select id="tc"><option value="MARKETING">Marketing · promociones, novedades, reactivar</option><option value="UTILITY">Utilidad · sobre un pedido que ya hizo</option></select></div>
        <div class="field"><label for="th">Arriba del mensaje</label><select id="th"><option value="">Nada</option><option value="TEXT">Un título</option><option value="IMAGE">Una foto</option><option value="VIDEO">Un video</option></select></div>
        <div class="field" id="thtw" hidden><label for="tht">Título</label><input id="tht" maxlength="60" placeholder="¡Volvieron tus colores! 🔥"></div>
        <div class="field" id="thfw" hidden><label for="thf">Archivo</label><input type="file" id="thf" accept="image/jpeg,image/png"><span class="note">Foto JPG/PNG hasta 5 MB o video MP4 hasta 16 MB. Se guarda para usarla en cada envío.</span></div>
        <div class="field"><label for="tb">Mensaje</label><textarea id="tb" required rows="6" maxlength="1024" placeholder="Hola {{1}} 👋 Repusimos los colores que te gustaron. ¿Te separo el tuyo?"></textarea>
          <div class="chips"><button type="button" class="chip" id="tadd">+ Agregar dato {{n}}</button></div>
          <span class="note">Los datos {{1}}, {{2}}… se llenan al enviar (ej. el nombre). No pueden ir al inicio ni al final del mensaje.</span></div>
        <div id="tex" class="grid" style="gap:12px"></div>
        <div class="field"><label for="tf">Pie (opcional, letra pequeña)</label><input id="tf" maxlength="60" placeholder="Responde SALIR si no quieres más mensajes"></div>
        <div class="field"><label for="tbq">Botones para responder (opcional, uno por línea, hasta 3)</label><textarea id="tbq" rows="2" maxlength="90" placeholder="Sí, quiero\nVer colores"></textarea></div>
        <div class="field"><label for="tbu">Botón con enlace (opcional)</label><div style="display:flex;gap:6px;flex-wrap:wrap"><input id="tbu" maxlength="25" placeholder="Ver catálogo" style="flex:1;min-width:120px"><input id="tbl" type="url" placeholder="https://…" style="flex:2;min-width:160px"></div></div>
      </div>
      <div class="tpside"><span class="note">Así le llega</span><div class="tpwrap" id="tpv2"></div></div>
      <div class="err" hidden style="grid-column:1/-1"></div>
      <div class="row" style="grid-column:1/-1"><button type="button" class="iconbtn" data-close>Cancelar</button><button class="send" type="submit">Mandar a revisión de Meta</button></div>
    </form>`);
  document.querySelector('.modal').classList.add('wide');
  ['#tb', '#th', '#tht', '#tf', '#tbq', '#tbu', '#tbl'].forEach((s) => $(s).addEventListener('input', sync));
  $('#th').addEventListener('change', sync);
  $('#tadd').onclick = () => {
    const ta = $('#tb');
    const n = (t.vars.at(-1) || 0) + 1;
    const p = ta.selectionStart ?? ta.value.length;
    const ins = `{{${n}}}`;
    ta.value = ta.value.slice(0, p) + ins + ta.value.slice(ta.selectionEnd ?? p);
    ta.focus();
    sync();
  };
  $('#thf').onchange = () => {
    file = $('#thf').files[0] || null;
    img = file && file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
    sync();
  };
  sync();
  $('#tpf2').onsubmit = async (ev) => {
    ev.preventDefault();
    sync();
    const err = $('#tpf2 .err');
    const btn = $('#tpf2 [type=submit]');
    const form = new FormData();
    form.append('name', $('#tn').value);
    form.append('category', $('#tc').value);
    form.append('body', t.body);
    form.append('examples', JSON.stringify(t.examples));
    form.append('header', $('#th').value);
    form.append('header_text', $('#tht').value);
    form.append('footer', t.footer);
    form.append('buttons', JSON.stringify(t.buttons));
    if (file) form.append('file', file, file.name);
    btn.disabled = true;
    btn.textContent = 'Enviando a Meta…';
    try {
      const r = await H.api('POST', `/stores/${H.S.storeId}/plantillas`, form);
      H.closeModal();
      R.tpl = null;
      H.toast(r.status === 'APPROVED' ? 'Plantilla aprobada ✅' : 'Enviada a revisión. Te avisamos aquí cuando Meta la apruebe.', 5000);
      after?.();
    } catch (er) {
      err.hidden = false;
      err.textContent = er.message;
      btn.disabled = false;
      btn.textContent = 'Mandar a revisión de Meta';
    }
  };
  $('#tn').focus();
}
