// Pedidos: Lima, provincia y agencia, por día; editor; copiar orden. También la configuración (precios, Shopify, mensajes automáticos)
let H;
export function initPedidos(ctx) {
  H = ctx;
}
const e = (s) => H.esc(s);
const money = (n) => `S/${Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const MODOS = { lima: 'Contraentrega Lima', ce_prov: 'Contraentrega provincia', agencia: 'Agencia (Shalom)' };
const MODO_CORTO = { lima: 'Lima', ce_prov: 'CE provincia', agencia: 'Agencia' };
const ESTADOS = { nuevo: 'Nuevo', confirmado: 'Confirmado', en_ruta: 'En ruta', reprogramado: 'Pospuso su compra', entregado: 'Entregado', rechazado: 'Rechazado', por_pagar: 'Yape por validar', validado: 'Validado', enviado: 'Enviado', en_camino: 'En camino', en_agencia: 'En agencia', falta_abonar: 'Recogido · falta abonar', recogido: 'Recogido', no_recogido: 'No recogido', cancelado: 'Cancelado' };
const FLUJO = {
  lima: ['nuevo', 'confirmado', 'en_ruta', 'reprogramado', 'entregado', 'rechazado', 'cancelado'],
  ce_prov: ['nuevo', 'confirmado', 'en_ruta', 'reprogramado', 'entregado', 'rechazado', 'cancelado'],
  agencia: ['por_pagar', 'validado', 'enviado', 'en_camino', 'en_agencia', 'falta_abonar', 'recogido', 'no_recogido', 'cancelado'],
};
const TONO = { nuevo: 'info', por_pagar: 'warn', confirmado: 'acc', validado: 'acc', en_ruta: 'run', enviado: 'run', en_camino: 'run', en_agencia: 'run', falta_abonar: 'warn', reprogramado: 'warn', entregado: 'ok', recogido: 'ok', rechazado: 'bad', no_recogido: 'bad', cancelado: 'mute' };
const FUENTE = { ia: 'IA', shopify: 'Shopify', whatsapp: 'WhatsApp', manual: 'Manual' };
const TALLAS = ['XS', 'S', 'M', 'L', 'XL'];
const COLORES = ['Negro', 'Gris claro', 'Gris oscuro', 'Perla', 'Vino', 'Azul noche', 'Beige'];
const P = { grupo: '', vista: 'dia', dia: null, estado: '', q: '', data: null, storeId: null };

export function resetPedidos() {
  P.storeId = null;
}

const pill = (status) => `<span class="opill t-${TONO[status] || 'mute'}">${e(ESTADOS[status] || status)}</span>`;
const dayLabel = (d, today) => {
  if (d === today) return 'Hoy';
  const dt = new Date(d + 'T12:00');
  return dt.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric' });
};
const resumen = (o) => o.items.map((i) => `${i.cantidad}× ${[i.talla, i.color].filter(Boolean).join(' ') || i.producto}`).join(' · ');
const destino = (o) => (o.modo === 'agencia' ? [o.sede, o.ciudad, o.guia_estado && `🚚 ${o.guia_estado}`].filter(Boolean).join(' · ') : o.modo === 'ce_prov' ? o.ciudad || o.distrito : o.distrito) || '—';

export async function renderPedidos(content) {
  if (P.storeId !== H.S.storeId) Object.assign(P, { grupo: '', vista: 'dia', dia: null, estado: '', q: '', data: null, storeId: H.S.storeId });
  const role = H.store()?.role;
  const grupos = role === 'despacho_prov' ? [['prov', 'Provincia y agencia']] : [['', 'Todos'], ['lima', 'Lima'], ['prov', 'Provincia y agencia']];
  if (role === 'despacho_prov') P.grupo = 'prov';
  content.innerHTML = `<div class="ped">
    <div class="pedhead">
      <div class="seg" role="tablist" aria-label="Tipo">${grupos.map(([k, l]) => `<button data-pg="${k}" aria-pressed="${P.grupo === k}">${l}</button>`).join('')}</div>
      <div class="seg" role="tablist" aria-label="Vista"><button data-pv="dia" aria-pressed="${P.vista === 'dia'}">Por día</button><button data-pv="pendientes" aria-pressed="${P.vista === 'pendientes'}">Pendientes</button></div>
      <div class="search pedq"><input id="pedq" type="search" placeholder="Buscar nombre, celular, DNI, #pedido…" value="${e(P.q)}" autocomplete="off" aria-label="Buscar pedidos"></div>
      <span class="grow"></span>
      <button class="send" data-pact="nuevo">+ Nuevo pedido</button>
    </div>
    <div class="pdays" id="pdays"></div>
    <div class="pchips" id="pchips"></div>
    <div class="ptot" id="ptot"></div>
    <div class="plist" id="plist"><div class="empty" style="padding:50px"><span class="spin"></span></div></div>
  </div>`;
  const root = content.querySelector('.ped');
  root.addEventListener('click', onClick);
  let tm;
  H.$('#pedq').oninput = (ev) => {
    clearTimeout(tm);
    tm = setTimeout(() => {
      P.q = ev.target.value.trim();
      load();
    }, 300);
  };
  if (P.data) draw();
  await load();
}

async function load() {
  const p = new URLSearchParams();
  if (P.grupo) p.set('grupo', P.grupo);
  if (P.vista === 'pendientes') p.set('vista', 'pendientes');
  if (P.dia) p.set('dia', P.dia);
  if (P.estado) p.set('estado', P.estado);
  if (P.q) p.set('q', P.q);
  try {
    P.data = await H.api('GET', `/stores/${H.S.storeId}/pedidos?${p}`);
    if (!P.dia) P.dia = P.data.dia;
  } catch (er) {
    const b = H.$('#plist');
    if (b) b.innerHTML = `<div class="err">${e(er.message)}</div>`;
    return;
  }
  draw();
}

function draw() {
  const d = P.data;
  if (!d || !H.$('#plist')) return;
  H.$('#pdays').hidden = P.vista !== 'dia' || !!P.q;
  H.$('#pdays').innerHTML = d.dias.map((x) => `<button class="pday${x.dia === P.dia ? ' on' : ''}" data-pd="${x.dia}"><span>${e(dayLabel(x.dia, d.today))}</span><b>${x.n}</b>${x.perdidos ? `<small>${x.perdidos} perdidos</small>` : ''}</button>`).join('');
  H.$('#pdays .pday.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const est = d.estados;
  const all = Object.values(est).reduce((a, x) => a + x.n, 0);
  const order = [...new Set([...FLUJO.lima, ...FLUJO.agencia])].filter((s) => est[s]);
  H.$('#pchips').innerHTML = `<button data-pe="" class="${!P.estado ? 'on' : ''}">Todos <b>${all}</b></button>` + order.map((s) => `<button data-pe="${s}" class="${P.estado === s ? 'on' : ''}"><i class="dot t-${TONO[s]}"></i>${e(ESTADOS[s])} <b>${est[s].n}</b></button>`).join('');
  const list = d.pedidos;
  const tot = list.filter((o) => !['cancelado', 'rechazado', 'no_recogido'].includes(o.status));
  H.$('#ptot').innerHTML = list.length ? `<span><b>${list.length}</b> pedidos</span><span><b>${tot.reduce((a, o) => a + o.unidades, 0)}</b> prendas</span><span><b>${money(tot.reduce((a, o) => a + o.total, 0))}</b> en ventas</span><span class="note">${P.vista === 'pendientes' ? 'Todos los que siguen abiertos' : P.q ? 'Resultado de la búsqueda' : P.dia === d.today ? 'Creados hoy' : 'Creados ese día'}</span>` : '';
  if (!list.length) {
    H.$('#plist').innerHTML = `<div class="empty" style="padding:50px 16px"><b>${P.q ? 'Ningún pedido con esa búsqueda' : 'No hay pedidos aquí'}</b><span>Los pedidos llegan de la IA (cuando la clienta compra), de Shopify o los creas con «+ Nuevo pedido» o desde el chat.</span></div>`;
    return;
  }
  H.$('#plist').innerHTML = `<table class="ptable"><thead><tr><th>#</th><th>Clienta</th><th>Destino</th><th>Productos</th><th class="r">Total</th><th>Estado</th><th></th></tr></thead><tbody>
    ${list.map((o) => `<tr data-po="${o.id}" tabindex="0">
      <td class="mono"><b>#${o.number}</b><small class="psrc s-${o.source}">${e(FUENTE[o.source] || o.source)}${o.ext_name ? ' ' + e(o.ext_name) : ''}</small></td>
      <td><b>${e(o.nombre || '—')}</b><small class="mono">${e(o.celular ? H.fmtPhone(o.celular) : '')}</small></td>
      <td><span class="pmodo m-${o.modo}">${e(MODO_CORTO[o.modo])}</span><small>${e(destino(o))}</small></td>
      <td class="pres">${e(resumen(o))}</td>
      <td class="r mono"><b>${money(o.total)}</b>${o.adelanto ? `<small>adel. ${money(o.adelanto)}</small>` : ''}</td>
      <td>${pill(o.status)}</td>
      <td class="r pqa">${o.modo !== 'agencia' && !['entregado', 'rechazado', 'cancelado'].includes(o.status) ? `<button class="pq ok" data-pq="${o.id}|entregado" title="Pagó y se le entregó">✅ Entregado</button><button class="pq warn" data-pq="${o.id}|reprogramado" title="Pospuso su compra">📅 Pospuso</button><button class="pq bad" data-pq="${o.id}|cancelado" title="Canceló">❌ Canceló</button>` : ''}<button class="iconbtn sm" data-pcopy="${o.id}" title="Copiar orden">Copiar</button></td></tr>`).join('')}</tbody></table>`;
}

async function onClick(ev) {
  const t = ev.target;
  const g = t.closest('[data-pg]');
  if (g) return (P.grupo = g.dataset.pg, P.estado = '', renderPedidos(H.$('#content')));
  const v = t.closest('[data-pv]');
  if (v) return (P.vista = v.dataset.pv, P.estado = '', renderPedidos(H.$('#content')));
  const d = t.closest('[data-pd]');
  if (d) return (P.dia = d.dataset.pd, P.estado = '', load());
  const s = t.closest('[data-pe]');
  if (s) return (P.estado = s.dataset.pe, load());
  const q = t.closest('[data-pq]');
  if (q) {
    const [id, st] = q.dataset.pq.split('|');
    q.disabled = true;
    try {
      await H.api('PATCH', `/pedidos/${id}`, { status: st });
      H.toast(st === 'entregado' ? 'Marcado como entregado ✅' : st === 'reprogramado' ? 'Marcado: pospuso su compra 📅' : 'Marcado: canceló ❌');
      load();
    } catch (er) {
      H.toast(er.message, 5000);
      q.disabled = false;
    }
    return;
  }
  const c = t.closest('[data-pcopy]');
  if (c) return copyOrder(Number(c.dataset.pcopy));
  if (t.closest('[data-pact="nuevo"]')) return openPedido({ prefill: { modo: P.grupo === 'prov' ? 'agencia' : 'lima' } });
  const row = t.closest('[data-po]');
  if (row) return openPedido({ id: Number(row.dataset.po) });
}

async function copyOrder(id) {
  try {
    const r = await H.api('GET', `/pedidos/${id}`);
    await navigator.clipboard.writeText(r.texto);
    H.toast('Orden copiada. Pégala en tu grupo 📋');
  } catch (er) {
    H.toast(er.message || 'No se pudo copiar', 4000);
  }
}

/* =================== Editor de pedido =================== */
let M = null;

export async function openPedido({ id, prefill, chatId, onSaved } = {}) {
  closeModal();
  const wrap = document.createElement('div');
  wrap.className = 'pmodal';
  wrap.innerHTML = '<div class="pmbox" role="dialog" aria-modal="true" aria-label="Pedido"><div class="empty" style="padding:50px"><span class="spin"></span></div></div>';
  document.body.appendChild(wrap);
  wrap.addEventListener('mousedown', (ev) => ev.target === wrap && closeModal());
  M = { wrap, onSaved, order: null, events: [], texto: '' };
  document.addEventListener('keydown', escClose);
  try {
    if (id) {
      const r = await H.api('GET', `/pedidos/${id}`);
      Object.assign(M, { order: r.pedido, events: r.events, texto: r.texto });
    } else if (chatId) {
      const r = await H.api('GET', `/chats/${chatId}/pedido-borrador`);
      M.order = { ...r.borrador, status: r.borrador.modo === 'agencia' ? 'por_pagar' : 'nuevo' };
    } else {
      M.order = { modo: 'lima', status: 'nuevo', items: [{ talla: '', color: '', cantidad: 1 }], total: 0, adelanto: 0, ...prefill };
      if (M.order.modo === 'agencia') M.order.status = 'por_pagar';
    }
  } catch (er) {
    wrap.querySelector('.pmbox').innerHTML = `<div class="err" style="margin:20px">${e(er.message)}</div>`;
    return;
  }
  drawEditor();
}

function escClose(ev) {
  if (ev.key === 'Escape') closeModal();
}
function closeModal() {
  if (!M) return;
  M.wrap.remove();
  document.removeEventListener('keydown', escClose);
  M = null;
}

function drawEditor() {
  const o = M.order;
  const isNew = !o.id;
  const box = M.wrap.querySelector('.pmbox');
  const owner = H.owner();
  const items = o.items?.length ? o.items : [{ talla: '', color: '', cantidad: 1 }];
  box.innerHTML = `
    <header class="pmh"><div><h2>${isNew ? 'Nuevo pedido' : `Pedido #${o.number}`}</h2>
      <span class="note">${isNew ? (o.chat_id ? 'Con los datos que guardó el bot. Revisa y guarda.' : 'Llénalo a mano.') : `${e(FUENTE[o.source] || o.source)}${o.ext_name ? ' ' + e(o.ext_name) : ''} · ${e(new Date(o.created_at).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' }))}`}</span></div>
      <button class="iconbtn" data-mx aria-label="Cerrar">✕</button></header>
    <div class="pmbody">
      <section><h3>Tipo de envío</h3><div class="pmodos">${Object.entries(MODOS).map(([k, l]) => `<label class="pmo${o.modo === k ? ' on' : ''}"><input type="radio" name="modo" value="${k}" ${o.modo === k ? 'checked' : ''}><b>${e(l)}</b><span>${k === 'lima' ? 'Motorizado, paga al recibir' : k === 'ce_prov' ? 'Courier, paga al recibir' : 'Adelanto + saldo en agencia'}</span></label>`).join('')}</div></section>
      <section><h3>Estado</h3><div class="pflow">${FLUJO[o.modo].map((s) => `<button type="button" data-ms="${s}" class="${o.status === s ? 'on' : ''} t-${TONO[s]}">${e(ESTADOS[s])}</button>`).join('')}</div>
        <p class="note" style="margin:6px 0 0">Al cambiar el estado sale el mensaje automático que tengas encendido (Configuración → ${H.store()?.canal === 'shopify' ? 'Shopify' : 'Pedidos'}).</p></section>
      <section><h3>Clienta</h3><div class="pgrid">
        <div class="field"><label>Nombre</label><input data-f="nombre" value="${e(o.nombre || '')}"></div>
        <div class="field"><label>Celular</label><input data-f="celular" value="${e(o.celular || '')}" inputmode="tel"></div>
        ${o.modo === 'lima' ? `
          <div class="field"><label>Distrito</label><input data-f="distrito" value="${e(o.distrito || '')}"></div>
          <div class="field"><label>Día de entrega</label><input type="date" data-f="entrega" value="${e(o.entrega || '')}"></div>
          <div class="field pwide"><label>Dirección</label><input data-f="direccion" value="${e(o.direccion || '')}"></div>
          <div class="field pwide"><label>Referencia o GPS</label><input data-f="referencia" value="${e(o.referencia || '')}"></div>`
        : o.modo === 'ce_prov' ? `
          <div class="field"><label>Ciudad</label><input data-f="ciudad" value="${e(o.ciudad || '')}"></div>
          <div class="field"><label>Día de entrega</label><input type="date" data-f="entrega" value="${e(o.entrega || '')}"></div>
          <div class="field pwide"><label>Dirección</label><input data-f="direccion" value="${e(o.direccion || '')}"></div>`
        : `
          <div class="field"><label>DNI</label><input data-f="dni" value="${e(o.dni || '')}" inputmode="numeric"></div>
          <div class="field"><label>Ciudad</label><input data-f="ciudad" value="${e(o.ciudad || '')}"></div>
          <div class="field pwide"><label>Sede de Shalom</label><input data-f="sede" value="${e(o.sede || '')}" placeholder="Ej. Arequipa · Av. Ejército"></div>
          <div class="field"><label>Courier</label><select data-f="courier"><option value="shalom" ${o.courier !== 'olva' ? 'selected' : ''}>Shalom</option><option value="olva" ${o.courier === 'olva' ? 'selected' : ''}>Olva</option></select></div>
          <div class="field"><label>Nro. de orden (ticket Shalom)</label><input data-f="guia" value="${e(o.guia || '')}" inputmode="numeric" placeholder="Ej. 10183909"></div>
          <div class="field"><label>Código del ticket</label><input data-f="guia_codigo" value="${e(o.guia_codigo || '')}" placeholder="Ej. NPJK" style="text-transform:uppercase"></div>
          ${!isNew ? `<div class="field pwide shtrack">${o.guia_estado ? `<div class="okbox" style="margin:0">🚚 Shalom: <b>${e(o.guia_estado)}</b>${o.guia_at ? ` <span class="note">· revisado ${e(new Date(o.guia_at).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: 'numeric', minute: '2-digit' }))}</span>` : ''}</div>` : '<p class="note" style="margin:0">Pon el nro. de orden y el código del ticket y guarda: el estado se revisa solo cada 2 horas y el pedido avanza solo (enviado → en agencia → recogido).</p>'}
            ${o.guia && o.guia_codigo ? '<button type="button" class="iconbtn sm" data-mtrack style="margin-top:6px">Rastrear ahora</button>' : ''}<div data-mtrackout></div></div>` : ''}`}
      </div></section>
      <section><div class="pmsec"><h3>Productos</h3><button type="button" class="iconbtn sm" data-madd>+ Producto</button></div>
        <div class="pitems">${items.map((it, i) => `<div class="pit" data-i="${i}">
          <input data-it="producto" value="${e(it.producto || '')}" placeholder="Producto" aria-label="Producto">
          <select data-it="talla" aria-label="Talla"><option value="">Talla</option>${TALLAS.map((t) => `<option ${it.talla === t ? 'selected' : ''}>${t}</option>`).join('')}${it.talla && !TALLAS.includes(it.talla) ? `<option selected>${e(it.talla)}</option>` : ''}</select>
          <input data-it="color" value="${e(it.color || '')}" list="pcolores" placeholder="Color" aria-label="Color">
          <input data-it="cantidad" type="number" min="1" value="${it.cantidad || 1}" aria-label="Cantidad">
          <button type="button" class="iconbtn sm" data-mdel="${i}" aria-label="Quitar">×</button></div>`).join('')}</div>
        <datalist id="pcolores">${COLORES.map((c) => `<option>${c}</option>`).join('')}</datalist>
        <div class="pmoney">
          <div class="field"><label>Total (S/)</label><input data-f="total" type="number" min="0" step="0.5" value="${o.total ?? 0}"></div>
          <div class="field"><label>Adelanto (S/)${o.modo === 'agencia' ? '' : ' · si pagó algo antes'}</label><input data-f="adelanto" type="number" min="0" step="0.5" value="${o.adelanto ?? 0}"></div><div class="field"><label>${o.modo === 'agencia' ? 'Saldo' : 'Paga al recibir'}</label><div class="mono pmsaldo">${money(Math.max(0, (o.total || 0) - (o.adelanto || 0)))}</div></div>
        </div>
        <p class="note" style="margin:4px 0 0">Si cambias los productos y no tocas el total, se calcula solo con tus precios por cantidad.</p></section>
      <section><h3>Notas</h3><textarea class="notesbox" data-f="notas" rows="2" placeholder="Horario especial, color de reemplazo…">${e(o.notas || '')}</textarea></section>
      ${!isNew && M.events.length ? `<section><h3>Historial</h3><ul class="phist">${M.events.map((x) => `<li><span class="note mono">${e(new Date(x.created_at).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: 'numeric', minute: '2-digit' }))}</span> ${e(x.detail)}${x.user_name ? ` <span class="note">· ${e(x.user_name)}</span>` : ''}</li>`).join('')}</ul></section>` : ''}
    </div>
    <footer class="pmf">
      ${!isNew ? `<button type="button" class="iconbtn" data-mcopy>Copiar orden</button>${o.chat_id && H.canChats() ? '<button type="button" class="iconbtn" data-mchat>Abrir chat</button>' : ''}<button type="button" class="iconbtn" data-mdup>Duplicar (recompra)</button>${owner ? '<button type="button" class="iconbtn bad" data-mborrar>Borrar</button>' : ''}` : ''}
      <span class="grow"></span><span class="err" hidden id="pmerr"></span>
      <button type="button" class="send" data-msave>${isNew ? 'Crear pedido' : 'Guardar cambios'}</button>
    </footer>`;
  M.dirtyTotal = false;
  box.onclick = editorClick;
  box.oninput = (ev) => {
    if (ev.target.dataset.f === 'total') M.dirtyTotal = true;
    if (ev.target.dataset.f === 'total' || ev.target.dataset.f === 'adelanto') {
      const s = box.querySelector('.pmsaldo');
      if (s) s.textContent = money(Math.max(0, (Number(box.querySelector('[data-f="total"]').value) || 0) - (Number(box.querySelector('[data-f="adelanto"]')?.value) || 0)));
    }
  };
  box.onchange = (ev) => {
    if (ev.target.name === 'modo') {
      collect();
      M.order.modo = ev.target.value;
      if (!FLUJO[M.order.modo].includes(M.order.status)) M.order.status = M.order.modo === 'agencia' ? 'por_pagar' : 'nuevo';
      drawEditor();
    }
  };
}

function collect() {
  const box = M.wrap.querySelector('.pmbox');
  const o = M.order;
  for (const el of box.querySelectorAll('[data-f]')) o[el.dataset.f] = el.type === 'number' ? Number(el.value) : el.value;
  o.items = [...box.querySelectorAll('.pit')].map((row) => ({
    producto: row.querySelector('[data-it="producto"]').value,
    talla: row.querySelector('[data-it="talla"]').value,
    color: row.querySelector('[data-it="color"]').value,
    cantidad: Number(row.querySelector('[data-it="cantidad"]').value) || 1,
  }));
  return o;
}

async function editorClick(ev) {
  const t = ev.target;
  if (t.closest('[data-mx]')) return closeModal();
  const st = t.closest('[data-ms]');
  if (st) {
    collect();
    M.order.status = st.dataset.ms;
    for (const b of M.wrap.querySelectorAll('[data-ms]')) b.classList.toggle('on', b === st);
    return;
  }
  if (t.closest('[data-madd]')) {
    collect();
    const last = M.order.items[M.order.items.length - 1] || {};
    M.order.items.push({ producto: last.producto || '', talla: last.talla || '', color: '', cantidad: 1 });
    return drawEditor();
  }
  const del = t.closest('[data-mdel]');
  if (del) {
    collect();
    if (M.order.items.length > 1) M.order.items.splice(Number(del.dataset.mdel), 1);
    return drawEditor();
  }
  if (t.closest('[data-mcopy]')) return copyOrder(M.order.id);
  if (t.closest('[data-mchat]')) {
    const id = M.order.chat_id;
    closeModal();
    return H.goChat(id);
  }
  if (t.closest('[data-mdup]')) {
    try {
      const r = await H.api('POST', `/pedidos/${M.order.id}/duplicar`);
      H.toast(`Pedido #${r.pedido.number} creado (recompra)`);
      const cb = M.onSaved;
      await openPedido({ id: r.pedido.id, onSaved: cb });
      refresh();
    } catch (er) {
      H.toast(er.message, 5000);
    }
    return;
  }
  if (t.closest('[data-mborrar]')) {
    if (!confirm(`¿Borrar el pedido #${M.order.number}? No se puede deshacer.`)) return;
    try {
      await H.api('DELETE', `/pedidos/${M.order.id}`);
      H.toast('Pedido borrado');
      const cb = M.onSaved;
      closeModal();
      cb?.();
      refresh();
    } catch (er) {
      H.toast(er.message, 5000);
    }
    return;
  }
  if (t.closest('[data-mtrack]')) {
    const b = t.closest('[data-mtrack]');
    const out = M.wrap.querySelector('[data-mtrackout]');
    b.disabled = true;
    out.innerHTML = '<p class="note">Consultando a Shalom…</p>';
    try {
      const r = await H.api('POST', `/pedidos/${M.order.id}/rastrear`);
      if (!r.ok) {
        out.innerHTML = `<div class="err">${e(r.error || 'No se pudo rastrear.')}</div>`;
      } else {
        const d = await H.api('GET', `/pedidos/${M.order.id}`);
        Object.assign(M, { order: d.pedido, events: d.events, texto: d.texto });
        drawEditor();
        const o2 = M.wrap.querySelector('[data-mtrackout]');
        if (o2) o2.innerHTML = `<ol class="shsteps">${r.summary.pasos.map((p) => `<li class="${p.ok ? 'ok' : ''}"><b>${e(p.label)}</b>${p.fecha ? ` <span class="note mono">${e(p.fecha)}</span>` : ''}</li>`).join('')}</ol>`;
        refresh();
      }
    } catch (er) {
      out.innerHTML = `<div class="err">${e(er.message)}</div>`;
    }
    b.disabled = false;
    return;
  }
  if (t.closest('[data-msave]')) return save(t.closest('[data-msave]'));
}

async function save(btn) {
  const o = collect();
  const err = M.wrap.querySelector('#pmerr');
  err.hidden = true;
  const data = { modo: o.modo, status: o.status, nombre: o.nombre, celular: o.celular, dni: o.dni, distrito: o.distrito, direccion: o.direccion, referencia: o.referencia, ciudad: o.ciudad, sede: o.sede, guia: o.guia, guia_codigo: o.guia_codigo, courier: o.courier, entrega: o.entrega, notas: o.notas, items: o.items, adelanto: o.adelanto };
  if (M.dirtyTotal || o.id) data.total = o.total;
  if (!o.id && !M.dirtyTotal) delete data.total;
  btn.disabled = true;
  try {
    let r;
    if (o.id) r = await H.api('PATCH', `/pedidos/${o.id}`, data);
    else r = await H.api('POST', `/stores/${H.S.storeId}/pedidos`, { ...data, chat_id: o.chat_id || null, ad_id: o.ad_id || null });
    H.toast(o.id ? 'Pedido guardado' : `Pedido #${r.pedido.number} creado`);
    const cb = M.onSaved;
    if (!o.id) {
      await openPedido({ id: r.pedido.id, onSaved: cb });
    } else {
      const d = await H.api('GET', `/pedidos/${o.id}`);
      Object.assign(M, { order: d.pedido, events: d.events, texto: d.texto });
      drawEditor();
    }
    cb?.();
    refresh();
  } catch (er) {
    err.textContent = er.message;
    err.hidden = false;
  }
  btn.disabled = false;
}

function refresh() {
  if (H.S.view === 'pedidos' && H.$('#plist')) load();
}

/* =================== Pedidos de la clienta (ficha del chat) =================== */
export async function fichaPedidos(chatId, el, cached = false) {
  if (!el) return;
  el.onclick = (ev) => {
    const again = () => {
      H.S.fpCache = null;
      fichaPedidos(chatId, el);
    };
    const b = ev.target.closest('[data-fpo]');
    if (b) return openPedido({ id: Number(b.dataset.fpo), onSaved: again });
    if (ev.target.closest('[data-fpnew]')) openPedido({ chatId, onSaved: again });
  };
  if (cached) return;
  try {
    const r = await H.api('GET', `/chats/${chatId}/pedidos`);
    el.innerHTML = `${r.pedidos.length ? `<ul class="fped">${r.pedidos.slice(0, 5).map((o) => `<li><button data-fpo="${o.id}"><b class="mono">#${o.number}</b> ${pill(o.status)} <span class="note">${e(resumen(o))} · ${money(o.total)}</span></button></li>`).join('')}</ul>` : '<p class="note" style="margin:0 0 8px">Todavía no tiene pedidos.</p>'}
      <button class="iconbtn" data-fpnew>+ Crear pedido</button>`;
  } catch (er) {
    el.innerHTML = `<span class="note">${e(er.message)}</span>`;
  }
}

/* =================== Configuración → Pedidos (tienda por mensajes) o Shopify (tienda por web) =================== */
let CFG = null;

export async function renderPedidosConfig(body) {
  body.innerHTML = '<div class="empty" style="padding:40px"><span class="spin"></span></div>';
  try {
    CFG = await H.api('GET', `/stores/${H.S.storeId}/pedidos-config`);
  } catch (er) {
    body.innerHTML = `<div class="err">${e(er.message)}</div>`;
    return;
  }
  drawConfig(body);
  if (CFG.plantillas_ok && CFG.autos.some((a) => a.tpl_name && a.tpl_status !== 'APPROVED')) {
    try {
      CFG.autos = (await H.api('POST', `/stores/${H.S.storeId}/autos/sync`)).autos;
      drawConfig(body);
    } catch {}
  }
}

const SOLO_SHOPIFY = ['confirmar', 'adelanto', 'carrito'];
const TPL = { APPROVED: ['Aprobada', 'ok'], PENDING: ['En revisión', 'warn'], REJECTED: ['Rechazada', 'bad'], PAUSED: ['Pausada', 'warn'], DISABLED: ['Desactivada', 'bad'] };

function drawConfig(body) {
  const c = CFG.cfg;
  const sh = CFG.shopify;
  const shop = H.store()?.canal === 'shopify';
  // En una tienda por mensajes no van los avisos que solo tienen sentido con la web (confirmar, adelanto y carrito de Shopify)
  const autos = shop ? CFG.autos : CFG.autos.filter((a) => !SOLO_SHOPIFY.includes(a.key));
  const precios = `<form class="card" id="pcf"><h3>Precios y envíos</h3><p class="sub">${shop ? 'Para los pedidos que crees a mano o desde un chat. Los de Shopify llegan con su propio precio.' : 'Con esto se arma el total de cada pedido (el que crea la IA o el que haces a mano).'}</p>
      <div class="fields3">
        <div class="field"><label>Producto</label><input name="producto" value="${e(c.producto)}"></div>
        ${[1, 2, 3, 4].map((n) => `<div class="field"><label>${n} ${n === 1 ? 'unidad' : 'unidades'} (S/)</label><input name="p${n}" type="number" step="0.5" min="0" value="${c.precios[n] ?? ''}"></div>`).join('')}
        <div class="field"><label>Por mayor desde (unidades)</label><input name="mayor_desde" type="number" min="0" value="${c.mayor_desde}"></div>
        <div class="field"><label>Precio por mayor c/u (S/)</label><input name="mayor_unit" type="number" step="0.5" min="0" value="${c.mayor_unit}"></div>
        <div class="field"><label>Adelanto agencia (S/)</label><input name="adelanto" type="number" step="0.5" min="0" value="${c.adelanto}"></div>
        <div class="field"><label>Pedidos de provincia van por</label><select name="prov_modo"><option value="agencia" ${c.prov_modo !== 'ce_prov' ? 'selected' : ''}>Agencia (Shalom, con adelanto)</option><option value="ce_prov" ${c.prov_modo === 'ce_prov' ? 'selected' : ''}>Contraentrega provincia (courier)</option></select></div>
      </div>
      <div class="field"><label>Distritos de Lima sin cobertura (van por agencia)</label><textarea name="sin_cobertura" rows="2" class="notesbox">${e(c.sin_cobertura)}</textarea></div>
      <div class="err" hidden></div><div><button class="send" type="submit">Guardar precios</button></div></form>`;
  const shopify = `<div class="card"><h3>Conectar Shopify</h3>
      <p class="sub">Cada compra de tu web entra sola a Pedidos (y si la apagas o cancelas en Shopify, aquí también). No hace falta instalar ninguna app.</p>
      ${sh.url ? `<div class="pshurl"><span class="mono">${e(sh.url)}</span><button class="iconbtn sm" data-copy="${e(sh.url)}">Copiar</button></div>` : '<button class="send" data-shgen>Crear mi enlace de Shopify</button>'}
      <ol class="steps">
        <li>En Shopify entra a <b>Configuración → Notificaciones → Webhooks</b> y toca <b>Crear webhook</b>.</li>
        <li>Evento <b>Creación de pedido</b>, formato <b>JSON</b>, pega el enlace de arriba y guarda. Repite con <b>Cancelación de pedido</b> y, para carritos, <b>Creación de pantalla de pago</b>.</li>
        <li>Abajo de la lista, Shopify muestra «Tus webhooks se firmarán con…». Copia esa clave y ponla en Cloudflare como secreto <b class="mono">${e(sh.secret_name)}</b> (no la pegues aquí ni en el chat).</li>
      </ol>
      <div class="${sh.secret_ok ? 'okbox' : 'warnbox'}">${sh.secret_ok ? `✓ Clave lista.${sh.last_at ? ` Último aviso de Shopify: ${e(H.listTime(sh.last_at))}.` : ' Todavía no llegó ningún pedido.'}` : `Falta el secreto <b class="mono">${e(sh.secret_name)}</b> en Cloudflare.`}</div>
      ${sh.url ? '<button class="iconbtn sm" data-shgen style="margin-top:8px">Cambiar enlace</button>' : ''}</div>`;
  const mensajes = `<div class="card"><h3>Mensajes automáticos por estado</h3>
      <p class="sub">${shop ? 'Salen solos por WhatsApp cuando entra un pedido de tu web o cambia de estado.' : 'Salen solos por WhatsApp cuando cambias el estado del pedido (agendado, en ruta, entregado…).'} Si la clienta escribió en las últimas 24 h sale <b>gratis</b>; si no, sale con la <b>plantilla aprobada por Meta</b> (se cobra). Datos que se llenan solos: ${CFG.vars.map((v) => `<span class="mono">{${v}}</span>`).join(' ')}</p>
      ${!CFG.plantillas_ok ? '<div class="warnbox">Para pedir plantillas a Meta, primero conecta el número de WhatsApp de esta tienda.</div>' : ''}
      <div class="autos">${autos.map((a) => {
        const tp = TPL[a.tpl_status] || null;
        return `<div class="auto${a.on ? ' on' : ''}" data-ak="${a.key}">
          <div class="ahead"><label class="bswitch sm"><input type="checkbox" data-aon ${a.on ? 'checked' : ''}><span></span></label>
            <div style="flex:1;min-width:0"><b>${e(a.title)}</b><span class="note">${e(a.when)}</span></div>
            <span class="pill-cat">${a.cat === 'MARKETING' ? 'Marketing ~US$0.08' : 'Utilidad ~US$0.03'}</span></div>
          <textarea data-atext rows="3" class="notesbox">${e(a.text)}</textarea>
          ${a.buttons.length ? `<p class="note" style="margin:0">Botones: ${a.buttons.map((b) => `<b>${e(b)}</b>`).join(' · ')}</p>` : ''}
          <div class="afoot">
            ${a.key === 'recompra' ? `<label class="note">Días después de entregado <input type="number" min="1" data-adelay="1440" value="${Math.round((a.delay_min || 28800) / 1440)}" style="width:60px"></label>` : ''}
            ${a.key === 'carrito' ? `<label class="note">Minutos después <input type="number" min="15" data-adelay="1" value="${a.delay_min || 60}" style="width:70px"></label>` : ''}
            <span class="grow"></span>
            ${tp ? `<span class="opill t-${tp[1]}" title="${e(a.tpl_reason || '')}">Plantilla: ${tp[0]}</span>` : '<span class="note">Sin plantilla</span>'}
            ${CFG.plantillas_ok ? `<button class="iconbtn sm" data-atpl>${a.tpl_name ? 'Pedir otra plantilla' : 'Pedir plantilla a Meta'}</button>` : ''}
            <button class="iconbtn sm" data-asave>Guardar</button>
          </div></div>`;
      }).join('')}</div></div>`;
  const cp = CFG.capi || {};
  const capi = `<div class="card"><h3>Compra a Meta (anuncios)</h3>
      <p class="sub">Cuando se crea un pedido de una clienta que llegó por un anuncio de clic a WhatsApp, se avisa a Meta la <b>Compra</b> con el valor del pedido. Así en el Administrador de anuncios ves cuántas ventas y cuánto costó cada una, y Meta optimiza para traer compradoras.</p>
      <label class="bswitch"><input type="checkbox" data-capi ${cp.on ? 'checked' : ''} ${cp.conectado ? '' : 'disabled'}><span>Avisar las compras a Meta</span></label>
      ${!cp.conectado ? '<div class="warnbox" style="margin-top:10px">Primero conecta el número de WhatsApp de esta tienda.</div>' : ''}
      ${cp.last ? `<div class="${cp.last.ok ? 'okbox' : 'warnbox'}" style="margin-top:10px">${cp.last.ok ? `✓ Última compra avisada: ${e(cp.last.msg)} · ${e(H.listTime(cp.last.at))}` : `<b>No funcionó:</b> ${e(cp.last.msg)}`}</div>` : ''}
      ${cp.last && !cp.last.ok ? `<ol class="steps"><li>En Meta → Configuración del negocio → Usuarios del sistema → <b>suyon-crm</b> → Generar token nuevo.</li><li>Marca también el permiso <b class="mono">whatsapp_business_manage_events</b> (además de los que ya tiene).</li><li>Pon ese token nuevo en Cloudflare en el mismo secreto del número y vuelve a encender aquí.</li></ol>` : ''}
      <p class="note" style="margin:8px 0 0">Solo se avisa una vez por pedido. Los pedidos de clientas que escribieron directo (sin anuncio) no se mandan.</p></div>`;
  body.innerHTML = shop
    ? `<div class="ph"><div><h2>Shopify</h2><p>Esta tienda vende por su web. Aquí conectas Shopify y eliges los mensajes de WhatsApp que salen solos con cada pedido.</p></div></div>
      <div class="grid" style="gap:14px">${shopify}${mensajes}${capi}${precios}
        <p class="note">¿Esta tienda vende por chat? Cámbiala a «Por mensajes de WhatsApp» en <button class="linkbtn" data-cfg="general">General</button>.</p></div>`
    : `<div class="ph"><div><h2>Pedidos</h2><p>Precios, envíos y los mensajes que salen solos según el estado del pedido.</p></div></div>
      <div class="grid" style="gap:14px">${precios}${mensajes}${capi}
        <p class="note">¿Esta tienda vende por su web? Cámbiala a «Por Shopify» en <button class="linkbtn" data-cfg="general">General</button>.</p></div>`;
  const f = body.querySelector('#pcf');
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    const precios = {};
    for (const n of [1, 2, 3, 4]) if (Number(d['p' + n]) > 0) precios[n] = Number(d['p' + n]);
    try {
      const r = await H.api('PATCH', `/stores/${H.S.storeId}/pedidos-config`, { producto: d.producto, precios, mayor_desde: Number(d.mayor_desde), mayor_unit: Number(d.mayor_unit), adelanto: Number(d.adelanto), prov_modo: d.prov_modo, sin_cobertura: d.sin_cobertura });
      CFG.cfg = r.cfg;
      H.toast('Precios guardados');
    } catch (er) {
      const x = f.querySelector('.err');
      x.textContent = er.message;
      x.hidden = false;
    }
  };
  const cb = body.querySelector('[data-capi]');
  if (cb) cb.onchange = async () => {
    cb.disabled = true;
    try {
      const r = await H.api('PATCH', `/stores/${H.S.storeId}/capi`, { on: cb.checked });
      CFG.capi = r.capi;
      H.toast(r.error ? 'Meta no lo permitió todavía: revisa los pasos' : r.capi.on ? 'Listo: las compras se avisarán a Meta' : 'Apagado', r.error ? 5000 : 2500);
    } catch (er) {
      H.toast(er.message, 5000);
    }
    drawConfig(body);
  };
  body.onclick = async (ev) => {
    const t = ev.target;
    if (t.closest('[data-shgen]')) {
      if (CFG.shopify.url && !confirm('Si cambias el enlace, tendrás que ponerlo de nuevo en Shopify. ¿Seguir?')) return;
      try {
        CFG.shopify = (await H.api('POST', `/stores/${H.S.storeId}/shopify/enlace`)).shopify;
        drawConfig(body);
      } catch (er) {
        H.toast(er.message, 5000);
      }
      return;
    }
    const card = t.closest('[data-ak]');
    if (!card) return;
    const key = card.dataset.ak;
    const patch = (extra = {}) => {
      const d = { text: card.querySelector('[data-atext]').value, ...extra };
      const dl = card.querySelector('[data-adelay]');
      if (dl) d.delay_min = Number(dl.value) * Number(dl.dataset.adelay);
      return d;
    };
    try {
      if (t.closest('[data-aon]')) {
        const on = t.closest('[data-aon]').checked;
        const r = await H.api('PATCH', `/stores/${H.S.storeId}/autos/${key}`, { on });
        Object.assign(CFG.autos.find((a) => a.key === key), r.auto);
        card.classList.toggle('on', on);
        H.toast(on ? 'Mensaje encendido' : 'Mensaje apagado');
      } else if (t.closest('[data-asave]')) {
        const r = await H.api('PATCH', `/stores/${H.S.storeId}/autos/${key}`, patch());
        Object.assign(CFG.autos.find((a) => a.key === key), r.auto);
        H.toast('Mensaje guardado');
        drawConfig(body);
      } else if (t.closest('[data-atpl]')) {
        await H.api('PATCH', `/stores/${H.S.storeId}/autos/${key}`, patch());
        const r = await H.api('POST', `/stores/${H.S.storeId}/autos/${key}/plantilla`);
        Object.assign(CFG.autos.find((a) => a.key === key), r.auto);
        H.toast('Plantilla enviada a Meta. Suele aprobarse en minutos.', 5000);
        drawConfig(body);
      }
    } catch (er) {
      H.toast(er.message, 6000);
    }
  };
}
