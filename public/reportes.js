// Reportes: números rápidos de la tienda con gráficos simples
let H;
export function initReportes(ctx) {
  H = ctx;
}
const e = (s) => H.esc(s);
const R = { range: 'hoy', desde: null, hasta: null, data: null, metric: 'ventas', storeId: null, loading: false };
const fmt = (n) => Number(n || 0).toLocaleString('es-PE');
const pct = (x) => (x == null ? '—' : `${(x * 100).toFixed(x > 0 && x < 0.1 ? 1 : 0)} %`);

function localDay(offsetDays = 0, tz) {
  const d = new Date(Date.now() + offsetDays * 864e5);
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function rangeDates() {
  const tz = H.store()?.timezone || 'America/Lima';
  if (R.range === 'hoy') return [localDay(0, tz), localDay(0, tz)];
  if (R.range === 'ayer') return [localDay(-1, tz), localDay(-1, tz)];
  if (R.range === '7') return [localDay(-6, tz), localDay(0, tz)];
  if (R.range === '30') return [localDay(-29, tz), localDay(0, tz)];
  return [R.desde, R.hasta];
}

export function resetReportes() {
  R.storeId = null;
  R.data = null;
}

export async function renderReportes(content) {
  if (R.storeId !== H.S.storeId) {
    R.storeId = H.S.storeId;
    R.data = null;
  }
  const [d0, d1] = rangeDates();
  if (!R.desde) [R.desde, R.hasta] = [d0, d1];
  content.innerHTML = `<div class="rep">
    <div class="rephead">
      <div class="seg" role="tablist" aria-label="Periodo">${[['hoy', 'Hoy'], ['ayer', 'Ayer'], ['7', '7 días'], ['30', '30 días'], ['rango', 'Elegir fechas']].map(([k, l]) => `<button data-rr="${k}" aria-pressed="${R.range === k}">${l}</button>`).join('')}</div>
      <div class="repdates" ${R.range === 'rango' ? '' : 'hidden'}><input type="date" id="rd0" value="${e(R.desde)}" aria-label="Desde"><span>a</span><input type="date" id="rd1" value="${e(R.hasta)}" aria-label="Hasta"></div>
      <span class="grow"></span><span class="note" id="repwhen"></span>
    </div>
    <div id="repbody"><div class="empty" style="padding:60px"><span class="spin"></span></div></div>
  </div>`;
  content.querySelector('.rephead').onclick = (ev) => {
    const b = ev.target.closest('[data-rr]');
    if (!b) return;
    R.range = b.dataset.rr;
    if (R.range !== 'rango') [R.desde, R.hasta] = rangeDates();
    renderReportes(content);
  };
  for (const id of ['rd0', 'rd1']) H.$('#' + id).onchange = () => {
    R.desde = H.$('#rd0').value;
    R.hasta = H.$('#rd1').value;
    if (R.desde && R.hasta) load();
  };
  if (R.data) draw();
  await load();
}

async function load() {
  const [desde, hasta] = R.range === 'rango' ? [R.desde, R.hasta] : rangeDates();
  R.loading = true;
  try {
    R.data = await H.api('GET', `/stores/${H.S.storeId}/reporte?desde=${desde}&hasta=${hasta}`);
  } catch (er) {
    const b = H.$('#repbody');
    if (b) b.innerHTML = `<div class="err">${e(er.message)}</div>`;
    R.loading = false;
    return;
  }
  R.loading = false;
  draw();
}

function tile(label, value, sub, cls = '') {
  return `<div class="rtile ${cls}"><span class="rtl">${e(label)}</span><b class="rtv">${value}</b>${sub ? `<span class="rts">${sub}</span>` : ''}</div>`;
}

// Barras horizontales: un solo color, valor al final de cada barra
function hbars(list, { unit = '', empty = 'Todavía no hay datos', max } = {}) {
  if (!list.length) return `<p class="note rempty">${e(empty)}</p>`;
  const m = max || Math.max(...list.map((x) => x.value), 1);
  const total = list.reduce((a, x) => a + x.value, 0);
  return `<ul class="hbars">${list.map((x) => {
    const w = Math.max(2, (x.value / m) * 100);
    const share = total ? Math.round((x.value / total) * 100) : 0;
    return `<li title="${e(x.name)}: ${fmt(x.value)}${unit} (${share} %)"><span class="hbn">${e(x.name)}</span><span class="hbt"><i class="${x.name === 'Sin dato' ? 'mute' : ''}" style="width:${w}%"></i></span><span class="hbv">${fmt(x.value)}<small>${share} %</small></span></li>`;
  }).join('')}</ul>`;
}

// Columnas por hora o por día, con tooltip al pasar el mouse
function vbars(series, metric) {
  const vals = series.map((s) => s[metric] || 0);
  const m = Math.max(...vals, 1);
  const names = { ventas: 'ventas', chats: 'conversaciones', mensajes: 'mensajes' };
  const step = series.length > 16 ? Math.ceil(series.length / 10) : series.length > 12 ? 2 : 1;
  const ticks = [m, Math.round(m / 2)].filter((v, i, a) => v > 0 && a.indexOf(v) === i);
  return `<div class="vchart" role="img" aria-label="${e(names[metric])} por ${series.length === 24 ? 'hora' : 'día'}">
    <div class="vgrid">${ticks.map((t) => `<span style="bottom:${(t / m) * 100}%"><em>${fmt(t)}</em></span>`).join('')}</div>
    <div class="vcols">${series.map((s, i) => `<div class="vcol" tabindex="0" data-tip="${e(s.label)} · ${fmt(s[metric])} ${names[metric]}"><i style="height:${s[metric] ? Math.max(2, (s[metric] / m) * 100) : 0}%"></i><span>${i % step === 0 ? e(s.label) : ''}</span></div>`).join('')}</div>
    <div class="vtip" hidden></div></div>`;
}

function draw() {
  const box = H.$('#repbody');
  const d = R.data;
  if (!box || !d) return;
  const t = d.totales;
  const when = H.$('#repwhen');
  if (when) when.textContent = d.desde === d.hasta ? new Date(d.desde + 'T12:00').toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' }) : `${d.desde.slice(8)}/${d.desde.slice(5, 7)} al ${d.hasta.slice(8)}/${d.hasta.slice(5, 7)}`;
  const lp = t.lima + t.provincia;
  const metricNames = [['ventas', 'Ventas'], ['chats', 'Conversaciones'], ['mensajes', 'Mensajes']];
  box.innerHTML = `
    <div class="rtiles">
      ${tile('Mensajes recibidos', fmt(t.mensajes), 'de tus clientas')}
      ${tile('Conversaciones nuevas', fmt(t.chats), `${fmt(t.chats_anuncio)} por anuncio`)}
      ${tile(d.fuente === 'pedidos' ? 'Pedidos' : 'Ventas cerradas', fmt(t.ventas), d.fuente === 'pedidos' ? `${fmt(t.unidades)} pantalones · S/${fmt(t.monto)}` : `${fmt(t.unidades)} pantalones`, 'hi')}
      ${tile('Tasa de cierre', pct(t.tasa), 'ventas ÷ conversaciones nuevas')}
      ${tile('Lima', fmt(t.lima), lp ? `${Math.round((t.lima / lp) * 100)} % de las ventas` : '—')}
      ${tile('Provincia', fmt(t.provincia), lp ? `${Math.round((t.provincia / lp) * 100)} % de las ventas` : '—')}
      ${d.fuente === 'pedidos' ? tile('Entregados', fmt(t.entregados), t.ventas ? `${Math.round((t.entregados / t.ventas) * 100)} % de los pedidos` : '—') + tile('Rechazados o no recogidos', fmt(t.perdidos), t.ventas ? `${Math.round((t.perdidos / t.ventas) * 100)} % de los pedidos` : '—') : ''}
    </div>
    <section class="rcard rwide"><div class="rch"><h3>${d.oneDay ? 'Por hora' : 'Por día'}</h3>
      <div class="seg sm" role="tablist">${metricNames.map(([k, l]) => `<button data-rm="${k}" aria-pressed="${R.metric === k}">${l}</button>`).join('')}</div></div>
      ${vbars(d.series, R.metric)}</section>
    <div class="rgrid">
      <section class="rcard"><h3>Tallas más vendidas</h3><p class="rsub">Pantalones por talla</p>${hbars(d.tallas, { unit: ' pantalones' })}</section>
      <section class="rcard"><h3>Colores más vendidos</h3><p class="rsub">Pantalones por color</p>${hbars(d.colores, { unit: ' pantalones' })}</section>
      <section class="rcard"><h3>Promociones</h3><p class="rsub">Cuántos pantalones llevó cada clienta</p>${hbars(d.promos, { unit: ' ventas' })}</section>
      <section class="rcard"><h3>Distritos y ciudades</h3><p class="rsub">Dónde se vendió más</p>${hbars(d.lugares, { unit: ' ventas' })}</section>
    </div>
    <section class="rcard rwide"><h3>Anuncios</h3><p class="rsub">Qué anuncio trajo conversaciones, cuántas ventas se confirmaron y cuántas se entregaron</p>
      ${d.anuncios.length ? `<div class="rtable"><table><thead><tr><th>Anuncio</th><th class="r">Conversaciones</th><th class="r">Ventas confirmadas</th>${d.fuente === 'pedidos' ? '<th class="r">Entregadas</th><th class="r">Monto</th>' : ''}<th>Tasa de cierre</th></tr></thead><tbody>
        ${d.anuncios.map((a) => `<tr><td><b>${e(a.name)}</b>${a.id ? `<small class="mono">ID ${e(a.id)}</small>` : ''}</td><td class="r mono">${fmt(a.chats)}</td><td class="r mono"><b>${fmt(a.ventas)}</b></td>${d.fuente === 'pedidos' ? `<td class="r mono">${fmt(a.entregadas)}</td><td class="r mono">S/${fmt(Math.round(a.monto))}</td>` : ''}
          <td><span class="rrate"><i style="width:${a.tasa == null ? 0 : Math.min(100, a.tasa * 100)}%"></i></span><span class="mono">${pct(a.tasa)}</span></td></tr>`).join('')}</tbody></table></div>` : '<p class="note rempty">Todavía no hay conversaciones en este periodo.</p>'}
    </section>
    <section class="rcard rwide"><h3>Llamadas</h3><div class="rtiles sm">
      ${tile('Cerró', fmt(d.llamadas.cerro), '')}${tile('Lo piensa', fmt(d.llamadas.lo_piensa), '')}${tile('No contestó', fmt(d.llamadas.no_contesto), '')}</div></section>
    <p class="note rnote">${d.fuente === 'pedidos'
      ? 'Ventas = pedidos creados en este periodo (sin contar los cancelados), de la IA, de Shopify o hechos a mano. Talla, colores y cantidad salen de los productos de cada pedido.'
      : `Ventas = chats que recibieron la etiqueta COMPRÓ, ✅ LIMA o ✅ PROVINCIA en este periodo. Talla, colores, cantidad y distrito salen de los datos que guardó el bot (los puedes corregir en Clientes). Apenas crees tu primer pedido, los reportes salen de Pedidos.${t.sin_destino ? ` ${fmt(t.sin_destino)} venta(s) sin saber si es Lima o provincia.` : ''}`}</p>`;
  box.querySelector('.rch .seg').onclick = (ev) => {
    const b = ev.target.closest('[data-rm]');
    if (!b) return;
    R.metric = b.dataset.rm;
    draw();
  };
  const chart = box.querySelector('.vchart');
  const tip = chart.querySelector('.vtip');
  const show = (col) => {
    if (!col) return (tip.hidden = true);
    tip.textContent = col.dataset.tip;
    tip.hidden = false;
    const cr = chart.getBoundingClientRect();
    const r = col.getBoundingClientRect();
    tip.style.left = Math.min(Math.max(r.left - cr.left + r.width / 2, 60), cr.width - 60) + 'px';
  };
  chart.addEventListener('mouseover', (ev) => show(ev.target.closest('.vcol')));
  chart.addEventListener('focusin', (ev) => show(ev.target.closest('.vcol')));
  chart.addEventListener('mouseleave', () => show(null));
}
