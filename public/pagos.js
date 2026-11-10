// Validación de pagos: capturas que mandaron las clientas → ✅ Confirmar pago / ❌ No llegó.
// Opcional: «Conectar app de pagos» (el celular reenvía las notificaciones de Yape/Plin/banco) para cruzar montos solo.
let H;
export function initPagos(ctx) {
  H = ctx;
}
const e = (s) => H.esc(s ?? '');
const money = (n) => `S/${Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const P = { storeId: null, tab: 'pend', data: null, busy: false, timer: null };

export function resetPagos() {
  P.storeId = null;
  P.data = null;
}

const TABS = [['pend', 'Por validar'], ['ok', 'Validados'], ['no', 'No llegaron'], ['app', 'Pagos de tu app']];
const ESTADO = { por_pagar: ['warn', 'Yape por validar'], nuevo: ['info', 'Lima · por confirmar'] };

function ago(t) {
  const m = Math.round((Date.now() - t) / 60e3);
  if (m < 60) return `hace ${Math.max(1, m)} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
}
const hm = (t) => new Date(t).toLocaleTimeString('es-PE', { hour: 'numeric', minute: '2-digit', timeZone: H.store()?.timezone || 'America/Lima' });

export async function renderPagos(content) {
  if (P.storeId !== H.S.storeId) {
    P.storeId = H.S.storeId;
    P.data = null;
  }
  content.innerHTML = `<div class="page kpage pgpage">
    <div class="ph"><div><h2>Validación de pagos</h2><p>Las capturas de Yape, Plin o transferencia que mandaron tus clientas. Revisa que el pago llegó y toca <b>Confirmar</b>: el pedido queda agendado solo.</p></div>
      ${H.owner() ? '<button class="iconbtn" data-pgapp>📲 Conectar app de pagos</button>' : ''}</div>
    <div id="pgbody"><div class="empty" style="padding:60px"><span class="spin"></span></div></div>
  </div>`;
  content.querySelector('[data-pgapp]')?.addEventListener('click', appModal);
  await load();
  clearInterval(P.timer);
  P.timer = setInterval(() => {
    if (H.S.view !== 'pagos' || !document.getElementById('pgbody')) return clearInterval(P.timer);
    if (!P.busy && !document.querySelector('#pgbody input:focus')) load(true);
  }, 30e3);
}

async function load(quiet) {
  try {
    P.data = await H.api('GET', `/stores/${P.storeId}/pagos?tab=${P.tab}`);
  } catch (er) {
    const b = H.$('#pgbody');
    if (b && !quiet) b.innerHTML = `<div class="err">${e(er.message)}</div>`;
    return;
  }
  H.setPagosCount?.(P.data.resumen.pend);
  draw();
}

function thumb(p) {
  const c = p.captura;
  if (!c) return '<div class="pgimg none"><span>Sin captura</span></div>';
  if (c.type === 'image') return `<button class="pgimg" data-pgimg="${c.id}" aria-label="Ver captura en grande"><img src="/api/media/${c.id}" alt="Captura del pago" loading="lazy"></button>`;
  return `<a class="pgimg doc" href="/api/media/${c.id}" target="_blank" rel="noopener"><span>📄</span><small>${e(c.name || 'Documento')}</small></a>`;
}

function matchLine(p, app) {
  const x = p.sugerido;
  if (x) return `<div class="pgmatch ok">💚 Llegó a tu app: <b>${money(x.monto)}</b>${x.nombre ? ` de <b>${e(x.nombre)}</b>` : ''} · ${hm(x.at)}${x.nombre_ok ? '' : ' <span class="note">(revisa el nombre)</span>'}</div>`;
  const m = p.esperado.adelanto || p.esperado.total;
  if (app.on && m) return `<div class="pgmatch no">⚠️ Todavía no veo un pago de ${money(m)} en tu app. Revísalo en tu Yape antes de confirmar.</div>`;
  return '';
}

function card(p, app) {
  const st = p.order ? ESTADO[p.order.status] : null;
  const ex = p.esperado;
  const val = p.sugerido?.monto || ex.adelanto || ex.total || '';
  const chips = [ex.adelanto && ['Adelanto', ex.adelanto], ex.total && ex.total !== ex.adelanto && ['Pago completo', ex.total]].filter(Boolean);
  return `<div class="pgcard" data-chat="${p.chat_id}" data-msg="${p.captura?.id || 0}" data-pago="${p.sugerido?.id || ''}">
    ${thumb(p)}
    <div class="pgmain">
      <div class="khead"><b>${e(p.nombre || 'Sin nombre')}</b><span class="note mono">${e(H.fmtPhone ? H.fmtPhone(p.wa_id) : p.wa_id)}</span>
        ${st ? `<span class="kpill ${st[0]}">${st[1]} · #${e(p.order.number)}</span>` : '<span class="kpill warn">Sin pedido todavía</span>'}
        <span class="grow"></span><span class="note">${p.captura ? `captura ${ago(p.captura.at)}` : ago(p.at)}</span></div>
      <div class="pgexp">${p.zona === 'lima' ? '🛵 Lima' : '🚚 Provincia'}${ex.adelanto ? ` · Adelanto <b>${money(ex.adelanto)}</b>` : ''}${ex.total ? ` · Total <b>${money(ex.total)}</b>` : ''}</div>
      ${matchLine(p, app)}
      <div class="pgact">
        <label class="pgmonto">Recibió S/ <input type="number" inputmode="decimal" min="0" step="0.01" value="${e(val)}" aria-label="Monto que llegó"></label>
        ${chips.map(([l, v]) => `<button class="iconbtn sm" data-pgset="${v}">${l} ${money(v)}</button>`).join('')}
        <span class="grow"></span>
        <button class="iconbtn sm" data-pgchat>💬 Abrir chat</button>
        <button class="iconbtn sm pgno" data-pgno>❌ No llegó</button>
        <button class="send sm" data-pgok>✅ Confirmar pago</button>
      </div>
    </div>
  </div>`;
}

function markRow(m) {
  return `<div class="kcard"><div class="khead"><b>${e(m.nombre || 'Sin nombre')}</b><span class="note mono">${e(H.fmtPhone ? H.fmtPhone(m.wa_id) : m.wa_id)}</span>
    ${m.monto ? `<span class="kpill ${m.estado === 'ok' ? 'ok' : 'warn'}">${money(m.monto)}</span>` : ''}
    ${m.order_number ? `<span class="note">Pedido #${e(m.order_number)}</span>` : ''}
    <span class="grow"></span><span class="note">${ago(m.created_at)}${m.user_name ? ` · ${e(m.user_name)}` : ''}</span></div>
    ${m.nota ? `<div class="note">${e(m.nota)}</div>` : ''}
    <div class="kfoot">${m.msg_id ? `<button class="iconbtn sm" data-pgimg="${m.msg_id}">Ver captura</button>` : ''}<button class="iconbtn sm" data-pgchatid="${m.chat_id}">💬 Abrir chat</button><span class="grow"></span>
      <button class="iconbtn sm" data-pgundo="${m.id}" title="Vuelve a «Por validar». El pedido no cambia de estado.">Deshacer</button></div></div>`;
}

function pagoRow(x) {
  return `<div class="kcard"><div class="khead"><b class="mono">${money(x.monto)}</b><span>${e(x.nombre || 'Sin nombre')}</span>
    <span class="kpill ${x.chat_id ? 'ok' : 'info'}">${x.chat_id ? '✅ Cruzado con un chat' : 'Sin cruzar'}</span><span class="grow"></span><span class="note">${hm(x.at)} · ${ago(x.at)}</span></div>
    <div class="note">${e(x.texto || '')}</div>
    ${x.chat_id ? `<div class="kfoot"><button class="iconbtn sm" data-pgchatid="${x.chat_id}">💬 Abrir chat</button></div>` : ''}</div>`;
}

function draw() {
  const box = H.$('#pgbody');
  const d = P.data;
  if (!box || !d) return;
  const r = d.resumen;
  let list = '';
  if (P.tab === 'pend') list = d.pendientes.length ? d.pendientes.map((p) => card(p, d.app)).join('') : '<div class="card empty"><b>No hay pagos por validar 🎉</b><span>Cuando una clienta mande la captura de su Yape o Plin, aparece aquí.</span></div>';
  else if (P.tab === 'app') list = !d.app.on ? `<div class="card empty"><b>Tu app de pagos no está conectada</b><span>${H.owner() ? 'Toca «📲 Conectar app de pagos» arriba: así cada Yape que te llega aparece aquí y se cruza solo con las capturas.' : 'Pídele al dueño que la conecte.'}</span></div>` : d.pagos.length ? d.pagos.map(pagoRow).join('') : '<div class="card empty"><b>Todavía no llegó ningún pago</b><span>Aquí salen los Yape/Plin de las últimas 48 horas que reenvía tu celular.</span></div>';
  else list = d.marcas.length ? d.marcas.map(markRow).join('') : `<div class="card empty"><b>${P.tab === 'ok' ? 'Todavía no validas pagos' : 'Ninguno marcado como «no llegó»'}</b><span>Se muestran los últimos 14 días.</span></div>`;
  box.innerHTML = `
    <div class="rtiles">
      <div class="rtile ${r.pend ? 'hi' : ''}"><span class="rtl">Por validar</span><b class="rtv">${r.pend}</b></div>
      <div class="rtile"><span class="rtl">Validados (24 h)</span><b class="rtv">${r.ok24}</b><span class="rts">${money(r.monto24)}</span></div>
      <div class="rtile"><span class="rtl">App de pagos</span><b class="rtv" style="font-size:16px">${d.app.on ? (d.app.last_at ? '🟢 Conectada' : '🟡 Sin pagos aún') : '⚪ No conectada'}</b><span class="rts">${d.app.last_at ? `último ${ago(d.app.last_at)}` : ''}</span></div>
    </div>
    <div class="kbar"><div class="pchips">${TABS.map(([k, l]) => `<button data-pgtab="${k}" class="${P.tab === k ? 'on' : ''}">${l}${k === 'pend' && r.pend ? ` · ${r.pend}` : ''}</button>`).join('')}</div></div>
    <div class="klist">${list}</div>`;
  box.onclick = onClick;
}

async function onClick(ev) {
  const t = ev.target.closest('[data-pgtab],[data-pgimg],[data-pgchat],[data-pgchatid],[data-pgset],[data-pgok],[data-pgno],[data-pgundo]');
  if (!t) return;
  if (t.dataset.pgtab) {
    P.tab = t.dataset.pgtab;
    return load();
  }
  if (t.dataset.pgimg) {
    return H.modal(`<h3 style="margin:0 0 10px">Captura del pago</h3><img src="/api/media/${t.dataset.pgimg}" alt="Captura del pago" style="max-width:100%;max-height:75vh;display:block;margin:auto;border-radius:10px"><p style="text-align:center;margin-top:10px"><a href="/api/media/${t.dataset.pgimg}" target="_blank" rel="noopener">Abrir en otra pestaña</a></p>`);
  }
  if (t.dataset.pgchatid) return H.goChat(Number(t.dataset.pgchatid));
  const cardEl = t.closest('.pgcard');
  if ('pgchat' in t.dataset && cardEl) return H.goChat(Number(cardEl.dataset.chat));
  if (t.dataset.pgset && cardEl) {
    cardEl.querySelector('input').value = t.dataset.pgset;
    return;
  }
  if (t.dataset.pgundo) {
    P.busy = true;
    try {
      await H.api('DELETE', `/pago-marks/${t.dataset.pgundo}`);
      H.toast('Volvió a «Por validar»');
      await load();
    } catch (er) {
      H.toast(er.message);
    }
    P.busy = false;
    return;
  }
  if (('pgok' in t.dataset || 'pgno' in t.dataset) && cardEl) {
    const ok = 'pgok' in t.dataset;
    const monto = Number(cardEl.querySelector('input').value) || null;
    if (ok && !monto && !confirm('No pusiste el monto que llegó. ¿Confirmar igual?')) return;
    P.busy = true;
    cardEl.querySelectorAll('button').forEach((b) => (b.disabled = true));
    try {
      const res = await H.api('POST', `/chats/${cardEl.dataset.chat}/pago`, { accion: ok ? 'ok' : 'no_llego', msg_id: Number(cardEl.dataset.msg) || 0, monto, pago_id: Number(cardEl.dataset.pago) || null });
      const p = res.pedido;
      H.toast(ok ? `✅ Pago confirmado${p ? ` · pedido #${p.num} ${p.creado ? 'creado' : 'agendado'}` : ''}` : 'Marcado como «no llegó». Escríbele a la clienta desde el chat.');
      cardEl.classList.add('pggone');
      setTimeout(load, 250);
    } catch (er) {
      H.toast(er.message, 6000);
      cardEl.querySelectorAll('button').forEach((b) => (b.disabled = false));
    }
    P.busy = false;
  }
}

/* ---------- Conectar app de pagos (solo dueño) ---------- */
async function appModal() {
  let info;
  try {
    info = await H.api('GET', `/stores/${P.storeId}/pagos-app`);
  } catch (er) {
    return H.toast(er.message);
  }
  const draw0 = () => {
    H.modal(`<h3 style="margin:0 0 6px">📲 Conectar app de pagos</h3>
      <p class="note" style="margin:0 0 12px">Tu celular le avisa a Control Total cada vez que te llega un Yape, Plin o transferencia. Así, junto a cada captura ves si el pago <b>de verdad llegó</b> (mismo monto y nombre). Siempre confirmas tú: nada se agenda solo.</p>
      ${info.url ? `<label class="note">Tu enlace (no lo compartas)</label>
        <div style="display:flex;gap:8px;margin:4px 0 12px"><input readonly value="${e(info.url)}" style="flex:1;min-width:0;border:1px solid var(--line);border-radius:8px;padding:7px 9px;background:var(--surface-2);font-size:12px" id="pgurl"><button class="send sm" data-pgcopy>Copiar</button></div>
        <ol class="pgsteps">
          <li>Usa un celular <b>Android</b> donde te lleguen los Yape (el iPhone no deja leer notificaciones).</li>
          <li>Instala <b>MacroDroid</b> (gratis, Play Store) y crea una macro nueva.</li>
          <li><b>Disparador:</b> Notificación → Notificación recibida → elige la app <b>Yape</b> (puedes agregar Plin o tu banco).</li>
          <li><b>Acción:</b> Conectividad → <b>Solicitud HTTP</b> → método <b>POST</b> → pega tu enlace → en el cuerpo pon el <b>texto de la notificación</b> (botón de texto mágico → título y texto de la notificación).</li>
          <li>Guarda y pide que te yapeen <b>S/1</b> de prueba: debe salir en la pestaña «Pagos de tu app».</li>
        </ol>
        <p class="note">${info.last_at ? `🟢 Último pago recibido ${ago(info.last_at)}.` : '🟡 Todavía no llega ningún pago por este enlace.'}</p>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px"><button class="iconbtn sm" data-pgnew>Cambiar enlace</button><button class="iconbtn sm pgno" data-pgoff>Desconectar</button></div>`
      : `<button class="send" data-pgnew>Crear mi enlace</button>`}`);
    const m = document.querySelector('.modal');
    m.onclick = async (ev) => {
      const t = ev.target.closest('[data-pgcopy],[data-pgnew],[data-pgoff]');
      if (!t) return;
      if ('pgcopy' in t.dataset) {
        try {
          await navigator.clipboard.writeText(info.url);
          H.toast('Enlace copiado');
        } catch {
          document.getElementById('pgurl')?.select();
        }
        return;
      }
      if ('pgnew' in t.dataset && info.url && !confirm('El enlace viejo dejará de funcionar. Tendrás que pegar el nuevo en MacroDroid. ¿Seguir?')) return;
      if ('pgoff' in t.dataset && !confirm('¿Desconectar? Los pagos dejarán de llegar.')) return;
      try {
        info = await H.api('POST', `/stores/${P.storeId}/pagos-app`, { off: 'pgoff' in t.dataset });
        draw0();
        load(true);
      } catch (er) {
        H.toast(er.message);
      }
    };
  };
  draw0();
}
