// Reportes: números rápidos de la tienda con gráficos simples
let H;
export function initReportes(ctx) {
  H = ctx;
}
const e = (s) => H.esc(s);
const R = { range: 'hoy', desde: null, hasta: null, data: null, metric: 'ventas', wmetric: 'pedidos', storeId: null, canal: null, loading: false, view: 'resumen', ad: '', zona: '', open: null };
const web = () => H.store()?.canal === 'shopify';
const money = (n) => `S/${Number(n || 0).toLocaleString('es-PE', { maximumFractionDigits: 2 })}`;
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
  if (R.storeId !== H.S.storeId || R.canal !== web()) {
    R.storeId = H.S.storeId;
    R.canal = web();
    R.data = null;
  }
  const [d0, d1] = rangeDates();
  if (!R.desde) [R.desde, R.hasta] = [d0, d1];
  content.innerHTML = `<div class="rep">
    <div class="rephead">
      ${web() ? '' : `<div class="seg" role="tablist" aria-label="Vista">${[['resumen', 'Resumen'], ['embudo', 'Embudo']].map(([k, l]) => `<button data-rv="${k}" aria-pressed="${R.view === k}">${l}</button>`).join('')}</div>`}
      <div class="seg" role="tablist" aria-label="Periodo">${[['hoy', 'Hoy'], ['ayer', 'Ayer'], ['7', '7 días'], ['30', '30 días'], ['rango', 'Elegir fechas']].map(([k, l]) => `<button data-rr="${k}" aria-pressed="${R.range === k}">${l}</button>`).join('')}</div>
      <div class="repdates" ${R.range === 'rango' ? '' : 'hidden'}><input type="date" id="rd0" value="${e(R.desde)}" aria-label="Desde"><span>a</span><input type="date" id="rd1" value="${e(R.hasta)}" aria-label="Hasta"></div>
      <span class="grow"></span><span class="note" id="repwhen"></span>
    </div>
    <div id="repbody"><div class="empty" style="padding:60px"><span class="spin"></span></div></div>
  </div>`;
  content.querySelector('.rephead').onclick = (ev) => {
    const v = ev.target.closest('[data-rv]');
    if (v) {
      R.view = v.dataset.rv;
      R.data = null;
      return renderReportes(content);
    }
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
    const emb = !web() && R.view === 'embudo';
    const extra = emb ? `&ad=${encodeURIComponent(R.ad)}&zona=${R.zona}` : '';
    R.data = await H.api('GET', `/stores/${H.S.storeId}/${web() ? 'reporte-web' : emb ? 'embudo' : 'reporte'}?desde=${desde}&hasta=${hasta}${extra}`);
    R.data._web = web();
    R.data._embudo = emb;
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
  if (d._web) return drawWeb(box, d);
  if (d._embudo) return drawEmbudo(box, d);
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
      <section class="rcard only-ropa"><h3>Tallas más vendidas</h3><p class="rsub">Pantalones por talla</p>${hbars(d.tallas, { unit: ' pantalones' })}</section>
      <section class="rcard only-ropa"><h3>Colores más vendidos</h3><p class="rsub">Pantalones por color</p>${hbars(d.colores, { unit: ' pantalones' })}</section>
      <section class="rcard"><h3>Promociones</h3><p class="rsub">${H.store?.()?.rubro === 'simple' ? 'Cuántas unidades llevó cada clienta' : 'Cuántos pantalones llevó cada clienta'}</p>${hbars(d.promos, { unit: ' ventas' })}</section>
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
  chartTips(box);
}

function chartTips(box) {
  const chart = box.querySelector('.vchart');
  if (!chart) return;
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

// Tiendas que venden por Shopify: pedidos de la web, confirmados por WhatsApp y carritos abandonados
function drawWeb(box, d) {
  const t = d.totales;
  const k = d.carritos;
  const when = H.$('#repwhen');
  if (when) when.textContent = d.desde === d.hasta ? new Date(d.desde + 'T12:00').toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' }) : `${d.desde.slice(8)}/${d.desde.slice(5, 7)} al ${d.hasta.slice(8)}/${d.hasta.slice(5, 7)}`;
  const lp = t.lima + t.provincia;
  const names = [['pedidos', 'Pedidos'], ['confirmados', 'Confirmados'], ['carritos', 'Carritos abandonados']];
  const series = d.series.map((x) => ({ ...x }));
  box.innerHTML = `
    <div class="rtiles">
      ${tile('Pedidos recibidos', fmt(t.pedidos), `${fmt(t.web)} de la web${t.manual ? ` · ${fmt(t.manual)} a mano` : ''}`, 'hi')}
      ${tile('Confirmados', fmt(t.confirmados), `${pct(t.tasa_confirma)} de los pedidos`)}
      ${tile('Por confirmar', fmt(t.por_confirmar), 'esperan respuesta de la clienta')}
      ${tile('Cancelados', fmt(t.cancelados), t.pedidos ? `${Math.round((t.cancelados / t.pedidos) * 100)} % de los pedidos` : '—')}
      ${tile('Vendido', money(t.monto), t.ticket ? `ticket promedio ${money(t.ticket)}` : '—')}
      ${tile('Entregados', fmt(t.entregados), t.confirmados ? `${pct(t.tasa_entrega)} de los confirmados${t.perdidos ? ` · ${fmt(t.perdidos)} rechazados` : ''}` : '—')}
      ${tile('Carritos abandonados', fmt(k.abandonados), k.abandonados ? `${money(k.monto_perdido)} sin recuperar` : 'nadie dejó su compra a medias')}
      ${tile('Carritos recuperados', fmt(k.recuperados), k.abandonados ? `${pct(k.tasa)} · ${money(k.monto_recuperado)}` : '—')}
      ${tile('Lima', fmt(t.lima), lp ? `${Math.round((t.lima / lp) * 100)} % de los pedidos` : '—')}
      ${tile('Provincia', fmt(t.provincia), lp ? `${Math.round((t.provincia / lp) * 100)} % de los pedidos` : '—')}
    </div>
    <section class="rcard rwide"><div class="rch"><h3>${d.oneDay ? 'Por hora' : 'Por día'}</h3>
      <div class="seg sm" role="tablist">${names.map(([key, l]) => `<button data-rw="${key}" aria-pressed="${R.wmetric === key}">${l}</button>`).join('')}</div></div>
      ${vbarsWeb(series, R.wmetric, Object.fromEntries(names))}</section>
    <div class="rgrid">
      <section class="rcard"><h3>Productos más vendidos</h3><p class="rsub">Unidades en pedidos no cancelados</p>${hbars(d.productos, { unit: ' unidades' })}</section>
      <section class="rcard"><h3>Promociones</h3><p class="rsub">Cuántas unidades llevó cada clienta</p>${hbars(d.promos, { unit: ' pedidos' })}</section>
      <section class="rcard only-ropa"><h3>Tallas</h3><p class="rsub">Unidades por talla</p>${hbars(d.tallas, { unit: ' unidades' })}</section>
      <section class="rcard only-ropa"><h3>Colores</h3><p class="rsub">Unidades por color</p>${hbars(d.colores, { unit: ' unidades' })}</section>
      <section class="rcard"><h3>Distritos y ciudades</h3><p class="rsub">A dónde se envió más</p>${hbars(d.lugares, { unit: ' pedidos' })}</section>
      <section class="rcard"><h3>Carritos abandonados</h3><p class="rsub">Qué pasó con cada uno</p>${hbars([
        { name: 'Volvieron y compraron', value: k.recuperados },
        { name: 'Se les avisó, no compraron', value: Math.max(0, k.avisados - k.recuperados_aviso) },
        { name: 'Sin aviso todavía', value: Math.max(0, k.abandonados - k.avisados - (k.recuperados - k.recuperados_aviso)) },
      ].filter((x) => x.value), { unit: ' carritos', empty: 'No hubo carritos abandonados' })}</section>
      <section class="rcard"><h3>Avisos por WhatsApp</h3><p class="rsub">Mensajes automáticos que salieron</p>${hbars(d.avisos, { unit: ' mensajes', empty: 'No salió ningún aviso (enciéndelos en Configuración → Shopify)' })}</section>
    </div>
    <p class="note rnote">Pedidos = los que entraron en este periodo (de tu web o hechos a mano). Confirmados = los que pasaron de «Nuevo» (la clienta tocó «Sí, confirmo» o tu asesora lo confirmó). Carrito recuperado = la clienta dejó su compra a medias y después compró.</p>`;
  box.querySelector('.rch .seg').onclick = (ev) => {
    const b = ev.target.closest('[data-rw]');
    if (!b) return;
    R.wmetric = b.dataset.rw;
    draw();
  };
  chartTips(box);
}

function vbarsWeb(series, metric, names) {
  const vals = series.map((s) => s[metric] || 0);
  const m = Math.max(...vals, 1);
  const step = series.length > 16 ? Math.ceil(series.length / 10) : series.length > 12 ? 2 : 1;
  const ticks = [m, Math.round(m / 2)].filter((v, i, a) => v > 0 && a.indexOf(v) === i);
  const name = names[metric].toLowerCase();
  return `<div class="vchart" role="img" aria-label="${e(name)} por ${series.length === 24 ? 'hora' : 'día'}">
    <div class="vgrid">${ticks.map((t) => `<span style="bottom:${(t / m) * 100}%"><em>${fmt(t)}</em></span>`).join('')}</div>
    <div class="vcols">${series.map((s, i) => `<div class="vcol" tabindex="0" data-tip="${e(s.label)} · ${fmt(s[metric])} ${e(name)}"><i style="height:${s[metric] ? Math.max(2, (s[metric] / m) * 100) : 0}%"></i><span>${i % step === 0 ? e(s.label) : ''}</span></div>`).join('')}</div>
    <div class="vtip" hidden></div></div>`;
}

/* ---------------- Embudo: hasta qué paso llega cada conversación ---------------- */
const ago = (t) => {
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`;
};

function drawEmbudo(box, d) {
  const when = H.$('#repwhen');
  if (when) when.textContent = d.desde === d.hasta ? new Date(d.desde + 'T12:00').toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' }) : `${d.desde.slice(8)}/${d.desde.slice(5, 7)} al ${d.hasta.slice(8)}/${d.hasta.slice(5, 7)}`;
  const top = d.etapas[0]?.n || 0;
  const zonas = [['', 'Todas'], ['lima', 'Lima'], ['provincia', 'Provincia']];
  box.innerHTML = `
    <div class="embf">
      <label class="embsel"><span>Anuncio</span><select id="embad">
        <option value="">Todos</option><option value="con" ${R.ad === 'con' ? 'selected' : ''}>Solo los que vinieron por anuncio</option><option value="sin" ${R.ad === 'sin' ? 'selected' : ''}>Sin anuncio</option>
        ${d.anuncios.map((a) => `<option value="${e(a.id)}" ${R.ad === a.id ? 'selected' : ''}>${e(a.name)} (${fmt(a.n)})</option>`).join('')}
      </select></label>
      <div class="seg sm" role="tablist" aria-label="Destino">${zonas.map(([k, l]) => `<button data-ez="${k}" aria-pressed="${R.zona === k}">${l}</button>`).join('')}</div>
    </div>
    ${!top ? '<p class="note rempty">Todavía no hay conversaciones nuevas en este periodo.</p>' : `
    ${d.peor ? `<div class="embtip">💡 Donde más se quedan: <b>${e(d.peor.label)}</b> → ${fmt(d.peor.quedaron)} no llegaron a «${e(d.peor.sig)}». Revisa el texto de ese paso.</div>` : ''}
    <section class="rcard rwide"><h3>Embudo</h3><p class="rsub">${fmt(top)} conversaciones nuevas. Toca un paso para ver los chats que se quedaron ahí.</p>
      <ol class="emb">${d.etapas.map((x, j) => `
        <li class="${R.open === x.key ? 'open' : ''}">
          <button class="embrow" data-eo="${x.key}" ${x.quedaron ? '' : 'disabled'} aria-expanded="${R.open === x.key}">
            <span class="embn">${j + 1}. ${e(x.label)}</span>
            <span class="embbar"><i style="width:${top ? Math.max(1.5, (x.n / top) * 100) : 0}%"></i></span>
            <span class="embv"><b>${fmt(x.n)}</b><small>${pct(x.del_total)}</small></span>
            <span class="embq">${x.quedaron ? `se quedaron <b>${fmt(x.quedaron)}</b>${x.de_arriba != null ? '' : ''}` : ''}</span>
          </button>
          ${R.open === x.key ? `<div class="embchats">${x.chats.length ? x.chats.map((c) => `<button class="embchat" data-ec="${c.id}"><b>${e(c.nombre || '+' + c.wa)}</b>${c.pausa ? ' <span class="bpz">⏸️ En pausa</span>' : ''}<span>${e(String(c.ultimo).slice(0, 90))}</span><small>${ago(c.at)}</small></button>`).join('') : '<p class="note">Sin chats.</p>'}${x.quedaron > x.chats.length ? `<p class="note">Se muestran los ${x.chats.length} más recientes.</p>` : ''}</div>` : ''}
        </li>`).join('')}</ol>
    </section>`}
    <section class="rcard rwide"><h3>Seguimientos</h3><p class="rsub">A cuántas se les mandó cada seguimiento y cuántas respondieron después (revivieron)</p>
      ${d.seguimientos.length ? `<div class="rtable"><table><thead><tr><th>Seguimiento</th><th>Qué manda</th><th class="r">Enviados</th><th class="r">Revivieron</th><th>Tasa</th></tr></thead><tbody>
        ${d.seguimientos.map((x) => `<tr><td><b>${e(x.seq)}</b><small>Paso ${e(x.paso)} · ${e(x.cuando)}</small></td><td>${e(x.que)}</td><td class="r mono">${fmt(x.enviados)}${x.fallidos ? `<small class="err-t">${fmt(x.fallidos)} fallaron</small>` : ''}</td><td class="r mono"><b>${fmt(x.revivieron)}</b></td>
          <td><span class="rrate"><i style="width:${x.tasa == null ? 0 : Math.min(100, x.tasa * 100)}%"></i></span><span class="mono">${pct(x.tasa)}</span></td></tr>`).join('')}</tbody></table></div>` : '<p class="note rempty">No se mandaron seguimientos en este periodo.</p>'}
    </section>
    <p class="note rnote">Cuenta las conversaciones que empezaron en el periodo y el paso más alto al que llegó cada una, según lo que guardó el bot (talla, colores, distrito, datos), el formulario que recibió y sus pedidos. «Revivieron» = respondieron después de ese seguimiento.</p>`;
  box.querySelector('#embad').onchange = (ev) => {
    R.ad = ev.target.value;
    R.open = null;
    load();
  };
  box.onclick = (ev) => {
    const z = ev.target.closest('[data-ez]');
    if (z) {
      R.zona = z.dataset.ez;
      R.open = null;
      return load();
    }
    const o = ev.target.closest('[data-eo]');
    if (o) {
      R.open = R.open === o.dataset.eo ? null : o.dataset.eo;
      return draw();
    }
    const c = ev.target.closest('[data-ec]');
    if (c && H.goChat) H.goChat(Number(c.dataset.ec));
  };
}
