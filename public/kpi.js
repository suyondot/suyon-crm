// Franja de arriba (Chats y Pedidos): leads del periodo, confirmados y tasa de confirmación.
// Shopify: lead = pedido de la web; mensajes: lead = conversación nueva. Pedido de Jordan para medir mejor.
const K = { p: 'hoy', cache: {} };
const LBL = { hoy: 'Hoy', ayer: 'Ayer', '7d': '7 días' };
const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);

export async function kpiBar(el, { api, esc, S }, force = false) {
  if (!el || !S.storeId) return;
  el.onclick = (ev) => {
    const b = ev.target.closest('[data-kp]');
    if (!b) return;
    K.p = b.dataset.kp;
    kpiBar(el, { api, esc, S });
  };
  const sid = S.storeId;
  const key = `${sid}:${K.p}`;
  const c = K.cache[key];
  if (c) draw(el, c.v, esc);
  if (!force && c && Date.now() - c.at < 30e3) return;
  try {
    const v = await api('GET', `/stores/${sid}/kpi?p=${K.p}`);
    K.cache[key] = { at: Date.now(), v };
    if (S.storeId === sid && el.isConnected) draw(el, v, esc);
  } catch {}
}

function draw(el, v, esc) {
  const shop = v.canal === 'shopify';
  const a = v.antes || {};
  let trend = '';
  if (v.tasa != null && a.tasa != null) {
    const d = Math.round((v.tasa - a.tasa) * 100);
    const vs = v.p === 'hoy' ? 'ayer a esta hora' : v.p === 'ayer' ? 'anteayer' : 'los 7 días anteriores';
    trend = `<span class="kp-tr ${d > 0 ? 'up' : d < 0 ? 'down' : ''}" title="Comparado con ${vs}: ${pct(a.tasa)}">${d > 0 ? '▲' : d < 0 ? '▼' : '='} ${Math.abs(d)} pts vs ${vs}</span>`;
  }
  const low = v.tasa != null && v.leads >= 5 && v.tasa < 0.45;
  el.innerHTML = `<div class="kpibar">
    <div class="kp-seg" role="group" aria-label="Periodo">${Object.entries(LBL).map(([k, l]) => `<button data-kp="${k}" aria-pressed="${v.p === k}">${l}</button>`).join('')}</div>
    <div class="kp-nums">
      <div class="kp"><b>${v.leads}</b><span>${shop ? 'Leads (pedidos web)' : 'Leads (chats nuevos)'}</span></div>
      <div class="kp"><b>${v.confirmados}</b><span>Agendados (✅)</span></div>
      <div class="kp kp-t ${low ? 'low' : v.tasa != null && v.tasa >= 0.55 ? 'ok' : ''}"><b>${pct(v.tasa)}</b><span>${shop ? 'Tasa de confirmación' : 'Tasa de cierre'}</span></div>
    </div>
    <div class="kp-sub">${[v.dijo_si ? `👍 ${v.dijo_si} dijeron Sí` : '', v.por_confirmar ? `⏳ ${v.por_confirmar} por agendar` : '', v.confirmados ? `Lima ${v.lima} · Provincia ${v.provincia}` : '', v.cancelados ? `${v.cancelados} cancelado${v.cancelados > 1 ? 's' : ''}` : ''].filter(Boolean).map(esc).join(' · ')}${trend ? ` ${trend}` : ''}</div>
  </div>`;
}
