// Envíos a provincia (Shalom / Olva): por cobrar, registro, ya recogió, devueltos, reporte y ajustes
import { openPedido } from './pedidos.js';

let H;
export function initEnvios(ctx) {
  H = ctx;
}
const e = (s) => H.esc(s ?? '');
const m2 = (n) => `S/ ${Number(n || 0).toFixed(2)}`;
const DAY = 864e5;
const ABIERTOS = ['enviado', 'en_camino', 'en_agencia', 'falta_abonar'];
const REG = ['por_pagar', 'validado'];
const ST = {
  por_pagar: ['Yape por validar', 'var(--warn)'],
  validado: ['Agendado (sin guía)', 'var(--t-grey)'],
  enviado: ['Pendiente', '#8a8a85'],
  en_camino: ['En camino', '#2f6fd0'],
  en_agencia: ['En agencia', '#c78a0a'],
  falta_abonar: ['Recogido · falta abonar', '#7b4fc9'],
  recogido: ['Recogido', '#2e8b57'],
  no_recogido: ['Devuelto / problema', '#c0392b'],
  cancelado: ['Cancelado', 'var(--t-grey)'],
};
const TABS = [['cobrar', 'Por cobrar'], ['reg', 'Registro'], ['pag', 'Pagados'], ['dev', 'Devueltos'], ['prod', 'Productos'], ['pre', 'Precios', 1], ['rep', 'Reporte'], ['aju', 'Ajustes', 1]];
const EV = { storeId: null, data: null, tab: 'cobrar', f: 'all', cf: 'all', cu: 'all', q: '', rp: 'sem', rd1: '', rd2: '', pf: 'all', shown: 60, regOut: [], dupForms: [], cruceOut: '', fotos: [], fotoOut: '', busy: false, timer: null };

try {
  const u = JSON.parse(localStorage.getItem('scrm:envios') || '{}');
  for (const k of ['tab', 'f', 'cf', 'cu', 'rp']) if (u[k]) EV[k] = u[k];
} catch {}
const keepUI = () => {
  try {
    localStorage.setItem('scrm:envios', JSON.stringify({ tab: EV.tab, f: EV.f, cf: EV.cf, cu: EV.cu, rp: EV.rp }));
  } catch {}
};

export function resetEnvios() {
  EV.storeId = null;
  EV.data = null;
}

/* ---------- fechas en la zona de la tienda ---------- */
let DF = null;
const dk = (t) => {
  if (!t) return '';
  if (!DF) DF = new Intl.DateTimeFormat('en-CA', { timeZone: H.store()?.timezone || 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' });
  return DF.format(new Date(t));
};
const fD = (k) => (k ? `${k.slice(8, 10)}/${k.slice(5, 7)}` : '');
const addD = (k, n) => {
  const d = new Date(k + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const monOf = (k) => addD(k, -((new Date(k + 'T12:00:00Z').getUTCDay() + 6) % 7));
const DN = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const wd = (k) => DN[new Date(k + 'T12:00:00Z').getUTCDay()];
const sent = (x) => x.enviado_at || x.created_at;
const days = (t) => Math.max(0, Math.floor((Date.now() - t) / DAY));
const hm = (t) => new Date(t).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: H.store()?.timezone || 'America/Lima' });

/* ---------- reglas de la tarjeta ---------- */
const cfg = () => EV.data?.cfg || { productos: [], extras: [], remitentes: [], dias_aviso: 20, dias_devolver: 25 };
const isExtra = (it) => cfg().extras.some((x) => x.nombre.toLowerCase() === String(it.producto || '').toLowerCase());
const mainItems = (x) => x.items.filter((it) => !isExtra(it));
const isOpen = (x) => ABIERTOS.includes(x.status);
const isDV = (x) => isOpen(x) && x.status !== 'falta_abonar' && days(sent(x)) >= cfg().dias_devolver;
const isRR = (x) => isOpen(x) && x.status !== 'falta_abonar' && days(sent(x)) >= cfg().dias_aviso && !isDV(x);
const miss = (x) => {
  const r = [];
  const mi = mainItems(x);
  if (!mi.length) r.push('producto');
  if (mi.some((it) => !it.color)) r.push('colores');
  if (mi.some((it) => !it.talla)) r.push('tallas');
  if (!x.total) r.push('ticket');
  return r;
};
const saldo = (x) => Math.max(0, (x.total || 0) - (x.adelanto || 0));
const cel9 = (x) => String(x.celular || '').replace(/\D/g, '').slice(-9);
const courier = (x) => (x.courier === 'olva' ? 'olva' : 'shalom');

/* ---------- carga ---------- */
export async function renderEnvios(content) {
  if (EV.storeId !== H.S.storeId) Object.assign(EV, { storeId: H.S.storeId, data: null, shown: 60, regOut: [], cruceOut: '', fotos: [], fotoOut: '' });
  DF = null;
  content.innerHTML = `<div class="env gs">
    <h2 class="gsh">📦 Guías Shalom · Olva<span class="grow-sp"></span><button class="gbtn blue" data-ea="registrar">📝 Registro manual</button><button class="gbtn green" data-ea="recogio">✅ Ya recogió</button></h2>
    <div class="gsub"><span id="gstot"></span><span id="gssv"></span></div>
    <div class="gtabs" role="tablist" aria-label="Envíos" id="envtabs"></div>
    <div id="envtop"></div>
    <div id="envbody"><div class="gemp"><span class="spin"></span></div></div>
  </div>`;
  const root = content.querySelector('.env');
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('paste', onPaste);
  root.addEventListener('input', onInput);
  if (EV.data) draw();
  await load();
  clearInterval(EV.timer);
  EV.timer = setInterval(() => {
    if (H.S.view !== 'envios' || !H.$('.env')) return clearInterval(EV.timer);
    if (document.hidden || EV.busy || document.querySelector('.pmodal') || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    load();
  }, 60000);
}

async function load() {
  try {
    EV.data = await H.api('GET', `/stores/${H.S.storeId}/envios`);
  } catch (er) {
    const b = H.$('#envbody');
    if (b) b.innerHTML = `<div class="err">${e(er.message)}</div>`;
    return;
  }
  draw();
  if (EV.data.envios.some((x) => x.guia_qr)) loadQR();
}

function counts() {
  const l = EV.data.envios;
  return { cobrar: l.filter(isOpen).length, reg: l.filter((x) => REG.includes(x.status)).length, pag: l.filter((x) => x.status === 'recogido').length, dev: l.filter((x) => x.status === 'no_recogido').length };
}

function draw() {
  if (!EV.data || !H.$('#envbody')) return;
  keepUI();
  const c = counts();
  const tabs = TABS.filter((t) => !t[2] || H.owner());
  if (!tabs.some(([k]) => k === EV.tab)) EV.tab = 'cobrar';
  H.$('#envtabs').innerHTML = tabs.map(([k, l]) => `<button class="gchip${EV.tab === k ? ' on' : ''}" data-et="${k}" aria-pressed="${EV.tab === k}">${l}${c[k] !== undefined ? ` · ${c[k]}` : ''}</button>`).join('');
  H.$('#gssv').textContent = EV.saving || '';
  if (EV.tab === 'reg') drawReg();
  else if (EV.tab === 'rep') drawRep();
  else if (EV.tab === 'prod') drawProd();
  else if (EV.tab === 'pre') drawPre();
  else if (EV.tab === 'aju') drawAju();
  else drawList();
  if (!EV.gav) gav();
}

// Al entrar: si hay pedidos sin guía, aviso grande (máx. 1 vez cada 4 horas), como en el artifact
function gav() {
  EV.gav = true;
  const r = EV.data.envios.filter((x) => REG.includes(x.status));
  if (!r.length) return;
  try {
    const lt = Number(localStorage.getItem('scrm:gav') || 0);
    if (Date.now() - lt < 4 * 3600e3) return;
    localStorage.setItem('scrm:gav', String(Date.now()));
  } catch {}
  const fd = (t) => (t ? `${DN[new Date(t).getDay()]} ${fD(dk(t))}` : '');
  const old = r.reduce((a, x) => (x.created_at < a.created_at ? x : a));
  const last = EV.data.envios.reduce((a, x) => (x.enviado_at && x.enviado_at > a ? x.enviado_at : a), 0);
  const viejos = r.filter((x) => days(x.created_at) >= 2).length;
  const el = document.createElement('div');
  el.className = 'gav';
  el.setAttribute('role', 'dialog');
  el.innerHTML = `<div class="gi" aria-hidden="true">📦</div><h2>Faltan enviar ${r.length} guía${r.length > 1 ? 's' : ''}</h2>
    <p>Toma foto a las guías de Shalom de estos pedidos y súbelas en Registro → «Subir fotos de guías».</p>
    <div class="gn"><div><b>${r.length}</b><span>pedidos sin guía</span></div><div><b>${fd(old.created_at)}</b><span>el más antiguo${viejos ? ` · ${viejos} con 2+ días` : ''}</span></div>${last ? `<div><b>${fd(last)}</b><span>última guía subida</span></div>` : ''}</div>
    <div class="gb"><button type="button" class="g1" data-gav="reg">Ver cuáles faltan</button><button type="button" class="g2b">Cerrar</button></div><div class="gbar" aria-hidden="true"></div>`;
  document.body.appendChild(el);
  const tm = setTimeout(() => el.remove(), 6000);
  el.addEventListener('click', (ev) => {
    clearTimeout(tm);
    if (ev.target.closest('[data-gav]')) {
      EV.tab = 'reg';
      draw();
    }
    el.remove();
  });
}

/* ---------- QR (para mostrar en agencia) ---------- */
let qrLib = null;
function loadQR() {
  if (qrLib || window.qrcode) return;
  qrLib = new Promise((ok) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
    s.onload = () => {
      ok();
      draw();
    };
    s.onerror = ok;
    document.head.appendChild(s);
  });
}
const QC = {};
function qsvg(t) {
  if (!window.qrcode) return '';
  if (QC[t]) return QC[t];
  try {
    const q = window.qrcode(0, 'M');
    q.addData(t);
    q.make();
    return (QC[t] = q.createSvgTag({ cellSize: 2, margin: 0, scalable: true }));
  } catch {
    return '';
  }
}

/* ---------- Por cobrar / Pagados / Devueltos (igual que el artifact) ---------- */
const prodOf = (x) => cfg().productos.find((p) => p.nombre === mainItems(x)[0]?.producto) || null;
const unitsOf = (x) => mainItems(x).flatMap((it) => Array.from({ length: Math.min(it.cantidad, 60) }, () => ({ color: it.color || '', talla: it.talla || '' })));
const extrasOf = (x) => x.items.filter(isExtra);
const extrasTotal = (list) => list.reduce((s, it) => s + (Number(it.precio) || 0) * (it.cantidad || 1), 0);
function buildItems(producto, units, extras) {
  const map = new Map();
  for (const u of units) {
    const k = `${u.talla}|${u.color}`;
    if (map.has(k)) map.get(k).cantidad++;
    else map.set(k, { producto, talla: u.talla, color: u.color, cantidad: 1 });
  }
  return [...map.values(), ...extras];
}

function drawList() {
  const all = EV.data.envios;
  const inTab = (x) => (EV.tab === 'cobrar' ? isOpen(x) : EV.tab === 'pag' ? x.status === 'recogido' : x.status === 'no_recogido');
  const base = all.filter(inTab);
  const hasOlva = all.some((x) => courier(x) === 'olva');
  const g = base.filter((x) => EV.cu === 'all' || courier(x) === EV.cu);
  const q = EV.q.toLowerCase().trim();
  const qm = (x) => !q || [x.nombre, x.guia, x.guia_codigo, x.sede, x.ciudad, x.dni, x.celular, `#${x.number}`].join(' ').toLowerCase().includes(q);
  const stF = (x) => EV.tab !== 'cobrar' || EV.f === 'all' || (EV.f === 'rr' ? isRR(x) : EV.f === 'dv' ? isDV(x) : x.status === EV.f && !isRR(x) && !isDV(x));
  const cfF = (x) => EV.tab !== 'cobrar' || EV.cf === 'all' || (EV.cf === 'inc') === !!miss(x).length;
  const l = g.filter((x) => stF(x) && cfF(x) && qm(x));
  if (EV.tab === 'cobrar') l.sort((a, b) => sent(a) - sent(b));
  else l.sort((a, b) => (b.status_at || 0) - (a.status_at || 0));
  H.$('#gstot').textContent = `${g.length} guías${EV.tab === 'cobrar' ? ` · por cobrar ${m2(g.reduce((s, x) => s + saldo(x), 0))}` : ''}`;
  const cnt = (k) => g.filter((x) => x.status === k && !isRR(x) && !isDV(x)).length;
  const ni = g.filter((x) => miss(x).length).length;
  const cuh = hasOlva ? [['all', 'Todos'], ['shalom', 'Shalom'], ['olva', 'Olva']].map(([k, t]) => `<button class="gchip${EV.cu === k ? ' on' : ''}" data-ecu="${k}">${t} · ${k === 'all' ? base.length : base.filter((x) => courier(x) === k).length}</button>`).join('') : '';
  H.$('#envtop').innerHTML = `
    <input type="search" id="envq" class="gsq" placeholder="Buscar nombre, orden, código o destino" value="${e(EV.q)}" autocomplete="off" aria-label="Buscar">
    ${EV.tab === 'cobrar' ? `<div class="gchips">${cuh}<button class="gchip${EV.cf === 'all' ? ' on' : ''}" data-ecf="all">Todas</button><button class="gchip${EV.cf === 'inc' ? ' on' : ''}" data-ecf="inc">🟡 Por completar · ${ni}</button><button class="gchip${EV.cf === 'ok' ? ' on' : ''}" data-ecf="ok">🟢 Completadas · ${g.length - ni}</button></div>
    <div class="gchips"><button class="gchip${EV.f === 'all' ? ' on' : ''}" data-ef="all">Todas · ${g.length}</button><button class="gchip${EV.f === 'falta_abonar' ? ' on' : ''}" data-ef="falta_abonar">💜 Recogido · falta abonar · ${cnt('falta_abonar')}</button>
      ${['enviado', 'en_camino', 'en_agencia'].map((k) => `<button class="gchip${EV.f === k ? ' on' : ''}" data-ef="${k}">${ST[k][0]} · ${cnt(k)}</button>`).join('')}
      <button class="gchip rch${EV.f === 'rr' ? ' on' : ''}" data-ef="rr">🔴 Posible devolución (${cfg().dias_aviso}–${cfg().dias_devolver - 1} días) · ${g.filter(isRR).length}</button>
      <button class="gchip dch${EV.f === 'dv' ? ' on' : ''}" data-ef="dv">🚨 Devolución (${cfg().dias_devolver}+ días) · ${g.filter(isDV).length}</button></div>`
      : cuh ? `<div class="gchips">${cuh}</div>` : ''}`;
  const body = H.$('#envbody');
  if (!l.length) {
    body.innerHTML = `<div class="gemp">${q ? 'Sin resultados' : EV.tab === 'cobrar' ? 'No hay guías por cobrar. Registra los pedidos en «Registro» y cruza su guía: pasan aquí solos.' : 'Todavía no hay nada aquí'}</div>`;
    return;
  }
  body.innerHTML = l.slice(0, EV.shown).map(card).join('') + (l.length > EV.shown ? `<div style="text-align:center;padding:10px"><button class="gchip" data-emore>Ver ${Math.min(60, l.length - EV.shown)} más (quedan ${l.length - EV.shown})</button></div>` : '');
}

function segHTML(x) {
  const sg = x.seg || [];
  const N = Math.max(5, sg.length + 1);
  let b = '';
  for (let i = 0; i < N; i++) {
    const on = i < sg.length;
    const nx = i === sg.length;
    const ok = (on && i === sg.length - 1) || nx;
    b += `<button class="sgb${on ? ' on' : nx ? ' nx' : ''}" data-eseg="${x.id}|${on ? 'pop' : 'add'}" ${ok ? '' : 'disabled'} title="${on ? (i === sg.length - 1 ? 'Toca para quitar' : '') : nx ? 'Marcar el seguimiento de hoy' : ''}">${on ? '✓ ' : ''}Día ${i + 1}${on ? `<small>${fD(dk(sg[i]))}</small>` : ''}</button>`;
  }
  const last = sg.length ? days(sg[sg.length - 1]) : null;
  return `<div class="sgw"><div class="sgt"><span>Seguimientos: <b>${sg.length}</b>${last !== null ? ` · último ${last === 0 ? 'hoy' : last === 1 ? 'ayer' : `hace ${last} días`}` : ''}</span><button class="nqb${x.no_quiere ? ' on' : ''}" data-enq="${x.id}">🚫 No quiere recoger</button></div><div class="sgr">${b}</div>${x.no_quiere ? '<div class="nql">🚫 Cliente no quiere recoger · seguimiento en vano</div>' : ''}</div>`;
}

function devHTML(x) {
  const c = cfg();
  const rems = c.remitentes;
  const r = rems.find((y) => y.id === x.rem) || rems[0] || { nombre: '', dni: '', cel: '' };
  const row = (lb, v) => `<div class="dvr"><span>${lb}</span><b>${e(v || '—')}</b>${v ? `<button class="cpb" data-cp="${e(v)}">Copiar</button>` : ''}</div>`;
  const inp = (lb, k, v, ph) => (v ? row(lb, v) : `<div class="dvr"><span>${lb}</span><input data-edato="${x.id}|${k}" inputmode="numeric" placeholder="${ph}"></div>`);
  const all = [`REMITENTE: ${r.nombre}`, `DNI: ${r.dni}`, `Cel: ${r.cel}`, `Origen: ${c.origen || ''}`, `Destino: ${x.sede || x.ciudad || ''}`, `DESTINATARIO: ${x.nombre || ''}`, `DNI: ${x.dni || '—'}`, `Cel: ${cel9(x) || '—'}`, `Guía: ${x.guia || ''}${x.guia_codigo ? ` · Código ${x.guia_codigo}` : ''}`].join('\n');
  return `<div class="dvd"><div class="dvt">📋 Datos para devolver a ${courier(x) === 'olva' ? 'Olva' : 'Shalom'}<button class="cpb" data-cp="${e(all)}">Copiar todo</button></div>
    ${rems.length ? `<div class="dvs">Remitente</div>${rems.length > 1 ? `<div class="dvr"><span>Quién envió</span><select data-erem="${x.id}">${rems.map((y) => `<option value="${e(y.id)}" ${y.id === r.id ? 'selected' : ''}>${e(y.nombre)}</option>`).join('')}</select></div>` : ''}${row('Nombre', r.nombre)}${row('DNI', r.dni)}${row('Celular', r.cel)}` : '<p class="note">Pon tus remitentes en Ajustes para tenerlos listos aquí.</p>'}
    <div class="dvs">Envío</div>${row('Origen', c.origen)}${row('Destino', x.sede || x.ciudad)}${row('N° de orden', x.guia)}${x.guia_codigo ? row('Código', x.guia_codigo) : ''}
    <div class="dvs">Destinatario</div>${row('Nombre', x.nombre)}${inp('DNI', 'dni', x.dni, 'Escribe el DNI')}${inp('Celular', 'celular', cel9(x), 'Escribe el celular')}</div>`;
}

const sel = (attrs, opts, cur) => `<select ${attrs}><option value="">—</option>${opts.map((o) => `<option ${o === cur ? 'selected' : ''}>${e(o)}</option>`).join('')}${cur && !opts.includes(cur) ? `<option selected>${e(cur)}</option>` : ''}</select>`;

function detHTML(x) {
  const id = x.id;
  const prods = cfg().productos.map((p) => p.nombre);
  const units = unitsOf(x);
  const n = units.length;
  const my = n >= 5;
  const producto = mainItems(x)[0]?.producto || '';
  const p = prodOf(x);
  let h = `<div class="gmny"><label>Producto${sel(`data-k="p" data-id="${id}"`, [...prods, 'Otro'], producto)}</label>
    <label>Promo<select data-k="pr" data-id="${id}"><option value="">—</option>${[1, 2, 3, 4].map((k) => `<option value="${k}" ${!my && n === k ? 'selected' : ''}>Por ${k}</option>`).join('')}<option value="M" ${my ? 'selected' : ''}>Mayorista</option></select></label>
    ${my ? `<label>Cantidad<input type="number" inputmode="numeric" min="5" max="50" data-k="mq" data-id="${id}" value="${n}"></label>` : ''}</div>`;
  if (!producto || !n) h += '<div class="gmny"><span>Elige producto y promo para escoger los colores</span></div>';
  else if (!p || !p.colores?.length) {
    h += `<div class="gmny"><label class="wide">Colores (separa con coma)<input type="text" data-k="clt" data-id="${id}" value="${e(units.map((u) => u.color).filter(Boolean).join(', '))}"></label></div>
      <div class="gmny"><label class="wide">Tallas (separa con coma)<input type="text" data-k="tlt" data-id="${id}" value="${e(units.map((u) => u.talla).filter(Boolean).join(', '))}"></label></div>`;
  } else {
    const tallas = p.tallas?.length ? p.tallas : ['XS', 'S', 'M', 'L', 'XL'];
    h += units.map((u, i) => `<div class="gmny"><label>Color ${i + 1}${sel(`data-k="cl" data-id="${id}" data-i="${i}"`, p.colores, u.color)}</label><label>Talla ${i + 1}${sel(`data-k="tl" data-id="${id}" data-i="${i}"`, tallas, u.talla)}</label></div>`).join('');
  }
  const ex = extrasOf(x);
  h += ex.map((it, i) => `<div class="gpol"><b>${e(it.producto)}</b><label>Color<input type="text" data-k="xc" data-id="${id}" data-i="${i}" value="${e(it.color || '')}"></label><label>Talla<input type="text" data-k="xt" data-id="${id}" data-i="${i}" value="${e(it.talla || '')}"></label><label>Precio S/<input type="number" inputmode="decimal" min="0" data-k="xv" data-id="${id}" data-i="${i}" value="${it.precio ?? ''}"></label><button class="gpdl" data-xdel="${id}|${i}" aria-label="Quitar">✕</button></div>`).join('');
  h += cfg().extras.length ? `<div class="gpbs">${cfg().extras.map((xx) => `<button class="gpbt" data-xadd="${id}|${e(xx.nombre)}">+ ${e(xx.nombre)}</button>`).join('')}</div>` : '';
  return h;
}

function card(x) {
  const d = days(sent(x));
  const ms = miss(x);
  const open = isOpen(x);
  const n9 = cel9(x);
  const olva = courier(x) === 'olva';
  const opts = ['enviado', 'en_camino', 'en_agencia', 'falta_abonar', 'recogido', 'no_recogido'];
  const fc = !open ? 'var(--line)' : ms.length ? '#d4a20a' : '#2e8b57';
  const dt = new Date(sent(x));
  const fecha = `${dk(sent(x))} ${hm(sent(x))}`;
  return `<article class="gcard${isDV(x) ? ' dv' : isRR(x) ? ' rr' : ''}" style="--sc:${ST[x.status]?.[1] || 'var(--line)'};--fc:${fc}" data-eid="${x.id}" data-t="${dt.getTime()}">
   <div class="gcb"><div class="gcl">
    <div class="gtop"><span class="gnm">${e(x.nombre || '—')}${x.notas && /Recuperado/.test(x.notas) ? '<span class="rvb">♻ Recuperado</span>' : ''}</span><span class="gdy">${d} días</span></div>
    <div class="gds">${e(x.sede || x.ciudad || 'Sin destino')} · ${fecha}</div>
    <div class="grow">${olva ? `<span class="olv">Olva</span>${x.guia ? `<button class="gcod" data-cp="${e(x.guia)}" title="Clic para copiar">${e(x.guia)}</button>` : ''}`
      : `${x.guia_codigo ? `<button class="gcod" data-cp="${e(x.guia_codigo)}" title="Clic para copiar">${e(x.guia_codigo)}</button>` : ''}${x.guia ? `<button class="gord" data-cp="${e(x.guia)}" title="Clic para copiar">${e(x.guia)}</button>` : ''}`}
      <select data-est="${x.id}" aria-label="Estado">${opts.map((s) => `<option value="${s}" ${s === x.status ? 'selected' : ''}>${ST[s][0]}</option>`).join('')}</select></div>
    <div class="gmny"><label>Ticket S/<input type="number" inputmode="decimal" min="0" data-k="t" data-id="${x.id}" value="${x.total || ''}"></label><label>Adelanto S/<input type="number" inputmode="decimal" min="0" data-k="a" data-id="${x.id}" value="${x.adelanto ?? ''}"></label><span class="gsal">${x.status === 'recogido' ? `Pagado ✓${x.total ? ' ' + m2(x.total) : ''}` : x.total ? `Saldo: ${m2(saldo(x))}` : 'Saldo: —'}</span></div>
    ${open ? `<div class="wab">📱 ${n9 ? `<b>${n9.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}</b><a href="https://wa.me/51${n9}" target="_blank" rel="noopener">WhatsApp</a><button class="cpb" data-cp="${n9}">Copiar</button>` : '<small>WhatsApp del formulario:</small>'}${n9 ? '' : `<input type="text" inputmode="numeric" placeholder="9xx xxx xxx" data-edato="${x.id}|celular">`}${x.chat_id && H.canChats() ? `<button class="cpb" data-echat="${x.chat_id}">Abrir chat</button>` : ''}</div>` : ''}
    ${detHTML(x)}
    ${open && x.status !== 'falta_abonar' ? segHTML(x) : ''}
    ${isDV(x) ? `<div class="dvl">🚨 Más de ${cfg().dias_devolver} días en agencia · DEVOLVER</div>${devHTML(x)}` : isRR(x) ? `<div class="rrl">⚠ Posible devolución · ${d} días sin recoger</div>` : ''}
    ${x.guia_estado ? `<div class="gshl">🚚 Shalom: <b>${e(x.guia_estado)}</b>${x.guia_at ? ` · revisado ${fD(dk(x.guia_at))} ${hm(x.guia_at)}` : ''}</div>` : ''}
    ${open ? (ms.length ? `<div class="fal">Falta: ${ms.join(', ')}</div>` : '<div class="okc">✓ Completo</div>') : ''}
    <div class="gact"><button class="gmini" data-eedit="${x.id}">Más datos · pedido #${x.number}</button>${!olva && x.guia && x.guia_codigo && EV.data.shalom && open ? `<button class="gmini" data-etrack="${x.id}">Rastrear ahora</button>` : ''}</div>
   </div>${x.guia_qr && window.qrcode ? `<button class="gqr" data-eqr="${e(x.guia_qr)}" aria-label="Ver QR en grande">${qsvg(x.guia_qr)}</button>` : ''}</div>
  </article>`;
}

// Cambios en la tarjeta (ticket, adelanto, producto, promo, colores, tallas, adicionales) → se guardan al toque
async function editCard(x, k, v, i) {
  const c = { producto: mainItems(x)[0]?.producto || '', units: unitsOf(x), extras: extrasOf(x).map((it) => ({ ...it })) };
  let total = x.total || 0;
  const body = {};
  const priceOf = (prod, n) => cfg().productos.find((p) => p.nombre === prod)?.precios?.[n];
  if (k === 't') body.total = Math.max(0, Number(v) || 0);
  else if (k === 'a') body.adelanto = Math.max(0, Number(v) || 0);
  else {
    if (k === 'p') {
      c.producto = v || '';
      c.units = c.units.map(() => ({ color: '', talla: '' }));
      if (!c.units.length && v) c.units = [{ color: '', talla: '' }];
    } else if (k === 'pr' || k === 'mq') {
      const nn = k === 'mq' ? Math.max(5, Math.min(50, Math.round(Number(v)) || 5)) : v === 'M' ? Math.max(5, c.units.length) : Number(v) || 0;
      c.units = Array.from({ length: nn }, (_, j) => c.units[j] || { color: '', talla: '' });
    } else if (k === 'cl' || k === 'tl') c.units[i] = { ...c.units[i], [k === 'cl' ? 'color' : 'talla']: v };
    else if (k === 'clt' || k === 'tlt') {
      const vals = String(v).split(',').map((s) => s.trim());
      c.units = c.units.map((u, j) => ({ ...u, [k === 'clt' ? 'color' : 'talla']: vals[j] || '' }));
    } else if (k === 'xc' || k === 'xt') c.extras[i] = { ...c.extras[i], [k === 'xc' ? 'color' : 'talla']: v };
    else if (k === 'xv') {
      const nv = Math.max(0, Number(v) || 0);
      total = Math.max(0, total - (Number(c.extras[i].precio) || 0) + nv);
      c.extras[i] = { ...c.extras[i], precio: nv };
      body.total = total;
    } else if (k === 'xadd') {
      const ex = cfg().extras.find((xx) => xx.nombre === v);
      c.extras.push({ producto: v, color: '', talla: '', cantidad: 1, precio: ex?.precio || 0 });
      body.total = total + (ex?.precio || 0);
    } else if (k === 'xdel') {
      const it = c.extras[i];
      c.extras.splice(i, 1);
      body.total = Math.max(0, total - (Number(it?.precio) || 0));
    }
    if (['p', 'pr', 'mq'].includes(k)) {
      const z = c.units.length < 5 ? priceOf(c.producto, c.units.length) : undefined;
      if (z !== undefined) body.total = Number(z) + extrasTotal(c.extras);
    }
    if (!c.units.length && !c.extras.length) c.units = [{ color: '', talla: '' }];
    body.items = buildItems(c.producto || 'Producto', c.units, c.extras);
    if (!('total' in body)) body.total = total;
  }
  const r = await act(() => H.api('PATCH', `/pedidos/${x.id}`, body));
  if (r?.pedido) Object.assign(x, { items: r.pedido.items, total: r.pedido.total, adelanto: r.pedido.adelanto });
  const sc = H.$('.content');
  const y = sc?.scrollTop || 0;
  draw();
  if (sc) sc.scrollTop = y;
}

/* ---------- Registro ---------- */
function drawReg() {
  const r = EV.data.envios.filter((x) => REG.includes(x.status)).sort((a, b) => a.created_at - b.created_at);
  const ad = r.reduce((s, x) => s + (x.adelanto || 0), 0);
  const old = r.filter((x) => days(x.created_at) >= 2).length;
  const q = EV.q.toLowerCase().trim();
  const l = r.filter((x) => !q || [x.nombre, x.sede, x.ciudad, x.dni, x.celular, `#${x.number}`].join(' ').toLowerCase().includes(q));
  H.$('#gstot').textContent = `${r.length} agendados sin guía · ${m2(ad)} en adelantos${old ? ` · ${old} con 2+ días` : ''}`;
  H.$('#envtop').innerHTML = `<input type="search" id="envq" class="gsq" placeholder="Buscar nombre, DNI, celular o destino" value="${e(EV.q)}" autocomplete="off" aria-label="Buscar">`;
  const today = EV.data.hoy;
  const it = (x) => {
    const u = unitsOf(x);
    return u.map((k) => [k.color, k.talla].filter(Boolean).join(' ')).filter(Boolean).join(' · ');
  };
  H.$('#envbody').innerHTML = `
    <div class="gcard" style="--sc:#2f6fd0;margin-bottom:10px"><div class="gnm" style="margin-bottom:6px">📋 Pegar formularios</div>
      <textarea id="regIn" rows="3" class="gta" placeholder="Pega aquí el formulario (Ctrl+V). Se agrega solo y el cuadro queda listo para el siguiente."></textarea>
      <div class="gline"><label class="gsmall">Fecha <input type="date" id="regD" value="${e(EV.regD || today)}"></label><button class="gchip" data-ea="regadd">Agregar</button></div>
      ${EV.regOut.length ? `<div class="gmsg">${EV.regOut.map((x, i) => `${x.ok ? '✅' : '⚠️'} ${e(x.text)}${x.dup ? ` <button class="gchip" data-eforce="${i}">Agregar igual</button>` : ''}`).join('<br>')}</div>` : ''}
    </div>
    <div class="gcard" style="--sc:#2e8b57;margin-bottom:10px"><div class="gnm" style="margin-bottom:6px">🎫 Cruzar guía con su pedido</div>
      <div class="gline"><input id="cgC" placeholder="Código (ej. 7KJ9)" maxlength="8" style="width:120px;text-transform:uppercase"><input id="cgD" inputmode="numeric" placeholder="DNI de la guía" style="width:130px"><input id="cgO" inputmode="numeric" placeholder="Nro. orden (opcional)" style="width:160px"><select id="cgK" aria-label="Courier"><option value="shalom">Shalom</option><option value="olva">Olva</option></select><button class="gchip" data-ea="cruzar">Cruzar</button></div>
      <div class="gline"><label class="gchip" style="cursor:pointer">📷 Subir fotos de guías<input type="file" id="cgF" accept="image/*" multiple hidden></label> <small class="gsmall">Shalom u Olva · hasta 10 por vez${EV.data.ia ? '' : ' · falta la clave de la IA'}</small></div>
      ${EV.fotos.length ? `<div class="gline"><b>${EV.fotos.length} foto(s) listas</b> <button class="gchip on" data-ea="leer">▶️ Leer y cruzar</button></div>` : ''}
      ${EV.cruceOut ? `<div class="gmsg">${EV.cruceOut}</div>` : ''}${EV.fotoOut ? `<div class="gmsg">${EV.fotoOut}</div>` : ''}
    </div>
    <div class="gemp" style="padding:0 0 10px;text-align:left">Pedidos ya agendados que todavía no tienen guía. Cuando llega su guía, el pedido pasa a Por cobrar con todos sus datos.</div>
    ${l.length ? l.map((x) => {
      const d = days(x.created_at);
      const ex = extrasOf(x);
      return `<div class="gcard rg${d >= 2 ? ' old' : ''}" style="--sc:#8a8a85">
        <div class="gtop"><span class="gnm">${e(x.nombre || '—')}</span><span class="gdy">${d <= 0 ? 'hoy' : d === 1 ? 'hace 1 día' : `hace ${d} días`}</span></div>
        <div class="gds">${e(x.sede || x.ciudad || '')} · agendado ${dk(x.created_at)}${x.status === 'por_pagar' ? ' · <b style="color:var(--warn)">Yape por validar</b>' : ''}</div>
        <div class="grow">${x.dni ? `<button class="gord2" data-cp="${e(x.dni)}">DNI ${e(x.dni)}</button>` : ''}${cel9(x) ? `<button class="gord2" data-cp="${cel9(x)}">Cel ${cel9(x)}</button>` : ''}${courier(x) === 'olva' ? '<span class="olv">Olva</span>' : ''}
          <span class="grow-sp"></span>${x.status === 'por_pagar' ? `<button class="gmini" data-evalid="${x.id}">✅ Yape validado</button>` : ''}<button class="gmini" data-eedit="${x.id}">Editar</button>${H.owner() ? `<button class="grdl" data-edel="${x.id}">Eliminar</button>` : ''}</div>
        <div class="grgl"><b>${e(mainItems(x)[0]?.producto || 'Sin producto')}${unitsOf(x).length ? ` · por ${unitsOf(x).length}` : ''}</b>${it(x) ? `<br>${e(it(x))}` : ''}${ex.map((q) => `<br>+ ${e(q.producto)} ${e(q.color || '')} ${e(q.talla || '')} (S/ ${Number(q.precio) || 0})`).join('')}</div>
        <div class="gmny"><span>Ticket <b>${x.total ? m2(x.total) : '—'}</b></span><span>Adelanto <b>${m2(x.adelanto)}</b></span><span class="gsal">Saldo: ${x.total ? m2(saldo(x)) : '—'}</span></div></div>`;
    }).join('') : `<div class="gemp">${r.length ? 'Sin resultados' : 'No hay pedidos agendados sin guía'}</div>`}`;
}

/* ---------- Reporte ---------- */
function rng() {
  const t = EV.data.hoy;
  const ms = t.slice(0, 8) + '01';
  if (EV.rp === 'hoy') return [t, t, `Hoy ${fD(t)}`];
  if (EV.rp === 'ayer') {
    const a = addD(t, -1);
    return [a, a, `Ayer ${fD(a)}`];
  }
  if (EV.rp === 'sem') {
    const a = monOf(t);
    return [a, addD(a, 6), `Esta semana (lun ${fD(a)} – dom ${fD(addD(a, 6))})`];
  }
  if (EV.rp === 'semp') {
    const a = addD(monOf(t), -7);
    return [a, addD(a, 6), `Semana pasada (lun ${fD(a)} – dom ${fD(addD(a, 6))})`];
  }
  if (EV.rp === 'mes') return [ms, addD(addD(ms, 32).slice(0, 8) + '01', -1), 'Este mes'];
  if (EV.rp === 'mesp') {
    const end = addD(ms, -1);
    return [end.slice(0, 8) + '01', end, 'Mes pasado'];
  }
  if (EV.rp === 'ran') {
    const a = EV.rd1 || t;
    const b = EV.rd2 || a;
    return a <= b ? [a, b, `Del ${fD(a)} al ${fD(b)}`] : [b, a, `Del ${fD(b)} al ${fD(a)}`];
  }
  return ['0000-00-00', '9999-99-99', 'Todo'];
}
function stat(l) {
  const su = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const op = l.filter(isOpen);
  const rc = l.filter((x) => x.status === 'recogido');
  const pr = l.filter((x) => x.status === 'no_recogido');
  return { n: l.length, ven: su(l.filter((x) => x.status !== 'no_recogido'), (x) => x.total || 0), ade: su(l, (x) => x.adelanto || 0), pc: su(op, saldo), cob: su(rc, saldo), np: op.length, nr: rc.length, nd: pr.length, sinT: l.filter((x) => !x.total).length };
}
function drawRep() {
  H.$('#envtop').innerHTML = '';
  H.$('#gstot').textContent = `Reporte · ${EV.data.envios.filter((x) => !REG.includes(x.status)).length} guías`;
  const all = EV.data.envios;
  const g = all.filter((x) => !REG.includes(x.status));
  const [a, b, lab] = rng();
  const inR = (k) => k >= a && k <= b;
  const l = g.filter((x) => inR(dk(sent(x))));
  const s = stat(l);
  const rg = all.filter((x) => REG.includes(x.status) && inR(dk(x.created_at)));
  const ch = [['hoy', 'Hoy'], ['ayer', 'Ayer'], ['sem', 'Esta semana'], ['semp', 'Semana pasada'], ['mes', 'Este mes'], ['mesp', 'Mes pasado'], ['ran', 'Fechas exactas'], ['all', 'Todo']];
  let h = `<section class="rcard"><h3>Por fechas · según la fecha de envío de la guía</h3>
    <div class="pchips" style="margin:8px 0">${ch.map(([k, t]) => `<button data-erp="${k}" class="${EV.rp === k ? 'on' : ''}">${t}</button>`).join('')}</div>
    ${EV.rp === 'ran' ? `<div class="regrow">Desde <input type="date" data-erpd="1" value="${e(EV.rd1 || EV.data.hoy)}"> hasta <input type="date" data-erpd="2" value="${e(EV.rd2 || EV.rd1 || EV.data.hoy)}"></div>` : ''}
    <p style="margin:4px 0"><b>${e(lab)}</b></p>
    <div class="kp"><div><span>Pedidos enviados</span><b>${s.n}</b></div><div><span>Vendido (tickets, sin devueltos)</span><b>${m2(s.ven)}</b></div><div><span>Adelantos recibidos</span><b>${m2(s.ade)}</b></div><div><span>Por cobrar de estos pedidos</span><b>${m2(s.pc)}</b></div><div><span>Ya cobrado de estos pedidos</span><b>${m2(s.cob)}</b></div><div><span>Abiertos · recogidos · devueltos</span><b>${s.np} · ${s.nr} · ${s.nd}</b></div></div>
    ${s.sinT ? `<p class="note">${s.sinT} guía(s) sin ticket en este periodo: no suman en los montos.</p>` : ''}
    ${rg.length ? `<p class="note">Además, ${rg.length} pedido(s) agendado(s) en este periodo siguen sin guía (Registro), con ${m2(rg.reduce((t, x) => t + (x.adelanto || 0), 0))} de adelantos.</p>` : ''}`;
  const ds = [...new Set(l.map((x) => dk(sent(x))))].sort().reverse();
  if (ds.length > 1 && ds.length <= 62) {
    h += `<h3 style="margin-top:14px">Día por día</h3><div class="tbw"><table class="tb"><tr><th>Día</th><th>Pedidos</th><th>Vendido</th><th>Adelantos</th><th>Por cobrar</th></tr>${ds.map((k) => {
      const t = stat(l.filter((x) => dk(sent(x)) === k));
      return `<tr><td>${wd(k)} ${fD(k)}</td><td>${t.n}</td><td>${m2(t.ven)}</td><td>${m2(t.ade)}</td><td>${m2(t.pc)}</td></tr>`;
    }).join('')}</table></div>`;
  }
  const m0 = monOf(EV.data.hoy);
  h += `<h3 style="margin-top:14px">Últimas 8 semanas (lun–dom)</h3><div class="tbw"><table class="tb"><tr><th>Semana</th><th>Pedidos</th><th>Adelantos</th><th>Por cobrar</th><th>Cobrado</th></tr>${[...Array(8)].map((_, i) => {
    const w = addD(m0, -7 * i);
    const end = addD(w, 6);
    const x = stat(g.filter((y) => {
      const k = dk(sent(y));
      return k >= w && k <= end;
    }));
    return `<tr><td>${fD(w)}–${fD(end)}</td><td>${x.n}</td><td>${m2(x.ade)}</td><td>${m2(x.pc)}</td><td>${m2(x.cob)}</td></tr>`;
  }).join('')}</table></div></section>`;
  // General
  const N = g.length;
  const su = (a, f) => a.reduce((t, x) => t + f(x), 0);
  const rec = g.filter((x) => x.status === 'recogido');
  const pro = g.filter((x) => x.status === 'no_recogido');
  const open = g.filter(isOpen);
  const old = open.filter((x) => days(sent(x)) >= 7);
  const pct = (x, y) => (y ? Math.round((x / y) * 100) + '%' : '—');
  h += `<section class="rcard"><h3>General · ${N} guías</h3>
    <div class="kp"><div><span>Por cobrar (guías sin recoger)</span><b>${m2(su(open, saldo))}</b><small>${open.length} abiertas · ${old.length} con 7+ días</small></div>
    <div><span>Tasa de recojo</span><b>${pct(rec.length, N)}</b><small>${rec.length} de ${N}</small></div>
    <div><span>Devueltos / no recogió</span><b>${pct(pro.length, N)}</b><small>${pro.length} de ${N}</small></div></div>
    <div class="lst"><div><span>Facturación (tickets, sin devueltos)</span><b>${m2(su(g.filter((x) => x.status !== 'no_recogido'), (x) => x.total || 0))}</b></div><div><span>Adelantos recibidos</span><b>${m2(su(g.filter((x) => x.status !== 'no_recogido'), (x) => x.adelanto || 0))}</b></div><div><span>Cobrado al recoger</span><b>${m2(su(rec, saldo))}</b></div><div><span>Adelanto en devueltos</span><b>${m2(su(pro, (x) => x.adelanto || 0))}</b></div></div>
    <div class="lst">${['enviado', 'en_camino', 'en_agencia', 'falta_abonar', 'recogido', 'no_recogido'].map((k) => `<div><span>${ST[k][0]}</span><b>${g.filter((x) => x.status === k).length}</b></div>`).join('')}</div></section>`;
  H.$('#envbody').innerHTML = h;
}

function prodRep(g) {
  const prods = [...new Set(g.flatMap((x) => mainItems(x).map((it) => it.producto)))].filter(Boolean);
  const sel = EV.pf === 'all' ? g : g.filter((x) => mainItems(x).some((it) => it.producto === EV.pf));
  const rows = (r, tot) => (r.length ? r.map(([k, v]) => `<div><span>${e(k)}</span><b>${v}${tot ? ` · ${Math.round((v / tot) * 100)}%` : ''}</b></div>`).join('') : '<div><span>Sin datos todavía</span></div>');
  const pc = {};
  const cc = {};
  const tc = {};
  for (const x of sel) {
    const mi = mainItems(x).filter((it) => EV.pf === 'all' || it.producto === EV.pf);
    const u = mi.reduce((a, it) => a + it.cantidad, 0);
    if (u) pc[u >= 5 ? 'Mayorista (5+)' : `Por ${u}`] = (pc[u >= 5 ? 'Mayorista (5+)' : `Por ${u}`] || 0) + 1;
    for (const it of mi) {
      if (it.color) cc[it.color] = (cc[it.color] || 0) + it.cantidad;
      if (it.talla) tc[it.talla.toUpperCase()] = (tc[it.talla.toUpperCase()] || 0) + it.cantidad;
    }
  }
  const sum = (o) => Object.values(o).reduce((a, v) => a + v, 0);
  const TO = ['XS', 'S', 'M', 'L', 'XL'];
  const srt = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);
  const trow = Object.entries(tc).sort((a, b) => ((TO.indexOf(a[0]) + 99) % 99) - ((TO.indexOf(b[0]) + 99) % 99));
  let h = `<section class="rcard"><h3>Productos (guías enviadas)</h3>
    <div class="pchips" style="margin:8px 0">${[['all', 'Todos'], ...prods.map((p) => [p, p])].map(([k, t]) => `<button data-epf="${e(k)}" class="${EV.pf === k ? 'on' : ''}">${e(t)}</button>`).join('')}</div>
    <div class="repgrid"><div><h4>Promoción</h4><div class="lst">${rows(srt(pc), sum(pc))}</div></div>
    <div><h4>Colores (unidades)</h4><div class="lst">${rows(srt(cc), sum(cc))}</div></div>
    <div><h4>Tallas (unidades)</h4><div class="lst">${rows(trow, sum(tc))}</div></div>`;
  for (const ex of cfg().extras) {
    const L = (x) => x.items.filter((it) => it.producto.toLowerCase() === ex.nombre.toLowerCase());
    const wp = sel.filter((x) => L(x).length);
    const u = sel.reduce((a, x) => a + L(x).reduce((s, it) => s + it.cantidad, 0), 0);
    if (!u) continue;
    const c2 = {};
    for (const x of sel) for (const it of L(x)) if (it.color) c2[it.color] = (c2[it.color] || 0) + it.cantidad;
    h += `<div><h4>Upsell ${e(ex.nombre.toLowerCase())}</h4><div class="lst"><div><span>Pedidos con ${e(ex.nombre.toLowerCase())}</span><b>${wp.length} de ${sel.length} · ${Math.round((wp.length / Math.max(1, sel.length)) * 100)}%</b></div><div><span>Vendidos</span><b>${u}</b></div><div><span>Ingreso aprox. (sin devueltos)</span><b>${m2(sel.filter((x) => x.status !== 'no_recogido').reduce((a, x) => a + L(x).reduce((s, it) => s + it.cantidad, 0), 0) * (ex.precio || 0))}</b></div>${rows(srt(c2), u)}</div></div>`;
  }
  return h + '</div></section>';
}

function drawProd() {
  H.$('#envtop').innerHTML = '';
  const g = EV.data.envios.filter((x) => !REG.includes(x.status));
  H.$('#gstot').textContent = `Provincia · ${g.filter((x) => mainItems(x).length).length} guías clasificadas`;
  H.$('#envbody').innerHTML = prodRep(g);
}

function drawPre() {
  H.$('#envtop').innerHTML = '';
  H.$('#gstot').textContent = 'Precios por promoción';
  H.$('#envbody').innerHTML = `<div class="gemp" style="padding:4px 0 0;text-align:left">Al elegir producto y promo en una guía, el ticket se llena solo con estos precios. El adelanto lo pones a mano.</div>
    ${cfg().productos.map((p, i) => `<div class="h3">${e(p.nombre)} (S/)</div><div class="lst gpre">${[1, 2, 3, 4].map((k) => `<div><span>Por ${k}</span><input type="number" inputmode="decimal" min="0" data-pp2="${i}|${k}" value="${p.precios?.[k] ?? ''}"></div>`).join('')}</div>`).join('')}
    <p class="note">Para agregar productos, colores o tallas: pestaña Ajustes.</p>`;
}

/* ---------- Ajustes (solo dueño) ---------- */
function drawAju() {
  H.$('#envtop').innerHTML = '';
  H.$('#gstot').textContent = 'Ajustes de envíos';
  const c = cfg();
  const prods = c.productos.length ? c.productos : [{ nombre: '', precios: {}, colores: [], tallas: [] }];
  H.$('#envbody').innerHTML = `<div class="ajgrid">
    <section class="rcard"><h3>Productos y precios</h3><p class="note">Sirven para leer los formularios (colores con el nombre que usas) y llenar el ticket solo.</p>
      <div id="ajprods">${prods.map((p, i) => `<div class="ajprod" data-pi="${i}">
        <div class="regrow"><input data-pk="nombre" value="${e(p.nombre)}" placeholder="Nombre del producto" style="flex:1"><button class="iconbtn sm" data-ajdel="${i}" aria-label="Quitar">×</button></div>
        <div class="regrow">${[1, 2, 3, 4].map((k) => `<label class="note">Por ${k} S/<input type="number" min="0" step="0.5" data-pp="${k}" value="${p.precios?.[k] ?? ''}" style="width:76px"></label>`).join('')}</div>
        <div class="regrow"><input data-pk="colores" value="${e((p.colores || []).join(', '))}" placeholder="Colores, separados por coma" style="flex:1"></div>
        <div class="regrow"><input data-pk="tallas" value="${e((p.tallas || []).join(', '))}" placeholder="Tallas, separadas por coma" style="flex:1"></div></div>`).join('')}</div>
      <button class="iconbtn sm" data-ea="ajadd">+ Producto</button></section>
    <section class="rcard"><h3>Adicionales (upsell)</h3><p class="note">Uno por línea: <b>Nombre · precio</b>. Ej.: Polo · 25</p>
      <textarea id="ajext" rows="4">${e(c.extras.map((x) => `${x.nombre} · ${x.precio}`).join('\n'))}</textarea>
      <h3 style="margin-top:14px">Remitentes (para devoluciones)</h3><p class="note">Uno por línea: <b>Nombre · DNI · celular</b>.</p>
      <textarea id="ajrem" rows="3">${e(c.remitentes.map((x) => `${x.nombre} · ${x.dni} · ${x.cel}`).join('\n'))}</textarea>
      <div class="field"><label>Origen (agencia desde donde envías)</label><input id="ajori" value="${e(c.origen || '')}"></div>
      <div class="regrow"><label class="note">Aviso «posible devolución» a los <input type="number" id="ajda" min="3" max="60" value="${c.dias_aviso}" style="width:64px"> días</label><label class="note">«Devolver» a los <input type="number" id="ajdd" min="4" max="90" value="${c.dias_devolver}" style="width:64px"> días</label></div>
      <button class="send" data-ea="ajsave">Guardar ajustes</button></section>
    <section class="rcard"><h3>Respaldo</h3><p class="note">Descarga todos los envíos en Excel (CSV) cuando quieras.</p>
      <button class="iconbtn" data-ea="csv">⬇️ Descargar Excel</button>
      <h3 style="margin-top:14px">Traer datos del artifact «Guías Shalom»</h3><p class="note">Sube el archivo de respaldo del artifact. Se puede repetir: no duplica, solo agrega lo nuevo y actualiza estados.</p>
      <label class="iconbtn">📂 Elegir archivo<input type="file" id="ajimp" accept=".json,.gz,application/json" hidden></label><div id="ajimpout"></div></section>
  </div>`;
}

function readAju() {
  const prods = [...H.$$('.ajprod')].map((d) => ({
    nombre: d.querySelector('[data-pk="nombre"]').value.trim(),
    precios: Object.fromEntries([...d.querySelectorAll('[data-pp]')].filter((i) => i.value).map((i) => [i.dataset.pp, Number(i.value)])),
    colores: d.querySelector('[data-pk="colores"]').value,
    tallas: d.querySelector('[data-pk="tallas"]').value,
  }));
  const lines = (id) => H.$(id).value.split('\n').map((s) => s.split(/\s*[·|;]\s*|\s+-\s+/).map((x) => x.trim())).filter((a) => a[0]);
  return {
    productos: prods,
    extras: lines('#ajext').map(([nombre, precio]) => ({ nombre, precio: Number(String(precio || '').replace(/[^\d.]/g, '')) || 0 })),
    remitentes: lines('#ajrem').map(([nombre, dni, cel], i) => ({ id: cfg().remitentes[i]?.id || `r${i + 1}`, nombre, dni, cel })),
    origen: H.$('#ajori').value,
    dias_aviso: Number(H.$('#ajda').value),
    dias_devolver: Number(H.$('#ajdd').value),
  };
}

function csv() {
  const rows = [['Pedido', 'Estado', 'Courier', 'Nombre', 'DNI', 'Celular', 'Destino', 'Nro. orden', 'Código', 'Productos', 'Ticket', 'Adelanto', 'Saldo', 'Fecha guía', 'Agendado', 'Seguimientos', 'Rastreo Shalom']];
  for (const x of EV.data.envios) {
    rows.push([x.number, ST[x.status]?.[0] || x.status, courier(x), x.nombre, x.dni, x.celular, x.sede || x.ciudad, x.guia, x.guia_codigo,
      x.items.map((it) => `${it.cantidad} ${[it.producto, it.talla, it.color].filter(Boolean).join(' ')}`).join(' + '), x.total, x.adelanto, saldo(x),
      x.enviado_at ? dk(x.enviado_at) : '', dk(x.created_at), (x.seg || []).length, x.guia_estado || '']);
  }
  const txt = '﻿' + rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
  a.download = `envios-${EV.data.hoy}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1000);
}

/* ---------- Ya recogió (ventana) ---------- */
let RC = null;
function openRecogio() {
  closeRC();
  const wrap = document.createElement('div');
  wrap.className = 'pmodal';
  wrap.innerHTML = '<div class="pmbox" role="dialog" aria-modal="true" aria-label="Ya recogió"></div>';
  document.body.appendChild(wrap);
  wrap.addEventListener('mousedown', (ev) => ev.target === wrap && closeRC());
  RC = { wrap, res: [], note: '', text: '' };
  drawRC();
  setTimeout(() => wrap.querySelector('#rcIn')?.focus(), 50);
}
function closeRC() {
  if (RC) RC.wrap.remove();
  RC = null;
}
function drawRC() {
  const nck = RC.res.reduce((s, r) => s + r.items.filter((i) => i.ck).length, 0);
  const box = RC.wrap.querySelector('.pmbox');
  box.innerHTML = `<header class="pmh"><div><h2>✅ Ya recogió</h2><span class="note">Pega los formularios de las que ya recogieron (uno o varios), o solo los códigos de guía, nro. de orden, DNI o celular, uno por línea.</span></div><button class="iconbtn" data-rcx aria-label="Cerrar">✕</button></header>
    <div class="pmbody"><textarea id="rcIn" rows="5" class="notesbox">${e(RC.text)}</textarea>
      <div class="regrow"><button class="iconbtn" data-rcgo>🔍 Buscar guías</button>${nck ? `<button class="send" data-rcok>✅ Marcar ${nck} como recogido</button>` : ''}</div>
      ${RC.note ? `<p><b>${e(RC.note)}</b></p>` : ''}
      ${RC.res.map((r, ri) => (!r.items.length ? `<div class="rcR bad">❌ <b>${e(r.label)}</b><br><small>No encontré ninguna guía con esos datos</small></div>`
        : `<div class="rcR"><b>${e(r.label)}</b> <small class="note">(por ${e(r.how)})</small>${r.items.filter((i) => i.status !== 'recogido').length > 1 ? '<br><small style="color:var(--warn)">⚠️ Hay varias guías: marca la(s) correcta(s)</small>' : ''}
          ${r.items.map((i, ii) => {
            const lab = `${e(i.codigo)} · ${e(i.nombre)} · ${e(i.sede)}${i.total ? ` · S/${i.total}` : ''}`;
            return i.status === 'recogido' ? `<div class="rcok">✔️ ${lab} — <b>ya estaba recogido</b></div>` : `<label class="rcl"><input type="checkbox" data-rck="${ri}|${ii}" ${i.ck ? 'checked' : ''}><span>${lab} <small style="color:${ST[i.status]?.[1]}">(${e(ST[i.status]?.[0] || i.status)})</small></span></label>`;
          }).join('')}</div>`)).join('')}
    </div>`;
  box.onclick = rcClick;
  box.onchange = (ev) => {
    const ck = ev.target.dataset.rck;
    if (!ck) return;
    const [a, b] = ck.split('|').map(Number);
    RC.res[a].items[b].ck = ev.target.checked;
    RC.text = box.querySelector('#rcIn').value;
    drawRC();
  };
}
async function rcClick(ev) {
  const t = ev.target;
  if (t.closest('[data-rcx]')) return closeRC();
  if (t.closest('[data-rcgo]')) {
    RC.text = RC.wrap.querySelector('#rcIn').value;
    try {
      const r = await H.api('POST', `/stores/${H.S.storeId}/envios/buscar`, { text: RC.text });
      RC.res = r.resultados;
      const nf = RC.res.filter((x) => !x.items.length).length;
      RC.note = `Encontré ${RC.res.length - nf} de ${RC.res.length}. Revisa y presiona el botón verde.`;
    } catch (er) {
      RC.note = er.message;
    }
    return drawRC();
  }
  if (t.closest('[data-rcok]')) {
    const ids = RC.res.flatMap((r) => r.items.filter((i) => i.ck).map((i) => i.id));
    t.disabled = true;
    try {
      const r = await H.api('POST', `/stores/${H.S.storeId}/envios/recogido`, { ids });
      RC.res = [];
      RC.text = '';
      RC.note = `✅ Listo: ${r.marcados} marcado(s) como recogido.`;
      load();
    } catch (er) {
      RC.note = er.message;
    }
    drawRC();
  }
}

/* ---------- eventos ---------- */
async function act(fn, okMsg) {
  EV.busy = true;
  try {
    const r = await fn();
    if (okMsg) H.toast(okMsg);
    return r;
  } catch (er) {
    H.toast(er.message, 5000);
    return null;
  } finally {
    EV.busy = false;
  }
}
const patchLocal = (env) => {
  if (!env) return;
  const i = EV.data.envios.findIndex((x) => x.id === env.id);
  if (i >= 0) EV.data.envios[i] = env;
  draw();
};

async function sendForms(text, force = false) {
  if (!text.trim()) return;
  const r = await act(() => H.api('POST', `/stores/${H.S.storeId}/envios/formularios`, { text, fecha: H.$('#regD')?.value || EV.data.hoy, force }));
  if (!r) return;
  EV.regOut = r.resultados.map((x) => ({ ...x }));
  EV.dupForms = r.resultados.map((x) => x.form || null);
  await load();
  setTimeout(() => H.$('#regIn')?.focus(), 30);
}

async function readQRs(files) {
  if (!('BarcodeDetector' in window)) return files.map(() => '');
  try {
    const det = new window.BarcodeDetector({ formats: ['qr_code'] });
    return await Promise.all(files.map(async (f) => {
      try {
        const bmp = await createImageBitmap(f);
        const r = await det.detect(bmp);
        return r[0]?.rawValue || '';
      } catch {
        return '';
      }
    }));
  } catch {
    return files.map(() => '');
  }
}

async function onClick(ev) {
  const t = ev.target;
  const xa = t.closest('[data-xadd]') || t.closest('[data-xdel]');
  if (xa) {
    const add = !!xa.dataset.xadd;
    const [id, v] = (xa.dataset.xadd || xa.dataset.xdel).split('|');
    const x = EV.data.envios.find((y) => y.id === Number(id));
    if (x) return editCard(x, add ? 'xadd' : 'xdel', add ? v : '', add ? 0 : Number(v));
    return;
  }
  const cp = t.closest('[data-cp]');
  if (cp) {
    try {
      await navigator.clipboard.writeText(cp.dataset.cp);
      const o = cp.textContent;
      cp.textContent = 'Copiado ✓';
      setTimeout(() => (cp.textContent = o), 900);
    } catch {
      H.toast('No se pudo copiar');
    }
    return;
  }
  const tb = t.closest('[data-et]');
  if (tb) return (EV.tab = tb.dataset.et, EV.shown = 60, EV.q = '', draw(), H.$('.content')?.scrollTo(0, 0));
  const f = t.closest('[data-ef]');
  if (f) return (EV.f = f.dataset.ef, EV.shown = 60, draw());
  const cf = t.closest('[data-ecf]');
  if (cf) return (EV.cf = cf.dataset.ecf, draw());
  const cu = t.closest('[data-ecu]');
  if (cu) return (EV.cu = cu.dataset.ecu, draw());
  if (t.closest('[data-emore]')) return (EV.shown += 60, draw());
  const rp = t.closest('[data-erp]');
  if (rp) return (EV.rp = rp.dataset.erp, draw());
  const pf = t.closest('[data-epf]');
  if (pf) return (EV.pf = pf.dataset.epf, draw());
  const qr = t.closest('[data-eqr]');
  if (qr) {
    const ov = document.createElement('div');
    ov.className = 'pmodal';
    ov.innerHTML = `<div class="qrbig">${qsvg(qr.dataset.eqr)}<p class="note">Toca para cerrar</p></div>`;
    ov.onclick = () => ov.remove();
    document.body.appendChild(ov);
    return;
  }
  const ea = t.closest('[data-ea]')?.dataset.ea;
  if (ea === 'registrar') {
    EV.tab = 'reg';
    draw();
    return setTimeout(() => {
      const el = H.$('#regIn');
      el?.scrollIntoView({ block: 'center' });
      el?.focus();
    }, 60);
  }
  if (ea === 'recogio') return openRecogio();
  if (ea === 'regadd') return sendForms(H.$('#regIn').value);
  if (ea === 'cruzar') {
    const r = await act(() => H.api('POST', `/stores/${H.S.storeId}/envios/cruzar`, { codigo: H.$('#cgC').value, dni: H.$('#cgD').value, orden: H.$('#cgO').value, courier: H.$('#cgK').value }));
    if (!r) return;
    EV.cruceOut = `${r.ok ? '✅' : '⚠️'} ${e(r.text)}`;
    if (r.ok) await load();
    else draw();
    return;
  }
  if (ea === 'leer') {
    const files = EV.fotos;
    EV.fotoOut = `⏳ Leyendo ${files.length} foto(s)… <span class="spin"></span>`;
    draw();
    const qrs = await readQRs(files);
    const fd = new FormData();
    files.forEach((fl, i) => {
      fd.append('fotos', fl);
      if (qrs[i]) fd.append(`qr${i}`, qrs[i]);
    });
    EV.fotos = [];
    const r = await act(() => H.api('POST', `/stores/${H.S.storeId}/envios/fotos`, fd));
    EV.fotoOut = r ? r.resultados.map((x) => `${x.ok ? '✅' : '⚠️'} ${e(x.text)}`).join('<br>') + `<br><b>Listo: ${files.length} foto(s).</b>` : '';
    await load();
    return;
  }
  if (ea === 'ajadd') {
    const c = readAju();
    EV.data.cfg = { ...cfg(), ...c, productos: [...c.productos, { nombre: '', precios: {}, colores: [], tallas: [] }] };
    return draw();
  }
  if (ea === 'ajsave') {
    const r = await act(() => H.api('PATCH', `/stores/${H.S.storeId}/envios-config`, readAju()), 'Ajustes guardados');
    if (r) EV.data.cfg = { ...cfg(), ...r.cfg };
    return draw();
  }
  if (ea === 'csv') return csv();
  const ad = t.closest('[data-ajdel]');
  if (ad) {
    const c = readAju();
    c.productos.splice(Number(ad.dataset.ajdel), 1);
    EV.data.cfg = { ...cfg(), ...c };
    return draw();
  }
  const fo = t.closest('[data-eforce]');
  if (fo) {
    const form = EV.dupForms[Number(fo.dataset.eforce)];
    if (form) return sendForms(form, true);
    return;
  }
  const ed = t.closest('[data-eedit]');
  if (ed) return openPedido({ id: Number(ed.dataset.eedit), onSaved: () => load() });
  const ch = t.closest('[data-echat]');
  if (ch) return H.goChat(Number(ch.dataset.echat));
  const tr = t.closest('[data-etrack]');
  if (tr) {
    tr.disabled = true;
    const r = await act(() => H.api('POST', `/pedidos/${tr.dataset.etrack}/rastrear`));
    if (r) H.toast(r.ok ? `Shalom: ${r.summary?.estado || 'revisado'}` : r.error || 'No se pudo rastrear', 5000);
    return load();
  }
  const sg = t.closest('[data-eseg]');
  if (sg) {
    const [id, op] = sg.dataset.eseg.split('|');
    const r = await act(() => H.api('POST', `/pedidos/${id}/envio`, { accion: op === 'add' ? 'seg_add' : 'seg_pop' }));
    return patchLocal(r?.envio);
  }
  const nq = t.closest('[data-enq]');
  if (nq) {
    const r = await act(() => H.api('POST', `/pedidos/${nq.dataset.enq}/envio`, { accion: 'no_quiere' }));
    return patchLocal(r?.envio);
  }
  const va = t.closest('[data-evalid]');
  if (va) {
    const r = await act(() => H.api('POST', `/pedidos/${va.dataset.evalid}/envio-estado`, { status: 'validado' }), 'Adelanto validado');
    return patchLocal(r?.envio);
  }
  const del = t.closest('[data-edel]');
  if (del) {
    const x = EV.data.envios.find((y) => y.id === Number(del.dataset.edel));
    if (!x || !confirm(`¿Eliminar el registro de ${x.nombre}? No se puede deshacer.`)) return;
    const r = await act(() => H.api('DELETE', `/pedidos/${x.id}`), 'Registro eliminado');
    if (r) load();
  }
}

async function onChange(ev) {
  const t = ev.target;
  if (t.dataset.k && t.dataset.id) {
    const x = EV.data.envios.find((y) => y.id === Number(t.dataset.id));
    if (x) return editCard(x, t.dataset.k, t.value, Number(t.dataset.i));
    return;
  }
  if (t.dataset.pp2) {
    const [i, k] = t.dataset.pp2.split('|');
    const prods = cfg().productos.map((p) => ({ ...p, precios: { ...(p.precios || {}) } }));
    if (t.value === '') delete prods[i].precios[k];
    else prods[i].precios[k] = Math.max(0, Number(t.value));
    const r = await act(() => H.api('PATCH', `/stores/${H.S.storeId}/envios-config`, { productos: prods }), 'Precio guardado');
    if (r) EV.data.cfg = { ...cfg(), ...r.cfg };
    return;
  }
  if (t.dataset.est) {
    const r = await act(() => H.api('POST', `/pedidos/${t.dataset.est}/envio-estado`, { status: t.value }), 'Estado guardado');
    return r ? patchLocal(r.envio) : draw();
  }
  if (t.dataset.erem) {
    const r = await act(() => H.api('POST', `/pedidos/${t.dataset.erem}/envio`, { accion: 'rem', rem: t.value }));
    return patchLocal(r?.envio);
  }
  if (t.dataset.edato) {
    const [id, k] = t.dataset.edato.split('|');
    if (!t.value.trim()) return;
    const r = await act(() => H.api('POST', `/pedidos/${id}/envio`, { accion: 'datos', [k]: t.value }), 'Guardado');
    return patchLocal(r?.envio);
  }
  if (t.dataset.erpd) {
    if (t.dataset.erpd === '1') {
      EV.rd1 = t.value;
      if (EV.rd2 && EV.rd2 < EV.rd1) EV.rd2 = EV.rd1;
    } else EV.rd2 = t.value;
    return draw();
  }
  if (t.id === 'regD') EV.regD = t.value;
  if (t.id === 'cgF' && t.files?.length) {
    EV.fotos = [...t.files].slice(0, 10);
    EV.fotoOut = t.files.length > 10 ? 'Solo se tomarán las primeras 10 fotos.' : '';
    return draw();
  }
  if (t.id === 'ajimp' && t.files?.[0]) {
    const out = H.$('#ajimpout');
    out.innerHTML = '<p class="note">Subiendo… <span class="spin"></span></p>';
    try {
      const f = t.files[0];
      let data;
      if (/\.gz$/i.test(f.name)) {
        const bin = new Uint8Array(await f.arrayBuffer());
        let s = '';
        for (let i = 0; i < bin.length; i += 0x8000) s += String.fromCharCode(...bin.subarray(i, i + 0x8000));
        data = { gz: btoa(s) };
      } else data = JSON.parse(await f.text());
      const r = await H.api('POST', `/stores/${H.S.storeId}/envios/importar`, data);
      out.innerHTML = `<div class="okbox">Listo: ${r.guias} guías y ${r.registro} del Registro nuevas · ${r.actualizados} estados actualizados${r.con_chat ? ` · ${r.con_chat} unidas a su chat` : ''}.</div>`;
      load();
    } catch (er) {
      out.innerHTML = `<div class="err">${e(er.message)}</div>`;
    }
  }
}

function onPaste(ev) {
  if (ev.target.id !== 'regIn') return;
  const txt = (ev.clipboardData || window.clipboardData)?.getData('text');
  if (!txt) return;
  ev.preventDefault();
  sendForms(txt);
}

let qt;
function onInput(ev) {
  if (ev.target.id !== 'envq') return;
  clearTimeout(qt);
  qt = setTimeout(() => {
    EV.q = ev.target.value;
    EV.shown = 60;
    const pos = ev.target.selectionStart;
    draw();
    const el = H.$('#envq');
    if (el) {
      el.focus();
      el.setSelectionRange(pos, pos);
    }
  }, 250);
}
