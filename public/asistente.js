// Asistente de inicio: antes de ver el panel, el dueño responde preguntas de su producto.
// Con eso se arma su bot (en el orden del abordaje de Jordan), su IA y sus precios; al final pide
// las fotos y videos mostrando la imagen de referencia de cada uno.
let H;
export function initAsistente(ctx) {
  H = ctx;
}
const e = (s) => H.esc(s ?? '');

const A = { step: 0, data: null, ans: null, busy: false, storeId: null, preview: false };

const TALLAS_JEAN = 'XS · Jean 26-27\nS · Jean 28-30\nM · Jean 31-33\nL · Jean 34-37\nXL · Jean 38-40';
const RUBROS = [
  ['ropa', '👗 Ropa (con tallas y colores)', 'Pantalones, polos, leggings, vestidos… El bot pregunta la talla, manda los colores de esa talla y la IA cierra la venta.'],
  ['simple', '📦 Un producto sin variantes', 'Cápsulas, parlantes, cuadros personalizados, cremas… Sin tallas ni colores: el bot manda la promoción y la IA cierra la venta.'],
];

export function rubroPicker(cur, name = 'rubro') {
  return `<div class="canales" role="radiogroup">${RUBROS.map(([v, t, d]) => `<label class="canal"><input type="radio" name="${name}" value="${v}" ${cur === v ? 'checked' : ''}><b>${t}</b><span>${d}</span></label>`).join('')}</div>`;
}

export function resetAsistente() {
  A.step = 0;
  A.data = null;
  A.ans = null;
  A.storeId = null;
}

function defaults(st) {
  return {
    marca: st.name || '', producto: '', descripcion: '', beneficios: '', tela: '', tallas: TALLAS_JEAN, colores: '',
    precios: { 1: '', 2: '', 3: '', 4: '' }, envio: 'Envío gratis', lima: true, provincia: true, adelanto: 30,
    faq: '', garantia: '', trato: 'cercano', palabra: '',
  };
}

const STEPS = ['Qué vendes', 'Tu producto', 'Precios y envíos', 'Cómo atiende', 'Tu bot', 'Fotos y videos'];

export async function renderAsistente(root, st, opts, onDone) {
  if (A.storeId !== st.id || !A.data) {
    A.storeId = st.id;
    A.preview = !!opts?.preview;
    root.innerHTML = '<div class="asis"><div class="asis-box"><p class="note">Cargando…</p></div></div>';
    try {
      A.data = await H.api('GET', `/stores/${st.id}/asistente`);
    } catch (er) {
      root.innerHTML = `<div class="asis"><div class="asis-box"><p>${e(er.message)}</p><button class="send" id="as-out">Entrar al panel</button></div></div>`;
      root.querySelector('#as-out').onclick = () => onDone(false);
      return;
    }
    const saved = A.preview ? null : A.data.respuestas; // en vista previa empieza de cero, como un alumno nuevo
    A.ans = { ...defaults(st), ...(saved || {}), rubro: A.preview ? st.rubro || 'ropa' : A.data.rubro };
    A.ans.precios = { 1: '', 2: '', 3: '', 4: '', ...(saved?.precios || {}) };
    A.step = saved ? 4 : 0;
  }
  draw(root, st, onDone);
}

function head(st) {
  return `<div class="asis-top"><span class="asis-logo">${H.LOGO}</span><b>Control Total</b><span class="grow"></span><span class="note">${e(st.name)}</span></div>
  ${A.preview ? '<div class="viewband" style="margin:0;border-radius:10px">👁 Vista previa: así lo ve un alumno nuevo. No se guarda nada en tu tienda.</div>' : ''}
  <ol class="asis-steps">${STEPS.map((s, i) => `<li class="${i < A.step ? 'done' : i === A.step ? 'on' : ''}"><span>${i + 1}</span>${s}</li>`).join('')}</ol>`;
}

function draw(root, st, onDone) {
  const a = A.ans;
  const ropa = a.rubro === 'ropa';
  let inner = '';
  if (A.step === 0) {
    inner = `<h1>¡Hola! Armemos tu bot en 5 minutos 👋</h1>
      <p class="sub">Te haremos unas preguntas de tu producto. Con tus respuestas creamos tu bot, tu IA y tus precios, en un orden probado vendiendo todos los días por WhatsApp: foto y precios, pregunta, seguimientos, IA y asesora.</p>
      <div class="field"><label>¿Qué vendes?</label>${rubroPicker(a.rubro)}</div>`;
  } else if (A.step === 1) {
    inner = `<h1>Tu producto</h1><p class="sub">Escribe como se lo explicarías a una clienta. La IA usa esto para responder.</p>
      <div class="asis-grid">
        <div class="field"><label for="as-marca">Nombre de tu marca</label><input id="as-marca" name="marca" value="${e(a.marca)}" maxlength="60"></div>
        <div class="field"><label for="as-prod">¿Qué producto vendes?</label><input id="as-prod" name="producto" value="${e(a.producto)}" maxlength="60" placeholder="${ropa ? 'Ej: Pantalón formal stretch' : 'Ej: Cápsulas de colágeno'}" required></div>
      </div>
      <div class="field"><label for="as-desc">Descríbelo en 2 o 3 líneas</label><textarea id="as-desc" name="descripcion" rows="3" maxlength="800" placeholder="${ropa ? 'Ej: Pantalón de vestir que no se arruga, cintura alta, ideal para la oficina.' : 'Ej: 60 cápsulas por frasco, para 1 mes. Ayuda a la piel, uñas y cabello.'}">${e(a.descripcion)}</textarea></div>
      <div class="field"><label for="as-ben">Beneficios (uno por línea)</label><textarea id="as-ben" name="beneficios" rows="4" maxlength="800" placeholder="Ej:\nNo se arruga\nTela que estira\nNo transparenta">${e(a.beneficios)}</textarea></div>
      ${ropa ? `<div class="field"><label for="as-tela">Tela o material</label><input id="as-tela" name="tela" value="${e(a.tela)}" maxlength="200" placeholder="Ej: Crepe stretch, no transparenta"></div>
      <div class="asis-grid">
        <div class="field"><label for="as-tallas">Tallas (una por línea)</label><textarea id="as-tallas" name="tallas" rows="5" maxlength="400">${e(a.tallas)}</textarea>
          <span class="note">Puedes poner su equivalencia: «S · Jean 28-30». El bot reconoce la letra y los números. <button type="button" class="link" data-as="tsml">Usar S, M, L</button> · <button type="button" class="link" data-as="tjean">XS a XL con jean</button></span></div>
        <div class="field"><label for="as-col">Colores (separados por coma)</label><textarea id="as-col" name="colores" rows="5" maxlength="400" placeholder="Ej: Negro, Beige, Azul noche, Vino">${e(a.colores)}</textarea></div>
      </div>` : ''}`;
  } else if (A.step === 2) {
    const p = a.precios;
    inner = `<h1>Precios y envíos</h1><p class="sub">Pon tu promoción. La más grande se marca con 🔥 y la IA la recomienda.</p>
      <div class="asis-prices">${[1, 2, 3, 4].map((k) => `<div class="field"><label for="as-p${k}">${k} ${ropa ? (k === 1 ? 'prenda' : 'prendas') : k === 1 ? 'unidad' : 'unidades'}${k === 1 ? '' : ' (opcional)'}</label><div class="asis-money"><span>S/</span><input id="as-p${k}" name="p${k}" inputmode="decimal" value="${e(p[k])}" placeholder="${k === 1 ? '89' : ''}" ${k === 1 ? 'required' : ''}></div></div>`).join('')}</div>
      <div class="field"><label for="as-envio">Envío</label><input id="as-envio" name="envio" value="${e(a.envio)}" maxlength="120" placeholder="Ej: Envío gratis a todo el Perú"></div>
      <div class="field"><label>¿A dónde vendes?</label>
        <label class="asis-check"><input type="checkbox" name="lima" ${a.lima ? 'checked' : ''}> <span><b>Lima, contra entrega</b> · tu motorizado lleva el pedido y la clienta paga al recibir</span></label>
        <label class="asis-check"><input type="checkbox" name="provincia" ${a.provincia ? 'checked' : ''}> <span><b>Provincia por agencia Shalom</b> · la clienta recoge en la agencia que elija de la lista</span></label></div>
      <div class="field" style="max-width:260px"><label for="as-adel">Adelanto para provincia</label><div class="asis-money"><span>S/</span><input id="as-adel" name="adelanto" inputmode="numeric" value="${e(a.adelanto)}"></div><span class="note">0 = paga todo antes de enviar.</span></div>
      <div class="field"><label for="as-pal">Mensaje con el que llegan tus clientas (opcional)</label><input id="as-pal" name="palabra" value="${e(a.palabra)}" maxlength="80" placeholder="Ej: Deseo más información"><span class="note">El texto que pones en tu anuncio de WhatsApp. Si una clienta lo escribe, también arranca el bot.</span></div>`;
  } else if (A.step === 3) {
    inner = `<h1>Cómo atiende tu IA</h1><p class="sub">Lo que la IA no sepa, lo pasa a tu asesora. Mientras más preguntas frecuentes pongas, mejor responde.</p>
      <div class="field"><label>Trato con la clienta</label><div class="canales" role="radiogroup">
        <label class="canal"><input type="radio" name="trato" value="cercano" ${a.trato !== 'neutral' ? 'checked' : ''}><b>💕 Cercano</b><span>Cálido, con emojis: «¡Hola! 😊 ¿Qué talla usas?»</span></label>
        <label class="canal"><input type="radio" name="trato" value="neutral" ${a.trato === 'neutral' ? 'checked' : ''}><b>🙂 Amable y simple</b><span>Respetuoso, pocos emojis: «Hola, ¿qué talla usas?»</span></label></div></div>
      <div class="field"><label for="as-faq">Preguntas frecuentes (pregunta y respuesta)</label><textarea id="as-faq" name="faq" rows="7" maxlength="3000" placeholder="Ej:\n¿Tienen tienda física? → No, solo ventas online con envío.\n¿Cuánto demora a provincia? → 1 a 2 días por Shalom.\n¿Se puede cambiar? → Sí, dentro de 7 días si está sin usar.">${e(a.faq)}</textarea></div>
      <div class="field"><label for="as-gar">Cambios o garantía (opcional)</label><input id="as-gar" name="garantia" value="${e(a.garantia)}" maxlength="300" placeholder="Ej: Cambio de talla gratis dentro de 7 días"></div>`;
  } else if (A.step === 4) {
    inner = `<h1>Así atenderá tu bot ✅</h1><p class="sub">Ya está armado, en un orden probado para vender por WhatsApp. Puedes cambiar cualquier texto después en Configuración → Bot Suyon AI.</p>
      ${timeline(a)}`;
  } else {
    inner = `<h1>Necesito estas fotos y videos 📸</h1>
      <p class="sub">Son la clave para que te compren: dan confianza y cierran la venta. Cada uno trae un ejemplo de cómo se ve. Puedes subirlos ahora o después en Bot Suyon AI → Archivos.</p>
      <div class="asis-files">${A.data.assets.map(fileCard).join('')}</div>`;
  }
  const last = A.step === 5;
  root.innerHTML = `<div class="asis"><div class="asis-box">${head(st)}
    <form id="as-f" class="asis-form" novalidate>${inner}
      <div class="err" hidden></div>
      <div class="asis-nav">
        ${A.step > 0 ? '<button type="button" class="iconbtn" data-as="back">← Atrás</button>' : '<button type="button" class="link" data-as="skip">Saltar, lo hago después</button>'}
        <span class="grow"></span>
        <button class="send" type="submit" ${A.busy ? 'disabled' : ''}>${A.step === 3 ? (A.busy ? 'Armando tu bot…' : '✨ Armar mi bot') : last ? 'Entrar a mi panel' : A.step === 4 ? 'Siguiente: fotos y videos →' : 'Siguiente →'}</button>
      </div>
    </form></div></div>`;
  const f = root.querySelector('#as-f');
  const err = f.querySelector('.err');
  const showErr = (m) => {
    err.textContent = m;
    err.hidden = !m;
  };
  f.onclick = async (ev) => {
    const b = ev.target.closest('[data-as]');
    if (!b) return;
    const act = b.dataset.as;
    if (act === 'back') {
      collect(f);
      A.step--;
      return draw(root, st, onDone);
    }
    if (act === 'skip') return finish(st, onDone);
    if (act === 'tsml') f.tallas.value = 'S\nM\nL';
    if (act === 'tjean') f.tallas.value = TALLAS_JEAN;
    if (act === 'up') {
      if (A.preview) return H.toast('En la vista previa no se sube nada.');
      const inp = root.querySelector(`#up-${b.dataset.key}`);
      inp.onchange = () => upload(root, st, onDone, b.dataset.key, inp.files[0]);
      inp.click();
    }
  };
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    showErr('');
    collect(f);
    const bad = validate();
    if (bad) return showErr(bad);
    if (A.step === 3) {
      // Tienda que ya vendía con su propio prompt: avisar antes de reemplazarlo
      if (!A.preview && !A.data.respuestas && !A.data.setup && !confirm('Esto reemplaza el prompt de la IA de esta tienda por uno nuevo armado con tus respuestas y crea un flujo nuevo (apagado). Tus flujos actuales no se borran. ¿Seguir?')) return;
      A.busy = true;
      draw(root, st, onDone);
      try {
        A.data = await H.api('POST', `/stores/${st.id}/asistente${A.preview ? '?preview=1' : ''}`, { ...A.ans, rubro: A.ans.rubro });
        A.busy = false;
        A.step = 4;
      } catch (er) {
        A.busy = false;
        draw(root, st, onDone);
        return root.querySelector('.err') && ((root.querySelector('.err').textContent = er.message), (root.querySelector('.err').hidden = false));
      }
      return draw(root, st, onDone);
    }
    if (last) return finish(st, onDone);
    A.step++;
    draw(root, st, onDone);
    root.querySelector('.asis').scrollTop = 0;
  };
}

function collect(f) {
  const a = A.ans;
  const v = (n) => (f.elements[n] ? f.elements[n].value : undefined);
  if (A.step === 0) a.rubro = f.querySelector('input[name=rubro]:checked')?.value || a.rubro;
  if (A.step === 1) for (const k of ['marca', 'producto', 'descripcion', 'beneficios', 'tela', 'tallas', 'colores']) if (v(k) !== undefined) a[k] = v(k).trim();
  if (A.step === 2) {
    for (const k of [1, 2, 3, 4]) a.precios[k] = v(`p${k}`).trim();
    a.envio = v('envio').trim();
    a.lima = f.elements.lima.checked;
    a.provincia = f.elements.provincia.checked;
    a.adelanto = v('adelanto').trim();
    a.palabra = v('palabra').trim();
  }
  if (A.step === 3) {
    a.trato = f.querySelector('input[name=trato]:checked')?.value || 'cercano';
    a.faq = v('faq');
    a.garantia = v('garantia').trim();
  }
}

function validate() {
  const a = A.ans;
  if (A.step === 1) {
    if (!a.producto) return 'Escribe qué producto vendes.';
    if (a.rubro === 'ropa' && !a.tallas.trim()) return 'Escribe tus tallas.';
    if (a.rubro === 'ropa' && !a.colores.trim()) return 'Escribe tus colores.';
  }
  if (A.step === 2) {
    if (!(Number(String(a.precios[1]).replace(',', '.')) > 0)) return 'Pon el precio por 1.';
    if (!a.lima && !a.provincia) return 'Marca si vendes en Lima, en provincia o en los dos.';
  }
  return '';
}

const money = (n) => `S/${Number(n) % 1 ? Number(n).toFixed(2) : Number(n)}`;

function timeline(a) {
  const ropa = a.rubro === 'ropa';
  const ps = Object.entries(a.precios).filter(([, v]) => Number(v) > 0).map(([k, v]) => `${k} → ${money(v)}`).join(' · ');
  const rows = [
    ['🖼️', 'Apenas te escribe', `Foto de tu producto + precios (${e(ps)}). Gratis, sin IA.`],
    ['❓', 'Pregunta', ropa ? '«¿Qué talla usas?» con botones. Reconoce la talla sin IA (también números de jean) y manda la foto de colores de esa talla.' : '«¿Cuántas te gustaría?» con botones de tu promoción.'],
    ['⏱️', 'Si no responde', '15 min: texto · 40 min: tu nota de voz · 3 h: video · 15 h: fotos de pedidos. Se cancelan solos cuando responde y no salen de noche.'],
    ['🤖', 'IA Suyon', `Responde dudas con tu información, pide ${a.lima && a.provincia ? 'destino (Lima o provincia)' : a.lima ? 'el distrito' : 'la ciudad'}, datos y manda el formulario.${a.provincia ? ' En provincia le manda la lista de agencias Shalom.' : ''}`],
    ['👩', 'Pasa a tu asesora', `${a.lima ? 'Lima confirmó sus datos' : ''}${a.lima && a.provincia ? ' · ' : ''}${a.provincia ? 'mandó la captura del pago' : ''} · pidió hablar con una persona. El pedido se crea solo.`],
  ];
  return `<ol class="asis-tl">${rows.map(([ic, t, d]) => `<li><span class="asis-ic">${ic}</span><div><b>${t}</b><p>${d}</p></div></li>`).join('')}</ol>`;
}

function media(src, mime, cls) {
  if (!mime) return `<span class="${cls} none">Sin ejemplo</span>`;
  if (mime.startsWith('image/')) return `<img class="${cls}" src="${src}" alt="" loading="lazy">`;
  if (mime.startsWith('video/')) return `<video class="${cls}" src="${src}" controls preload="metadata" playsinline></video>`;
  if (mime.startsWith('audio/')) return `<div class="${cls} aud"><span>🎤</span><audio src="${src}" controls preload="none"></audio></div>`;
  return `<span class="${cls} none">PDF</span>`;
}

function fileCard(f) {
  const accept = f.key.startsWith('audio') ? 'audio/*' : f.key.startsWith('video') || f.key.startsWith('confianza-provincia') ? 'video/*,image/*' : f.key.startsWith('confianza') ? 'image/*,video/*' : 'image/*';
  return `<div class="asis-file ${f.ok ? 'ok' : ''}">
    <figure><figcaption>Ejemplo</figcaption>${media(`/api/referencias/${encodeURIComponent(f.ref)}`, f.ref_mime, 'asis-ref')}</figure>
    <div class="asis-fi">
      <b>${e(f.desc)}</b>
      <span class="note">${e(f.cuando)}</span>
      <span class="asis-need ${f.need === 'si' ? 'req' : ''}">${f.need === 'si' ? 'Necesario' : 'Recomendado'}</span>
      ${f.ok ? `<div class="asis-mine">${media(`/api/bot/assets/${f.asset_id}`, f.asset_mime, 'asis-own')}<span>✅ Subido</span></div>` : ''}
      <input type="file" id="up-${e(f.key)}" accept="${accept}" hidden>
      <button type="button" class="${f.ok ? 'iconbtn' : 'send'}" data-as="up" data-key="${e(f.key)}">${f.ok ? 'Cambiar' : 'Subir'}</button>
    </div></div>`;
}

async function upload(root, st, onDone, key, file) {
  if (!file) return;
  const fd = new FormData();
  fd.append('key', key);
  fd.append('file', file);
  H.toast('Subiendo…');
  try {
    await H.api('POST', `/stores/${st.id}/bot/assets`, fd);
    A.data = await H.api('GET', `/stores/${st.id}/asistente`);
    H.toast('Subido ✅');
  } catch (er) {
    H.toast(er.message);
  }
  draw(root, st, onDone);
}

async function finish(st, onDone) {
  if (!A.preview) {
    try {
      await H.api('POST', `/stores/${st.id}/asistente/listo`);
    } catch {}
  }
  const done = !!A.data?.respuestas;
  resetAsistente();
  onDone(done);
}
