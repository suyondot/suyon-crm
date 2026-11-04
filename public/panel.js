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
const PN = { data: null, q: '', f: '' };

export async function renderPanel(content) {
  content.innerHTML = '<div class="page pnl"><div class="empty" style="padding:40px"><span class="spin"></span></div></div>';
  try {
    PN.data = await H.api('GET', '/admin/empresas');
  } catch (er) {
    content.innerHTML = `<div class="page"><div class="err">${e(er.message)}</div></div>`;
    return;
  }
  draw(content);
}

function draw(content) {
  const d = PN.data;
  const p = d.plan;
  const rs = d.resumen;
  const q = PN.q.toLowerCase();
  const list = d.empresas.filter((x) => (!PN.f || (PN.f === 'vencidas' ? x.blocked : PN.f === 'pagando' ? ['active', 'grace'].includes(x.state) : x.state === PN.f)) && (!q || `${x.name} ${x.owner_email || ''} ${x.owner_name || ''}`.toLowerCase().includes(q)));
  const regUrl = `${location.origin}/registro`;
  content.innerHTML = `<div class="page pnl">
    <div class="ph"><div><h2>Panel Suyon</h2><p>Tus alumnos: quién está en prueba, quién pagó y cuánto entra al mes. Solo tú lo ves.</p></div></div>
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
