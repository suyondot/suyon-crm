// Carritos abandonados (solo tiendas que venden por Shopify)
let H;
export function initCarritos(ctx) {
  H = ctx;
}
const e = (s) => H.esc(s ?? '');
const money = (n) => `S/${Number(n || 0).toLocaleString('es-PE', { maximumFractionDigits: 2 })}`;
const K = { storeId: null, f: 'pendientes', q: '', data: null, busy: false };

export function resetCarritos() {
  K.storeId = null;
  K.data = null;
}

const TABS = [['pendientes', 'Sin aviso'], ['avisados', 'Avisados'], ['recuperados', 'Recuperados'], ['todos', 'Todos']];

function ago(t) {
  const m = Math.round((Date.now() - t) / 60e3);
  if (m < 60) return `hace ${Math.max(1, m)} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
}

export async function renderCarritos(content) {
  if (K.storeId !== H.S.storeId) {
    K.storeId = H.S.storeId;
    K.data = null;
  }
  content.innerHTML = `<div class="page kpage">
    <div class="ph"><div><h2>Carritos abandonados</h2><p>Clientas que empezaron a comprar en tu web y no terminaron. Si el aviso está encendido, les llega un WhatsApp solo para que vuelvan.</p></div></div>
    <div id="kbody"><div class="empty" style="padding:60px"><span class="spin"></span></div></div>
  </div>`;
  await load();
}

async function load() {
  try {
    K.data = await H.api('GET', `/stores/${K.storeId}/carritos?f=${K.f}&q=${encodeURIComponent(K.q)}`);
  } catch (er) {
    const b = H.$('#kbody');
    if (b) b.innerHTML = `<div class="err">${e(er.message)}</div>`;
    return;
  }
  draw();
}

function itemText(it) {
  const ropa = H.store()?.rubro !== 'simple';
  const extra = ropa ? [it.talla, it.color].filter(Boolean).join(' · ') : '';
  return `${it.cantidad || 1}× ${e(it.producto || 'Producto')}${extra ? ` <span class="note">(${e(extra)})</span>` : ''}`;
}

function card(k) {
  const st = k.order_id ? ['ok', `✅ Compró · pedido #${e(k.order_number || '')}`] : k.sent_at ? ['info', `💬 Aviso enviado ${ago(k.sent_at)}`] : ['warn', '⏳ Sin aviso'];
  return `<div class="kcard">
    <div class="khead"><b>${e(k.nombre || 'Sin nombre')}</b><span class="kpill ${st[0]}">${st[1]}</span><span class="grow"></span><span class="note">${ago(k.created_at)}</span></div>
    <div class="kitems">${(k.items || []).map(itemText).join('<br>') || '<span class="note">Sin productos</span>'}</div>
    <div class="kfoot"><b class="mono">${money(k.order_id ? k.order_total ?? k.total : k.total)}</b><span class="note mono">${e(H.fmtPhone ? H.fmtPhone(k.celular) : k.celular)}</span><span class="grow"></span>
      ${k.chat_id ? `<button class="iconbtn sm" data-kchat="${k.chat_id}">Abrir chat</button>` : ''}
      ${k.url ? `<button class="iconbtn sm" data-kcopy="${e(k.url)}">Copiar enlace del carrito</button>` : ''}
      ${!k.order_id ? `<button class="send sm" data-ksend="${k.id}">${k.sent_at ? 'Avisar otra vez' : 'Mandar aviso'}</button>` : ''}</div>
  </div>`;
}

function draw() {
  const box = H.$('#kbody');
  const d = K.data;
  if (!box || !d) return;
  const r = d.resumen;
  box.innerHTML = `
    ${d.aviso.on ? '' : `<div class="warnbox" style="margin-bottom:12px">El aviso automático «Carrito olvidado» está <b>apagado</b>: no le llega nada a la clienta. Enciéndelo en Configuración → Shopify.${H.owner() ? ' <button class="iconbtn sm" data-kcfg>Ir ahí</button>' : ''}</div>`}
    <div class="rtiles">
      <div class="rtile"><span class="rtl">Sin aviso</span><b class="rtv">${r.pendientes}</b></div>
      <div class="rtile"><span class="rtl">Avisados</span><b class="rtv">${r.avisados}</b><span class="rts">no compraron todavía</span></div>
      <div class="rtile hi"><span class="rtl">Recuperados</span><b class="rtv">${r.recuperados}</b><span class="rts">${r.total ? `${Math.round((r.recuperados / r.total) * 100)} % de los carritos` : '—'}</span></div>
      <div class="rtile"><span class="rtl">Por recuperar</span><b class="rtv">${money(r.monto_pendiente)}</b></div>
    </div>
    <div class="kbar"><div class="pchips">${TABS.map(([k, l]) => `<button data-kf="${k}" class="${K.f === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <input type="search" id="kq" placeholder="Buscar nombre o celular" value="${e(K.q)}"></div>
    <div class="klist">${d.carritos.length ? d.carritos.map(card).join('') : `<div class="card empty"><b>No hay carritos aquí</b><span>Cuando una clienta deja su compra a medias en tu web, aparece en esta lista.${r.total ? '' : ' Para que lleguen, en Shopify crea el aviso «Creación de pantalla de pago» (Configuración → Shopify).'}</span></div>`}</div>`;
  box.onclick = async (ev) => {
    const t = ev.target.closest('[data-kf],[data-kchat],[data-kcopy],[data-ksend],[data-kcfg]');
    if (!t) return;
    if (t.dataset.kf) {
      K.f = t.dataset.kf;
      return load();
    }
    if (t.dataset.kchat) return H.goChat(Number(t.dataset.kchat));
    if ('kcfg' in t.dataset) return H.goConfig('pedidoscfg');
    if (t.dataset.kcopy) {
      try {
        await navigator.clipboard.writeText(t.dataset.kcopy);
        H.toast('Enlace copiado: pégaselo en el chat');
      } catch {
        H.toast(t.dataset.kcopy, 6000);
      }
      return;
    }
    if (t.dataset.ksend) {
      t.disabled = true;
      try {
        const r0 = await H.api('POST', `/carritos/${t.dataset.ksend}/aviso`);
        H.toast(r0.type === 'template' ? 'Aviso enviado (con plantilla)' : 'Aviso enviado');
        await load();
      } catch (er) {
        H.toast(er.message, 6000);
        t.disabled = false;
      }
    }
  };
  let tm;
  H.$('#kq').oninput = (ev) => {
    clearTimeout(tm);
    tm = setTimeout(async () => {
      K.q = ev.target.value;
      await load();
      const q = H.$('#kq');
      if (q) {
        q.focus();
        q.setSelectionRange(q.value.length, q.value.length);
      }
    }, 350);
  };
}
