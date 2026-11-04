// Planes de alumnos: «Mi plan» (dueño), pantalla de plan vencido y Panel Suyon (administrador)
let H;
export function initPanel(ctx) {
  H = ctx;
}
const e = (s) => H.esc(s);
const money = (n, cur = 'USD') => `${cur === 'PEN' ? 'S/' : 'US$'}${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString('es-PE')}`;
const day = (t) => (t ? new Date(t).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const STATE = {
  free: ['Sin cobro', 't-mute'],
  trial: ['Prueba gratis', 't-info'],
  active: ['Pagado', 't-ok'],
  grace: ['Venció, en gracia', 't-warn'],
  trial_over: ['Prueba terminada', 't-bad'],
  expired: ['Vencido', 't-bad'],
  blocked: ['Bloqueado', 't-bad'],
};
const pill = (st) => `<span class="opill ${(STATE[st] || STATE.free)[1]}">${(STATE[st] || STATE.free)[0]}</span>`;

function priceBox(p) {
  return `<table class="ptable plprice"><tbody>${p.price.lines.map((l) => `<tr><td>${e(l.label)}</td><td class="r mono">${money(l.amount, p.price.currency)}</td></tr>`).join('')}
    <tr class="pltot"><td><b>Total al mes</b></td><td class="r mono"><b>${money(p.price.total, p.price.currency)}</b></td></tr></tbody></table>`;
}

function payBox(p) {
  const wa = p.contact ? `https://wa.me/${String(p.contact).replace(/\D/g, '')}?text=${encodeURIComponent('Hola, ya pagué mi plan de Control Total')}` : null;
  return `<div class="plpay"><h4>Cómo pagar</h4>
    ${p.pay_info ? `<p style="white-space:pre-line;margin:0">${e(p.pay_info)}</p>` : '<p class="note" style="margin:0">El administrador todavía no puso los datos de pago. Escríbele para renovar.</p>'}
    ${wa ? `<a class="send" href="${e(wa)}" target="_blank" rel="noopener" style="margin-top:10px;display:inline-flex">Ya pagué, avisar por WhatsApp</a>` : ''}
    <p class="note" style="margin:8px 0 0">Pronto: pagar con tarjeta aquí mismo y que se renueve solo cada mes.</p></div>`;
}

function stateText(p) {
  if (p.state === 'free') return 'Tu empresa no tiene cobro.';
  if (p.state === 'trial') return `Estás en la prueba gratis: te quedan <b>${p.days_left} ${p.days_left === 1 ? 'día' : 'días'}</b> (hasta el ${day(p.until)}).`;
  if (p.state === 'active') return `Plan pagado hasta el <b>${day(p.until)}</b> (${p.days_left} ${p.days_left === 1 ? 'día' : 'días'}).`;
  if (p.state === 'grace') return `Tu plan venció el ${day(p.until)}. Todavía puedes entrar unos días: renueva para no perder el acceso.`;
  if (p.state === 'trial_over') return 'Tu prueba gratis terminó. Tus chats y pedidos siguen guardados: renueva para seguir usando Control Total.';
  if (p.state === 'blocked') return 'El acceso de tu empresa está pausado. Escribe al administrador.';
  return `Tu plan venció el ${day(p.until)}. Tus chats y pedidos siguen guardados: renueva para seguir.`;
}

// Configuración → Mi plan (dueño)
export async function renderMiPlan(body, companyId) {
  body.innerHTML = '<div class="empty" style="padding:40px"><span class="spin"></span></div>';
  let r;
  try {
    r = await H.api('GET', `/companies/${companyId}/plan`);
  } catch (er) {
    body.innerHTML = `<div class="err">${e(er.message)}</div>`;
    return;
  }
  const p = r.plan;
  body.innerHTML = `<div class="ph"><div><h2>Mi plan</h2><p>${stateText(p)}</p></div><span class="grow"></span>${pill(p.state)}</div>
    <div class="grid" style="gap:14px">
      <div class="card"><h3>Lo que pagas al mes</h3><p class="sub">Tienes ${p.usage.numbers} ${p.usage.numbers === 1 ? 'número' : 'números'} de WhatsApp y ${p.usage.users} ${p.usage.users === 1 ? 'trabajadora' : 'trabajadoras'} (sin contar al dueño).</p>${priceBox(p)}
        <p class="note" style="margin:8px 0 0">Los mensajes que cobra Meta y lo que gasta la IA se pagan aparte, con tu tarjeta en Meta y tu clave de IA.</p></div>
      ${p.state !== 'free' ? `<div class="card">${payBox(p)}</div>` : ''}
      ${r.pagos.length ? `<div class="card"><h3>Pagos</h3><table class="ptable"><thead><tr><th>Fecha</th><th>Meses</th><th>Medio</th><th class="r">Monto</th><th>Cubre hasta</th></tr></thead><tbody>${r.pagos.map((x) => `<tr><td>${day(x.created_at)}</td><td>${x.months}</td><td>${e(x.method || '')}</td><td class="r mono">${money(x.amount, x.currency)}</td><td>${day(x.paid_to)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    </div>`;
}

// Pantalla cuando la prueba o el plan terminó
export async function renderPaywall(content, company) {
  content.innerHTML = `<div class="page"><div class="paywall card"><span class="spin"></span></div></div>`;
  const box = content.querySelector('.paywall');
  if (company.role !== 'dueno') {
    box.innerHTML = `<h2>El plan de ${e(company.name)} terminó</h2><p>${stateText(company.plan)}</p><p class="note">Avísale al dueño de la tienda para que lo renueve. Tus chats siguen guardados.</p>`;
    return;
  }
  try {
    const r = await H.api('GET', `/companies/${company.id}/plan`);
    const p = r.plan;
    box.innerHTML = `<h2>${p.state === 'trial_over' ? 'Tu prueba gratis terminó' : 'Tu plan venció'}</h2><p>${stateText(p)}</p>${priceBox(p)}${payBox(p)}`;
  } catch (er) {
    box.innerHTML = `<div class="err">${e(er.message)}</div>`;
  }
}

/* =================== Panel Suyon (solo administrador) =================== */
const PN = { data: null, q: '', f: '', tab: 'empresas', demos: null, df: 'proximas' };

export async function renderPanel(content) {
  content.innerHTML = '<div class="page pnl"><div class="empty" style="padding:40px"><span class="spin"></span></div></div>';
  try {
    [PN.data, PN.demos] = await Promise.all([H.api('GET', '/admin/empresas'), H.api('GET', '/admin/demos')]);
  } catch (er) {
    content.innerHTML = `<div class="page"><div class="err">${e(er.message)}</div></div>`;
    return;
  }
  draw(content);
}

const tabs = () => `<div class="seg pntabs" role="tablist">${[['empresas', 'Empresas'], ['demos', `Demos${PN.demos?.nuevas ? ` <span class="pnbadge">${PN.demos.nuevas}</span>` : ''}`], ['horarios', 'Horarios de demo'], ['pagina', 'Página pública']].map(([k, l]) => `<button data-ptab="${k}" aria-pressed="${PN.tab === k}">${l}</button>`).join('')}</div>`;

function draw(content) {
  if (PN.tab === 'demos') return drawDemos(content);
  if (PN.tab === 'horarios') return drawHorarios(content);
  if (PN.tab === 'pagina') return drawPagina(content);
  const d = PN.data;
  const p = d.plan;
  const rs = d.resumen;
  const q = PN.q.toLowerCase();
  const list = d.empresas.filter((x) => (!PN.f || (PN.f === 'vencidas' ? x.blocked : PN.f === 'pagando' ? ['active', 'grace'].includes(x.state) : x.state === PN.f)) && (!q || `${x.name} ${x.owner_email || ''} ${x.owner_name || ''}`.toLowerCase().includes(q)));
  const regUrl = `${location.origin}/registro`;
  content.innerHTML = `<div class="page pnl">
    <div class="ph"><div><h2>Panel Suyon</h2><p>Tus alumnos: quién está en prueba, quién pagó y cuánto entra al mes. Solo tú lo ves.</p></div></div>
    ${tabs()}
    <div class="clikpis">
      <div class="clikpi"><span>Ingreso mensual</span><b>${money(rs.mensual, p.currency)}</b><small>${rs.pagando} pagando</small></div>
      <div class="clikpi"><span>En prueba</span><b>${rs.prueba}</b><small>${p.trial_days} días gratis</small></div>
      <div class="clikpi"><span>Vencidas</span><b>${rs.vencidas}</b><small>para cobrar</small></div>
      <div class="clikpi"><span>Empresas</span><b>${rs.total}</b><small>${rs.gratis} sin cobro</small></div>
    </div>
    <div class="pedhead">
      <div class="seg" role="tablist">${[['', 'Todas'], ['trial', 'En prueba'], ['pagando', 'Pagando'], ['vencidas', 'Vencidas'], ['free', 'Sin cobro']].map(([k, l]) => `<button data-pf="${k}" aria-pressed="${PN.f === k}">${l}</button>`).join('')}</div>
      <div class="search pedq"><input id="pnq" type="search" placeholder="Buscar marca o correo…" value="${e(PN.q)}" aria-label="Buscar"></div>
    </div>
    <div class="plist"><table class="ptable"><thead><tr><th>Empresa</th><th>Estado</th><th>Hasta</th><th>Uso</th><th class="r">Al mes</th><th></th></tr></thead><tbody>
      ${list.map((x) => `<tr data-pe="${x.id}">
        <td><b>${e(x.name)}</b><small>${e(x.owner_name || '')} · ${e(x.owner_email || '')}${x.contact_phone ? ` · ${e(x.contact_phone)}` : ''}</small></td>
        <td>${pill(x.state)}</td>
        <td>${x.until ? `${day(x.until)}${x.days_left ? `<small>${x.days_left} días</small>` : ''}` : '—'}</td>
        <td>${x.numbers} ${x.numbers === 1 ? 'número' : 'números'} (${x.conectados} conectados)<small>${x.users} ${x.users === 1 ? 'trabajadora' : 'trabajadoras'}</small></td>
        <td class="r mono">${money(x.monthly, p.currency)}${x.cobrado ? `<small>cobrado ${money(x.cobrado, p.currency)}</small>` : ''}</td>
        <td class="r"><div class="pnacts">
          <button class="iconbtn sm" data-pa="pagado">Pagó 1 mes</button>
          <details class="pnmore"><summary class="iconbtn sm">Más</summary><div class="pnmenu">
            <button data-pa="dias">Dar días extra</button>
            <button data-pa="prueba">Reiniciar prueba</button>
            <button data-pa="gratis">Sin cobro</button>
            <button data-pa="bloquear">Pausar acceso</button>
          </div></details></div></td></tr>`).join('') || '<tr><td colspan="6" class="note" style="padding:30px;text-align:center">Nadie con ese filtro.</td></tr>'}
    </tbody></table></div>
    <form class="card" id="pnplan"><h3>Precios y registro</h3>
      <p class="sub">Enlace para que tus alumnos se registren solos: <span class="mono">${e(regUrl)}</span> <button type="button" class="iconbtn sm" data-copy="${e(regUrl)}">Copiar</button></p>
      <div class="fields3">
        <div class="field"><label>Plan base al mes</label><input name="base" type="number" step="0.5" min="0" value="${p.base}"></div>
        <div class="field"><label>Cada número extra</label><input name="per_number" type="number" step="0.5" min="0" value="${p.per_number}"></div>
        <div class="field"><label>Cada trabajadora extra</label><input name="per_user" type="number" step="0.5" min="0" value="${p.per_user}"></div>
        <div class="field"><label>Moneda</label><select name="currency"><option value="USD" ${p.currency === 'USD' ? 'selected' : ''}>Dólares (US$)</option><option value="PEN" ${p.currency === 'PEN' ? 'selected' : ''}>Soles (S/)</option></select></div>
        <div class="field"><label>Días de prueba gratis</label><input name="trial_days" type="number" min="0" max="90" value="${p.trial_days}"></div>
        <div class="field"><label>Días de gracia al vencer</label><input name="grace_days" type="number" min="0" max="30" value="${p.grace_days}"></div>
        <div class="field"><label>Tu WhatsApp para avisar el pago</label><input name="contact" value="${e(p.contact || '')}" placeholder="51999888777" inputmode="tel"></div>
        <div class="field"><label>Titular (sale en la página de planes)</label><input name="legal_name" value="${e(p.legal_name || '')}" placeholder="Tu nombre o razón social"></div>
        <div class="field"><label>RUC</label><input name="ruc" value="${e(p.ruc || '')}" inputmode="numeric" maxlength="11"></div>
      </div>
      <p class="note" style="margin:0">Página pública de precios y condiciones (la que revisa Culqi): <a href="/planes" target="_blank" rel="noopener">${e(location.origin)}/planes</a></p>
      <div class="field"><label>Cómo te pagan (lo ven tus alumnos al renovar)</label><textarea name="pay_info" rows="3" class="notesbox" placeholder="Ej: Yape al 9xx xxx xxx a nombre de … y manda la captura por WhatsApp">${e(p.pay_info || '')}</textarea></div>
      <label class="check"><input type="checkbox" name="signup_open" ${p.signup_open ? 'checked' : ''}> Registro abierto (cualquiera puede crear su cuenta con prueba gratis)</label>
      <div class="err" hidden></div><div><button class="send" type="submit">Guardar</button></div></form>
  </div>`;
  const root = content.querySelector('.pnl');
  root.querySelector('#pnq').oninput = (ev) => {
    PN.q = ev.target.value;
    clearTimeout(PN.t);
    PN.t = setTimeout(() => {
      draw(content);
      const i = content.querySelector('#pnq');
      i.focus();
      i.setSelectionRange(i.value.length, i.value.length);
    }, 250);
  };
  root.onclick = async (ev) => {
    if (tabClick(ev, content)) return;
    const f = ev.target.closest('[data-pf]');
    if (f) {
      PN.f = f.dataset.pf;
      return draw(content);
    }
    const a = ev.target.closest('[data-pa]');
    if (!a) return;
    const id = Number(a.closest('[data-pe]').dataset.pe);
    const co = PN.data.empresas.find((x) => x.id === id);
    const act = a.dataset.pa;
    const payload = { action: act };
    if (act === 'pagado') {
      const amt = prompt(`¿Cuánto pagó ${co.name}? (1 mes, sugerido ${co.monthly})`, String(co.monthly));
      if (amt === null) return;
      Object.assign(payload, { months: 1, amount: Number(amt) || 0, method: 'yape' });
    } else if (act === 'dias') {
      const d = prompt(`¿Cuántos días extra le das a ${co.name}?`, '7');
      if (!d) return;
      payload.days = Number(d);
    } else if (act === 'bloquear' && !confirm(`¿Pausar el acceso de ${co.name}? Sus datos no se borran.`)) return;
    try {
      await H.api('POST', `/admin/empresas/${id}`, payload);
      H.toast('Listo');
      PN.data = await H.api('GET', '/admin/empresas');
      draw(content);
    } catch (er) {
      H.toast(er.message, 5000);
    }
  };
  const form = root.querySelector('#pnplan');
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    d.signup_open = !!d.signup_open;
    try {
      PN.data.plan = (await H.api('PATCH', '/admin/plan', d)).plan;
      PN.data = await H.api('GET', '/admin/empresas');
      H.toast('Guardado');
      draw(content);
    } catch (er) {
      const x = form.querySelector('.err');
      x.textContent = er.message;
      x.hidden = false;
    }
  };
}

function tabClick(ev, content) {
  const t = ev.target.closest('[data-ptab]');
  if (!t) return false;
  PN.tab = t.dataset.ptab;
  draw(content);
  return true;
}

/* ---------- Demos agendadas ---------- */
const DST = {
  nueva: ['Nueva', 't-info'],
  confirmada: ['Confirmada', 't-ok'],
  hecha: ['Hecha', 't-mute'],
  no_vino: ['No vino', 't-warn'],
  cancelada: ['Cancelada', 't-bad'],
};
const dpill = (st) => `<span class="opill ${(DST[st] || DST.nueva)[1]}">${(DST[st] || DST.nueva)[0]}</span>`;

function waConfirm(d) {
  const msg = `Hola ${d.name.split(' ')[0]} 👋 Soy Jordan de Control Total. Te confirmo tu demo el ${d.dia} a las ${d.hora}. ${PN.demos.agenda.where || ''} ¿Te queda bien?`;
  return `https://wa.me/${d.phone}?text=${encodeURIComponent(msg)}`;
}

function drawDemos(content) {
  const t = Date.now();
  const all = PN.demos.demos;
  const list = PN.df === 'proximas' ? all.filter((d) => d.starts_at + d.dur_min * 6e4 > t && d.status !== 'cancelada') : all.filter((d) => !(d.starts_at + d.dur_min * 6e4 > t && d.status !== 'cancelada')).reverse();
  const pub = `${location.origin}/inicio#demo`;
  let lastDay = '';
  content.innerHTML = `<div class="page pnl">
    <div class="ph"><div><h2>Panel Suyon</h2><p>Demos que la gente agenda desde tu página. Confírmalas por WhatsApp y pásalas a tu Google Calendar.</p></div></div>
    ${tabs()}
    <div class="pedhead">
      <div class="seg">${[['proximas', 'Próximas'], ['pasadas', 'Pasadas y canceladas']].map(([k, l]) => `<button data-df="${k}" aria-pressed="${PN.df === k}">${l}</button>`).join('')}</div>
      <span class="note">Enlace para agendar: <span class="mono">${e(pub)}</span> <button type="button" class="iconbtn sm" data-copy="${e(pub)}">Copiar</button></span>
    </div>
    <div class="demolist">${list.map((d) => {
      const head = d.dia !== lastDay ? `<h4 class="demoday">${e(d.dia)}</h4>` : '';
      lastDay = d.dia;
      return `${head}<div class="card demo" data-dm="${d.id}">
        <div class="demotime"><b>${e(d.hora)}</b><small>${d.dur_min} min</small></div>
        <div class="demoinfo"><b>${e(d.name)}</b>${d.brand ? ` · ${e(d.brand)}` : ''} ${dpill(d.status)}
          <small><a href="https://wa.me/${e(d.phone)}" target="_blank" rel="noopener">+${e(d.phone)}</a>${d.sells ? ` · Vende: ${e(d.sells)}` : ''}${d.volume ? ` · ${e(d.volume)} chats al día` : ''}</small>
          ${d.note ? `<small>«${e(d.note)}»</small>` : ''}</div>
        <div class="demoacts">
          <a class="iconbtn sm" href="${e(waConfirm(d))}" target="_blank" rel="noopener">Confirmar por WhatsApp</a>
          <a class="iconbtn sm" href="${e(d.gcal)}" target="_blank" rel="noopener">A mi Google Calendar</a>
          <details class="pnmore"><summary class="iconbtn sm">Estado</summary><div class="pnmenu">
            ${Object.entries(DST).map(([k, [l]]) => `<button data-ds="${k}">${l}</button>`).join('')}
          </div></details>
        </div></div>`;
    }).join('') || `<div class="card empty" style="padding:30px;text-align:center"><p class="note" style="margin:0">${PN.df === 'proximas' ? 'Todavía no hay demos agendadas. Comparte tu enlace para agendar.' : 'Nada por aquí.'}</p></div>`}</div>
  </div>`;
  const root = content.querySelector('.pnl');
  root.onclick = async (ev) => {
    if (tabClick(ev, content)) return;
    const f = ev.target.closest('[data-df]');
    if (f) {
      PN.df = f.dataset.df;
      return draw(content);
    }
    const s = ev.target.closest('[data-ds]');
    if (!s) return;
    const id = Number(s.closest('[data-dm]').dataset.dm);
    if (s.dataset.ds === 'cancelada' && !confirm('¿Cancelar esta demo? El horario vuelve a quedar libre.')) return;
    try {
      await H.api('PATCH', `/admin/demos/${id}`, { status: s.dataset.ds });
      PN.demos = await H.api('GET', '/admin/demos');
      H.toast('Listo');
      draw(content);
    } catch (er) {
      H.toast(er.message, 5000);
    }
  };
}

/* ---------- Horarios en que das demos ---------- */
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
function drawHorarios(content) {
  const a = PN.demos.agenda;
  content.innerHTML = `<div class="page pnl">
    <div class="ph"><div><h2>Panel Suyon</h2><p>Elige los días y horas en que puedes dar demos. La página solo muestra esos horarios y nunca dos demos a la vez.</p></div></div>
    ${tabs()}
    <form class="card" id="pnag"><h3>Horarios de demo</h3>
      <label class="check"><input type="checkbox" name="on" ${a.on ? 'checked' : ''}> Recibir demos desde la página</label>
      <div class="field"><label>Días</label><div class="pndays">${DIAS.map((l, i) => `<label class="pnday"><input type="checkbox" name="d${i}" ${a.days.includes(i) ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
      <div class="fields3">
        <div class="field"><label>Desde</label><input name="from" type="time" value="${e(a.from)}" step="900"></div>
        <div class="field"><label>Hasta</label><input name="to" type="time" value="${e(a.to)}" step="900"></div>
        <div class="field"><label>Duración de cada demo (min)</label><input name="dur_min" type="number" min="15" max="120" step="5" value="${a.dur_min}"></div>
        <div class="field"><label>Pausa desde (vacío = sin pausa)</label><input name="pausa_from" type="time" value="${e(a.pausa_from || '')}" step="900"></div>
        <div class="field"><label>Pausa hasta</label><input name="pausa_to" type="time" value="${e(a.pausa_to || '')}" step="900"></div>
        <div class="field"><label>Cada cuánto empieza una (min)</label><input name="slot_min" type="number" min="15" max="120" step="5" value="${a.slot_min}"></div>
        <div class="field"><label>Anticipación mínima (horas)</label><input name="min_hours" type="number" min="0" max="72" value="${a.min_hours}"></div>
        <div class="field"><label>Hasta cuántos días adelante</label><input name="max_days" type="number" min="1" max="60" value="${a.max_days}"></div>
      </div>
      <div class="field"><label>Días sin demos (feriados, viajes)</label><input name="off_dates" value="${e(a.off_dates || '')}" placeholder="2026-12-25, 2026-12-31"></div>
      <div class="field"><label>Dónde es la demo (lo ve la persona al agendar)</label><input name="where" value="${e(a.where || '')}" maxlength="300"></div>
      <p class="note" style="margin:0">Hora de Lima. Las demos nuevas salen en la pestaña Demos y con un número en «Panel Suyon».</p>
      <div class="err" hidden></div><div><button class="send" type="submit">Guardar</button></div></form>
  </div>`;
  const root = content.querySelector('.pnl');
  root.onclick = (ev) => tabClick(ev, content);
  const form = root.querySelector('#pnag');
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    const out = { on: !!d.on, days: DIAS.map((_, i) => (d[`d${i}`] ? i : -1)).filter((i) => i >= 0) };
    for (const k of ['from', 'to', 'pausa_from', 'pausa_to', 'dur_min', 'slot_min', 'min_hours', 'max_days', 'off_dates', 'where']) out[k] = d[k];
    try {
      PN.demos.agenda = (await H.api('PATCH', '/admin/agenda', out)).agenda;
      H.toast('Guardado');
      draw(content);
    } catch (er) {
      const x = form.querySelector('.err');
      x.textContent = er.message;
      x.hidden = false;
    }
  };
}

/* ---------- Página pública: video y testimonios ---------- */
async function drawPagina(content) {
  if (!PN.landing) {
    try {
      PN.landing = (await H.api('GET', '/admin/landing')).landing;
    } catch (er) {
      H.toast(er.message, 5000);
      return;
    }
  }
  const L = PN.landing;
  const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
  content.innerHTML = `<div class="page pnl">
    <div class="ph"><div><h2>Panel Suyon</h2><p>Lo que se ve en tu página pública. <a href="/inicio" target="_blank" rel="noopener">Abrir la página</a></p></div></div>
    ${tabs()}
    <div class="grid" style="gap:14px">
      <div class="card"><h3>Video de 1 minuto</h3>
        <p class="sub">Sale debajo de la portada con el título «Míralo en 1 minuto». Graba la pantalla mostrando un chat, el bot, un pedido y un reporte. MP4, hasta 50 MB (1 minuto en 720p pesa unos 15 MB).</p>
        ${L.video ? `<video controls preload="metadata" src="/inicio/media/${e(L.video.name)}" style="width:100%;max-width:560px;border-radius:12px;background:#000"></video>
          <p class="note" style="margin:6px 0 0">${mb(L.video.size)} · subido el ${day(L.video.at)}</p>` : '<p class="note" style="margin:0">Todavía no hay video. Mientras no subas uno, esa sección no sale.</p>'}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          <label class="send" style="cursor:pointer">${L.video ? 'Cambiar video' : 'Subir video'}<input type="file" accept="video/mp4,video/webm,video/quicktime" id="pnvid" hidden></label>
          ${L.video ? '<button class="iconbtn" data-pl="delvid">Quitar video</button>' : ''}
        </div><p class="note" id="pnvidst" hidden style="margin:8px 0 0"></p></div>
      <div class="card"><h3>Testimonios</h3>
        <p class="sub">Solo de personas reales que usan Control Total y te dieron permiso. La sección sale cuando hay al menos uno.</p>
        ${L.testimonios.length ? `<div class="demolist" style="margin-bottom:14px">${L.testimonios.map((t) => `<div class="card demo" style="grid-template-columns:56px 1fr auto" data-tid="${e(t.id)}">
          ${t.photo ? `<img src="/inicio/media/${e(t.photo)}" alt="" style="width:48px;height:48px;border-radius:50%;object-fit:cover">` : `<span class="av" style="width:48px;height:48px;background:var(--accent)">${e(t.name.charAt(0))}</span>`}
          <div class="demoinfo"><b>${e(t.name)}</b>${t.brand ? ` · ${e(t.brand)}` : ''}<small>«${e(t.text)}»</small></div>
          <button class="iconbtn sm" data-pl="deltes">Borrar</button></div>`).join('')}</div>` : ''}
        <form id="pntes" class="fields3" style="align-items:end">
          <div class="field"><label>Nombre</label><input name="name" maxlength="60" required placeholder="Ej. Carla Ramos"></div>
          <div class="field"><label>Marca o tienda</label><input name="brand" maxlength="60" placeholder="Ej. Carla Store"></div>
          <div class="field"><label>Foto (opcional)</label><input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></div>
          <div class="field" style="grid-column:1/-1"><label>Lo que dijo (con sus palabras)</label><textarea name="text" rows="3" maxlength="500" class="notesbox" required></textarea></div>
          <label class="check" style="grid-column:1/-1"><input type="checkbox" name="permiso" value="1"> Esta persona usa Control Total y me dio permiso para publicar su nombre, su foto y lo que dijo.</label>
          <div style="grid-column:1/-1"><div class="err" hidden></div><button class="send" type="submit">Agregar testimonio</button></div>
        </form></div>
    </div></div>`;
  const root = content.querySelector('.pnl');
  const reload = (landing) => {
    PN.landing = landing;
    drawPagina(content);
  };
  root.onclick = async (ev) => {
    if (tabClick(ev, content)) return;
    const b = ev.target.closest('[data-pl]');
    if (!b) return;
    try {
      if (b.dataset.pl === 'delvid' && confirm('¿Quitar el video de la página?')) reload((await H.api('DELETE', '/admin/landing/video')).landing);
      if (b.dataset.pl === 'deltes' && confirm('¿Borrar este testimonio?')) reload((await H.api('DELETE', `/admin/landing/testimonios/${b.closest('[data-tid]').dataset.tid}`)).landing);
    } catch (er) {
      H.toast(er.message, 5000);
    }
  };
  root.querySelector('#pnvid').onchange = async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    const st = root.querySelector('#pnvidst');
    st.hidden = false;
    st.textContent = `Subiendo ${mb(f.size)}… no cierres esta pantalla.`;
    const fd = new FormData();
    fd.append('file', f);
    try {
      reload((await H.api('POST', '/admin/landing/video', fd)).landing);
      H.toast('Video subido');
    } catch (er) {
      st.textContent = er.message;
    }
  };
  const form = root.querySelector('#pntes');
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      reload((await H.api('POST', '/admin/landing/testimonios', new FormData(form))).landing);
      H.toast('Testimonio agregado');
    } catch (er) {
      const x = form.querySelector('.err');
      x.textContent = er.message;
      x.hidden = false;
      btn.disabled = false;
    }
  };
}
