// Control Total — app web (bandeja de WhatsApp, etiquetas, configuración)
import { webmOpusToOgg, toOggOpus } from './ogg.js';
import { initBot, renderBotTab, renderAvisos, botFicha, botDirty, resetBot } from './bot.js';
import { initClientes, renderClientes, resetClientes, openCliente } from './clientes.js';
import { initReportes, renderReportes, resetReportes } from './reportes.js';

// Marca: C y T (la T en rosado). Sin fondo: el fondo lo pone el contenedor.
const LOGO = '<img src="/logo-mark.png" alt="" width="128" height="128">';
import { initPedidos, renderPedidos, resetPedidos, fichaPedidos, renderPedidosConfig } from './pedidos.js';
import { initEnvios, renderEnvios, resetEnvios } from './envios.js';
import { initAsistente, renderAsistente, resetAsistente, rubroPicker } from './asistente.js';
import { initCarritos, renderCarritos, resetCarritos } from './carritos.js';
import { initPanel, renderMiPlan, renderPaywall, renderPanel } from './panel.js';

/* =================== Utilidades =================== */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const H = 3600e3;
const isTouch = matchMedia('(pointer:coarse)').matches;

const ICON = {
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2.4 11h10.2L20 8H6.2"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/></svg>',
  truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6h11v10H2z"/><path d="M13 9h4l4 4v3h-8"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  img: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>',
  clip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11l-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" width="15" height="15"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M4 5h16l-6 8v5l-4 2v-7z"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" width="18" height="18"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
};
const AVC = ['#7A1F35', '#2D5BA8', '#1E7A4C', '#A35F00', '#6B4FA3', '#B0413E', '#2F7F86', '#8A5A2B'];
const STORE_COLORS = ['#7A1F35', '#2D5BA8', '#1E7A4C', '#A35F00', '#6B4FA3', '#B0413E', '#2F7F86', '#1F1A1D'];
const LABEL_COLORS = [['--t-grey', 'Gris'], ['--t-yellow', 'Amarillo'], ['--t-orange', 'Naranja'], ['--t-green', 'Verde'], ['--t-blue', 'Azul'], ['--t-wine', 'Vino'], ['--bad', 'Rojo'], ['--t-purple', 'Morado'], ['--t-teal', 'Turquesa']];

function toast(msg, ms = 3400) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

async function copy(text, okMsg = 'Copiado') {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMsg);
  } catch {
    prompt('Copia este texto:', text);
  }
}

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (t) => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
function listTime(t) {
  if (!t) return '';
  const d = new Date(t);
  const n = new Date();
  if (sameDay(d, n)) return hhmm(t);
  const y = new Date(n);
  y.setDate(n.getDate() - 1);
  if (sameDay(d, y)) return 'Ayer';
  if (n - d < 6 * 864e5) return d.toLocaleDateString('es-PE', { weekday: 'short' });
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function dayLabel(t) {
  const d = new Date(t);
  const n = new Date();
  if (sameDay(d, n)) return 'Hoy';
  const y = new Date(n);
  y.setDate(n.getDate() - 1);
  if (sameDay(d, y)) return 'Ayer';
  return d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() !== n.getFullYear() ? 'numeric' : undefined });
}
function ago(t) {
  if (!t) return 'nunca';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'hace unos segundos';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return new Date(t).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
}
function fmtPhone(wa) {
  const d = String(wa || '').replace(/\D/g, '');
  if (d.startsWith('51') && d.length === 11) return `+51 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  return d ? '+' + d : '';
}
const chatName = (c) => c.name || c.profile_name || fmtPhone(c.wa_id);
function initials(n) {
  const w = String(n || '?').replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '#';
  if (/^\d/.test(w[0])) return w[w.length - 1].slice(-2);
  return w.slice(0, 2).map((x) => x[0]).join('').toUpperCase();
}
const avColor = (id) => AVC[id % AVC.length];
const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

/* =================== API =================== */
async function api(method, path, data) {
  const o = { method, headers: { 'x-crm': '1' }, credentials: 'same-origin' };
  if (data instanceof FormData) o.body = data;
  else if (data !== undefined) {
    o.headers['content-type'] = 'application/json';
    o.body = JSON.stringify(data);
  }
  let res;
  try {
    res = await fetch('/api' + path, o);
  } catch {
    const e = new Error('Sin conexión a internet. Revisa tu red.');
    e.offline = true;
    throw e;
  }
  let j = {};
  try {
    j = await res.json();
  } catch {}
  if (!res.ok) {
    const e = new Error(j.error || `Error ${res.status}`);
    e.status = res.status;
    e.data = j;
    if (res.status === 401 && S.me && !path.startsWith('/login')) loggedOut();
    throw e;
  }
  return j;
}

function uploadWithProgress(path, form, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', '/api' + path);
    x.setRequestHeader('x-crm', '1');
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () => {
      let j = {};
      try {
        j = JSON.parse(x.responseText);
      } catch {}
      if (x.status >= 200 && x.status < 300) resolve(j);
      else {
        const e = new Error(j.error || `Error ${x.status}`);
        e.status = x.status;
        e.data = j;
        reject(e);
      }
    };
    x.onerror = () => reject(new Error('Sin conexión a internet. Revisa tu red.'));
    x.send(form);
  });
}

/* =================== Estado =================== */
const S = {
  me: null,
  storeId: null,
  view: 'chats',
  chats: new Map(),
  chatCursor: 0,
  chatsMore: false,
  chatsLoading: false,
  labels: [],
  filter: 'todos',
  tagf: [],
  q: '',
  tagMenu: false,
  openId: null,
  ficha: window.innerWidth > 1180,
  msgs: new Map(),
  drafts: new Map(),
  replyTo: null,
  rec: null,
  storeMenu: false,
  cfgTab: null,
  revs: {},
  unread: {},
  avisos: {},
  calls: [],
  callsOpen: false,
  lastUnreadTotal: null,
  health: null,
  team: null,
};
const store = () => S.me?.stores.find((s) => s.id === S.storeId);
const role = () => store()?.role;
const owner = () => role() === 'dueno';
const canChats = () => role() === 'dueno' || role() === 'asesora';
const company = (id) => S.me.companies.find((c) => c.id === id);
const labelById = (id) => S.labels.find((l) => l.id === id);
const pref = {
  get(k, d) {
    try {
      return JSON.parse(localStorage.getItem('scrm:' + k)) ?? d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('scrm:' + k, JSON.stringify(v));
    } catch {}
  },
};

function tagHTML(l) {
  if (!l) return '';
  return `<span class="tag${l.auto ? ' sys' : ''}" style="--tc:var(${esc(l.color)})"><i></i>${esc(l.name)}</span>`;
}

/* =================== Arranque y pantallas de acceso =================== */
const root = () => $('#app');

async function boot() {
  const path = location.pathname;
  const inv = path.match(/^\/invitacion\/([\w-]+)/);
  const rst = path.match(/^\/clave\/([\w-]+)/);
  if (inv) return showInvite(inv[1]);
  if (rst) return showReset(rst[1]);
  if (path === '/registro') return showRegister();
  let st;
  try {
    st = await api('GET', '/state');
  } catch (e) {
    return authShell(`<h1>Sin conexión</h1><p>${esc(e.message)}</p><button class="send" onclick="location.reload()">Reintentar</button>`);
  }
  if (st.setup) return showSetup(st);
  if (st.login) {
    // Visitante nuevo en la web (no en la app instalada) → página pública
    const app = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (path === '/' && !app && !location.search.includes('login')) return location.replace('/inicio');
    return showLogin(null, st);
  }
  if (path === '/entrar') history.replaceState(null, '', '/');
  startApp(st);
}

function authShell(inner) {
  document.body.classList.add('auth-mode');
  root().className = 'bootx';
  root().innerHTML = `<div class="authx">
    <section class="authbrand">
      <div class="ab-top"><span class="ab-mark">${LOGO}</span><b>Control Total</b></div>
      <div class="ab-copy">
        <span class="ab-kicker">Para marcas de ropa que venden por WhatsApp</span>
        <h2>El sistema para vender ropa por WhatsApp.</h2>
        <p>Bandeja, bot con IA, etiquetas, llamadas y pedidos en un solo lugar. Creado por una marca que vende así todos los días.</p>
        <ul class="ab-list">
          <li>Reconoce tallas y colores sin gastar en IA</li>
          <li>IA Suyon conversa, toma los datos y pasa a tu asesora</li>
          <li>Seguimientos automáticos dentro de la ventana gratis</li>
          <li>Lima y provincia: Yape, Shalom y llamadas pendientes</li>
        </ul>
      </div>
      <div class="ab-demo" aria-hidden="true">
        <div class="abm in">Hola, ¿qué talla tienen? Uso 30 de jean</div>
        <div class="abm out"><span>Bot</span>¡Te queda la <b>S</b>! 😍 Estos son tus colores 👇</div>
        <div class="abtags"><i style="--c:#4A74D9">Talla S</i><i style="--c:#2E9E5E">ANUNCIO</i></div>
        <div class="abm out ia"><span>IA Suyon</span>Llevando 3 te sale a S/58.33 c/u 🔥 ¿A qué distrito te lo enviamos?</div>
      </div>
      <footer class="ab-foot">Hecho en Perú · Con la API oficial de WhatsApp</footer>
    </section>
    <section class="authside"><div class="auth">${inner}</div></section>
  </div>`;
}

function formHandler(form, fn) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    const errEl = form.querySelector('.err');
    errEl.hidden = true;
    btn.disabled = true;
    try {
      await fn(Object.fromEntries(new FormData(form)));
    } catch (er) {
      errEl.textContent = er.message;
      errEl.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });
}

function showSetup(st) {
  authShell(`<h1>Bienvenido a Control Total</h1>
    <p>Crea la cuenta del dueño. Esto se hace una sola vez.</p>
    ${st.code_set ? '' : '<div class="err">Falta poner la clave de inicio (SETUP_CODE) en Cloudflare. Sigue los pasos de la guía y recarga esta página.</div>'}
    <form id="f" class="grid" style="gap:12px">
      <div class="field"><label for="code">Clave de inicio</label><input id="code" name="code" required autocomplete="off"><span class="note">La clave que inventaste y pusiste en Cloudflare (el valor de SETUP_CODE, no el nombre).</span></div>
      <div class="field"><label for="company">Nombre de tu empresa</label><input id="company" name="company" required placeholder="Ej: Mi Marca"></div>
      <div class="field"><label for="name">Tu nombre</label><input id="name" name="name" required autocomplete="name"></div>
      <div class="field"><label for="email">Tu correo</label><input id="email" name="email" type="email" required autocomplete="email"></div>
      <div class="field"><label for="pw">Contraseña (mínimo 8)</label><input id="pw" name="password" type="password" minlength="8" required autocomplete="new-password"></div>
      <div class="err" hidden></div>
      <button class="send" type="submit">Crear cuenta</button>
    </form>`);
  formHandler($('#f'), async (d) => startApp(await api('POST', '/setup', d)));
}

async function showRegister() {
  let info = { open: false, trial_days: 15 };
  try {
    info = await api('GET', '/registro');
  } catch {}
  if (!info.open) {
    authShell('<h1>Registro cerrado</h1><p>Por ahora se entra con invitación. Pídesela a quien te recomendó Control Total.</p><button class="send" id="go">Ya tengo cuenta</button>');
    $('#go').onclick = () => {
      history.replaceState(null, '', '/');
      showLogin();
    };
    return;
  }
  const cur = 'S/';
  authShell(`<div class="auth-h"><h1>Prueba gratis ${info.trial_days} días</h1><p>Sin tarjeta. Después, ${cur}${info.base} al mes con 1 número de WhatsApp y 1 trabajadora (+${cur}${info.per_number} al mes por cada número o trabajadora extra). Más barato si pagas 3, 6 o 12 meses.</p></div>
    <form id="f" class="grid" style="gap:12px">
      <div class="field"><label for="company">Nombre de tu marca o tienda</label><input id="company" name="company" required autocomplete="organization"></div>
      <div class="field"><label for="name">Tu nombre</label><input id="name" name="name" required autocomplete="name"></div>
      <div class="field"><label for="phone">Tu WhatsApp</label><input id="phone" name="phone" inputmode="tel" autocomplete="tel" placeholder="9xx xxx xxx"></div>
      <div class="field"><label for="email">Tu correo</label><input id="email" name="email" type="email" required autocomplete="email"></div>
      <div class="field"><label for="pw">Contraseña (mínimo 8)</label><input id="pw" name="password" type="password" minlength="8" required autocomplete="new-password"></div>
      <div class="field"><label>¿Cómo vendes?</label>${canalPicker('mensajes')}</div>
      <div class="field"><label>¿Qué vendes?</label>${rubroPicker('ropa')}</div>
      <input name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;opacity:0">
      <div class="err" hidden></div>
      <button class="send" type="submit">Crear mi cuenta gratis</button>
    </form>
    <button class="link" id="haveacc">Ya tengo cuenta</button>`);
  formHandler($('#f'), async (d) => {
    await api('POST', '/registro', d);
    history.replaceState(null, '', '/');
    startApp(await api('GET', '/state'));
  });
  $('#haveacc').onclick = () => {
    history.replaceState(null, '', '/');
    showLogin();
  };
}

function showLogin(msg, st) {
  authShell(`<div class="auth-h"><h1>Bienvenido de vuelta</h1><p>Entra con tu correo y contraseña.</p></div>
    ${msg ? `<div class="okmsg">${esc(msg)}</div>` : ''}
    <form id="f" class="grid" style="gap:12px">
      <div class="field"><label for="email">Correo</label><input id="email" name="email" type="email" required autocomplete="email" autofocus></div>
      <div class="field"><label for="pw">Contraseña</label><input id="pw" name="password" type="password" required autocomplete="current-password"></div>
      <div class="err" hidden></div>
      <button class="send" type="submit">Entrar</button>
    </form>
    <button class="link" id="forgot">Olvidé mi contraseña</button>
    ${st?.signup_open ? `<p class="note" style="margin:0;text-align:center">¿Nuevo en Control Total? <a href="/registro" id="toreg">Crea tu cuenta gratis · ${st.trial_days} días</a></p>` : ''}`);
  formHandler($('#f'), async (d) => startApp(await api('POST', '/login', d)));
  $('#forgot').onclick = () => showRecover(st);
  const tr = $('#toreg');
  if (tr)
    tr.onclick = (ev) => {
      ev.preventDefault();
      history.pushState(null, '', '/registro');
      showRegister();
    };
}

// Confirmar el correo con el código de 6 números (solo si el correo está configurado)
function showVerify(me) {
  authShell(`<div class="auth-h"><h1>Confirma tu correo</h1><p>Te mandamos un código de 6 números a <b>${esc(me.user.email)}</b>. Revisa también la carpeta de spam o promociones.</p></div>
    <form id="f" class="grid" style="gap:12px">
      <div class="field"><label for="code">Código</label><input id="code" name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required class="mono" style="font-size:22px;letter-spacing:6px;text-align:center"></div>
      <div class="err" hidden></div>
      <button class="send" type="submit">Confirmar</button>
    </form>
    <button class="link" id="resend">Mandarme otro código</button>
    <button class="link" id="out">Salir</button>`);
  $('#code').focus();
  formHandler($('#f'), async (d) => startApp(await api('POST', '/correo/verificar', d)));
  $('#resend').onclick = async () => {
    try {
      await api('POST', '/correo/codigo');
      toast('Te mandamos otro código');
    } catch (e) {
      toast(e.message, 5000);
    }
  };
  $('#out').onclick = async () => {
    await api('POST', '/logout').catch(() => {});
    location.href = '/entrar';
  };
}

function showRecover(st) {
  const n = String(st?.soporte || '').replace(/\D/g, '');
  const wa = n ? `<a class="send" style="text-align:center;text-decoration:none" href="https://wa.me/${n}?text=${encodeURIComponent('Hola, olvidé mi contraseña de Control Total. Mi correo es: ')}" target="_blank" rel="noopener">Pedir mi enlace por WhatsApp</a>` : '';
  authShell(`<h1>Recuperar acceso</h1>
    ${st?.correo ? `<form id="rf" class="grid" style="gap:12px"><p style="margin:0">Escribe tu correo y te mandamos un enlace para poner una contraseña nueva.</p>
      <div class="field"><label for="rmail">Tu correo</label><input id="rmail" name="email" type="email" required autocomplete="email"></div>
      <div class="err" hidden></div><button class="send" type="submit">Mandarme el enlace</button></form>
      <p class="note">¿No te llega? ${n ? `<a href="https://wa.me/${n}" target="_blank" rel="noopener">Escríbenos por WhatsApp</a>` : 'Escríbenos'}.</p>` : `<p>Si eres <b>dueño de una tienda</b>: escríbenos por WhatsApp con tu correo y te mandamos un enlace para poner una contraseña nueva.</p>
    ${wa}`}
    <p>Si eres <b>asesora o despacho</b>: pide al dueño de tu tienda que te genere el enlace (Configuración → Equipo).</p>
    <details><summary class="note" style="cursor:pointer">Soy el administrador de Control Total</summary>
    <form id="f" class="grid" style="gap:12px;margin-top:10px">
      <div class="field"><label for="code">Clave de inicio</label><input id="code" name="code" required autocomplete="off"></div>
      <div class="field"><label for="email">Tu correo</label><input id="email" name="email" type="email" required></div>
      <div class="field"><label for="pw">Nueva contraseña (mínimo 8)</label><input id="pw" name="password" type="password" minlength="8" required autocomplete="new-password"></div>
      <div class="err" hidden></div>
      <button class="send" type="submit">Cambiar y entrar</button>
    </form></details>
    <button class="link" id="back">← Volver</button>`);
  formHandler($('#f'), async (d) => startApp(await api('POST', '/recover', d)));
  const rf = $('#rf');
  if (rf) formHandler(rf, async (d) => {
    await api('POST', '/correo/clave', d);
    rf.innerHTML = '<div class="okmsg">Listo: si ese correo tiene cuenta, te llegó un enlace. Revisa también spam o promociones.</div>';
  });
  $('#back').onclick = () => showLogin(null, st);
}

async function showInvite(token) {
  let inv;
  try {
    inv = await api('GET', `/invites/${token}`);
  } catch (e) {
    authShell(`<h1>Invitación no válida</h1><p>${esc(e.message)}</p><button class="send" id="go">Ir a entrar</button>`);
    $('#go').onclick = () => {
      history.replaceState(null, '', '/');
      boot();
    };
    return;
  }
  authShell(`<h1>Te invitaron a ${esc(inv.company)}</h1>
    <p>Entrarás como <b>${esc(inv.role)}</b> con el correo <b>${esc(inv.email)}</b>.</p>
    <form id="f" class="grid" style="gap:12px">
      ${inv.has_account
        ? '<div class="field"><label for="pw">Tu contraseña de siempre</label><input id="pw" name="password" type="password" required autocomplete="current-password"></div>'
        : `<div class="field"><label for="name">Tu nombre</label><input id="name" name="name" required autocomplete="name"></div>
           <div class="field"><label for="pw">Crea tu contraseña (mínimo 8)</label><input id="pw" name="password" type="password" minlength="8" required autocomplete="new-password"></div>`}
      <div class="err" hidden></div>
      <button class="send" type="submit">Aceptar y entrar</button>
    </form>`);
  formHandler($('#f'), async (d) => {
    const me = await api('POST', `/invites/${token}/accept`, d);
    history.replaceState(null, '', '/');
    startApp(me);
  });
}

async function showReset(token) {
  let r;
  try {
    r = await api('GET', `/resets/${token}`);
  } catch (e) {
    authShell(`<h1>Enlace no válido</h1><p>${esc(e.message)}</p><button class="send" id="go">Ir a entrar</button>`);
    $('#go').onclick = () => {
      history.replaceState(null, '', '/');
      boot();
    };
    return;
  }
  authShell(`<h1>Nueva contraseña</h1><p>Para ${esc(r.name)} (${esc(r.email)})</p>
    <form id="f" class="grid" style="gap:12px">
      <div class="field"><label for="pw">Nueva contraseña (mínimo 8)</label><input id="pw" name="password" type="password" minlength="8" required autocomplete="new-password"></div>
      <div class="err" hidden></div>
      <button class="send" type="submit">Guardar y entrar</button>
    </form>`);
  formHandler($('#f'), async (d) => {
    const me = await api('POST', `/resets/${token}`, d);
    history.replaceState(null, '', '/');
    startApp(me);
  });
}

function loggedOut() {
  S.me = null;
  stopPolling();
  showLogin('Tu sesión terminó. Vuelve a entrar.');
}

/* =================== App principal =================== */
function startApp(me) {
  if (location.pathname === '/entrar') history.replaceState(null, '', '/');
  if (me?.user && me.user.email_ok === false) return showVerify(me);
  document.body.classList.remove('auth-mode');
  root().className = 'app';
  setMe(me);
  const saved = pref.get('store');
  S.storeId = me.stores.some((s) => s.id === saved) ? saved : me.stores[0]?.id ?? null;
  S.view = !store() || canChats() ? 'chats' : 'pedidos';
  enterStore();
  startPolling();
}

function setMe(me) {
  // «Ver como» (solo admin): cambia cómo se VE la tienda (mensajes/Shopify, ropa/sin variantes) sin tocar la tienda real
  for (const st of me.stores) {
    st._real = { canal: st.canal, rubro: st.rubro };
    if (S.preview && me.user.is_admin) Object.assign(st, S.preview);
  }
  S.me = me;
  for (const s of me.stores) if (S.revs[s.id] === undefined) S.revs[s.id] = s.rev;
}

function enterStore() {
  S.chats = new Map();
  S.msgs = new Map();
  S.openId = null;
  S.replyTo = null;
  S.tagf = [];
  S.q = '';
  S.chatCursor = 0;
  S.labels = [];
  S.health = null;
  S.team = null;
  S.connSteps = null;
  resetBot();
  resetClientes();
  resetReportes();
  resetPedidos();
  resetEnvios();
  resetCarritos();
  if (S.storeId) pref.set('store', S.storeId);
  if (S.view === 'chats' && store() && !canChats()) S.view = 'pedidos';
  render();
  S.calls = [];
  S.callsOpen = false;
  if (S.storeId && canChats() && !planBlocked()) {
    loadLabels();
    loadChats();
    loadCalls();
  }
}

async function loadLabels() {
  try {
    const r = await api('GET', `/stores/${S.storeId}/labels`);
    S.labels = r.labels;
    if (S.view === 'chats') {
      renderListHead();
      renderItems();
      renderFicha();
      renderTagbar();
    } else if (S.view === 'config') renderConfig();
  } catch {}
}

/* ---------- Esqueleto ---------- */
// Empresa de la tienda elegida (o la primera donde es dueño)
function currentCompany() {
  const st = store();
  const cos = S.me?.companies || [];
  return cos.find((c) => c.id === st?.company_id) || cos.find((c) => c.role === 'dueno') || cos[0] || null;
}

function planBlocked() {
  return !!currentCompany()?.plan?.blocked;
}

function navItems() {
  const items = [];
  if (canChats() || !store()) items.push(['chats', 'Chats', ICON.chat, S.unread[S.storeId] || 0]);
  if (store() && canChats()) items.push(['clientes', 'Clientes', ICON.users, 0]);
  if (store()) items.push(['pedidos', 'Pedidos', ICON.box, 0]);
  if (store()?.canal === 'shopify' && canChats()) items.push(['carritos', 'Carritos', ICON.cart, 0]);
  if (store()) items.push(['envios', 'Envíos', ICON.truck, 0]);
  if (store() && canChats()) items.push(['avisos', 'Avisos', ICON.bell, S.avisos[S.storeId] || 0]);
  if (owner() || (!S.me.stores.length && S.me.companies.some((c) => c.role === 'dueno'))) items.push(['config', 'Configuración', ICON.gear, 0]);
  else items.push(['config', 'Mi cuenta', ICON.user, 0]);
  if (store() && canChats()) items.push(['reportes', 'Reportes', ICON.chart, 0]);
  if (S.me.user.is_admin) items.push(['panel', 'Panel Suyon', ICON.users, S.me.demos_nuevas || 0]);
  if (planBlocked()) return items.filter(([v]) => ['config', 'panel'].includes(v));
  return items;
}

// Asistente de inicio: tienda nueva (setup = 1) o abierto desde Bot Suyon AI
function asisOn() {
  const st = store();
  return !!st && owner() && !planBlocked() && (S.asis || st.setup === 1);
}

function renderAsis() {
  const st = store();
  if (S.view === 'asis' && root().querySelector('.asis') && S.asisStore === st.id) return; // ya está en pantalla: no se borra lo escrito
  S.view = 'asis';
  S.asisStore = st.id;
  renderAsistente(root(), st, { preview: S.asis === 'preview' }, (hecho) => {
    const from = S.asis;
    if (from === 'preview') {
      S.asis = false;
      S.asisStore = null;
      S.view = 'config';
      S.cfgTab = 'bot';
      render();
      return toast('Así lo ve un alumno nuevo. No se guardó nada en tu tienda.');
    }
    S.asis = false;
    S.asisStore = null;
    st.setup = 0;
    resetBot();
    if (from === 'bot') {
      S.view = 'config';
      S.cfgTab = 'bot';
    } else if (!st.phone_number_id) {
      S.view = 'config';
      S.cfgTab = 'numero';
    } else S.view = 'chats';
    render();
    if (S.view === 'chats') loadChats();
    toast(hecho ? (st.phone_number_id ? '¡Listo! Tu bot está armado (apagado). Enciéndelo en Bot Suyon AI cuando quieras.' : '¡Listo! Tu bot está armado. Ahora conecta tu número de WhatsApp.') : 'Puedes armar tu bot cuando quieras en Configuración → Bot Suyon AI → ✨ Asistente.');
  });
}

window.addEventListener('ct:asistente', () => {
  S.asis = S.preview ? 'preview' : 'bot';
  resetAsistente();
  render();
});

function render() {
  if (asisOn()) return renderAsis();
  if (S.view === 'asis') S.view = 'chats';
  if (S.view === 'carritos' && store()?.canal !== 'shopify') S.view = 'pedidos';
  const st = store();
  document.body.dataset.rubro = st?.rubro || 'ropa';
  const co = currentCompany();
  if (co?.plan?.blocked && !['config', 'panel'].includes(S.view)) {
    S.view = 'config';
    S.cfgTab = co.role === 'dueno' ? 'miplan' : 'cuenta';
  }
  const titles = { chats: 'Chats', clientes: 'Clientes', reportes: 'Reportes', avisos: 'Avisos', pedidos: 'Pedidos', envios: 'Envíos provincia', carritos: 'Carritos abandonados', panel: 'Panel Suyon', config: owner() || !st ? 'Configuración' : 'Mi cuenta' };
  const roleName = st ? S.me.roles[st.role] : '';
  root().innerHTML = `
  <nav class="side" aria-label="Principal">
    <button class="brand" data-act="stores" aria-haspopup="true" aria-label="Cambiar tienda"><span class="brand-mark">${LOGO}</span><span class="bt"><b>Control Total</b><small>${st ? `<i class="sdot" style="background:${esc(st.color)}"></i>${esc(storeLabel(st))}` : 'Sin tienda'}</small></span><span class="caret">▾</span></button>
    ${navItems().map(([v, l, ic, c]) => `<button class="navbtn" data-nav="${v}" ${S.view === v ? 'aria-current="page"' : ''}>${ic}<span>${l}</span>${c ? `<span class="cnt">${c > 99 ? '99+' : c}</span>` : ''}</button>`).join('')}
    <div class="side-foot"><button data-nav="config" data-tab="cuenta"><b>${esc(S.me.user.name)}</b>${roleName ? ' · ' + esc(roleName) : ''}<br>Mi cuenta</button></div>
  </nav>
  <main class="main">
    <header class="topbar">
      <button class="store-top" data-act="stores" aria-label="Cambiar tienda"><span>${st ? `<i class="sdot" style="background:${esc(st.color)}"></i>${esc(storeLabel(st))}` : 'Elegir tienda'}</span><span class="caret">▾</span></button>
      <h1>${titles[S.view]}</h1>
      <span class="grow"></span>
      ${S.me.user.is_admin && st ? `<button class="viewpill ${S.preview ? 'on' : ''}" data-act="vercomo" title="Ver la app como la ve un alumno, sin cambiar tu tienda">👁 ${S.preview ? `${S.preview.canal === 'shopify' ? 'Shopify' : 'Mensajes'} · ${S.preview.rubro === 'simple' ? 'Sin variantes' : 'Ropa'}` : 'Ver como'}</button>` : ''}
      ${S.me.user.is_admin && S.me.ia_saldo ? saldoPill(S.me.ia_saldo) : ''}
      ${co?.role === 'dueno' && co.ia_saldo != null ? `<button class="iapill ${co.ia_saldo <= 3 ? 'low' : ''}" data-nav="config" data-tab="miplan" title="Saldo de IA">🤖 IA S/ ${Number(co.ia_saldo).toFixed(2)}</button>` : ''}
      ${co?.role === 'dueno' && co.plan && ['trial', 'grace'].includes(co.plan.state) ? `<button class="planpill ${co.plan.state === 'grace' || co.plan.days_left <= 3 ? 'warn' : ''}" data-nav="config" data-tab="miplan">${co.plan.state === 'trial' ? `Prueba gratis · ${co.plan.days_left} ${co.plan.days_left === 1 ? 'día' : 'días'}` : 'Tu plan venció · renovar'}</button>` : ''}
    </header>
    ${S.preview && S.me.user.is_admin ? `<div class="viewband">👁 Vista previa: <b>${S.preview.canal === 'shopify' ? 'vende por Shopify' : 'vende por mensajes'} · ${S.preview.rubro === 'simple' ? 'producto sin variantes' : 'ropa'}</b>. Tu tienda real no cambia.<span class="grow"></span><button data-act="vercomo-asis">Ver el asistente de inicio</button><button data-act="vercomo-off">Salir</button></div>` : ''}
    <div class="content" id="content"></div>
  </main>`;
  const content = $('#content');
  if (S.view === 'chats') renderChatsView(content);
  else if (S.view === 'avisos') renderAvisos(content);
  else if (S.view === 'clientes') renderClientes(content);
  else if (S.view === 'reportes') renderReportes(content);
  else if (S.view === 'pedidos') renderPedidos(content);
  else if (S.view === 'envios') renderEnvios(content);
  else if (S.view === 'carritos') renderCarritos(content);
  else if (S.view === 'panel' && S.me.user.is_admin) renderPanel(content);
  else if (co?.plan?.blocked && co.role !== 'dueno' && S.cfgTab !== 'cuenta') renderPaywall(content, co);
  else renderConfig();
  drawStoreMenu();
  updateTitle();
}

// Saldo de la IA (Claude / OpenAI) en la barra de arriba, solo para el administrador
function saldoPill(x) {
  const ps = x.proveedores.filter((p) => p.key);
  if (!ps.length) return '';
  const bajo = ps.some((p) => p.bajo);
  const txt = ps.map((p) => `${p.name} ${p.configurado ? `$${p.saldo.toFixed(2)}` : '—'}`).join(' · ');
  return `<button class="saldopill${bajo ? ' warn' : ''}" data-act="saldo" title="Saldo de la IA: toca para actualizarlo">🤖 ${esc(txt)}</button>`;
}
// «Ver como» un alumno: elige cómo vende y qué vende; solo cambia lo que ves tú
function setPreview(p) {
  S.preview = p;
  for (const st of S.me.stores) Object.assign(st, p || st._real || {});
  resetBot();
  resetEnvios();
  resetReportes();
  render();
  toast(p ? 'Vista previa activada. Tu tienda real no cambia.' : 'Volviste a tu vista real.');
}

function openVerComo() {
  const cur = S.preview || store()?._real || {};
  modal(`<h3>Ver como un alumno</h3>
    <p class="note" style="margin:0">Mira el panel como lo ve alguien que vende por Shopify o que vende un producto sin variantes. Solo cambia lo que ves tú: tu tienda, tu bot y tus pedidos siguen igual.</p>
    <form id="vf" class="grid" style="gap:12px">
      <div class="field"><label>¿Cómo vende?</label>${canalPicker(cur.canal || 'mensajes')}</div>
      <div class="field"><label>¿Qué vende?</label>${rubroPicker(cur.rubro || 'ropa')}</div>
      <div class="err" hidden></div>
      <div class="row" style="flex-wrap:wrap">${S.preview ? '<button type="button" class="iconbtn" id="vf-off">Volver a mi vista real</button>' : '<button type="button" class="iconbtn" data-close>Cancelar</button>'}<span class="grow"></span>
        <button type="button" class="iconbtn" id="vf-asis">Ver el asistente de inicio</button><button class="send" type="submit">Ver así</button></div>
    </form>`);
  const pick = () => ({ canal: $('#vf input[name=canal]:checked')?.value || 'mensajes', rubro: $('#vf input[name=rubro]:checked')?.value || 'ropa' });
  formHandler($('#vf'), async () => {
    const p = pick();
    closeModal();
    setPreview(p);
  });
  $('#vf-asis').onclick = () => {
    const p = pick();
    closeModal();
    setPreview(p);
    S.asis = 'preview';
    resetAsistente();
    render();
  };
  const off = $('#vf-off');
  if (off) off.onclick = () => {
    closeModal();
    setPreview(null);
  };
}

function openSaldo() {
  const x = S.me.ia_saldo;
  const wrap = document.createElement('div');
  wrap.className = 'pmodal';
  const row = (p) => `<div class="sdrow"><div><b>${esc(p.name)}</b>${p.key ? '' : ' <small class="note">(sin clave)</small>'}
      <div class="note">${p.configurado ? `Quedan <b>US$${p.saldo.toFixed(2)}</b> · gastado US$${p.gastado.toFixed(2)} desde que lo pusiste${p.dias != null ? ` · alcanza para unos <b>${p.dias} días</b>` : ''}` : 'Todavía no pusiste tu saldo.'}<br>Últimos 30 días: US$${p.ultimos_30.toFixed(2)}</div></div>
      <label class="note">Saldo que ves ahora (US$)<input type="number" step="0.01" min="0" data-sd="${p.id}" placeholder="${p.configurado ? p.saldo.toFixed(2) : 'ej. 10.00'}"></label></div>`;
  wrap.innerHTML = `<div class="pmbox" role="dialog" aria-modal="true" aria-label="Saldo de la IA"><header class="pmh"><div><h2>🤖 Saldo de la IA</h2><span class="note">Claude y OpenAI no dejan leer el saldo desde otro sistema. Por eso: escribe aquí el saldo que ves en tu cuenta y desde ahí el sistema resta lo que va gastando (bot, notas de voz, ortografía, fotos de guías).</span></div><button class="iconbtn" data-sdx aria-label="Cerrar">✕</button></header>
    <div class="pmbody">${x.proveedores.map(row).join('')}
      <div class="field" style="max-width:260px"><label>Avisarme (en rojo) cuando quede menos de US$</label><input type="number" step="0.5" min="0" id="sdal" value="${x.alerta}"></div>
      <p class="note">Dónde ver tu saldo: Claude → console.anthropic.com → Billing («Credit balance»). OpenAI → platform.openai.com → Settings → Billing. Cada vez que recargues, vuelve aquí y pon el saldo nuevo.</p>
      <div class="regrow"><button class="send" data-sdok>Guardar</button></div></div></div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.addEventListener('mousedown', (ev) => ev.target === wrap && close());
  wrap.querySelector('[data-sdx]').onclick = close;
  wrap.querySelector('[data-sdok]').onclick = async () => {
    try {
      let r = null;
      for (const i of wrap.querySelectorAll('[data-sd]')) if (i.value !== '') r = await api('PATCH', '/admin/ia-saldo', { provider: i.dataset.sd, saldo: i.value });
      r = await api('PATCH', '/admin/ia-saldo', { alerta: Number($('#sdal').value) });
      S.me.ia_saldo = r;
      close();
      toast('Saldo guardado');
      render();
    } catch (e) {
      toast(e.message, 5000);
    }
  };
}

// Arriba sale SOLO el WhatsApp elegido (nombre + número), para que la asesora sepa en cuál está
function storeLabel(s) {
  const num = String(s.phone_display || '').replace(/^\+51\s*/, '');
  return `${s.name}${num ? ` · ${num}` : ''}`;
}

function updateBadges() {
  $$('.navbtn[data-nav="chats"],.navbtn[data-nav="avisos"]').forEach((b) => {
    const n = (b.dataset.nav === 'avisos' ? S.avisos : S.unread)[S.storeId] || 0;
    let el = b.querySelector('.cnt');
    if (!n) return el?.remove();
    if (!el) {
      el = document.createElement('span');
      el.className = 'cnt';
      b.appendChild(el);
    }
    el.textContent = n > 99 ? '99+' : n;
  });
  const chip = $('#unreadchip');
  if (chip) chip.textContent = S.unread[S.storeId] || '';
  if (S.storeMenu) drawStoreMenu();
  updateTitle();
}

function updateTitle() {
  const total = Object.entries(S.unread).reduce((a, [, n]) => a + n, 0);
  document.title = total ? `(${total}) Control Total` : 'Control Total';
}

function drawStoreMenu() {
  let el = $('#storelayer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'storelayer';
    document.body.appendChild(el);
  }
  if (!S.storeMenu || !S.me) return (el.innerHTML = '');
  const canAdd = S.me.companies.some((c) => c.role === 'dueno');
  el.innerHTML = `<div class="scrim" data-act="closestores"></div><div class="storepanel" role="dialog" aria-label="Tiendas">
    ${S.me.companies.map((co) => {
      const list = S.me.stores.filter((s) => s.company_id === co.id);
      if (!list.length && co.role !== 'dueno') return '';
      return `<h4>${esc(co.name)}</h4>${list.map((s) => `<button class="storeopt" data-store="${s.id}" aria-current="${s.id === S.storeId}">
        <span class="sm" style="background:${esc(s.color)}">${esc(initials(s.name))}</span>
        <span><b>${esc(s.name)}</b><span class="mono">${esc(s.phone_display || 'Sin número')}</span></span>
        ${S.unread[s.id] ? `<span class="unread">${S.unread[s.id]}</span>` : `<span class="st ${s.status === 'activo' ? 'st-on' : 'st-off'}">${s.status === 'activo' ? 'Activo' : 'Pendiente'}</span>`}
      </button>`).join('') || '<p class="note" style="margin:2px 8px 6px">Sin tiendas todavía</p>'}`;
    }).join('')}
    ${canAdd ? '<button class="addstore" data-act="addstore">+ Agregar tienda o número</button>' : ''}
  </div>`;
}

/* =================== CHATS =================== */
function renderChatsView(content) {
  const st = store();
  if (!st) {
    const isOwner = S.me.companies.some((c) => c.role === 'dueno');
    content.innerHTML = `<div class="empty" style="height:100%"><b>${isOwner ? 'Agrega tu primera tienda' : 'Aún no tienes tiendas asignadas'}</b>
      <span>${isOwner ? 'Cada tienda es un número de WhatsApp con sus propios chats, etiquetas y configuración.' : 'Pide al dueño que te dé acceso a una tienda.'}</span>
      ${isOwner ? '<button class="send" data-act="addstore">Agregar tienda</button>' : ''}</div>`;
    return;
  }
  content.innerHTML = `<div class="chats" id="chatsWrap">
    <section class="list" id="list" aria-label="Lista de chats"></section>
    <section class="conv" id="conv" aria-label="Conversación"></section>
    <aside class="ficha" id="ficha" aria-label="Ficha de la clienta"></aside>
  </div>`;
  layoutChats();
  renderListHead();
  renderItems();
  renderConv();
}

function layoutChats() {
  const w = $('#chatsWrap');
  if (!w) return;
  const showFicha = !!(S.openId && S.ficha);
  w.classList.toggle('open', !!S.openId);
  w.classList.toggle('no-ficha', !showFicha);
  w.classList.toggle('ficha-open', showFicha);
}

const matchChat = (c) =>
  (S.filter === 'todos' || (S.filter === 'unread' && c.unread > 0) || (S.filter === 'pending' && c.last_dir === 'in') || (S.filter === 'confirmar' && c.por_confirmar > 0)) &&
  S.tagf.every((t) => c.labels.includes(t)) &&
  (!S.q || (chatName(c) + ' ' + (c.profile_name || '') + ' ' + c.wa_id).toLowerCase().includes(S.q.toLowerCase()) || (S.q.replace(/\D/g, '').length >= 4 && c.wa_id.includes(S.q.replace(/\D/g, ''))));
const sortKey = (c) => c.last_msg_at || c.created_at;
function visibleChats() {
  return [...S.chats.values()].filter(matchChat).sort((a, b) => sortKey(b) - sortKey(a));
}

function storeBanner() {
  const st = store();
  if (st.status === 'activo') return '';
  return `<div class="storebar"><span class="grow">${owner() ? 'Este número todavía no está conectado a WhatsApp.' : 'El dueño todavía no conecta este número.'}</span>${owner() ? '<button data-nav="config" data-tab="numero">Conectar</button>' : ''}</div>`;
}

function renderListHead() {
  const list = $('#list');
  if (!list) return;
  const all = [...S.chats.values()];
  list.innerHTML = `${storeBanner()}<div id="callbar"></div><div class="list-head">
      <div class="searchrow">
        <div class="search"><span aria-hidden="true">⌕</span><input id="q" type="search" placeholder="Buscar nombre o número" value="${esc(S.q)}" aria-label="Buscar chats" autocomplete="off"></div>
        <button class="filterbtn ${S.tagf.length ? 'on' : ''}" data-act="tagmenu" aria-expanded="${S.tagMenu}">${ICON.filter}Etiqueta${S.tagf.length ? ` · ${S.tagf.length}` : ''}</button>
      </div>
      ${S.tagMenu ? (() => {
        const opt = (l) => `<button role="menuitemcheckbox" aria-checked="${S.tagf.includes(l.id)}" data-tagf="${l.id}">${tagHTML(l)}<span class="n">${S.tagf.includes(l.id) ? '✓ ' : ''}${all.filter((x) => x.labels.includes(l.id)).length}</span></button>`;
        const mine = S.labels.filter((l) => !l.auto || /PENDIENTE/i.test(l.name));
        const bot = S.labels.filter((l) => l.auto && !/PENDIENTE/i.test(l.name));
        return `<div class="tagmenu" role="menu">${mine.map(opt).join('') || '<p class="note" style="padding:8px">Sin etiquetas</p>'}${bot.length ? `<p class="tmsep">Las que pone el bot</p>${bot.map(opt).join('')}` : ''}</div>`;
      })() : ''}
      ${S.tagf.length ? `<div class="activef">${S.tagf.map((id) => `<button data-tagf="${id}" aria-label="Quitar filtro">${esc(labelById(id)?.name || '')} ×</button>`).join('')}</div>` : ''}
      <div class="chips" role="group" aria-label="Estado">
        ${[['todos', 'Todos'], ['unread', 'Sin leer'], ['pending', 'Por responder'], ['confirmar', '🟡 Por confirmar']].map(([k, l]) => `<button class="chip${k === 'confirmar' ? ' pcchip' : ''}" data-filter="${k}" aria-pressed="${S.filter === k}">${l}${k === 'unread' ? `<span class="n" id="unreadchip">${S.unread[S.storeId] || ''}</span>` : k === 'confirmar' ? `<span class="n" id="pcchip">${all.filter((x) => x.por_confirmar > 0).length || ''}</span>` : ''}</button>`).join('')}
      </div>
    </div>
    <div class="items" id="items"></div>`;
  renderCallbar();
  const q = $('#q');
  let deb;
  q.addEventListener('input', () => {
    S.q = q.value.trim();
    renderItems();
    clearTimeout(deb);
    if (S.q) deb = setTimeout(() => loadChats({ search: true }), 350);
  });
}

function renderItems() {
  const box = $('#items');
  if (!box) return;
  const list = visibleChats();
  const sc = box.scrollTop;
  const pcc = $('#pcchip');
  if (pcc) pcc.textContent = [...S.chats.values()].filter((x) => x.por_confirmar > 0).length || '';
  if (!list.length) {
    box.innerHTML = S.chatsLoading
      ? '<div class="empty"><span class="spin"></span></div>'
      : `<div class="empty"><b>${S.chats.size ? 'Sin chats aquí' : 'Todavía no hay chats'}</b><span>${S.chats.size ? 'Prueba con otro filtro o quita la etiqueta.' : store().status === 'activo' ? 'Cuando una clienta escriba a este número, aparecerá aquí.' : 'Conecta el número para empezar a recibir mensajes.'}</span></div>`;
    return;
  }
  box.innerHTML = list.map((x) => {
    const labs = x.labels.map(labelById).filter((l) => l && !/^Talla /.test(l.name)).sort((a, b) => (a.auto ? 1 : 0) - (b.auto ? 1 : 0)).slice(0, 3);
    const pc = x.por_confirmar > 0;
    return `<button class="item${pc ? ' pc' : ''}" data-open="${x.id}" aria-current="${x.id === S.openId}">${pc ? '<i class="pcdot" aria-hidden="true"></i>' : ''}
      <span class="av" style="background:${avColor(x.id)}">${esc(initials(chatName(x)))}</span>
      <span style="min-width:0"><span class="nm">${esc(chatName(x))}</span>
        <span class="lm">${x.last_dir === 'out' ? 'Tú: ' : ''}${esc(x.last_preview || '')}</span>
        ${labs.length || x.ad_id || pc ? `<span class="row">${pc ? '<span class="pcb">🟡 Por confirmar</span>' : ''}${x.ad_id ? '<span class="who ia">Anuncio</span>' : ''}${labs.map(tagHTML).join('')}</span>` : ''}</span>
      <span class="meta"><span>${listTime(x.last_msg_at)}</span>${x.unread ? `<span class="unread">${x.unread}</span>` : ''}</span>
    </button>`;
  }).join('') + (S.chatsMore && !S.q ? '<button class="iconbtn loadmore" data-act="morechats" style="margin:10px auto;display:flex">Cargar más</button>' : '');
  box.scrollTop = sc;
}

function mergeChats(list) {
  let newInbound = [];
  for (const c of list) {
    const prev = S.chats.get(c.id);
    if (prev && c.last_inbound_at && c.last_inbound_at > (prev.last_inbound_at || 0) && c.last_dir === 'in') newInbound.push(c);
    S.chats.set(c.id, c);
  }
  return newInbound;
}

async function loadChats({ more = false, search = false } = {}) {
  const sid = S.storeId;
  const p = new URLSearchParams();
  if (S.filter !== 'todos') p.set('filter', S.filter);
  if (S.tagf.length) p.set('labels', S.tagf.join(','));
  if (search && S.q) p.set('q', S.q);
  if (more) {
    const vis = visibleChats();
    if (vis.length) p.set('before', sortKey(vis[vis.length - 1]));
  }
  S.chatsLoading = true;
  if (!more && !search) renderItems();
  try {
    const r = await api('GET', `/stores/${sid}/chats?${p}`);
    if (sid !== S.storeId) return;
    mergeChats(r.chats);
    if (!search) S.chatsMore = r.more;
    if (!S.chatCursor) S.chatCursor = r.t;
  } catch (e) {
    toast(e.message);
  } finally {
    S.chatsLoading = false;
  }
  renderItems();
}

/* ---------- Conversación ---------- */
function msgState(id) {
  if (!S.msgs.has(id)) S.msgs.set(id, { list: [], cursor: 0, more: false, loading: false, loaded: false });
  return S.msgs.get(id);
}

async function openChat(id, { push = true } = {}) {
  if (S.openId && S.openId !== id) saveDraft();
  S.openId = id;
  S.replyTo = null;
  S.tagMenu = false;
  layoutChats();
  $$('#items .item').forEach((el) => el.setAttribute('aria-current', String(Number(el.dataset.open) === id)));
  renderConv();
  renderFicha();
  if (push && window.innerWidth <= 860) history.pushState({ chat: id }, '');
  const ms = msgState(id);
  if (!ms.loaded) await loadMessages(id);
  else if (ms.stale) fetchNewMessages(id);
  const c = S.chats.get(id);
  if (c?.unread) {
    c.unread = 0;
    S.unread[S.storeId] = Math.max(0, (S.unread[S.storeId] || 1) - 1);
    renderItems();
    updateBadges();
    api('POST', `/chats/${id}/read`).catch(() => {});
  }
  if (!isTouch) $('#draft')?.focus();
}

function closeChat() {
  saveDraft();
  S.openId = null;
  S.replyTo = null;
  layoutChats();
  renderConv();
  renderFicha();
  $$('#items .item').forEach((el) => el.setAttribute('aria-current', 'false'));
}

async function loadMessages(id, { older = false } = {}) {
  const ms = msgState(id);
  if (ms.loading) return;
  ms.loading = true;
  try {
    const q = older && ms.list.length ? `?before=${ms.list[0].id}` : '';
    const r = await api('GET', `/chats/${id}/messages${q}`);
    const map = new Map(ms.list.map((m) => [m.id, m]));
    for (const m of r.messages) map.set(m.id, m);
    ms.list = [...map.values()].sort((a, b) => a.id - b.id);
    if (!older) ms.cursor = r.t;
    if (!older || !ms.loaded) ms.more = r.more;
    else ms.more = r.more;
    ms.loaded = true;
  } catch (e) {
    toast(e.message);
  } finally {
    ms.loading = false;
  }
  if (S.openId === id) renderMsgs({ older, toBottom: !older });
}

function windowInfo(c) {
  const t = Date.now();
  const open = c.last_inbound_at && t - c.last_inbound_at < 24 * H;
  if (c.referral_at && t < c.referral_at + 72 * H) {
    const ok = c.first_reply_at ? c.first_reply_at < c.referral_at + 24 * H : t < c.referral_at + 24 * H;
    if (ok) return { canSend: true, free: true, label: `Gratis por ${Math.ceil((c.referral_at + 72 * H - t) / H)} h`, title: 'Llegó por un anuncio: todos los mensajes son gratis por 72 h si respondes dentro de las primeras 24 h.' };
  }
  if (open) return { canSend: true, free: false, label: `Abierta ${Math.ceil((c.last_inbound_at + 24 * H - t) / H)} h`, title: 'Puedes responder libremente hasta 24 h después de su último mensaje.' };
  return { canSend: false, free: false, label: 'Ventana cerrada', title: 'Pasaron más de 24 h desde su último mensaje.' };
}

function renderConv() {
  const conv = $('#conv');
  if (!conv) return;
  const c = S.chats.get(S.openId);
  if (!c) {
    conv.innerHTML = `<div class="empty" style="height:100%"><b>Elige un chat</b><span>${S.chats.size ? 'Los más recientes salen arriba.' : ''}</span></div>`;
    return;
  }
  conv.innerHTML = `<div class="conv-head" id="convhead"></div><div class="msgs" id="msgs"></div><div id="replyslot"></div><div id="tagbar"></div><div id="composer"></div>`;
  renderConvHead();
  const box = $('#msgs');
  box.addEventListener('load', onMediaLoad, true);
  box.addEventListener('loadedmetadata', onMediaLoad, true);
  box.addEventListener('error', onMediaError, true);
  const unstick = () => (S.stick = false);
  box.addEventListener('wheel', unstick, { passive: true });
  box.addEventListener('touchmove', unstick, { passive: true });
  box.addEventListener('scroll', () => {
    const ms = msgState(S.openId);
    if (box.scrollTop < 60 && ms.more && !ms.loading) loadMessages(S.openId, { older: true });
  });
  renderMsgs({ toBottom: true });
  renderReply();
  renderTagbar();
  renderComposer();
}

// Barra de etiquetas rápidas encima del cuadro de escribir (como en Pancake)
const QUICK_ORDER = ['LIMA PENDIENTE', 'YAPE PENDIENTE', '🔥 URGENTE', '✅ LIMA', '✅ PROVINCIA'];
function quickLabels() {
  const list = S.labels.filter((l) => !l.auto || l.name === 'YAPE PENDIENTE');
  const rank = (l) => {
    const i = QUICK_ORDER.indexOf(l.name);
    return i < 0 ? 100 + l.sort : i;
  };
  return list.sort((a, b) => rank(a) - rank(b));
}
function renderTagbar() {
  const box = $('#tagbar');
  const c = S.chats.get(S.openId);
  if (!box) return;
  if (!c || !S.labels.length) return (box.innerHTML = '');
  box.innerHTML = `<div class="tagbar" role="group" aria-label="Etiquetas rápidas">${quickLabels()
    .map((l) => `<button data-tag="${l.id}" aria-pressed="${c.labels.includes(l.id)}" style="--c:var(${esc(l.color)})" title="${c.labels.includes(l.id) ? 'Quitar' : 'Poner'} ${esc(l.name)}">${esc(l.name)}</button>`)
    .join('')}</div>`;
}

function renderConvHead() {
  const head = $('#convhead');
  const c = S.chats.get(S.openId);
  if (!head || !c) return;
  const w = windowInfo(c);
  head.innerHTML = `
    <button class="iconbtn back" data-act="back" aria-label="Volver a la lista">←</button>
    <span class="av" style="background:${avColor(c.id)};width:34px;height:34px;font-size:12px">${esc(initials(chatName(c)))}</span>
    <div class="t" style="min-width:0;flex:1"><b style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(chatName(c))}</b><span class="mono">${esc(fmtPhone(c.wa_id))}</span></div>
    <span class="window ${w.canSend ? '' : 'off'}" title="${esc(w.title)}">${esc(w.label)}</span>
    <button class="iconbtn" data-act="ficha">${S.ficha ? 'Ocultar ficha' : 'Ficha'}</button>`;
}

function quoteText(m) {
  if (!m) return 'Mensaje anterior';
  const who = m.direction === 'in' ? '' : 'Tú: ';
  const label = { image: '📷 Foto', video: '🎥 Video', audio: '🎤 Audio', document: '📄 ' + (m.media_name || 'Documento'), sticker: 'Sticker', location: '📍 Ubicación' }[m.type];
  return who + (m.body ? (label ? label + ' · ' : '') + m.body : label || '');
}

function byLabel(m) {
  if (m.sender === 'cel') return 'Celular';
  if (m.sender === 'bot') return 'Bot';
  if (m.sender === 'ia') return 'IA';
  return m.user_name || 'Asesora';
}

function tick(m) {
  if (m.direction !== 'out') return '';
  const s = m.status;
  if (s === 'failed') return '<span class="tick failed" title="No se envió">⚠</span>';
  if (s === 'sending') return '<span class="tick" title="Enviando">🕓</span>';
  if (s === 'read') return '<span class="tick read" title="Leído">✓✓</span>';
  if (s === 'delivered') return '<span class="tick" title="Entregado">✓✓</span>';
  return '<span class="tick" title="Enviado">✓</span>';
}

function mediaHTML(m) {
  const url = m.local_url || `/api/media/${m.id}`;
  if (m.media_status === 'error' && !m.local_url) {
    return `<div class="mpend">${ICON.img.replace('<svg', '<svg width="20" height="20"')}<span>No se pudo bajar el archivo.</span><button class="iconbtn" data-refetch="${m.id}" style="padding:3px 8px">Reintentar</button></div>`;
  }
  switch (m.type) {
    case 'image':
      return `<img class="pic" src="${url}" alt="Foto" loading="lazy" data-zoom="${url}">`;
    case 'sticker':
      return `<img class="stk" src="${url}" alt="Sticker" loading="lazy">`;
    case 'video':
      return `<video src="${url}" controls preload="metadata" playsinline></video>`;
    case 'audio':
      return `<audio src="${url}" controls preload="metadata"></audio>`;
    case 'document':
      return `<a class="doc" href="${url}" target="_blank" rel="noopener">${ICON.doc}<span style="min-width:0"><b>${esc(m.media_name || 'Documento')}</b><span>${m.media_size ? fmtSize(m.media_size) : 'Abrir'}</span></span></a>`;
  }
  return '';
}

function msgRow(m, list) {
  const out = m.direction === 'out';
  const media = ['image', 'video', 'audio', 'document', 'sticker'].includes(m.type);
  const ctx = m.context_wamid ? list.find((x) => x.wamid === m.context_wamid) : null;
  let inner = '';
  if (m.context_wamid) inner += `<div class="quote">${esc(quoteText(ctx))}</div>`;
  if (m.type === 'location' && m.extra?.location) {
    const l = m.extra.location;
    inner += `<a class="doc" href="https://www.google.com/maps?q=${l.latitude},${l.longitude}" target="_blank" rel="noopener">${ICON.pin}<span style="min-width:0"><b>${esc(m.body || 'Ubicación')}</b><span>Abrir en Google Maps</span></span></a>`;
  } else if (media) {
    inner += mediaHTML(m) + (m.body ? `<span class="cap">${esc(m.body)}</span>` : '');
    if (m.type === 'audio' && m.transcript) inner += `<span class="trans" title="Lo que dijo (pasado a texto)">«${esc(m.transcript)}»</span>`;
    else if (m.type === 'audio' && m.direction === 'in' && /^Nota de voz sin texto/.test(m.error || '')) inner += '<span class="trans off">No se pudo pasar a texto. Escúchala.</span>';
  } else {
    inner += esc(m.body || (m.type === 'unsupported' ? 'Mensaje que WhatsApp no deja ver aquí (ábrelo en el celular).' : ''));
  }
  if (Array.isArray(m.extra?.opciones)) inner += `<span class="bopts-out">${m.extra.opciones.map((o) => `<span>${esc(String(o).split(' · ')[0])}</span>`).join('')}</span>`;
  const meta = `<span class="meta">${hhmm(m.created_at)} ${tick(m)}</span>`;
  const bubble = `<div class="bub ${media ? 'mediab' : ''}">${inner}${meta}${m.extra?.reaction ? `<span class="react">${esc(m.extra.reaction)}</span>` : ''}</div>`;
  const canReply = !!m.wamid;
  return `<div class="m ${out ? 'out s-' + m.sender : ''}">${out ? `<span class="by ${m.sender === 'ase' ? 'ase' : m.sender}">${esc(byLabel(m))}</span>` : ''}
    <div class="wrapb">${bubble}${canReply ? `<button class="rbtn" data-reply="${m.id}" aria-label="Responder a este mensaje" title="Responder">↩</button>` : ''}</div>
    ${m.status === 'failed' ? `<div class="failnote"><span>${esc(m.error || 'No se envió')}</span>${typeof m.id === 'number' ? `<button data-retry="${m.id}">Reintentar</button>` : ''}</div>` : ''}
  </div>`;
}

function patchChildren(container, rows) {
  const existing = new Map();
  for (const el of [...container.children]) existing.set(el.dataset.key, el);
  rows.forEach((r, i) => {
    let el = existing.get(r.key);
    if (!el || el.dataset.sig !== r.sig) {
      const tpl = document.createElement('template');
      tpl.innerHTML = r.html.trim();
      const fresh = tpl.content.firstElementChild;
      fresh.dataset.key = r.key;
      fresh.dataset.sig = r.sig;
      if (el) el.replaceWith(fresh);
      el = fresh;
    }
    existing.delete(r.key);
    if (container.children[i] !== el) container.insertBefore(el, container.children[i] || null);
  });
  for (const el of existing.values()) el.remove();
}

function renderMsgs({ toBottom = false, older = false } = {}) {
  const box = $('#msgs');
  const c = S.chats.get(S.openId);
  if (!box || !c) return;
  const ms = msgState(c.id);
  if (!ms.loaded) {
    box.innerHTML = '<div class="empty" style="flex:1"><span class="spin"></span></div>';
    return;
  }
  if (box.querySelector('.empty')) box.innerHTML = '';
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 90;
  const oldH = box.scrollHeight;
  const oldTop = box.scrollTop;
  const rows = [];
  if (ms.more) rows.push({ key: 'more', sig: String(ms.loading), html: `<button class="iconbtn loadmore" data-act="older">${ms.loading ? 'Cargando…' : 'Ver mensajes anteriores'}</button>` });
  let lastDay = '';
  for (const m of ms.list) {
    const day = new Date(m.created_at).toDateString();
    if (day !== lastDay) {
      rows.push({ key: 'd' + day, sig: dayLabel(m.created_at), html: `<div class="daysep">${esc(dayLabel(m.created_at))}</div>` });
      lastDay = day;
    }
    if (m.extra?.referral) {
      const r = m.extra.referral;
      rows.push({ key: 'ad' + m.id, sig: '1', html: `<div class="adcard">Llegó desde un anuncio<b>${esc(r.headline || 'Anuncio de Meta')}</b>${r.source_id ? `<span class="mono">ID ${esc(r.source_id)}</span>` : ''}</div>` });
    }
    const sig = [m.status, m.media_status, m.extra?.reaction, m.error, m.transcript ? 'T' + m.transcript.length : '', m.user_name, m.local_url ? 'L' : '', ms.list.some((x) => x.wamid && x.wamid === m.context_wamid) ? 'q' : ''].join('|');
    rows.push({ key: 'm' + m.id, sig, html: msgRow(m, ms.list) });
  }
  if (!ms.list.length) rows.push({ key: 'none', sig: '', html: '<div class="sysm">Sin mensajes todavía</div>' });
  patchChildren(box, rows);
  if (older) box.scrollTop = oldTop + (box.scrollHeight - oldH);
  else if (toBottom || atBottom) {
    box.scrollTop = box.scrollHeight;
    S.stick = true;
  }
}

function onMediaLoad(e) {
  const box = $('#msgs');
  if (!box || !/IMG|VIDEO|AUDIO/.test(e.target.tagName)) return;
  if (S.stick) box.scrollTop = box.scrollHeight;
}
function onMediaError(e) {
  const t = e.target;
  if (!/IMG|VIDEO|AUDIO/.test(t.tagName) || t.dataset.failed) return;
  t.dataset.failed = '1';
  const id = Number(t.closest('.m')?.dataset.key?.slice(1));
  const div = document.createElement('div');
  div.className = 'mpend';
  div.innerHTML = `<span>No se pudo cargar el archivo.</span>${id ? `<button class="iconbtn" data-refetch="${id}" style="padding:3px 8px">Reintentar</button>` : ''}`;
  t.replaceWith(div);
}

function renderReply() {
  const slot = $('#replyslot');
  if (!slot) return;
  const m = S.replyTo ? msgState(S.openId).list.find((x) => x.id === S.replyTo) : null;
  slot.innerHTML = m ? `<div class="replybar"><span class="quote">${esc(quoteText(m))}</span><button data-act="noreply" aria-label="Quitar respuesta">×</button></div>` : '';
}

function renderComposer() {
  const box = $('#composer');
  const c = S.chats.get(S.openId);
  if (!box || !c) return;
  const w = windowInfo(c);
  const st = store();
  if (st.status !== 'activo') {
    box.innerHTML = `<div class="closed">El número no está conectado: puedes leer, pero todavía no responder.</div>`;
    return;
  }
  if (!w.canSend) {
    box.innerHTML = `<div class="closed">Pasaron más de 24 h desde su último mensaje. Solo se puede enviar una plantilla aprobada por Meta (tiene costo); llega en una próxima fase.</div>`;
    return;
  }
  if (S.rec) {
    box.innerHTML = `<div class="composer">
      <button class="iconbtn" data-act="reccancel" aria-label="Cancelar audio" title="Cancelar">${ICON.trash}</button>
      <div class="recbar"><span class="recdot"></span><span id="rectime">0:00</span><span style="font-family:var(--f-body);font-weight:600">Grabando…</span></div>
      <button class="send" data-act="recsend">Enviar</button></div>`;
    return;
  }
  box.innerHTML = `<div class="composer">
    <button class="iconbtn" data-act="attach" aria-label="Enviar foto, video, audio o documento" title="Foto, video, audio o documento">${ICON.clip}</button>
    <button class="iconbtn" data-act="mic" aria-label="Grabar nota de voz" title="Grabar nota de voz">${ICON.mic}</button>
    <textarea id="draft" rows="1" placeholder="Escribe un mensaje" aria-label="Mensaje">${esc(S.drafts.get(c.id) || '')}</textarea>
    <button class="send" data-act="send">Enviar</button>
  </div>`;
  const ta = $('#draft');
  autosize(ta);
  ta.addEventListener('input', () => {
    autosize(ta);
    S.drafts.set(c.id, ta.value);
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isTouch && !e.isComposing) {
      e.preventDefault();
      sendText();
    }
  });
  ta.addEventListener('paste', (e) => {
    const f = [...(e.clipboardData?.files || [])][0];
    if (f) {
      e.preventDefault();
      openAttach(f);
    }
  });
}

function autosize(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight + 2, 140) + 'px';
}
function saveDraft() {
  const ta = $('#draft');
  if (ta && S.openId) S.drafts.set(S.openId, ta.value);
}

let tmpSeq = 0;
function addLocal(chatId, m) {
  const ms = msgState(chatId);
  ms.list.push(m);
  if (S.openId === chatId) renderMsgs({ toBottom: true });
}
function replaceLocal(chatId, tmpId, real) {
  const ms = msgState(chatId);
  ms.list = ms.list.filter((x) => x.id !== tmpId && x.id !== real?.id);
  if (real) ms.list.push(real);
  ms.list.sort((a, b) => (typeof a.id === 'number' ? a.id : 1e15) - (typeof b.id === 'number' ? b.id : 1e15));
  if (S.openId === chatId) renderMsgs({ toBottom: true });
}
function touchChatAfterSend(chatId, preview) {
  const c = S.chats.get(chatId);
  if (!c) return;
  c.last_msg_at = Date.now();
  c.last_dir = 'out';
  c.last_preview = preview;
  if (c.referral_at && !c.first_reply_at) c.first_reply_at = Date.now();
  renderItems();
}

async function sendText() {
  const ta = $('#draft');
  const chatId = S.openId;
  const text = ta?.value.trim();
  if (!text || !chatId) return;
  const replyTo = S.replyTo;
  const ctx = replyTo ? msgState(chatId).list.find((x) => x.id === replyTo)?.wamid : null;
  ta.value = '';
  autosize(ta);
  S.drafts.delete(chatId);
  S.replyTo = null;
  renderReply();
  const tmp = 'tmp' + ++tmpSeq;
  addLocal(chatId, { id: tmp, direction: 'out', sender: 'ase', user_name: S.me.user.name, type: 'text', body: text, status: 'sending', context_wamid: ctx, created_at: Date.now() });
  touchChatAfterSend(chatId, text);
  try {
    const r = await api('POST', `/chats/${chatId}/messages`, { text, reply_to: replyTo || undefined });
    replaceLocal(chatId, tmp, r.message);
  } catch (e) {
    replaceLocal(chatId, tmp, null);
    if (S.openId === chatId && !$('#draft').value) {
      $('#draft').value = text;
      autosize($('#draft'));
    }
    toast(e.message, 5000);
  }
}

/* ---------- Archivos ---------- */
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = 'image/*,video/*,audio/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv';
fileInput.hidden = true;
document.body.appendChild(fileInput);
fileInput.addEventListener('change', () => {
  const f = fileInput.files[0];
  fileInput.value = '';
  if (f) openAttach(f);
});

const MAXS = { image: 5 * 1048576, video: 16 * 1048576, audio: 16 * 1048576, document: 100 * 1048576 };
const OKMIME = { image: ['image/jpeg', 'image/png'], video: ['video/mp4', 'video/3gpp'], audio: ['audio/aac', 'audio/amr', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/ogg', 'audio/mp3'] };
const mainType = (f) => (f.type || '').split('/')[0];

async function toJpeg(file) {
  const bmp = await createImageBitmap(file);
  let scale = Math.min(1, 2560 / Math.max(bmp.width, bmp.height));
  for (let q = 0.86; ; q -= 0.12) {
    const cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * scale);
    cv.height = Math.round(bmp.height * scale);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', Math.max(q, 0.5)));
    if (blob.size <= MAXS.image || q < 0.55) {
      if (blob.size > MAXS.image) {
        scale *= 0.7;
        q = 0.98;
        continue;
      }
      return new File([blob], (file.name || 'foto').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
    }
  }
}

async function openAttach(file) {
  const chatId = S.openId;
  if (!chatId) return;
  let f = file;
  let kind = mainType(f);
  let note = '';
  let asDoc = false;
  if (kind === 'image') {
    if (!OKMIME.image.includes(f.type) || f.size > MAXS.image) {
      try {
        f = await toJpeg(f);
        note = 'La foto se ajustó para que WhatsApp la acepte.';
      } catch {
        asDoc = true;
        note = 'Esta imagen se enviará como documento.';
      }
    }
  } else if (kind === 'video') {
    if (!OKMIME.video.includes(f.type) || f.size > MAXS.video) {
      asDoc = true;
      note = f.size > MAXS.video ? 'El video pasa de 16 MB: se enviará como documento (la clienta lo descarga para verlo).' : 'WhatsApp solo acepta videos MP4: este se enviará como documento.';
    }
  } else if (kind === 'audio') {
    if (!OKMIME.audio.includes(f.type.split(';')[0]) || f.size > MAXS.audio) {
      asDoc = true;
      note = 'Este formato de audio se enviará como documento.';
    }
  } else asDoc = true;
  if (f.size > MAXS.document) return toast('El archivo pasa de 100 MB, WhatsApp no lo acepta.', 5000);
  if (asDoc) kind = 'document';
  const url = URL.createObjectURL(f);
  const prev = kind === 'image' ? `<img src="${url}" alt="Vista previa">` : kind === 'video' ? `<video src="${url}" controls playsinline></video>` : kind === 'audio' ? `<audio src="${url}" controls></audio>` : `<div class="doc">${ICON.doc}<span><b>${esc(f.name)}</b><span>${fmtSize(f.size)}</span></span></div>`;
  modal(`<h3>Enviar a ${esc(chatName(S.chats.get(chatId)))}</h3>
    <div class="preview">${prev}</div>
    ${note ? `<p class="note" style="margin:0">${esc(note)}</p>` : ''}
    ${kind !== 'audio' ? '<div class="field"><label for="cap">Texto (opcional)</label><input id="cap" maxlength="1024" placeholder="Escribe algo para acompañar"></div>' : ''}
    <div class="row"><button class="iconbtn" data-close>Cancelar</button><button class="send" id="dosend">Enviar</button></div>`, () => URL.revokeObjectURL(url));
  $('#cap')?.focus();
  const go = () => {
    const caption = $('#cap')?.value.trim() || '';
    closeModal();
    sendFile(chatId, f, { caption, asDoc, kind });
  };
  $('#dosend').onclick = go;
  $('#cap')?.addEventListener('keydown', (e) => e.key === 'Enter' && go());
}

async function sendFile(chatId, f, { caption = '', asDoc = false, kind } = {}) {
  const tmp = 'tmp' + ++tmpSeq;
  const local = URL.createObjectURL(f);
  kind = kind || (asDoc ? 'document' : mainType(f));
  addLocal(chatId, { id: tmp, direction: 'out', sender: 'ase', user_name: S.me.user.name, type: kind, body: caption, media_name: f.name, media_size: f.size, local_url: local, status: 'sending', created_at: Date.now() });
  const labels = { image: '📷 Foto', video: '🎥 Video', audio: '🎤 Audio', document: '📄 Documento' };
  touchChatAfterSend(chatId, labels[kind] + (caption ? ': ' + caption : ''));
  const form = new FormData();
  form.append('file', f, f.name);
  if (caption) form.append('caption', caption);
  if (asDoc) form.append('as', 'document');
  try {
    const r = await uploadWithProgress(`/chats/${chatId}/media`, form);
    replaceLocal(chatId, tmp, r.message);
  } catch (e) {
    replaceLocal(chatId, tmp, null);
    if (e.data?.can_document && !asDoc) {
      if (confirm(e.message + '\n\n¿Enviarlo como documento?')) return sendFile(chatId, f, { caption, asDoc: true, kind: 'document' });
    } else toast(e.message, 5000);
  } finally {
    setTimeout(() => URL.revokeObjectURL(local), 60000);
  }
}

/* ---------- Notas de voz ---------- */
function pickRecMime() {
  const opts = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];
  return opts.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
}

async function startRec() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('Este navegador no permite grabar audio.');
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
  } catch {
    return toast('Sin permiso para usar el micrófono. Actívalo en el candado de la barra de direcciones.', 5000);
  }
  const mimeType = pickRecMime();
  const rec = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 24000 } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const chatId = S.openId;
  S.rec = { rec, stream, chunks, start: Date.now(), chatId, timer: null, cancel: false };
  rec.onstop = () => finishRec(S.rec);
  rec.start(1000);
  renderComposer();
  S.rec.timer = setInterval(() => {
    const s = Math.floor((Date.now() - S.rec.start) / 1000);
    const el = $('#rectime');
    if (el) el.textContent = `${Math.floor(s / 60)}:${pad(s % 60)}`;
    if (s >= 300) stopRec(false);
  }, 250);
}

function stopRec(cancel) {
  if (!S.rec) return;
  S.rec.cancel = cancel;
  clearInterval(S.rec.timer);
  if (S.rec.rec.state !== 'inactive') S.rec.rec.stop();
}

async function finishRec(r) {
  r.stream.getTracks().forEach((t) => t.stop());
  S.rec = null;
  renderComposer();
  if (r.cancel) return;
  if (Date.now() - r.start < 800) return toast('El audio es muy corto.');
  const type = (r.rec.mimeType || r.chunks[0]?.type || '').toLowerCase();
  let file;
  try {
    if (type.includes('webm')) {
      const ogg = webmOpusToOgg(await new Blob(r.chunks).arrayBuffer());
      file = new File([ogg], 'nota-de-voz.ogg', { type: 'audio/ogg' });
    } else if (type.includes('ogg')) file = new File(r.chunks, 'nota-de-voz.ogg', { type: 'audio/ogg' });
    else {
      const blob = new Blob(r.chunks, { type: type || 'audio/mp4' });
      const ogg = await toOggOpus(blob).catch(() => null);
      file = ogg ? new File([ogg], 'nota-de-voz.ogg', { type: 'audio/ogg' }) : new File(r.chunks, 'nota-de-voz.m4a', { type: 'audio/mp4' });
    }
  } catch (e) {
    return toast('No se pudo preparar el audio: ' + e.message, 5000);
  }
  sendFile(r.chatId, file, { kind: 'audio' });
}

/* ---------- Ficha ---------- */
function renderFicha() {
  const f = $('#ficha');
  if (!f) return;
  const c = S.chats.get(S.openId);
  if (!c) return (f.innerHTML = '');
  if (f.contains(document.activeElement) && document.activeElement.matches('input,textarea')) return;
  const w = windowInfo(c);
  f.innerHTML = `
    ${window.innerWidth <= 1180 ? '<button class="iconbtn" data-act="ficha" style="justify-self:end">Cerrar ficha</button>' : ''}
    <div class="sec"><h3>Clienta</h3><dl class="kv">
      <dt>Nombre</dt><dd><input class="namein" id="cname" value="${esc(c.name || '')}" placeholder="${esc(c.profile_name || 'Ponle un nombre')}" aria-label="Nombre de la clienta"></dd>
      ${c.profile_name ? `<dt>En WhatsApp</dt><dd>${esc(c.profile_name)}</dd>` : ''}
      <dt>Celular</dt><dd class="mono" style="display:flex;gap:6px;align-items:center">${esc(fmtPhone(c.wa_id))}<button class="iconbtn" data-copy="${esc(c.wa_id.replace(/^51/, ''))}" aria-label="Copiar celular" style="padding:2px 6px">${ICON.copy}</button></dd>
      <dt>Primer mensaje</dt><dd>${esc(new Date(c.created_at).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' }))}</dd>
    </dl></div>
    <div class="sec"><h3>Ventana de WhatsApp</h3><p class="note" style="margin:0"><b style="color:${w.canSend ? 'var(--ok)' : 'var(--muted)'}">${esc(w.label)}</b> · ${esc(w.title)}</p></div>
    ${botFicha(c)}
    <div class="sec"><h3>Pedidos</h3><div id="fpeds"><span class="note">Cargando…</span></div></div>
    <div class="sec"><h3>Notas</h3><textarea class="notesbox" id="cnotes" placeholder="Solo las ve tu equipo">${esc(c.notes || '')}</textarea></div>
    <div class="sec" style="display:flex;gap:8px;flex-wrap:wrap"><button class="iconbtn" data-act="markunread">Marcar como no leído</button><button class="iconbtn" data-act="vercliente">Ficha completa en Clientes</button></div>`;
  const save = async (field, value) => {
    try {
      await api('PATCH', `/chats/${c.id}`, { [field]: value });
      c[field] = value || null;
      if (field === 'name') {
        renderItems();
        renderConvHead();
      }
    } catch (e) {
      toast(e.message);
    }
  };
  const nm = $('#cname');
  nm.addEventListener('change', () => save('name', nm.value.trim()));
  nm.addEventListener('keydown', (e) => e.key === 'Enter' && nm.blur());
  const nt = $('#cnotes');
  nt.addEventListener('change', () => save('notes', nt.value.trim()));
  const fp = $('#fpeds');
  if (S.fpCache?.id === c.id && Date.now() - S.fpCache.at < 20000) {
    fp.innerHTML = S.fpCache.html;
    fichaPedidos(c.id, fp, true);
  } else {
    S.fpCache = { id: c.id, at: Date.now(), html: '' };
    fichaPedidos(c.id, fp).then(() => (S.fpCache = { id: c.id, at: Date.now(), html: fp.innerHTML }));
  }
}

async function toggleTag(labelId) {
  const c = S.chats.get(S.openId);
  if (!c) return;
  const on = c.labels.includes(labelId);
  c.labels = on ? c.labels.filter((x) => x !== labelId) : [...c.labels, labelId];
  renderFicha();
  renderTagbar();
  renderItems();
  try {
    await api(on ? 'DELETE' : 'PUT', `/chats/${c.id}/labels/${labelId}`);
  } catch (e) {
    c.labels = on ? [...c.labels, labelId] : c.labels.filter((x) => x !== labelId);
    renderFicha();
    renderTagbar();
    renderItems();
    toast(e.message);
  }
}

/* =================== Franja de llamadas =================== */
const CALL_RES = { cerro: ['Cerró', 'ok'], lo_piensa: ['Lo piensa', 'warn'], no_contesto: ['No contestó', 'bad'] };
let callsLoading = false;
async function loadCalls() {
  if (!S.storeId || !canChats() || callsLoading) return;
  callsLoading = true;
  const sid = S.storeId;
  try {
    const r = await api('GET', `/stores/${sid}/llamadas`);
    if (sid === S.storeId) {
      S.calls = r.calls;
      renderCallbar();
    }
  } catch {}
  callsLoading = false;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function renderCallbar() {
  const el = $('#callbar');
  if (!el) return;
  const t0 = startOfToday();
  const todo = S.calls.filter((c) => !c.last_at || c.last_at < t0);
  if (!S.calls.length) return (el.innerHTML = '');
  const nY = todo.filter((c) => c.label === 'YAPE PENDIENTE').length;
  const nL = todo.length - nY;
  const groups = new Map();
  for (const c of S.calls) {
    const k = dayLabel(c.since);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  el.innerHTML = `<div class="callbar ${todo.length ? 'hot' : ''} ${S.callsOpen ? 'open' : ''}">
    <button class="cb-head" data-calltoggle aria-expanded="${S.callsOpen}">
      <span class="cb-ic">${ICON.phone}</span>
      <span class="cb-t"><b>${todo.length ? `${todo.length} para llamar` : 'Llamadas al día'}</b><span>${todo.length ? `Yape ${nY} · Lima ${nL}` : 'Todas llamadas hoy'}</span></span>
      <span class="caret">${S.callsOpen ? '▴' : '▾'}</span>
    </button>
    ${S.callsOpen ? `<div class="cb-list">${[...groups].map(([day, list]) => `<h5>${esc(day)} <span>${list.length}</span></h5>${list.map((c) => {
      const done = c.last_at && c.last_at >= t0;
      const res = CALL_RES[c.last_result];
      return `<div class="cb-row ${done ? 'done' : ''}">
        <button class="cb-name" data-open="${c.id}"><b>${esc(c.name || c.profile_name || fmtPhone(c.wa_id))}</b>
          <span class="cb-tag ${c.label === 'YAPE PENDIENTE' ? 'y' : 'l'}">${c.label === 'YAPE PENDIENTE' ? 'Yape' : 'Lima'}</span>
          ${res ? `<span class="cb-res ${res[1]}">${res[0]}${c.tries > 1 ? ` · ${c.tries} veces` : ''}${c.last_by ? ` · ${esc(c.last_by)}` : ''}</span>` : ''}</button>
        <div class="cb-acts"><a class="iconbtn" href="tel:+${esc(c.wa_id)}" aria-label="Llamar">${ICON.phone}</a>
          ${Object.entries(CALL_RES).map(([k, [l, cls]]) => `<button class="cb-btn ${cls}" data-callr="${c.id}|${esc(c.label)}|${k}">${l}</button>`).join('')}</div>
      </div>`;
    }).join('')}`).join('')}</div>` : ''}
  </div>`;
}

document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-calltoggle],[data-callr]');
  if (!t) return;
  if ('calltoggle' in t.dataset) {
    S.callsOpen = !S.callsOpen;
    renderCallbar();
    if (S.callsOpen) loadCalls();
    return;
  }
  const [id, label, result] = t.dataset.callr.split('|');
  const row = S.calls.find((c) => c.id === Number(id) && c.label === label);
  t.closest('.cb-row')?.classList.add('saving');
  try {
    await api('POST', `/chats/${id}/llamada`, { result, label });
    if (row) Object.assign(row, { last_result: result, last_at: Date.now(), last_by: S.me.user.name, tries: (row.tries || 0) + 1 });
    if (result === 'cerro') S.calls = S.calls.filter((c) => c !== row);
    renderCallbar();
    toast(`Llamada guardada: ${CALL_RES[result][0]}`);
  } catch (er) {
    toast(er.message);
    renderCallbar();
  }
});

/* =================== Sincronización =================== */
let pollTimer = null;
let polling = false;
function startPolling() {
  stopPolling();
  pollTimer = setTimeout(poll, 1500);
}
function stopPolling() {
  clearTimeout(pollTimer);
}
async function poll() {
  if (!S.me || polling) return;
  polling = true;
  try {
    const s = await api('GET', '/sync');
    let changed = false;
    let newUnread = false;
    for (const st of s.stores) {
      if (S.revs[st.id] !== st.rev) {
        if (st.id === S.storeId) changed = true;
        S.revs[st.id] = st.rev;
      }
      if (S.synced && (st.unread || 0) > (S.unread[st.id] || 0)) newUnread = true;
      S.unread[st.id] = st.unread;
      if (st.id === S.storeId && S.view === 'avisos' && (S.avisos[st.id] || 0) !== (st.avisos || 0)) refreshAvisos();
      S.avisos[st.id] = st.avisos || 0;
      const ms = S.me.stores.find((x) => x.id === st.id);
      if (ms && ms.status !== st.status) {
        ms.status = st.status;
        if (st.id === S.storeId && S.view === 'chats') {
          renderListHead();
          renderItems();
          renderComposer();
        }
      }
    }
    S.synced = true;
    if (s.stores.length !== S.me.stores.length) refreshMe();
    updateBadges();
    if (changed && S.view === 'chats' && canChats()) await refreshStore(newUnread);
    else if (newUnread) notifyNew([]);
  } catch (e) {
    if (e.status === 401) return;
  } finally {
    polling = false;
  }
  pollTimer = setTimeout(poll, document.hidden ? 15000 : 3000);
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && S.me) {
    clearTimeout(pollTimer);
    poll();
  }
});

async function refreshMe() {
  try {
    setMe(await api('GET', '/me'));
    if (!store()) {
      S.storeId = S.me.stores[0]?.id ?? null;
      enterStore();
    } else render();
  } catch {}
}

async function fetchNewMessages(id) {
  const ms = msgState(id);
  if (!ms.loaded) return;
  try {
    const m = await api('GET', `/chats/${id}/messages?after=${ms.cursor}`);
    const map = new Map(ms.list.map((x) => [x.id, x]));
    for (const x of m.messages) map.set(x.id, x);
    ms.list = [...map.values()].sort((a, b) => (typeof a.id === 'number' ? a.id : 1e15) - (typeof b.id === 'number' ? b.id : 1e15));
    ms.cursor = m.t;
    ms.stale = false;
    if (S.openId === id) renderMsgs();
  } catch {}
}

async function refreshStore(newUnread) {
  const sid = S.storeId;
  loadCalls();
  const r = await api('GET', `/stores/${sid}/chats?after=${S.chatCursor}`);
  if (sid !== S.storeId) return;
  S.chatCursor = r.t;
  const fresh = mergeChats(r.chats);
  const open = S.chats.get(S.openId);
  // Si el chat abierto recibió algo, se marca leído al toque
  if (open && open.unread && !document.hidden) {
    open.unread = 0;
    S.unread[sid] = Math.max(0, (S.unread[sid] || 1) - 1);
    api('POST', `/chats/${open.id}/read`).catch(() => {});
    updateBadges();
  }
  renderItems();
  if (S.openId) {
    await fetchNewMessages(S.openId);
    renderConvHead();
    renderFicha();
    renderTagbar();
    const wasLocked = !$('#draft') && !S.rec;
    if (wasLocked) renderComposer();
  }
  // Otros chats ya cargados se vuelven a pedir cuando se abran
  for (const c of r.chats) if (c.id !== S.openId && S.msgs.get(c.id)?.loaded) S.msgs.get(c.id).stale = true;
  if (newUnread || (fresh.length && S.synced)) notifyNew(fresh.filter((c) => c.id !== S.openId || document.hidden));
}

/* ---------- Avisos ---------- */
let audioCtx;
function ding() {
  if (pref.get('sound', true) === false) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime;
    [880, 1320].forEach((f, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.18, t + i * 0.12 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.18);
      o.connect(g).connect(audioCtx.destination);
      o.start(t + i * 0.12);
      o.stop(t + i * 0.12 + 0.2);
    });
  } catch {}
}
let lastDing = 0;
async function notifyNew(chats) {
  if (Date.now() - lastDing < 2500) return;
  lastDing = Date.now();
  ding();
  if (!document.hidden || !chats.length || !('Notification' in window) || Notification.permission !== 'granted') return;
  const c = chats[0];
  const title = chats.length > 1 ? `${chats.length} chats con mensajes nuevos` : chatName(c);
  const body = chats.length > 1 ? chats.map(chatName).slice(0, 3).join(', ') : c.last_preview || 'Mensaje nuevo';
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) reg.showNotification(title, { body, tag: 'scrm-' + S.storeId, icon: '/icon-192.png', badge: '/icon-192.png', data: { chat: c.id, store: S.storeId } });
    else new Notification(title, { body, tag: 'scrm-' + S.storeId, icon: '/icon-192.png' });
  } catch {}
}
navigator.serviceWorker?.addEventListener('message', (e) => {
  if (e.data?.chat && S.me) {
    if (e.data.store && e.data.store !== S.storeId && S.me.stores.some((s) => s.id === e.data.store)) {
      S.storeId = e.data.store;
      S.view = 'chats';
      enterStore();
    }
    setTimeout(() => S.chats.get(e.data.chat) && openChat(e.data.chat), 600);
  }
});

/* =================== Modales =================== */
let modalCleanup = null;
function modal(html, onClose) {
  closeModal();
  const layer = $('#layer');
  layer.innerHTML = `<div class="scrim" data-close></div><div class="mwrap" data-close><div class="modal" role="dialog" aria-modal="true"><button class="close" data-close aria-label="Cerrar">×</button>${html}</div></div>`;
  modalCleanup = onClose;
}
function closeModal() {
  $('#layer').innerHTML = '';
  modalCleanup?.();
  modalCleanup = null;
}

function linkModal(title, text, link) {
  modal(`<h3>${esc(title)}</h3><p class="note" style="margin:0">${esc(text)}</p>
    <div class="copyrow"><code>${esc(link)}</code></div>
    <div class="row"><a class="iconbtn" href="https://wa.me/?text=${encodeURIComponent(link)}" target="_blank" rel="noopener">Enviar por WhatsApp</a><button class="send" id="cplink">Copiar enlace</button></div>`);
  $('#cplink').onclick = () => copy(link, 'Enlace copiado');
}

function addStoreModal() {
  const cos = S.me.companies.filter((c) => c.role === 'dueno');
  const def = store()?.company_id && cos.some((c) => c.id === store().company_id) ? store().company_id : cos[0]?.id;
  modal(`<h3>Agregar tienda</h3><p class="note" style="margin:0">Cada tienda es un número de WhatsApp. Después de crearla, pones sus datos de Meta y la conectas.</p>
    <form id="nf" class="grid" style="gap:12px">
      ${cos.length > 1 ? `<div class="field"><label for="nco">Empresa</label><select id="nco" name="company">${cos.map((c) => `<option value="${c.id}" ${c.id === def ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>` : `<input type="hidden" name="company" value="${def}">`}
      <div class="field"><label for="nname">Nombre de la tienda</label><input id="nname" name="name" required placeholder="Ej: Pantalón de rayas"></div>
      <div class="field"><label>¿Cómo vende esta tienda?</label>${canalPicker('mensajes')}</div>
      <div class="field"><label>¿Qué vende?</label>${rubroPicker(store()?.rubro || 'ropa')}</div>
      <div class="field"><label>Color</label><div class="swatches" id="nsw">${STORE_COLORS.map((col, i) => `<button type="button" data-swatch="${col}" aria-pressed="${i === 0}" style="background:${col}" aria-label="Color ${i + 1}"></button>`).join('')}</div></div>
      <div class="err" hidden></div>
      <div class="row"><button type="button" class="iconbtn" data-close>Cancelar</button><button class="send" type="submit">Crear tienda</button></div>
    </form>`);
  let color = STORE_COLORS[0];
  $('#nsw').onclick = (e) => {
    const b = e.target.closest('[data-swatch]');
    if (!b) return;
    color = b.dataset.swatch;
    $$('#nsw button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  };
  formHandler($('#nf'), async (d) => {
    const r = await api('POST', `/companies/${d.company}/stores`, { name: d.name, color, canal: d.canal, rubro: d.rubro });
    setMe(r);
    closeModal();
    S.storeMenu = false;
    S.storeId = r.store_id;
    S.view = 'config';
    S.cfgTab = 'numero';
    enterStore();
    toast(d.canal === 'shopify' ? 'Tienda creada. Pon los datos de su número y luego conecta Shopify.' : 'Tienda creada. Ahora pon los datos de su número.');
  });
  $('#nname').focus();
}

// Los dos caminos: vender por chat (bot + IA Suyon) o por la web (Shopify + avisos por WhatsApp)
function canalPicker(cur) {
  const opts = [
    ['mensajes', '💬 Por mensajes de WhatsApp', 'La clienta llega por un anuncio, el bot y la IA Suyon la atienden y cierran la venta en el chat. El pedido se crea solo.'],
    ['shopify', '🛍️ Por Shopify (mi web)', 'La clienta compra en tu web. El pedido entra solo y por WhatsApp le llegan la confirmación, el envío y el carrito olvidado.'],
  ];
  return `<div class="canales" role="radiogroup">${opts.map(([v, t, d]) => `<label class="canal"><input type="radio" name="canal" value="${v}" ${cur === v ? 'checked' : ''}><b>${t}</b><span>${d}</span></label>`).join('')}</div>`;
}

/* =================== CONFIGURACIÓN =================== */
function cfgTabs() {
  const tabs = [];
  // La pestaña de pedidos cambia según cómo vende la tienda: por mensajes (Pedidos) o por su web (Shopify)
  if (owner()) tabs.push(['general', 'General'], ['numero', 'Número de WhatsApp'], ['perfil', 'Perfil de WhatsApp'], ['pedidoscfg', store()?.canal === 'shopify' ? 'Shopify' : 'Pedidos'], ['etiquetas', 'Etiquetas'], ['bot', 'Bot Suyon AI'], ['equipo', 'Equipo']);
  if (S.me.companies.some((c) => c.role === 'dueno')) tabs.push(['empresa', 'Empresas']);
  const co = currentCompany();
  const showPlan = co?.role === 'dueno' && co.plan && co.plan.state !== 'free';
  if (showPlan) tabs.push(['miplan', 'Mi plan']);
  tabs.push(['cuenta', 'Mi cuenta']);
  if (co?.plan?.blocked) return tabs.filter(([k]) => k === 'miplan' || k === 'cuenta');
  return tabs;
}

function renderConfig() {
  const content = $('#content');
  if (!content || S.view !== 'config') return;
  const tabs = cfgTabs();
  if (!tabs.some(([k]) => k === S.cfgTab)) S.cfgTab = tabs[0][0];
  const st = store();
  content.innerHTML = `<div class="page${S.cfgTab === 'bot' ? ' full' : ''}"><div class="cfg">
    <nav class="cfgnav" aria-label="Secciones">${tabs.map(([k, l]) => `<button data-cfg="${k}" aria-current="${S.cfgTab === k}">${l}</button>`).join('')}
      ${st && owner() ? `<div class="cfgnote">Lo de General, Número, Perfil, Etiquetas, Bot y Equipo es de <b>${esc(st.name)}</b>${S.cfgTab === 'equipo' ? ` y su empresa` : ''}. Cambia de tienda arriba a la izquierda.</div>` : ''}</nav>
    <div id="cfgbody"></div></div></div>`;
  ({ general: cfgGeneral, numero: cfgNumero, perfil: cfgPerfil, pedidoscfg: () => renderPedidosConfig($('#cfgbody')), etiquetas: cfgEtiquetas, bot: () => renderBotTab($('#cfgbody')), equipo: cfgEquipo, empresa: cfgEmpresa, cuenta: cfgCuenta, miplan: () => renderMiPlan($('#cfgbody'), currentCompany().id) })[S.cfgTab]();
}

function cfgGeneral() {
  const st = store();
  const body = $('#cfgbody');
  if (!st) return (body.innerHTML = '<div class="empty"><b>Sin tienda</b><span>Agrega una tienda desde el selector.</span><button class="send" data-act="addstore">Agregar tienda</button></div>');
  const G = S.me.general;
  const opt = (list, cur, label = (x) => x.name) => list.map((x) => `<option value="${esc(x.id)}" ${x.id === cur ? 'selected' : ''}>${esc(label(x))}</option>`).join('');
  const tzName = (tz) => tz.split('/').pop().replace(/_/g, ' ');
  const cur = G.currencies.find((x) => x.id === st.currency) || G.currencies[0];
  body.innerHTML = `
  <div class="ph"><div><h2>General</h2><p>Idioma, país, zona horaria y moneda de <b>${esc(st.name)}</b>. El bot, los seguimientos y la IA usan estos datos.</p></div></div>
  <form id="gf" class="grid" style="gap:14px">
    <div class="card"><h3>Idioma y región</h3>
      <div class="fields3">
        <div class="field"><label for="g-country">País</label><select id="g-country" name="country">${opt(G.countries, st.country)}</select></div>
        <div class="field"><label for="g-tz">Zona horaria</label><select id="g-tz" name="timezone">${G.timezones.map((tz) => `<option value="${tz}" ${tz === st.timezone ? 'selected' : ''}>${esc(tzName(tz))} (${esc(tzOff(tz))})</option>`).join('')}</select></div>
        <div class="field"><label for="g-cur">Moneda</label><select id="g-cur" name="currency">${opt(G.currencies, st.currency, (x) => `${x.symbol} · ${x.name}`)}</select></div>
        <div class="field"><label for="g-h12">Formato de hora</label><select id="g-h12" name="hour12"><option value="1" ${st.hour12 ? 'selected' : ''}>12 horas (3:30 p. m.)</option><option value="0" ${st.hour12 ? '' : 'selected'}>24 horas (15:30)</option></select></div>
        <div class="field"><label for="g-lang">Idioma del bot y la IA</label><select id="g-lang" name="language">${opt(G.languages, st.language)}</select></div>
        <div class="field"><label>Hora ahora en la tienda</label><div class="mono" id="g-now" style="padding:8px 0"></div></div>
      </div>
      <p class="note" style="margin:6px 0 0">La zona horaria decide los horarios del bot (por ejemplo, seguimientos solo de 8 a. m. a 10 p. m.), la hora que ve la IA para el corte HOY/MAÑANA y el gasto de IA por día. La app se ve en español.</p>
    </div>
    <div class="card"><h3>Mensajes de tu equipo</h3>
      <div class="field" style="max-width:420px"><label for="g-ac">Corregir ortografía al enviar</label><select id="g-ac" name="autocorrect"><option value="1" ${st.autocorrect !== 0 ? 'selected' : ''}>Sí: mayúsculas, tildes y comas</option><option value="0" ${st.autocorrect === 0 ? 'selected' : ''}>No: se manda tal cual</option></select></div>
      <p class="note" style="margin:6px 0 0">Tu asesora puede escribir rápido en minúsculas: antes de salir, el mensaje se arregla (Hola, ¿qué color te gustó?). Nunca cambia palabras, montos ni enlaces; si algo no cuadra, se manda tal cual. Solo para lo que escribe tu equipo: el bot ya escribe bien.</p>
    </div>
    <div class="card"><h3>Cómo vende esta tienda</h3>
      <p class="sub">Decide qué ves en Configuración: con mensajes, la pestaña <b>Pedidos</b>; con Shopify, la pestaña <b>Shopify</b> para conectar tu web. Los pedidos siempre caen en la sección <b>Pedidos</b>, con precios en ${esc(cur.symbol)} y la hora de ${esc(tzName(st.timezone))}.</p>
      ${canalPicker(st.canal || 'mensajes')}
    </div>
    <div class="card"><h3>Qué vende esta tienda</h3>
      <p class="sub">Con <b>ropa</b> ves tallas y colores en Pedidos, Envíos y Reportes. Con <b>un producto sin variantes</b> se esconden. Para rehacer tu bot con preguntas: Bot Suyon AI → ✨ Asistente.</p>
      ${rubroPicker(st.rubro || 'ropa')}
    </div>
    <div class="err" hidden></div>
    <div class="savebar"><span class="note"></span><button class="send" type="submit">Guardar</button></div>
  </form>`;
  const tick = () => {
    const el = $('#g-now');
    if (!el) return clearInterval(tm);
    const tz = $('#g-tz').value;
    el.textContent = new Date().toLocaleString('es-PE', { timeZone: tz, weekday: 'long', hour: 'numeric', minute: '2-digit', hour12: $('#g-h12').value === '1' });
  };
  const tm = setInterval(tick, 15000);
  tick();
  $('#g-tz').onchange = tick;
  $('#g-h12').onchange = tick;
  $('#g-country').onchange = (e) => {
    const c = G.countries.find((x) => x.id === e.target.value);
    if (!c) return;
    $('#g-tz').value = c.tz;
    $('#g-cur').value = c.currency;
    tick();
  };
  formHandler($('#gf'), async (d) => {
    if (S.preview) {
      // en vista previa no se guarda cómo vende ni qué vende (sería la tienda real)
      delete d.canal;
      delete d.rubro;
    }
    const r = await api('PATCH', `/stores/${st.id}`, { ...d, hour12: d.hour12 === '1', autocorrect: d.autocorrect !== '0' });
    setMe(r);
    toast('Guardado');
    render();
  });
}

function tzOff(tz) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName').value.replace('GMT', 'GMT');
  } catch {
    return '';
  }
}

async function cfgPerfil() {
  const st = store();
  const body = $('#cfgbody');
  if (!st) return (body.innerHTML = '<div class="empty"><b>Sin tienda</b><span>Agrega una tienda desde el selector.</span></div>');
  body.innerHTML = '<div class="empty" style="padding:40px"><span class="spin"></span></div>';
  let r;
  try {
    r = await api('GET', `/stores/${st.id}/perfil`);
  } catch (er) {
    body.innerHTML = `<div class="ph"><div><h2>Perfil de WhatsApp</h2></div></div><div class="card"><div class="err">${esc(er.message)}</div></div>`;
    return;
  }
  if (S.cfgTab !== 'perfil' || store()?.id !== st.id) return;
  const p = r.profile;
  const w = [...p.websites, '', ''].slice(0, 2);
  const cnt = (id, n) => `<span class="note mono" data-cnt="${id}" data-max="${n}"></span>`;
  body.innerHTML = `
  <div class="ph"><div><h2>Perfil de WhatsApp</h2><p>Lo que ven tus clientas al tocar el nombre de <b>${esc(r.name || st.name)}</b> en WhatsApp.</p></div></div>
  <form id="wpf" class="grid" style="gap:14px">
    <div class="card wprof">
      <div class="wpic"><span class="wpimg">${p.photo ? `<img src="${esc(p.photo)}" alt="Foto de perfil" referrerpolicy="no-referrer">` : '<b>S</b>'}</span>
        <label class="iconbtn">Cambiar foto<input type="file" id="wpfile" accept="image/jpeg,image/png" hidden></label>
        <span class="note">JPG o PNG cuadrada, mínimo 192×192 (ideal 640×640). Máx. 5 MB.</span></div>
      <div class="wpinfo"><b class="wpname">${esc(r.name || st.name)}</b><span class="note mono">${esc(r.phone || st.phone_display || '')}</span>
        <span class="note">El nombre no se cambia aquí: lo revisa Meta (Administrador de WhatsApp → Números de teléfono).</span></div>
    </div>
    <div class="card"><h3>Datos del perfil</h3><div class="grid" style="gap:12px">
      <div class="field"><label for="wp-about">Info (frase corta debajo del nombre) ${cnt('wp-about', 139)}</label><input id="wp-about" name="about" maxlength="139" value="${esc(p.about)}" placeholder="Pantalones formales stretch · Envío gratis a todo el Perú 🇵🇪"></div>
      <div class="field"><label for="wp-desc">Descripción ${cnt('wp-desc', 512)}</label><textarea id="wp-desc" name="description" maxlength="512" rows="4" placeholder="Qué vendes, horarios, cómo comprar…">${esc(p.description)}</textarea></div>
      <div class="fields">
        <div class="field"><label for="wp-cat">Categoría</label><select id="wp-cat" name="vertical">${Object.entries(r.verticals).map(([k, l]) => `<option value="${k}" ${k === p.vertical ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        <div class="field"><label for="wp-mail">Correo</label><input id="wp-mail" name="email" type="email" maxlength="128" value="${esc(p.email)}"></div>
      </div>
      <div class="field"><label for="wp-addr">Dirección</label><input id="wp-addr" name="address" maxlength="256" value="${esc(p.address)}" placeholder="Los Olivos, Lima"></div>
      <div class="fields">
        <div class="field"><label for="wp-w1">Enlace 1 (ej. Instagram)</label><input id="wp-w1" name="w1" value="${esc(w[0])}" placeholder="https://instagram.com/tumarca"></div>
        <div class="field"><label for="wp-w2">Enlace 2 (ej. Facebook o tu web)</label><input id="wp-w2" name="w2" value="${esc(w[1])}" placeholder="https://facebook.com/tumarca"></div>
      </div>
      <div class="err" hidden></div>
      <div><button class="send" type="submit">Guardar perfil</button></div></div></div>
    <div class="card"><h3>Conectar Facebook e Instagram</h3>
      <p class="sub">Esto no se puede hacer desde la API: Meta lo pide en sus propias apps. Lo que sí puedes poner aquí son los enlaces de arriba, que salen como botones en el perfil.</p>
      <ol class="steps">
        <li><b>Página de Facebook</b> (para anuncios de clic a WhatsApp): en tu página → Configuración → <b>WhatsApp</b> → agrega este número y confirma con el código.</li>
        <li><b>Instagram</b>: en la app → Editar perfil → <b>Agregar enlace</b> o <b>Botones de contacto</b> → WhatsApp → elige este número.</li>
        <li>Si usas Meta Business Suite, también lo encuentras en Configuración → <b>Cuentas</b> → Cuentas de WhatsApp.</li>
      </ol></div>
  </form>`;
  const counters = () => $$('[data-cnt]').forEach((el) => (el.textContent = `${$('#' + el.dataset.cnt).value.length}/${el.dataset.max}`));
  counters();
  $('#wpf').addEventListener('input', counters);
  formHandler($('#wpf'), async (d) => {
    await api('PATCH', `/stores/${st.id}/perfil`, { about: d.about, description: d.description, vertical: d.vertical, email: d.email, address: d.address, websites: [d.w1, d.w2] });
    toast('Perfil guardado en WhatsApp');
  });
  $('#wpfile').onchange = async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    const img = $('.wpimg');
    const url = URL.createObjectURL(f);
    const prev = img.innerHTML;
    img.innerHTML = `<img src="${url}" alt="Foto nueva"><span class="spin wpspin"></span>`;
    const fd = new FormData();
    fd.append('file', f);
    try {
      await api('POST', `/stores/${st.id}/perfil/foto`, fd);
      img.querySelector('.wpspin')?.remove();
      toast('Foto de perfil cambiada. En WhatsApp puede tardar unos minutos en verse.', 5000);
    } catch (er) {
      img.innerHTML = prev;
      toast(er.message, 6000);
    }
  };
}

function statusPill(s) {
  return s === 'activo' ? '<span class="pillst st-on">Conectado</span>' : '<span class="pillst st-off" style="background:var(--warn-soft);color:var(--warn)">Sin conectar</span>';
}

// Botón de ayuda por WhatsApp (el número de contacto sale del Panel Suyon)
function helpWA(text, label = '¿Necesitas ayuda? Escríbenos y lo hacemos juntos.') {
  const n = String(S.me?.soporte || '').replace(/\D/g, '');
  if (!n) return `<p class="note" style="margin:8px 0 0">${esc(label)}</p>`;
  return `<p class="note" style="margin:10px 0 6px">${esc(label)}</p><a class="iconbtn" href="https://wa.me/${n}?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">${ICON.wa || ''} Escribir por WhatsApp</a>`;
}

/* ---- Conectar WhatsApp con un clic (Registro insertado de Meta) ---- */
async function drawSignup(st) {
  const box = $('#esconn');
  if (!box) return;
  if (S.es?.storeId !== st.id) {
    try {
      S.es = { ...(await api('GET', `/stores/${st.id}/whatsapp/signup`)), storeId: st.id };
    } catch (e) {
      S.es = { storeId: st.id, error: e.message, falta: [] };
    }
  }
  const es = S.es;
  if (!$('#esconn')) return;
  const linked = st.connected_via === 'embedded' || st.connected_via === 'coexistencia';
  if (!es.ready && !S.me.user.is_admin) {
    box.innerHTML = `<h3>Conectar tu WhatsApp</h3>
      <p class="sub">Conectamos tu número juntos en una videollamada corta: tú pones el código que te llega por SMS y listo. Tu número queda a tu nombre, en tu propia cuenta de Meta.</p>
      ${helpWA('Hola, quiero conectar mi número de WhatsApp en Control Total')}`;
    return;
  }
  if (!es.ready) {
    box.innerHTML = `<h3>Conectar con un clic</h3>
      <p class="sub">Con este botón, tú o tus alumnos conectan su número sin copiar identificadores ni tokens: se abre la ventana de Meta, eligen su cuenta, ponen el código SMS y listo.</p>
      <div class="warnbox"><b>Falta un paso en Meta para encender el botón.</b>
        <ol>${es.falta?.includes('config') ? `<li>En Meta for Developers → tu app <b>SUYON CRM</b> → <b>Inicio de sesión con Facebook para empresas</b> → <b>Configuraciones</b> → «Crear desde plantilla» → <b>WhatsApp Embedded Signup</b>. Copia el <b>ID de configuración</b>.</li>
          <li>En <b>Inicio de sesión con Facebook para empresas → Configuración</b>, agrega <span class="mono">${esc(location.origin)}</span> en «Dominios permitidos» y en «URI de redireccionamiento de OAuth válidos». Activa «Inicio de sesión con el SDK de JavaScript».</li>
          <li>Pásame ese ID de configuración por el chat (no es una clave, se puede compartir) y lo pongo.</li>` : ''}
          ${es.falta?.includes('app') ? '<li>Falta el ID de la app: pásamelo por el chat (está arriba en Meta for Developers, no es una clave).</li>' : ''}
          ${es.falta?.includes('secret') ? '<li>Falta el secreto <span class="mono">META_APP_SECRET</span> en Cloudflare.</li>' : ''}</ol>
        ${es.error ? `<p class="note">${esc(es.error)}</p>` : ''}</div>`;
    return;
  }
  box.innerHTML = `<h3>Conectar con un clic</h3>
    <p class="sub">${linked ? `Este número se conectó con Meta${st.connected_via === 'coexistencia' ? ' y sigue en la app WhatsApp Business del celular' : ''}. Si cambias de número, vuelve a conectarlo aquí.` : 'Se abre la ventana de Meta: eliges tu portafolio, tu número y pones el código SMS. Control Total hace el resto.'}</p>
    <div class="esbtns">
      <button class="send esbtn" id="es-new" type="button">${ICON.wa || ''}<span><b>${linked ? 'Conectar otro número' : 'Conectar WhatsApp'}</b><small>Número nuevo, solo para la API</small></span></button>
      <button class="iconbtn esbtn" id="es-coex" type="button"><span><b>Ya uso WhatsApp Business en el celular</b><small>Lo sigues usando en el celular y también aquí</small></span></button>
    </div>
    <p class="note" style="margin:8px 0 0">Tu número queda a tu nombre, en tu propia cuenta de Meta. Después de conectar, agrega una tarjeta en esa cuenta (Meta cobra directo los mensajes que no son gratis).</p>
    ${S.me.user.is_admin ? '' : helpWA('Hola, tuve un problema al conectar mi número de WhatsApp en Control Total', '¿Algo no funcionó? Escríbenos y lo conectamos juntos.')}`;
  loadFbSdk(es).catch(() => {});
  $('#es-new').onclick = () => startSignup(st, false);
  $('#es-coex').onclick = () => startSignup(st, true);
}

function loadFbSdk(info) {
  if (window.FB && window.__fbReady) return Promise.resolve(window.FB);
  if (window.__fbLoading) return window.__fbLoading;
  window.__fbLoading = new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB.init({ appId: info.app_id, autoLogAppEvents: true, xfbml: false, version: info.version });
      window.__fbReady = true;
      resolve(window.FB);
    };
    const sc = document.createElement('script');
    sc.src = 'https://connect.facebook.net/es_LA/sdk.js';
    sc.async = true;
    sc.defer = true;
    sc.crossOrigin = 'anonymous';
    sc.onerror = () => {
      window.__fbLoading = null;
      reject(new Error('No se pudo abrir Meta. Revisa tu internet o apaga el bloqueador de anuncios en esta página.'));
    };
    document.head.appendChild(sc);
  });
  return window.__fbLoading;
}

function startSignup(st, coex) {
  const es = S.es;
  // FB.login tiene que salir justo con el toque (si no, el navegador bloquea la ventana)
  if (!window.FB || !window.__fbReady) {
    toast('Cargando Meta… toca otra vez en unos segundos');
    loadFbSdk(es).catch((e) => toast(e.message, 6000));
    return;
  }
  let session = null;
  const onMsg = (ev) => {
    let host = '';
    try {
      host = new URL(ev.origin).hostname;
    } catch {}
    if (!/(^|\.)facebook\.com$/.test(host)) return;
    let d = ev.data;
    try {
      if (typeof d === 'string') d = JSON.parse(d);
    } catch {
      return;
    }
    if (d && d.type === 'WA_EMBEDDED_SIGNUP') session = d;
  };
  window.addEventListener('message', onMsg);
  const done = (resp) => {
    (async () => {
      const code = resp?.authResponse?.code;
      // El aviso de la ventana puede llegar un poco después que el código
      for (let i = 0; i < 10 && code && !session; i++) await new Promise((r) => setTimeout(r, 200));
      window.removeEventListener('message', onMsg);
      if (!code) {
        toast(session?.event === 'CANCEL' ? 'Se cerró la ventana de Meta sin terminar.' : session?.event === 'ERROR' ? `Meta dio un error: ${session.data?.error_message || ''}` : 'No se completó la conexión.', 6000);
        return;
      }
      toast('Conectando tu número…', 8000);
      try {
        const r = await api('POST', `/stores/${st.id}/whatsapp/signup`, {
          code,
          phone_number_id: session?.data?.phone_number_id || null,
          waba_id: session?.data?.waba_id || null,
          coexistencia: coex || session?.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
          page_url: location.href.split(/[?#]/)[0],
          dialog_redirect: S.esRedirect?.() || '',
          es_event: session ? `${session.event || ''}${session.data?.current_step ? ` · ${session.data.current_step}` : ''}${session.data?.error_message ? ` · ${session.data.error_message}` : ''}` : 'sin aviso de la ventana',
        });
        setMe(r);
        S.connSteps = { steps: r.steps || [], ok: r.ok, error: r.error };
        S.es = null;
        toast(r.ok ? '¡Número conectado!' : 'No se pudo terminar: mira el detalle', 5000);
        render();
      } catch (e) {
        toast(e.message, 6000);
      }
    })();
  };
  // Meta exige, al canjear el código, la MISMA dirección de regreso con que abrió su ventana:
  // se lee de la ventana que abre el SDK (no cambia nada de lo que hace Meta)
  let dialogRedirect = '';
  const origOpen = window.open;
  window.open = function (u, ...rest) {
    try {
      const url = new URL(String(u), location.href);
      if (/(^|\.)facebook\.com$/.test(url.hostname) && /dialog\/oauth/.test(url.pathname)) dialogRedirect = url.searchParams.get('redirect_uri') || '';
    } catch {}
    return origOpen.call(window, u, ...rest);
  };
  S.esRedirect = () => dialogRedirect;
  setTimeout(() => {
    if (window.open !== origOpen) window.open = origOpen;
  }, 1500);
  window.FB.login(done, {
    config_id: es.config_id,
    response_type: 'code',
    override_default_response_type: true,
    // Registro insertado v4: «extras» va casi vacío (las claves viejas de v2/v3 hacen que Meta salte los pasos);
    // la coexistencia la detecta Meta sola si el número ya usa WhatsApp Business en el celular
    extras: { setup: {} },
  });
}

// Permiso de Meta con fecha de vencimiento (Conectar con un clic: 30 o 60 días)
function tokenExpHTML(st) {
  if (!st.token_exp) return '';
  const dias = Math.ceil((st.token_exp - Date.now()) / 864e5);
  const fecha = new Date(st.token_exp).toLocaleDateString('es-PE', { timeZone: st.timezone || 'America/Lima', day: 'numeric', month: 'long', year: 'numeric' });
  if (dias <= 0) return `<div class="err" style="margin:0 0 12px">Venció el permiso de Meta (${esc(fecha)}): el número ya no manda mensajes. Toca «Conectar WhatsApp» arriba con el mismo número.</div>`;
  if (dias <= 7) return `<div class="warnbox" style="margin:0 0 12px">El permiso de Meta vence en ${dias} ${dias === 1 ? 'día' : 'días'} (${esc(fecha)}). Toca «Conectar WhatsApp» arriba con el mismo número: toma 1 minuto y no se pierde nada.</div>`;
  return `<p class="note" style="margin:-4px 0 12px">Permiso de Meta vigente hasta el ${esc(fecha)}. Te avisamos 7 días antes para renovarlo.</p>`;
}

function cfgNumero() {
  const st = store();
  const body = $('#cfgbody');
  if (!st) return (body.innerHTML = '<div class="empty"><b>Sin tienda</b><span>Agrega una tienda desde el selector.</span><button class="send" data-act="addstore">Agregar tienda</button></div>');
  const h = S.health;
  const yes = (v) => (v ? '<span class="y">✓</span>' : '<span class="n">✗</span>');
  const adm = !!S.me.user.is_admin; // los pasos técnicos (identificadores, PIN, webhook) solo los ve el administrador
  body.innerHTML = `
  <div class="ph"><div><h2>${esc(st.name)}</h2><p>Este número es la tienda: sus chats, etiquetas y equipo son solo suyos.</p></div><span class="grow"></span>${statusPill(st.status)}</div>
  <div class="grid">
    <div class="card esconn" id="esconn"><h3>Conectar con un clic</h3><span class="spin"></span></div>
    <div class="card"><h3>Conexión</h3>
      ${st.status === 'activo'
        ? `<p class="sub">Conectado como <b>${esc(st.verified_name || '—')}</b> · <span class="mono">${esc(st.phone_display || '')}</span></p>${tokenExpHTML(st)}`
        : adm ? `<p class="sub">Pon los identificadores de abajo, toca «Guardar» y luego «Conectar número». Si no sabes el de la cuenta, déjalo vacío: el CRM lo busca solo.</p>` : `<p class="sub">Todavía no hay un número conectado. Toca «Conectar WhatsApp» arriba.</p>${helpWA('Hola, necesito ayuda para conectar mi número de WhatsApp en Control Total')}`}
      ${st.connect_error ? `<div class="err" style="margin-bottom:12px">${esc(st.connect_error)}</div>` : ''}
      ${S.connSteps ? `<ul class="stlist" style="margin-bottom:12px">${S.connSteps.steps.map((x) => `<li><span class="${/^(Cuenta|El token|No se pudo)/.test(x) ? 'n' : /^Info/.test(x) ? 'y' : 'y'}">${/^(Cuenta|El token|No se pudo)/.test(x) ? '•' : /^Info/.test(x) ? 'ℹ' : '✓'}</span><span style="overflow-wrap:anywhere">${esc(x)}</span></li>`).join('')}${S.connSteps.ok ? '' : `<li><span class="n">✗</span><span>${esc(S.connSteps.error)}</span></li>`}</ul>` : ''}
      ${adm || st.phone_number_id ? `<button class="send" data-act="connect" ${st.phone_number_id ? '' : 'disabled'}>${st.status === 'activo' ? 'Probar conexión otra vez' : 'Conectar número'}</button>` : ''}
    </div>
    ${adm ? `<div class="card"><h3>Activar número en la API</h3><p class="sub">Solo para un número recién agregado o pasado a una cuenta nueva: después de verificarlo con el código SMS en Meta, se activa aquí. El PIN de 6 números queda como «verificación en dos pasos». Anótalo.</p>
      <form id="rf" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
        <div class="field" style="flex:1;min-width:160px"><label for="r-pin">PIN nuevo (6 números)</label><input id="r-pin" name="pin" inputmode="numeric" maxlength="6" pattern="\\d{6}" required autocomplete="off" class="mono"></div>
        <button class="iconbtn" type="submit" style="height:38px" ${st.phone_number_id ? '' : 'disabled'}>Activar número</button>
        <div class="err" hidden style="width:100%"></div>
      </form></div>` : ''}
    <div class="card"><h3>Datos del número</h3><p class="sub">Se guardan solo para esta tienda.</p>
      <form id="sf" class="grid" style="gap:12px">
        <div class="fields">
          <div class="field"><label for="s-name">Nombre de la tienda</label><input id="s-name" name="name" value="${esc(st.name)}" required></div>
          <div class="field"><label for="s-disp">Número visible</label><input id="s-disp" name="phone_display" value="${esc(st.phone_display || '')}" placeholder="+51 9…"></div>
        </div>
        <div class="field"><label>Color</label><div class="swatches" id="ssw">${STORE_COLORS.map((col) => `<button type="button" data-swatch="${col}" aria-pressed="${col.toLowerCase() === (st.color || '').toLowerCase()}" style="background:${col}" aria-label="Color"></button>`).join('')}</div></div>
        ${adm ? `<div class="fields">
          <div class="field"><label for="s-pid">Identificador del número de teléfono</label><input id="s-pid" name="phone_number_id" class="mono" inputmode="numeric" value="${esc(st.phone_number_id || '')}" placeholder="Ej: 106540352242922"></div>
          <div class="field"><label for="s-waba">Identificador de la cuenta de WhatsApp Business</label><input id="s-waba" name="waba_id" class="mono" inputmode="numeric" value="${esc(st.waba_id || '')}" placeholder="Ej: 102290129340398"></div>
        </div>
        <details><summary class="note" style="cursor:pointer">Opciones avanzadas</summary>
          <div class="grid" style="gap:12px;margin-top:10px">
            <div class="field"><label for="s-tok">Nombre del secreto del token en Cloudflare</label><input id="s-tok" name="token_secret" class="mono" value="${esc(st.token_secret || 'WA_TOKEN')}"><span class="note">Déjalo en WA_TOKEN si todos tus números están en el mismo portafolio de Meta.</span></div>
            <label class="check"><input type="checkbox" name="read_receipts" ${st.read_receipts ? 'checked' : ''}> Mostrar doble check azul a la clienta cuando abrimos su chat</label>
          </div>
        </details>` : `<label class="check"><input type="checkbox" name="read_receipts" ${st.read_receipts ? 'checked' : ''}> Mostrar doble check azul a la clienta cuando abrimos su chat</label>`}
        <div class="err" hidden></div>
        <div><button class="send" type="submit">Guardar</button></div>
      </form>
    </div>
    ${adm ? `<div class="card"><h3>Webhook de Meta</h3><p class="sub">Esto se pega una sola vez en Meta → tu app SUYON CRM → WhatsApp → Configuración.</p>
      ${h ? `<div class="grid" style="gap:10px">
        <div class="field"><label>URL de devolución de llamada</label><div class="copyrow"><code>${esc(h.webhook_url)}</code><button class="iconbtn" data-copy="${esc(h.webhook_url)}">${ICON.copy}Copiar</button></div></div>
        <div class="field"><label>Token de verificación</label><p class="note" style="margin:0">El mismo texto que pusiste en Cloudflare como <span class="mono">WA_VERIFY_TOKEN</span>.</p></div>
        <div class="field"><label>Campos a suscribir</label><p class="note" style="margin:0"><span class="mono">messages</span> (y <span class="mono">smb_message_echoes</span> si el número también se usa en la app del celular).</p></div>
        <ul class="stlist">${Object.entries(h.secrets).map(([k, v]) => `<li>${yes(v)}<span>Secreto <span class="mono">${esc(k)}</span> ${v ? 'puesto' : 'falta ponerlo en Cloudflare'}</span></li>`).join('')}
          <li>${yes(h.last_webhook_at)}<span>Último aviso de Meta: ${esc(ago(h.last_webhook_at))}</span></li>
          <li><span class="y">·</span><span>${h.chats} chats en total, ${h.active_24h} con mensajes en las últimas 24 h</span></li></ul>
        ${h.log.length ? `<details><summary class="note" style="cursor:pointer">Registro de avisos raros (${h.log.length})</summary><div class="loglist" style="margin-top:8px">${h.log.map((l) => `<div>${esc(new Date(l.received_at).toLocaleString('es-PE'))} · <b>${esc(l.kind)}</b> ${esc(l.phone_number_id || '')} ${esc(l.detail || '')}</div>`).join('')}</div></details>` : ''}
      </div>` : '<span class="spin"></span>'}
    </div>
    ${h ? `<div class="card"><h3>Para publicar la app en Meta</h3><p class="sub">Meta pide estos enlaces en Configuración de la app → Básica.</p>
      <div class="grid" style="gap:8px">
        <div class="field"><label>Política de privacidad</label><div class="copyrow"><code>${esc(h.privacy_url)}</code><button class="iconbtn" data-copy="${esc(h.privacy_url)}">${ICON.copy}</button></div></div>
        <div class="field"><label>Eliminación de datos</label><div class="copyrow"><code>${esc(h.privacy_url.replace('/privacidad', '/eliminar-datos'))}</code><button class="iconbtn" data-copy="${esc(h.privacy_url.replace('/privacidad', '/eliminar-datos'))}">${ICON.copy}</button></div></div>
        <div class="field"><label>Condiciones del servicio</label><div class="copyrow"><code>${esc(h.privacy_url.replace('/privacidad', '/terminos'))}</code><button class="iconbtn" data-copy="${esc(h.privacy_url.replace('/privacidad', '/terminos'))}">${ICON.copy}</button></div></div>
      </div></div>` : ''}` : ''}
    <div class="card danger"><h3>Borrar tienda</h3><p class="sub">Borra sus chats, mensajes, archivos y etiquetas para siempre. No toca nada en Meta.</p>
      <button class="btn-danger" data-act="delstore">Borrar ${esc(st.name)}</button></div>
  </div>`;
  drawSignup(st);
  let color = st.color;
  $('#ssw').onclick = (e) => {
    const b = e.target.closest('[data-swatch]');
    if (!b) return;
    color = b.dataset.swatch;
    $$('#ssw button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  };
  formHandler($('#sf'), async (d) => {
    const r = await api('PATCH', `/stores/${st.id}`, { ...d, color, read_receipts: !!d.read_receipts });
    setMe(r);
    toast('Guardado');
    render();
  });
  formHandler($('#rf'), async (d) => {
    await api('POST', `/stores/${st.id}/register`, d);
    $('#rf').reset();
    toast('Número activado. Ahora toca «Conectar número».', 5000);
  });
  if (!h) loadHealth();
}

async function loadHealth() {
  try {
    S.health = await api('GET', `/stores/${S.storeId}/health`);
    if (S.view === 'config' && S.cfgTab === 'numero') cfgNumero();
  } catch (e) {
    toast(e.message);
  }
}

async function connectStore(btn) {
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> Conectando…';
  try {
    const r = await api('POST', `/stores/${S.storeId}/connect`);
    setMe(r);
    S.health = null;
    S.connSteps = { steps: r.steps, ok: r.ok, error: r.error };
    render();
    toast(r.ok ? 'Número conectado' : 'No se pudo conectar');
  } catch (e) {
    toast(e.message);
    btn.disabled = false;
  }
}

function delStoreModal() {
  const st = store();
  modal(`<h3>Borrar ${esc(st.name)}</h3><p class="note" style="margin:0">Se borran todos sus chats y archivos. No se puede deshacer. Escribe el nombre de la tienda para confirmar.</p>
    <form id="df" class="grid" style="gap:12px"><div class="field"><input name="confirm" placeholder="${esc(st.name)}" autocomplete="off" required></div><div class="err" hidden></div>
    <div class="row"><button type="button" class="iconbtn" data-close>Cancelar</button><button class="btn-danger" type="submit">Borrar para siempre</button></div></form>`);
  formHandler($('#df'), async (d) => {
    const r = await api('DELETE', `/stores/${st.id}`, d);
    setMe(r);
    closeModal();
    S.storeId = r.stores[0]?.id ?? null;
    enterStore();
    toast('Tienda borrada');
  });
}

function cfgEtiquetas() {
  const body = $('#cfgbody');
  const colorSel = (cur, attr) => `<select ${attr} aria-label="Color">${LABEL_COLORS.map(([v, n]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
  body.innerHTML = `<div class="ph"><div><h2>Etiquetas</h2><p>Sirven para ordenar los chats y filtrarlos. Las de borde punteado las pondrá el bot solo (fase 2): puedes cambiarles el color, no el nombre.</p></div></div>
    <div class="card" style="margin-bottom:14px">${S.labels.map((l) => `<div class="lrow" data-lrow="${l.id}">
        <div style="display:flex;gap:8px;align-items:center;min-width:0">${tagHTML(l)}${l.auto ? '' : `<input value="${esc(l.name)}" data-lname="${l.id}" aria-label="Nombre" maxlength="30">`}</div>
        ${colorSel(l.color, `data-lcolor="${l.id}"`)}
        <div class="acts"><span class="note">${l.n} chats</span>${l.auto ? '' : `<button class="iconbtn" data-ldel="${l.id}" aria-label="Borrar etiqueta">${ICON.trash}</button>`}</div>
      </div>`).join('') || '<span class="spin"></span>'}</div>
    <div class="card"><h3>Nueva etiqueta</h3><form id="lf" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
      <input name="name" required maxlength="30" placeholder="Ej: CAMBIO DE TALLA" aria-label="Nombre" style="flex:1;min-width:160px;border:1px solid var(--line);border-radius:8px;padding:8px 10px;background:var(--bg)">
      ${colorSel('--t-blue', 'name="color" style="border:1px solid var(--line);border-radius:8px;padding:8px;background:var(--bg)"')}
      <button class="send" type="submit">Agregar</button><div class="err" hidden style="width:100%"></div></form></div>`;
  formHandler($('#lf'), async (d) => {
    await api('POST', `/stores/${S.storeId}/labels`, d);
    await loadLabels();
    toast('Etiqueta creada');
  });
}

async function cfgEquipo() {
  const st = store();
  const body = $('#cfgbody');
  if (!st) return (body.innerHTML = '');
  const co = company(st.company_id);
  const coStores = S.me.stores.filter((s) => s.company_id === co.id);
  if (!S.team || S.team.company !== co.id) {
    body.innerHTML = '<span class="spin"></span>';
    try {
      S.team = { company: co.id, ...(await api('GET', `/companies/${co.id}/team`)) };
    } catch (e) {
      return (body.innerHTML = `<div class="err">${esc(e.message)}</div>`);
    }
    if (S.cfgTab !== 'equipo') return;
  }
  const T = S.team;
  const sees = (m) => (m.role === 'dueno' || m.all_stores ? 'Todas las tiendas' : m.store_ids.map((id) => coStores.find((s) => s.id === id)?.name).filter(Boolean).join(', ') || '—');
  const roleOpts = (cur) => Object.entries(S.me.roles).map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${v}</option>`).join('');
  body.innerHTML = `<div class="ph"><div><h2>Equipo de ${esc(co.name)}</h2><p>Cada persona entra con su correo y ve solo lo de su rol y las tiendas que le asignes. La asesora no ve configuración, gastos ni utilidades.</p></div></div>
    <div class="card" style="margin-bottom:14px"><div class="tbl"><table><thead><tr><th>Persona</th><th>Rol</th><th>Ve</th><th></th></tr></thead><tbody>
      ${T.members.map((m) => `<tr><td><b>${esc(m.name)}</b><br><span class="note">${esc(m.email)}</span></td><td>${esc(S.me.roles[m.role])}</td><td style="white-space:normal">${esc(sees(m))}</td>
        <td class="r"><div style="display:flex;gap:6px;justify-content:flex-end">${m.id === S.me.user.id ? '<span class="note">Tú</span>' : `<button class="iconbtn" data-medit="${m.id}">Cambiar</button><button class="iconbtn" data-mreset="${m.id}" title="Enlace para cambiar contraseña">Clave</button><button class="iconbtn" data-mdel="${m.id}" aria-label="Quitar del equipo">${ICON.trash}</button>`}</div></td></tr>`).join('')}
    </tbody></table></div></div>
    ${T.invites.length ? `<div class="card" style="margin-bottom:14px"><h3>Invitaciones sin aceptar</h3><div class="tbl"><table><tbody>${T.invites.map((i) => `<tr><td>${esc(i.email)}</td><td>${esc(S.me.roles[i.role])}</td><td class="note">vence ${esc(new Date(i.expires_at).toLocaleDateString('es-PE'))}</td><td class="r"><button class="iconbtn" data-idel="${i.id}">Anular</button></td></tr>`).join('')}</tbody></table></div></div>` : ''}
    <div class="card"><h3>Invitar</h3><p class="sub">Se crea un enlace que le mandas por WhatsApp. Vence en 7 días.</p>
      <form id="if" class="grid" style="gap:12px">
        <div class="fields"><div class="field"><label for="i-email">Correo</label><input id="i-email" name="email" type="email" required placeholder="correo@ejemplo.com"></div>
        <div class="field"><label for="i-role">Rol</label><select id="i-role" name="role">${roleOpts('asesora')}</select></div></div>
        ${storePicker(coStores, true, [])}
        <div class="err" hidden></div><div><button class="send" type="submit">Crear invitación</button></div>
      </form></div>`;
  wireStorePicker($('#if'));
  formHandler($('#if'), async (d) => {
    const r = await api('POST', `/companies/${co.id}/invites`, pickerValues($('#if'), d));
    S.team = null;
    cfgEquipo();
    linkModal('Invitación lista', `Mándale este enlace a ${r.email}. Al abrirlo crea su contraseña y entra.`, r.link);
  });
}

function storePicker(stores, all, selected) {
  return `<div class="field sp"><label>Tiendas que verá</label><div class="checks">
    <label class="check"><input type="checkbox" name="all_stores" ${all ? 'checked' : ''}> Todas las tiendas (también las que agregues después)</label>
    <div class="checks sp-list" style="padding-left:24px" ${all ? 'hidden' : ''}>${stores.map((s) => `<label class="check"><input type="checkbox" name="store" value="${s.id}" ${selected.includes(s.id) ? 'checked' : ''}> ${esc(s.name)}</label>`).join('')}</div></div></div>`;
}
function wireStorePicker(form) {
  const all = form.querySelector('[name=all_stores]');
  const roleSel = form.querySelector('[name=role]');
  const sync = () => {
    const isOwner = roleSel?.value === 'dueno';
    form.querySelector('.sp').hidden = isOwner;
    form.querySelector('.sp-list').hidden = all.checked;
  };
  all.onchange = sync;
  if (roleSel) roleSel.onchange = sync;
  sync();
}
function pickerValues(form, d) {
  return { email: d.email, role: d.role, all_stores: form.querySelector('[name=all_stores]').checked, store_ids: $$('[name=store]:checked', form).map((x) => Number(x.value)) };
}

function editMemberModal(id) {
  const m = S.team.members.find((x) => x.id === id);
  const st = store();
  const coStores = S.me.stores.filter((s) => s.company_id === st.company_id);
  modal(`<h3>${esc(m.name)}</h3><form id="mf" class="grid" style="gap:12px">
    <div class="field"><label for="m-role">Rol</label><select id="m-role" name="role">${Object.entries(S.me.roles).map(([k, v]) => `<option value="${k}" ${k === m.role ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    ${storePicker(coStores, !!m.all_stores, m.store_ids)}
    <div class="err" hidden></div><div class="row"><button type="button" class="iconbtn" data-close>Cancelar</button><button class="send" type="submit">Guardar</button></div></form>`);
  wireStorePicker($('#mf'));
  formHandler($('#mf'), async (d) => {
    await api('PATCH', `/companies/${st.company_id}/members/${id}`, pickerValues($('#mf'), d));
    closeModal();
    S.team = null;
    cfgEquipo();
    toast('Guardado');
  });
}

function cfgEmpresa() {
  const body = $('#cfgbody');
  const mine = S.me.companies.filter((c) => c.role === 'dueno');
  body.innerHTML = `<div class="ph"><div><h2>Empresas</h2><p>Cada empresa (cada marca) tiene sus propias tiendas y su propio equipo.</p></div></div>
    <div class="grid">${mine.map((c) => `<div class="card"><form data-coform="${c.id}" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
      <div class="field" style="flex:1;min-width:180px"><label>Nombre</label><input name="name" value="${esc(c.name)}" required maxlength="60"></div>
      <button class="iconbtn" type="submit" style="height:38px">Guardar</button><div class="err" hidden style="width:100%"></div></form>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px"><span class="note" style="flex:1">${S.me.stores.filter((s) => s.company_id === c.id).map((s) => esc(s.name)).join(' · ') || 'Sin tiendas todavía'}</span><button class="iconbtn" data-act="addstore">+ Agregar tienda</button></div></div>`).join('')}
    ${S.me.user.is_admin ? `<div class="card"><h3>Nueva empresa</h3><form id="cf" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
      <input name="name" required maxlength="60" placeholder="Ej: Mi Marca" aria-label="Nombre de la empresa" style="flex:1;min-width:180px;border:1px solid var(--line);border-radius:8px;padding:8px 10px;background:var(--bg)">
      <button class="send" type="submit">Crear</button><div class="err" hidden style="width:100%"></div></form></div>` : ''}</div>`;
  $$('[data-coform]', body).forEach((f) => formHandler(f, async (d) => {
    setMe(await api('PATCH', `/companies/${f.dataset.coform}`, d));
    render();
    toast('Guardado');
  }));
  if ($('#cf')) formHandler($('#cf'), async (d) => {
    setMe(await api('POST', '/companies', d));
    render();
    toast('Empresa creada. Agrégale una tienda desde el selector de tiendas.');
  });
}

function cfgCuenta() {
  const body = $('#cfgbody');
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  body.innerHTML = `<div class="ph"><div><h2>Mi cuenta</h2><p>${esc(S.me.user.email)}</p></div></div>
    <div class="grid">
      <div class="card"><h3>Tu nombre</h3><p class="sub">Así aparece en los mensajes que envías.</p><form id="nf" style="display:flex;gap:8px;flex-wrap:wrap">
        <input name="name" value="${esc(S.me.user.name)}" required maxlength="60" aria-label="Nombre" style="flex:1;min-width:180px;border:1px solid var(--line);border-radius:8px;padding:8px 10px;background:var(--bg)">
        <button class="send" type="submit">Guardar</button><div class="err" hidden style="width:100%"></div></form></div>
      <div class="card"><h3>Avisos</h3><p class="sub">Suena cuando llega un mensaje nuevo. Con avisos activados, también te llega una notificación si la app está en segundo plano.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          <label class="check"><input type="checkbox" id="snd" ${pref.get('sound', true) !== false ? 'checked' : ''}> Sonido</label>
          ${perm === 'granted' ? '<span class="pillst st-on">Notificaciones activadas</span>' : perm === 'denied' ? '<span class="note">Notificaciones bloqueadas: actívalas en el candado de la barra de direcciones.</span>' : perm === 'unsupported' ? '<span class="note">En iPhone: primero agrega la app a la pantalla de inicio.</span>' : '<button class="iconbtn" data-act="notif">Activar notificaciones</button>'}
          <button class="iconbtn" data-act="testding">Probar sonido</button>
        </div></div>
      <div class="card"><h3>Apariencia</h3><p class="sub">Cómo se ve la app en este equipo.</p>
        <div class="seg" role="radiogroup" aria-label="Apariencia" id="themeseg">${[['light', 'Claro'], ['dark', 'Oscuro'], ['auto', 'Como mi celular']].map(([k, l]) => `<button type="button" data-theme="${k}" aria-pressed="${pref.get('theme', 'light') === k}">${l}</button>`).join('')}</div></div>
      <div class="card"><h3>Cambiar contraseña</h3><form id="pf" class="grid" style="gap:12px;margin-top:8px">
        <div class="fields"><div class="field"><label for="p1">Actual</label><input id="p1" name="current" type="password" required autocomplete="current-password"></div>
        <div class="field"><label for="p2">Nueva (mínimo 8)</label><input id="p2" name="password" type="password" minlength="8" required autocomplete="new-password"></div></div>
        <div class="err" hidden></div><div><button class="send" type="submit">Cambiar</button></div></form></div>
      <div class="card"><h3>Instalar en el celular</h3><p class="sub" style="margin:0">Android (Chrome): menú ⋮ → «Instalar app». iPhone (Safari): botón Compartir → «Agregar a inicio».</p></div>
      <div><button class="iconbtn" data-act="logout">Salir de la cuenta</button></div>
    </div>`;
  $('#themeseg').onclick = (ev) => {
    const b = ev.target.closest('[data-theme]');
    if (!b) return;
    pref.set('theme', b.dataset.theme);
    applyTheme(b.dataset.theme);
    $$('#themeseg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  };
  formHandler($('#nf'), async (d) => {
    setMe(await api('PATCH', '/me', d));
    render();
    toast('Guardado');
  });
  formHandler($('#pf'), async (d) => {
    await api('POST', '/me/password', d);
    $('#pf').reset();
    toast('Contraseña cambiada. Se cerró la sesión en tus otros equipos.');
  });
  $('#snd').onchange = (e) => pref.set('sound', e.target.checked);
}

/* =================== Eventos =================== */
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act],[data-nav],[data-store],[data-open],[data-filter],[data-tagf],[data-tag],[data-cfg],[data-copy],[data-reply],[data-retry],[data-refetch],[data-zoom],[data-close],[data-ldel],[data-medit],[data-mreset],[data-mdel],[data-idel]');
  if (!t) {
    if (S.tagMenu && !e.target.closest('.tagmenu')) {
      S.tagMenu = false;
      renderListHead();
      renderItems();
    }
    return;
  }
  const d = t.dataset;
  if ('close' in d) {
    if (e.target === t || t.matches('button')) closeModal();
    return;
  }
  if ((d.nav || d.cfg || d.store) && botDirty() && !confirm('Tienes cambios del bot sin guardar. ¿Salir igual?')) return;
  if (d.nav) {
    S.view = d.nav;
    if (d.tab) S.cfgTab = d.tab;
    else if (d.nav === 'config' && S.cfgTab === 'cuenta' && owner()) S.cfgTab = null;
    S.storeMenu = false;
    if (d.nav === 'config') S.health = null;
    render();
    if (d.nav === 'chats' && canChats() && !S.chats.size && !planBlocked()) loadChats();
    if (d.nav === 'config' && !S.labels.length && owner() && !planBlocked()) loadLabels();
    return;
  }
  if (d.store) {
    S.storeMenu = false;
    S.storeId = Number(d.store);
    if (['pedidos', 'envios'].includes(S.view) && canChats()) S.view = 'chats';
    enterStore();
    return;
  }
  if (d.open) return S.chats.has(Number(d.open)) ? openChat(Number(d.open)) : goChat(Number(d.open));
  if (d.filter) {
    S.filter = d.filter;
    renderListHead();
    renderItems();
    if (S.filter !== 'todos') loadChats();
    return;
  }
  if (d.tagf) {
    const id = Number(d.tagf);
    S.tagf = S.tagf.includes(id) ? S.tagf.filter((x) => x !== id) : [...S.tagf, id];
    renderListHead();
    renderItems();
    if (S.tagf.length) loadChats();
    return;
  }
  if (d.tag) return toggleTag(Number(d.tag));
  if (d.cfg) {
    S.cfgTab = d.cfg;
    if (d.cfg === 'numero') S.health = null;
    renderConfig();
    if (d.cfg === 'etiquetas') loadLabels();
    return;
  }
  if (d.copy) return copy(d.copy);
  if (d.reply) {
    S.replyTo = Number(d.reply);
    renderReply();
    $('#draft')?.focus();
    return;
  }
  if (d.retry) {
    const chatId = S.openId;
    try {
      const r = await api('POST', `/messages/${d.retry}/retry`);
      replaceLocal(chatId, Number(d.retry), r.message);
      if (r.message.status === 'failed') toast(r.message.error, 5000);
    } catch (er) {
      toast(er.message, 5000);
    }
    return;
  }
  if (d.refetch) {
    t.disabled = true;
    try {
      const res = await fetch(`/api/media/${d.refetch}`, { cache: 'reload' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'No se pudo');
      const m = msgState(S.openId).list.find((x) => x.id === Number(d.refetch));
      if (m) {
        m.media_status = 'ok';
        m.local_url = URL.createObjectURL(await res.blob());
      }
      renderMsgs();
    } catch (er) {
      toast(er.message, 5000);
      t.disabled = false;
    }
    return;
  }
  if (d.zoom) {
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = `<img src="${esc(d.zoom)}" alt="Foto">`;
    lb.onclick = () => lb.remove();
    document.body.appendChild(lb);
    return;
  }
  if (d.ldel) {
    const l = labelById(Number(d.ldel));
    if (!confirm(`¿Borrar la etiqueta «${l.name}»? Se quita de ${l.n} chats.`)) return;
    try {
      await api('DELETE', `/labels/${l.id}`);
      await loadLabels();
    } catch (er) {
      toast(er.message);
    }
    return;
  }
  if (d.medit) return editMemberModal(Number(d.medit));
  if (d.mreset) {
    try {
      const r = await api('POST', `/companies/${store().company_id}/members/${d.mreset}/reset`);
      const m = S.team.members.find((x) => x.id === Number(d.mreset));
      linkModal('Enlace para cambiar contraseña', `Mándale este enlace a ${m.name}. Sirve una sola vez y vence en 2 días.`, r.link);
    } catch (er) {
      toast(er.message);
    }
    return;
  }
  if (d.mdel) {
    const m = S.team.members.find((x) => x.id === Number(d.mdel));
    if (!confirm(`¿Quitar a ${m.name} del equipo? Ya no podrá entrar a esta empresa.`)) return;
    try {
      await api('DELETE', `/companies/${store().company_id}/members/${m.id}`);
      S.team = null;
      cfgEquipo();
    } catch (er) {
      toast(er.message);
    }
    return;
  }
  if (d.idel) {
    try {
      await api('DELETE', `/companies/${store().company_id}/invites/${d.idel}`);
      S.team = null;
      cfgEquipo();
    } catch (er) {
      toast(er.message);
    }
    return;
  }
  switch (d.act) {
    case 'saldo':
      openSaldo();
      break;
    case 'vercomo':
      openVerComo();
      break;
    case 'vercomo-off':
      setPreview(null);
      break;
    case 'vercomo-asis':
      S.asis = 'preview';
      resetAsistente();
      render();
      break;
    case 'stores':
      S.storeMenu = !S.storeMenu;
      return drawStoreMenu();
    case 'closestores':
      S.storeMenu = false;
      return drawStoreMenu();
    case 'addstore':
      S.storeMenu = false;
      drawStoreMenu();
      return addStoreModal();
    case 'tagmenu':
      S.tagMenu = !S.tagMenu;
      renderListHead();
      return renderItems();
    case 'morechats':
      return loadChats({ more: true });
    case 'back':
      if (history.state?.chat) history.back();
      else closeChat();
      return;
    case 'ficha':
      S.ficha = !S.ficha;
      layoutChats();
      renderConvHead();
      return renderFicha();
    case 'older':
      return loadMessages(S.openId, { older: true });
    case 'noreply':
      S.replyTo = null;
      return renderReply();
    case 'send':
      return sendText();
    case 'attach':
      return fileInput.click();
    case 'mic':
      return startRec();
    case 'reccancel':
      return stopRec(true);
    case 'recsend':
      return stopRec(false);
    case 'vercliente':
      return S.openId && goCliente(S.openId);
    case 'markunread': {
      const c = S.chats.get(S.openId);
      await api('PATCH', `/chats/${c.id}`, { unread: true }).catch((er) => toast(er.message));
      c.unread = 1;
      if (history.state?.chat) history.back();
      else closeChat();
      renderItems();
      return;
    }
    case 'connect':
      return connectStore(t);
    case 'delstore':
      return delStoreModal();
    case 'notif':
      try {
        await Notification.requestPermission();
      } catch {}
      return cfgCuenta();
    case 'testding':
      lastDing = 0;
      return ding();
    case 'logout':
      await api('POST', '/logout').catch(() => {});
      S.me = null;
      stopPolling();
      return showLogin();
  }
});

// Cambios en etiquetas (nombre y color) desde Configuración
document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.dataset.lname || t.dataset.lcolor) {
    const id = Number(t.dataset.lname || t.dataset.lcolor);
    const data = t.dataset.lname ? { name: t.value.trim() } : { color: t.value };
    try {
      await api('PATCH', `/labels/${id}`, data);
      await loadLabels();
    } catch (er) {
      toast(er.message);
      loadLabels();
    }
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if ($('.lightbox')) return $('.lightbox').remove();
  if ($('#layer').innerHTML) return closeModal();
  if (S.storeMenu) {
    S.storeMenu = false;
    return drawStoreMenu();
  }
  if (S.rec) return stopRec(true);
});

window.addEventListener('popstate', () => {
  if (S.openId && S.view === 'chats') closeChat();
});

let lastW = window.innerWidth;
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  if ((lastW > 1180) !== (w > 1180) && S.view === 'chats') {
    layoutChats();
    renderFicha();
  }
  lastW = w;
});

// Abre un chat desde Avisos
async function goChat(id) {
  S.view = 'chats';
  render();
  if (!S.chats.size) await loadChats();
  if (!S.chats.has(id)) {
    try {
      const r = await api('GET', `/chats/${id}`);
      mergeChats([r.chat]);
      renderItems();
    } catch (er) {
      return toast(er.message);
    }
  }
  openChat(id);
}

function refreshAvisos() {
  if (S.view === 'avisos' && $('#content')) renderAvisos($('#content'));
}

initBot({ api, esc, toast, $, $$, S, store, goChat, fmtPhone, listTime, renderFicha, refreshAvisos });
initClientes({
  api, esc, toast, $, $$, S, goChat, fmtPhone, listTime, tagHTML, owner,
  forgetMessages(id) {
    S.msgs.delete(id);
    const c = S.chats.get(id);
    if (c) c.last_preview = null;
  },
  forgetChat(id) {
    S.chats.delete(id);
    S.msgs.delete(id);
    if (S.openId === id) S.openId = null;
  },
});

initReportes({ api, esc, $, S, store });
initPedidos({ api, esc, toast, $, $$, S, store, owner, goChat, fmtPhone, listTime, canChats });
initEnvios({ api, esc, toast, $, $$, S, store, owner, goChat, fmtPhone, canChats });
initPanel({ api, esc, toast });
initAsistente({ api, esc, toast, LOGO });
initCarritos({ api, esc, toast, $, $$, S, store, owner, goChat, fmtPhone, goConfig(tab) {
  S.view = 'config';
  S.cfgTab = tab;
  render();
} });

function applyTheme(t) {
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

function goCliente(id) {
  openCliente(id);
  S.view = 'clientes';
  render();
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

boot();
