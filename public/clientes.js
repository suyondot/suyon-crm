// Clientes: el CRM de cada clienta (datos, etiquetas, lo que guardó el bot, compras, borrar)
import { fichaPedidos } from './pedidos.js';
let H; // ayudantes de app.js
export function initClientes(ctx) {
  H = ctx;
}
const e = (s) => H.esc(s);
const K = { list: [], total: 0, q: '', labels: [], origen: '', seg: '', kpis: null, offset: 0, sel: null, loading: false, storeId: null, edit: null };
const SEGS = [
  ['', 'Todas', 'total'],
  ['nueva', 'Nuevas', 'nueva', 'Escribieron y todavía no compran'],
  ['una', 'Compraron 1 vez', 'una', 'Candidatas a la segunda compra'],
  ['frecuente', 'Frecuentes', 'frecuente', '2 o 3 compras'],
  ['vip', 'VIP', 'vip', '4+ compras o S/500 a más'],
  ['reactivar', 'Para reactivar', 'reactivar', 'Compraron y no vuelven hace 60+ días'],
];
const money = (n) => 'S/' + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('es-PE');
function segOf(c) {
  if (!c.compras) return null;
  if (c.ultima_compra && Date.now() - c.ultima_compra > 60 * 864e5) return ['reactivar', 'Para reactivar'];
  if (c.compras >= 4 || c.gastado >= 500) return ['vip', 'VIP'];
  if (c.compras >= 2) return ['frecuente', 'Frecuente'];
  return ['una', '1 compra'];
}
const MAIN_KEYS = ['talla', 'colores', 'cantidad', 'destino', 'distrito', 'nombre', 'celular', 'dni', 'direccion', 'sede_shalom'];
const KEY_NAMES = { talla: 'Talla', colores: 'Colores', cantidad: 'Cantidad', destino: 'Destino', distrito: 'Distrito', nombre: 'Nombre (pedido)', celular: 'Celular (pedido)', dni: 'DNI', direccion: 'Dirección', sede_shalom: 'Sede Shalom' };
const vars = (c) => {
  try {
    return JSON.parse(c.bot_vars || '{}') || {};
  } catch {
    return {};
  }
};
const nameOf = (c) => c.name || c.profile_name || H.fmtPhone(c.wa_id);
const initials = (c) => (nameOf(c).replace(/[^\p{L}\s]/gu, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('') || '#').toUpperCase();

export function resetClientes() {
  K.storeId = null;
  K.sel = null;
}

// Abre la ficha de una clienta desde el chat
export function openCliente(id) {
  K.pending = id;
}

export async function renderClientes(content) {
  if (K.storeId !== H.S.storeId) {
    Object.assign(K, { list: [], total: 0, q: '', labels: [], origen: '', seg: '', kpis: null, offset: 0, sel: null, storeId: H.S.storeId });
  }
  content.innerHTML = `<div class="cli">
    <div class="clihead">
      <div class="clititle"><span id="clitotal"></span></div>
      <span class="grow"></span>
      <div class="search cliq"><input id="cliq" type="search" placeholder="Buscar por nombre, celular, distrito, DNI…" value="${e(K.q)}" aria-label="Buscar clientas" autocomplete="off"></div>
      <select id="cliorigen" aria-label="Origen"><option value="">Todas</option><option value="anuncio" ${K.origen === 'anuncio' ? 'selected' : ''}>Llegaron por anuncio</option><option value="directo" ${K.origen === 'directo' ? 'selected' : ''}>Escribieron directo</option></select>
      ${H.owner() ? `<a class="iconbtn" href="/api/stores/${H.S.storeId}/clientes.csv" download>Descargar Excel</a>` : ''}
    </div>
    <div class="clikpis" id="clikpis"></div>
    <div class="cliseg" id="cliseg" role="tablist" aria-label="Segmentos"></div>
    <div class="clitags" id="clitags" aria-label="Filtrar por etiqueta"></div>
    <div class="cliwrap"><div class="clilist" id="clilist"></div><aside class="clidet" id="clidet" aria-label="Ficha de la clienta"></aside></div>
  </div>`;
  drawTags();
  drawKpis();
  H.$('#cliseg').onclick = (ev) => {
    const b = ev.target.closest('[data-seg]');
    if (!b) return;
    K.seg = b.dataset.seg;
    drawKpis();
    load();
  };
  let tm;
  H.$('#cliq').oninput = (ev) => {
    clearTimeout(tm);
    tm = setTimeout(() => {
      K.q = ev.target.value.trim();
      load();
    }, 300);
  };
  H.$('#cliorigen').onchange = (ev) => {
    K.origen = ev.target.value;
    load();
  };
  H.$('#clitags').onclick = (ev) => {
    const b = ev.target.closest('[data-cf]');
    if (!b) return;
    const id = Number(b.dataset.cf);
    K.labels = K.labels.includes(id) ? K.labels.filter((x) => x !== id) : [...K.labels, id];
    drawTags();
    load();
  };
  H.$('#clilist').onclick = (ev) => {
    if (ev.target.closest('[data-copy]')) return;
    const more = ev.target.closest('[data-climore]');
    if (more) return load(true);
    const row = ev.target.closest('[data-cli]');
    if (row) select(Number(row.dataset.cli));
  };
  if (K.list.length) {
    drawList();
    drawDetail();
  }
  await load();
}

function drawKpis() {
  const k = K.kpis;
  const box = H.$('#clikpis');
  if (box) {
    box.innerHTML = k
      ? [
          ['Compraron', k.compraron, k.total ? `${Math.round((k.compraron / k.total) * 100)} % de ${k.total.toLocaleString('es-PE')}` : ''],
          ['Volvieron a comprar', k.recompra, k.compraron ? `${Math.round((k.recompra / k.compraron) * 100)} % de las que compraron` : ''],
          ['Ticket promedio', money(k.ticket), `${k.pedidos.toLocaleString('es-PE')} pedidos`],
          ['Para reactivar', k.reactivar, `Sin comprar hace ${k.reactivar_dias}+ días`],
        ].map(([l, v, sub]) => `<div class="clikpi"><span>${l}</span><b>${typeof v === 'number' ? v.toLocaleString('es-PE') : v}</b><small>${e(sub)}</small></div>`).join('')
      : '';
  }
  const sb = H.$('#cliseg');
  if (sb) sb.innerHTML = SEGS.map(([key, label, kk, tip]) => `<button data-seg="${key}" aria-pressed="${K.seg === key}" ${tip ? `title="${e(tip)}"` : ''}>${label}${k ? ` <b>${(k[kk] || 0).toLocaleString('es-PE')}</b>` : ''}</button>`).join('');
}

function drawTags() {
  const box = H.$('#clitags');
  if (!box) return;
  box.innerHTML = H.S.labels.map((l) => `<button data-cf="${l.id}" class="${K.labels.includes(l.id) ? '' : 'off'}" aria-pressed="${K.labels.includes(l.id)}">${H.tagHTML(l)}</button>`).join('');
}

async function load(more = false) {
  if (K.loading) return;
  K.loading = true;
  const p = new URLSearchParams({ limit: '50', offset: String(more ? K.list.length : 0) });
  if (K.q) p.set('q', K.q);
  if (K.labels.length) p.set('labels', K.labels.join(','));
  if (K.origen) p.set('origen', K.origen);
  if (K.seg) p.set('seg', K.seg);
  if (!more && !K.list.length) H.$('#clilist').innerHTML = '<div class="empty" style="padding:40px"><span class="spin"></span></div>';
  try {
    const r = await H.api('GET', `/stores/${H.S.storeId}/clientes?${p}`);
    K.list = more ? [...K.list, ...r.clientes] : r.clientes;
    K.total = r.total;
    if (r.kpis) {
      K.kpis = r.kpis;
      drawKpis();
    }
  } catch (er) {
    H.toast(er.message, 5000);
  }
  K.loading = false;
  if (K.pending) {
    const id = K.pending;
    K.pending = null;
    if (!K.list.some((c) => c.id === id)) {
      try {
        const r = await H.api('GET', `/chats/${id}`);
        K.list = [{ ...r.chat, msgs: '—' }, ...K.list];
      } catch {}
    }
    K.sel = id;
    K.edit = null;
    K.dirty = false;
  }
  drawList();
  if (K.sel && !K.list.some((c) => c.id === K.sel)) K.sel = null;
  drawDetail();
}

function summary(v) {
  const parts = [v.talla && `Talla ${v.talla}`, v.colores, v.cantidad && `${v.cantidad} und.`, v.distrito || v.destino].filter(Boolean);
  return parts.join(' · ');
}

function drawList() {
  const box = H.$('#clilist');
  if (!box) return;
  const t = H.$('#clitotal');
  if (t) t.textContent = `${K.total.toLocaleString('es-PE')} ${K.total === 1 ? 'clienta' : 'clientas'}`;
  if (!K.list.length) {
    box.innerHTML = `<div class="empty" style="padding:48px 16px"><b>${K.q || K.labels.length || K.origen || K.seg ? 'Nadie con ese filtro' : 'Todavía no hay clientas'}</b><span>${K.q || K.labels.length || K.origen || K.seg ? 'Prueba con otra búsqueda, otro segmento o quita etiquetas.' : 'Cada persona que te escribe por WhatsApp aparece aquí con sus datos.'}</span></div>`;
    return;
  }
  const lab = Object.fromEntries(H.S.labels.map((l) => [l.id, l]));
  box.innerHTML = `<table class="clitable"><thead><tr><th>Clienta</th><th>Celular</th><th>Etiquetas</th><th>Datos que guardó</th><th>Compras</th><th>Origen</th><th class="r">Último mensaje</th></tr></thead><tbody>
    ${K.list.map((c) => {
      const v = vars(c);
      return `<tr data-cli="${c.id}" class="${c.id === K.sel ? 'sel' : ''}" tabindex="0">
        <td><div class="cliwho"><span class="cliav">${e(initials(c))}</span><span><b>${e(nameOf(c))}</b>${c.name && c.profile_name && c.profile_name !== c.name ? `<small>${e(c.profile_name)}</small>` : ''}</span></div></td>
        <td class="mono nowrap">${e(H.fmtPhone(c.wa_id))}</td>
        <td><div class="clichips">${c.labels.map((id) => H.tagHTML(lab[id])).join('') || '<span class="note">—</span>'}</div></td>
        <td class="clisum" title="${e(summary(v))}">${e(summary(v)) || '<span class="note">—</span>'}</td>
        <td class="nowrap">${c.compras ? `<b class="mono">${c.compras}</b> · ${money(c.gastado)}${segOf(c) ? ` <span class="pillsm seg-${segOf(c)[0]}">${segOf(c)[1]}</span>` : ''}` : '<span class="note">—</span>'}</td>
        <td>${c.ad_id ? '<span class="pillsm ad">Anuncio</span>' : '<span class="pillsm">Directo</span>'}</td>
        <td class="r note nowrap">${e(H.listTime(c.last_msg_at || c.created_at))}</td></tr>`;
    }).join('')}</tbody></table>
    ${K.list.length < K.total ? `<button class="iconbtn loadmore" data-climore>${K.loading ? 'Cargando…' : `Ver más (${(K.total - K.list.length).toLocaleString('es-PE')})`}</button>` : ''}`;
  for (const tr of box.querySelectorAll('tr[data-cli]')) tr.onkeydown = (ev) => ev.key === 'Enter' && select(Number(tr.dataset.cli));
}

function select(id) {
  K.sel = id;
  K.edit = null;
  K.dirty = false;
  for (const tr of H.$$('#clilist tr[data-cli]')) tr.classList.toggle('sel', Number(tr.dataset.cli) === id);
  drawDetail();
}

function drawDetail() {
  const box = H.$('#clidet');
  if (!box) return;
  const c = K.list.find((x) => x.id === K.sel);
  H.$('.cliwrap')?.classList.toggle('open', !!c);
  if (!c) {
    box.innerHTML = '<div class="empty clipick"><b>Elige una clienta</b><span>Verás su celular, etiquetas, los datos que guardó el bot y podrás corregir o borrar.</span></div>';
    return;
  }
  const v = K.edit || Object.entries(vars(c)).map(([k, val]) => ({ k, v: val }));
  K.edit = v;
  const own = H.owner();
  const phone = c.wa_id.replace(/^51/, '');
  box.innerHTML = `
    <div class="clidhead"><button class="iconbtn clix" data-cd="close" aria-label="Cerrar ficha">←</button>
      <span class="cliav lg">${e(initials(c))}</span>
      <div style="min-width:0;flex:1"><input class="namein" id="cdname" value="${e(c.name || '')}" placeholder="${e(c.profile_name || 'Ponle un nombre')}" aria-label="Nombre de la clienta">
        ${c.profile_name ? `<span class="note">En WhatsApp: ${e(c.profile_name)}</span>` : ''}</div></div>
    <div class="clidact">
      <button class="send" data-cd="chat">Abrir chat</button>
      <a class="iconbtn" href="tel:+${e(c.wa_id)}">Llamar</a>
      <button class="iconbtn" data-copy="${e(phone)}">Copiar celular</button>
    </div>
    <section class="clisec"><h3>Contacto</h3><dl class="kv">
      <dt>Celular</dt><dd class="mono">${e(H.fmtPhone(c.wa_id))}</dd>
      <dt>Primer mensaje</dt><dd>${e(new Date(c.created_at).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' }))}</dd>
      <dt>Último mensaje</dt><dd>${c.last_msg_at ? e(H.listTime(c.last_msg_at)) : '—'} · ${c.msgs} ${c.msgs === 1 ? 'mensaje' : 'mensajes'}</dd>
      <dt>Origen</dt><dd>${c.ad_id ? `Anuncio <span class="mono">${e(c.ad_id)}</span>${c.ad_headline ? ` · ${e(c.ad_headline)}` : ''}` : 'Escribió directo'}</dd>
      <dt>Bot</dt><dd>${c.bot_paused ? 'Pausado · la atiende la asesora' : c.bot_flow_id ? 'Activo en este chat' : 'Sin bot'}</dd>
    </dl></section>
    <section class="clisec"><h3>Etiquetas</h3><div class="tagbox">${H.S.labels.map((l) => `<button data-ctag="${l.id}" class="${c.labels.includes(l.id) ? '' : 'off'}" aria-pressed="${c.labels.includes(l.id)}">${H.tagHTML(l)}</button>`).join('')}</div>
      <p class="note" style="margin:8px 0 0">Toca para poner o quitar. Las de borde punteado las pone el bot.</p></section>
    <section class="clisec"><div class="clisech"><h3>Datos que guardó el bot</h3><button class="iconbtn sm" data-cd="addvar">+ Agregar</button></div>
      ${v.length ? `<div class="clivars">${v.map((x, i) => `<div class="clivar"><input data-vk="${i}" value="${e(x.k)}" list="clikeys" aria-label="Dato" placeholder="dato"><input data-vv="${i}" value="${e(x.v)}" aria-label="Valor de ${e(KEY_NAMES[x.k] || x.k)}" placeholder="valor"><button class="iconbtn sm" data-vdel="${i}" aria-label="Borrar ${e(KEY_NAMES[x.k] || x.k)}">×</button></div>`).join('')}</div>` : '<p class="note" style="margin:0">Todavía no guardó nada. La IA llena talla, colores, distrito, nombre, DNI… mientras conversa.</p>'}
      <datalist id="clikeys">${MAIN_KEYS.map((k) => `<option value="${k}">${e(KEY_NAMES[k])}</option>`).join('')}</datalist>
      <div class="clivbtns"><button class="send sm" data-cd="savevars" ${K.dirty ? '' : 'disabled'}>Guardar datos</button>${c.bot_vars && c.bot_vars !== '{}' || c.bot_flow_id ? '<button class="iconbtn sm" data-cd="clearbot">Borrar todo lo del bot</button>' : ''}</div></section>
    <section class="clisec"><h3>Notas</h3><textarea class="notesbox" id="cdnotes" placeholder="Solo las ve tu equipo">${e(c.notes || '')}</textarea></section>
    <section class="clisec"><h3>Pedidos${c.compras ? ` · ${c.compras} ${c.compras === 1 ? 'compra' : 'compras'} · ${money(c.gastado)}` : ''}</h3><div id="clipeds"><span class="spin"></span></div></section>
    ${own ? `<section class="clisec danger"><h3>Borrar</h3>
      <div class="clidanger"><div><b>Vaciar conversación</b><span class="note">Borra los mensajes, fotos y audios. Se quedan su celular, etiquetas y datos.</span></div><button class="iconbtn bad" data-cd="wipe">Vaciar</button></div>
      <div class="clidanger"><div><b>Borrar clienta</b><span class="note">Borra todo: conversación, etiquetas, datos, llamadas y seguimientos. No se puede deshacer.</span></div><button class="iconbtn bad" data-cd="delete">Borrar</button></div>
    </section>` : ''}`;
  wireDetail(box, c);
  fichaPedidos(c.id, H.$('#clipeds'));
}

function wireDetail(box, c) {
  const nm = H.$('#cdname');
  nm.onchange = () => patch(c, { name: nm.value.trim() });
  nm.onkeydown = (ev) => ev.key === 'Enter' && nm.blur();
  const nt = H.$('#cdnotes');
  nt.onchange = () => patch(c, { notes: nt.value.trim() });
  box.oninput = (ev) => {
    const t = ev.target;
    if (t.dataset.vk != null) K.edit[Number(t.dataset.vk)].k = t.value;
    else if (t.dataset.vv != null) K.edit[Number(t.dataset.vv)].v = t.value;
    else return;
    setDirty(true);
  };
  box.onclick = async (ev) => {
    const tag = ev.target.closest('[data-ctag]');
    if (tag) return toggleLabel(c, Number(tag.dataset.ctag));
    const del = ev.target.closest('[data-vdel]');
    if (del) {
      K.edit.splice(Number(del.dataset.vdel), 1);
      setDirty(true);
      return drawDetail();
    }
    const b = ev.target.closest('[data-cd]');
    if (!b) return;
    const act = b.dataset.cd;
    if (act === 'close') {
      K.sel = null;
      setDirty(false);
      drawList();
      return drawDetail();
    }
    if (act === 'chat') return H.goChat(c.id);
    if (act === 'addvar') {
      K.edit.push({ k: '', v: '' });
      drawDetail();
      return H.$(`[data-vk="${K.edit.length - 1}"]`)?.focus();
    }
    if (act === 'savevars') return saveVars(c);
    if (act === 'clearbot') {
      if (!confirm('¿Borrar todo lo que guardó el bot de esta clienta (datos, paso del flujo y seguimientos pendientes)? La conversación no se toca.')) return;
      return run(async () => {
        await H.api('POST', `/chats/${c.id}/bot`, { action: 'clear' });
        Object.assign(c, { bot_vars: null, bot_flow_id: null });
        K.edit = null;
        setDirty(false);
        syncChat(c);
        H.toast('Datos del bot borrados');
      });
    }
    if (act === 'wipe') {
      if (!confirm(`¿Vaciar la conversación con ${nameOf(c)}? Se borran todos los mensajes, fotos y audios. No se puede deshacer.`)) return;
      return run(async () => {
        await H.api('DELETE', `/chats/${c.id}/messages`);
        c.msgs = 0;
        H.forgetMessages(c.id);
        H.toast('Conversación vaciada');
      });
    }
    if (act === 'delete') {
      const word = prompt(`Para borrar a ${nameOf(c)} y todo su historial, escribe BORRAR`);
      if (word == null) return;
      if (word.trim().toUpperCase() !== 'BORRAR') return H.toast('No se borró: tenías que escribir BORRAR.');
      return run(async () => {
        await H.api('DELETE', `/chats/${c.id}`);
        K.list = K.list.filter((x) => x.id !== c.id);
        K.total = Math.max(0, K.total - 1);
        K.sel = null;
        H.forgetChat(c.id);
        drawList();
        H.toast('Clienta borrada');
      });
    }
  };
}

async function run(fn) {
  try {
    await fn();
  } catch (er) {
    H.toast(er.message, 5000);
  }
  drawDetail();
}

function setDirty(on) {
  K.dirty = on;
  const b = H.$('[data-cd="savevars"]');
  if (b) b.disabled = !on;
}

async function saveVars(c) {
  const datos = {};
  for (const x of K.edit) if (x.k.trim() && String(x.v).trim()) datos[x.k.trim()] = String(x.v).trim();
  await run(async () => {
    const r = await H.api('PUT', `/chats/${c.id}/datos`, { datos });
    c.bot_vars = JSON.stringify(r.datos);
    K.edit = null;
    setDirty(false);
    syncChat(c);
    drawList();
    H.toast('Datos guardados');
  });
}

async function patch(c, data) {
  try {
    await H.api('PATCH', `/chats/${c.id}`, data);
    Object.assign(c, Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v || null])));
    syncChat(c);
    drawList();
  } catch (er) {
    H.toast(er.message);
  }
}

async function toggleLabel(c, id) {
  const on = c.labels.includes(id);
  c.labels = on ? c.labels.filter((x) => x !== id) : [...c.labels, id];
  drawDetail();
  drawList();
  try {
    await H.api(on ? 'DELETE' : 'PUT', `/chats/${c.id}/labels/${id}`);
    syncChat(c);
  } catch (er) {
    c.labels = on ? [...c.labels, id] : c.labels.filter((x) => x !== id);
    drawDetail();
    drawList();
    H.toast(er.message);
  }
}

// Mantiene igual la bandeja de Chats si ya estaba cargada
function syncChat(c) {
  const x = H.S.chats.get(c.id);
  if (x) Object.assign(x, { name: c.name, notes: c.notes, labels: [...c.labels], bot_vars: c.bot_vars, bot_flow_id: c.bot_flow_id });
}
