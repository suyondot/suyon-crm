// Página pública de Control Total (/inicio): qué hace, cómo se ve, precios y agenda de demos
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

const MARK = (s = 30) => `<svg width="${s}" height="${s}" viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="112" fill="#7A1F35"/><g transform="translate(-14 0)" fill="none" stroke-linecap="round"><path d="M318 168A128 128 0 1 0 318 344" stroke="#fff" stroke-width="60"/><path d="M262 206H410M336 206V350" stroke="#F2B6C4" stroke-width="54"/></g></svg>`;
const I = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4a.5.5 0 0 0 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.1 5.1 0 0 0 1.1 2.7 11.7 11.7 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.5-.3Z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  bot: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="8" width="16" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M12 4v4M9 13h.01M15 13h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" fill="currentColor"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
  people: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8.5" r="3.2" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M3.5 19c.7-3 3-4.6 5.5-4.6s4.8 1.6 5.5 4.6M15.5 5.6a3.2 3.2 0 0 1 0 6M17 14.6c1.8.4 3 1.9 3.5 4.4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
  box: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5L12 4l8 3.5v9L12 20l-8-3.5z M4 7.5l8 3.5 8-3.5M12 11v9" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
  chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16M7 16v-5M12 16V6M17 16v-8" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19.5s-7.5-4.4-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.6-7.5 10-7.5 10z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
  flow: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.9"/><rect x="13.5" y="15.5" width="7" height="5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M7 8.5v4.5a2 2 0 0 0 2 2h4.5" fill="none" stroke="currentColor" stroke-width="1.9"/></svg>',
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3.5" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
  target: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>',
  cart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 4.5h2.3l2.2 10.5h10l1.8-7.5H7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.5" cy="19" r="1.4" fill="currentColor"/><circle cx="16.5" cy="19" r="1.4" fill="currentColor"/></svg>',
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M11 18.5h2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l7 2.8v5.4c0 4.4-3 7.6-7 8.8-4-1.2-7-4.4-7-8.8V6.3z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M8.8 12l2.2 2.2 4.2-4.4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
  user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.7" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M4.5 20c.9-3.6 3.9-5.5 7.5-5.5s6.6 1.9 7.5 5.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
};

const DIMS = { conversacion: [1000, 1240], asesoras: [658, 1100] };
function feature({ id, kicker, title, text, bullets, img, alt, flip, extra = '' }) {
  const [w, h] = DIMS[img] || [1600, 965];
  return `<section class="feat${flip ? ' flip' : ''}" id="${id}">
  <div class="feat-copy reveal">
    <p class="kicker">${kicker}</p>
    <h2>${title}</h2>
    <p class="lead">${text}</p>
    <ul class="ticks">${bullets.map((b) => `<li>${I.check}<span>${b}</span></li>`).join('')}</ul>
    ${extra}
  </div>
  <figure class="shot reveal${h > w ? ' tall' : ''}"><div class="bar"><i></i><i></i><i></i></div><img src="/landing/${img}.webp" alt="${esc(alt)}" loading="lazy" decoding="async" width="${w}" height="${h}"></figure>
</section>`;
}

const COMPARA = [
  ['Bandeja de WhatsApp para todo el equipo, con roles', 'Sí, en la herramienta de chats', true],
  ['Bot que reconoce tallas, números de jean y colores sin gastar IA', 'Depende del bot; muchas veces son frases exactas', true],
  ['IA con tus reglas que pasa a la asesora cuando hay que cobrar', 'Otra herramienta y otro pago', true],
  ['Pedidos de Lima y provincia con estados', 'Excel, cuaderno o capturas al grupo', true],
  ['Lista diaria de «personas para llamar»', 'A mano', true],
  ['Ventas por anuncio, talla, color y distrito', 'Sumando a mano', true],
  ['Compras reales enviadas a Meta para tus anuncios', 'Casi nunca', true],
  ['Lo que pagas', 'Varias suscripciones', 'Un solo plan'],
];

export function landingPage(env, plan, { logged = false, extra = {} } = {}) {
  const video = extra.video;
  const testi = extra.testimonios || [];
  const cur = 'S/';
  const wa = String(plan.contact || '').replace(/\D/g, '');
  const waLink = wa ? `https://wa.me/${wa}?text=${encodeURIComponent('Hola, quiero saber más de Control Total')}` : null;
  const email = env.CONTACT_EMAIL || 'storesuyo@gmail.com';
  const P = { cur, base: +plan.base, num: +plan.per_number, usr: +plan.per_user, trial: +plan.trial_days, open: !!plan.signup_open, pack: +plan.pack_min || 2, periods: plan.periods || [] };
  const anual = P.periods.find((x) => x.months === 12);
  const startHref = P.open ? '/registro' : '#demo';
  const startTxt = P.open ? `Prueba ${P.trial} días gratis` : 'Agenda una demo';

  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Control Total · Vende ropa por WhatsApp</title>
<meta name="description" content="Bandeja de WhatsApp para tu equipo, bot que reconoce tallas y colores, IA que cierra la venta con tus reglas, pedidos de Lima y provincia y reportes. API oficial de WhatsApp.">
<meta property="og:title" content="Control Total · Vende ropa por WhatsApp">
<meta property="og:description" content="El sistema para vender ropa por WhatsApp: bot, IA, asesoras, pedidos y reportes en un solo lugar.">
<meta property="og:image" content="/landing/chats.webp">
<meta name="theme-color" content="#141015">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Figtree:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{
  --ink:#141015;--ink-2:#1E1820;--ink-3:#2A2229;--wine:#7A1F35;--wine-2:#9B2C47;--rose:#F2B6C4;--rose-soft:#FBE9EE;
  --bg:#FBF8F9;--surface:#FFFFFF;--line:#ECE3E6;--fg:#1F1A1D;--muted:#6B6267;--ok:#1F8A5B;--ok-soft:#E3F4EC;--ia:#2F5BD3;--ia-soft:#E8EEFC;
  --r:18px;--shadow:0 1px 2px rgba(20,16,21,.06),0 12px 40px -12px rgba(20,16,21,.18);
  --display:"Bricolage Grotesque",ui-sans-serif,system-ui,sans-serif;--body:"Figtree",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#110D12;--surface:#1B161C;--line:#2E262E;--fg:#F1EAED;--muted:#A99EA4;--rose-soft:#3A1F28;--ok-soft:#173527;--ia-soft:#1C2645}}
:root[data-theme="dark"]{--bg:#110D12;--surface:#1B161C;--line:#2E262E;--fg:#F1EAED;--muted:#A99EA4;--rose-soft:#3A1F28;--ok-soft:#173527;--ia-soft:#1C2645}
*{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.6 var(--body);overflow-x:hidden}
img{max-width:100%;display:block}
a{color:inherit}
svg{width:1em;height:1em;flex:none}
h1,h2,h3{font-family:var(--display);letter-spacing:-.02em;line-height:1.08;margin:0}
.wrap{max-width:1180px;margin:0 auto;padding:0 20px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:0 22px;border-radius:999px;font:600 16px/1 var(--body);text-decoration:none;border:0;cursor:pointer;transition:transform .15s ease,background .15s ease,box-shadow .15s ease}
.btn:active{transform:scale(.98)}
.btn-main{background:var(--rose);color:var(--ink);box-shadow:0 8px 24px -8px rgba(242,182,196,.6)}
.btn-main:hover{background:#F7C9D4}
.btn-wine{background:var(--wine);color:#fff}.btn-wine:hover{background:var(--wine-2)}
.btn-ghost{background:transparent;color:inherit;box-shadow:inset 0 0 0 1.5px currentColor}
.btn-ghost:hover{background:rgba(255,255,255,.06)}
.btn svg{width:18px;height:18px}
:focus-visible{outline:3px solid var(--rose);outline-offset:3px;border-radius:8px}

/* Barra superior */
.top{position:sticky;top:0;z-index:20;background:rgba(20,16,21,.86);backdrop-filter:saturate(1.4) blur(12px);-webkit-backdrop-filter:saturate(1.4) blur(12px);color:#fff;border-bottom:1px solid rgba(255,255,255,.06)}
.top .wrap{display:flex;align-items:center;gap:20px;height:64px}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;font:700 19px/1 var(--display);letter-spacing:-.01em}
.top nav{display:flex;gap:4px;margin-left:auto}
.top nav a{padding:8px 12px;border-radius:999px;text-decoration:none;font-size:15px;color:rgba(255,255,255,.78)}
.top nav a:hover{color:#fff;background:rgba(255,255,255,.07)}
.top .acts{display:flex;gap:8px}
.top .btn{min-height:40px;padding:0 16px;font-size:15px}
@media (max-width:900px){.top nav{display:none}.top .acts{margin-left:auto}}
@media (max-width:480px){.top .entrar{display:none}}

/* Portada */
.hero{background:radial-gradient(1200px 500px at 85% -10%,rgba(155,44,71,.55),transparent 60%),radial-gradient(700px 400px at -10% 30%,rgba(122,31,53,.35),transparent 60%),var(--ink);color:#fff;padding:72px 0 0;overflow:hidden}
.hero .wrap{display:grid;grid-template-columns:1.05fr 1fr;gap:48px;align-items:center}
.pill{display:inline-flex;align-items:center;gap:8px;padding:6px 12px 6px 8px;border-radius:999px;background:rgba(242,182,196,.12);color:var(--rose);font-size:14px;font-weight:600}
.pill b{background:var(--rose);color:var(--ink);border-radius:999px;padding:2px 8px;font-size:12px}
.hero h1{font-size:clamp(40px,5.6vw,68px);margin:18px 0 18px;font-weight:800}
.hero h1 em{font-style:normal;color:var(--rose)}
.hero .lead{font-size:clamp(17px,1.6vw,20px);color:rgba(255,255,255,.78);max-width:560px;margin:0 0 28px}
.cta{display:flex;gap:12px;flex-wrap:wrap}
.trust{display:flex;gap:18px;flex-wrap:wrap;margin:22px 0 0;padding:0;list-style:none;color:rgba(255,255,255,.65);font-size:14.5px}
.trust li{display:flex;align-items:center;gap:6px}.trust svg{color:var(--rose)}
.hero-art{position:relative;align-self:end;margin-bottom:-6px}
.hero-art .shot{transform:perspective(1600px) rotateY(-9deg) rotateX(3deg);transform-origin:left center;margin-right:-180px}
.float{position:absolute;display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:14px;background:#fff;color:var(--fg);box-shadow:0 18px 40px -12px rgba(0,0,0,.45);font-size:14px;font-weight:600;line-height:1.25}
.float small{display:block;font-weight:500;color:var(--muted);font-size:12.5px}
.float .ic{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;font-size:18px}
.f1{left:-28px;top:18%}.f1 .ic{background:var(--ok-soft);color:var(--ok)}
.f2{left:8%;bottom:14%}.f2 .ic{background:var(--rose-soft);color:var(--wine)}
@media (max-width:960px){.hero .wrap{grid-template-columns:1fr}.hero-art .shot{transform:none;margin-right:0}.f1{left:8px;top:-18px}.f2{left:auto;right:8px;bottom:12%}}

/* Capturas */
.shot{margin:0;border-radius:14px;overflow:hidden;background:#fff;box-shadow:var(--shadow);border:1px solid rgba(20,16,21,.08)}
.shot .bar{display:flex;gap:6px;padding:10px 12px;background:#EFE9EC}
.shot .bar i{width:10px;height:10px;border-radius:50%;background:#D5CACF}
.shot img{width:100%;height:auto}
.shot.tall{max-width:520px;justify-self:center;width:100%}
.feat>*,.try>*,.demo>*,.price>*,.hero .wrap>*{min-width:0}

/* Franja */
.strip{background:var(--ink);color:rgba(255,255,255,.72);padding:26px 0;border-top:1px solid rgba(255,255,255,.06)}
.strip .wrap{display:flex;gap:12px 28px;justify-content:center;flex-wrap:wrap;font-size:15px}
@media (max-width:560px){.strip .wrap{font-size:14px;gap:10px 18px}}
.strip span{display:flex;align-items:center;gap:8px}.strip svg{color:var(--rose);width:20px;height:20px}

section{scroll-margin-top:80px}
.sec{padding:96px 0}
.kicker{margin:0 0 12px;color:var(--wine);font-weight:700;font-size:14px;letter-spacing:.08em;text-transform:uppercase}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .kicker{color:var(--rose)}}
:root[data-theme="dark"] .kicker{color:var(--rose)}
.sec-head{max-width:720px;margin:0 auto 48px;text-align:center}
.sec-head h2,.feat h2{font-size:clamp(30px,3.6vw,46px);font-weight:800}
.sec-head p{color:var(--muted);font-size:18px;margin:14px 0 0}
.lead{color:var(--muted);font-size:18px}

/* Antes / después */
.vs{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.vs .col{border-radius:var(--r);padding:28px;border:1px solid var(--line);background:var(--surface)}
.vs .col.good{background:var(--ink);color:#fff;border-color:var(--ink)}
.vs h3{font-size:22px;margin-bottom:16px}
.vs ul{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.vs li{display:flex;gap:10px;align-items:flex-start}
.vs li svg{width:20px;height:20px;margin-top:3px}
.vs .bad svg{color:#C24B5E}.vs .good svg{color:var(--rose)}
.vs .good li span{color:rgba(255,255,255,.86)}
@media (max-width:760px){.vs{grid-template-columns:1fr}}

/* Pasos */
.steps{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;counter-reset:s}
.step{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:24px;position:relative}
.step::before{counter-increment:s;content:counter(s);display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:var(--wine);color:#fff;font:700 18px/1 var(--display);margin-bottom:16px}
.step h3{font-size:19px;margin-bottom:8px}.step p{margin:0;color:var(--muted);font-size:15.5px}
@media (max-width:960px){.steps{grid-template-columns:1fr 1fr}}@media (max-width:560px){.steps{grid-template-columns:1fr}}

/* Funciones con captura */
.feat{display:grid;grid-template-columns:.9fr 1.1fr;gap:56px;align-items:center;padding:56px 0}
.feat.flip .feat-copy{order:2}
.ticks{list-style:none;padding:0;margin:22px 0 0;display:grid;gap:10px}
.ticks li{display:flex;gap:10px;align-items:flex-start}
.ticks svg{width:22px;height:22px;padding:3px;border-radius:50%;background:var(--ok-soft);color:var(--ok);margin-top:2px}
@media (max-width:960px){.feat{grid-template-columns:1fr;gap:28px;padding:40px 0}.feat.flip .feat-copy{order:0}}

/* Mini demo del bot */
.try{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center}
.phone{max-width:380px;margin:0 auto;width:100%;border-radius:36px;background:var(--ink);padding:12px;box-shadow:var(--shadow)}
.phone .scr{border-radius:26px;overflow:hidden;background:#EFE7DE;display:flex;flex-direction:column;height:560px}
.phone .hd{display:flex;align-items:center;gap:10px;padding:12px 14px;background:#1F2C33;color:#fff;font-size:15px;font-weight:600}
.phone .hd small{display:block;font-weight:400;color:rgba(255,255,255,.7);font-size:12px}
.phone .av{width:34px;height:34px;border-radius:50%;background:var(--wine);display:grid;place-items:center;font:700 13px var(--display)}
.msgs{flex:1;overflow-y:auto;padding:14px 12px;display:flex;flex-direction:column;gap:8px;scroll-behavior:smooth}
.m{max-width:84%;padding:8px 11px 6px;border-radius:12px;font-size:14.5px;line-height:1.4;background:#fff;color:#111;align-self:flex-start;box-shadow:0 1px 1px rgba(0,0,0,.08);animation:pop .25s ease both;white-space:pre-line}
.m.me{align-self:flex-end;background:#D9FDD3}
.m .who{display:block;font-size:11px;font-weight:700;letter-spacing:.04em;margin-bottom:2px}
.m.bot .who{color:var(--ok)}.m.ia .who{color:var(--ia)}.m.as .who{color:var(--wine)}
.m.sys{align-self:center;background:rgba(255,255,255,.75);color:#555;font-size:12.5px;border-radius:999px;padding:5px 12px}
.chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 12px}
.chips button{border:0;background:#fff;color:#0B7A5E;border-radius:999px;padding:8px 13px;font:600 14px var(--body);cursor:pointer;box-shadow:0 1px 1px rgba(0,0,0,.1)}
.chips button:hover{background:#F2FFF8}
.typing{align-self:flex-start;background:#fff;border-radius:12px;padding:10px 14px;display:flex;gap:4px}
.typing i{width:6px;height:6px;border-radius:50%;background:#999;animation:dot 1s infinite}.typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}
@keyframes dot{0%,60%,100%{opacity:.3;transform:none}30%{opacity:1;transform:translateY(-3px)}}
@keyframes pop{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.legend{display:grid;gap:14px;margin:24px 0 0}
.legend div{display:flex;gap:12px;align-items:flex-start}
.legend b{display:inline-block;min-width:76px;text-align:center;font-size:12px;letter-spacing:.06em;padding:4px 8px;border-radius:8px}
.lg-bot{background:var(--ok-soft);color:var(--ok)}.lg-ia{background:var(--ia-soft);color:var(--ia)}.lg-as{background:var(--rose-soft);color:var(--wine)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .lg-as{color:var(--rose)}}
.legend p{margin:0;color:var(--muted);font-size:15.5px}
@media (max-width:960px){.try{grid-template-columns:1fr}}

/* Seguimientos */
.timeline{display:grid;grid-template-columns:repeat(5,1fr);gap:0;margin:8px 0 0;position:relative}
.timeline::before{content:"";position:absolute;left:10%;right:10%;top:23px;height:2px;background:linear-gradient(90deg,var(--wine),var(--rose))}
.tl{text-align:center;padding:0 8px;position:relative}
.tl .dot{width:48px;height:48px;border-radius:50%;margin:0 auto 14px;display:grid;place-items:center;background:var(--surface);border:2px solid var(--wine);color:var(--wine);font:700 14px var(--display);position:relative}
.tl.win .dot{background:var(--wine);color:#fff}
.tl h3{font-size:17px;margin:0 0 4px}.tl p{margin:0;color:var(--muted);font-size:14.5px}
@media (max-width:760px){.timeline{grid-template-columns:1fr;gap:18px}.timeline::before{left:23px;right:auto;top:10px;bottom:10px;width:2px;height:auto;background:linear-gradient(180deg,var(--wine),var(--rose))}.tl{display:grid;grid-template-columns:48px 1fr;gap:14px;text-align:left;padding:0}.tl .dot{margin:0}}
.note-box{margin:36px auto 0;max-width:760px;padding:16px 20px;border-radius:14px;background:var(--ok-soft);display:flex;gap:12px;align-items:flex-start;font-size:15.5px}
.note-box svg{color:var(--ok);width:22px;height:22px;margin-top:2px}

/* Más funciones */
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:24px;transition:transform .2s ease,box-shadow .2s ease}
.card:hover{transform:translateY(-2px);box-shadow:var(--shadow)}
.card .ic{display:grid;place-items:center;width:44px;height:44px;border-radius:12px;background:var(--rose-soft);color:var(--wine);font-size:22px;margin-bottom:14px}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .card .ic{color:var(--rose)}}
:root[data-theme="dark"] .card .ic{color:var(--rose)}
.card h3{font-size:18px;margin-bottom:6px}.card p{margin:0;color:var(--muted);font-size:15.5px}
@media (max-width:960px){.grid{grid-template-columns:1fr 1fr}}@media (max-width:560px){.grid{grid-template-columns:1fr}}

/* Origen */
.origin{background:var(--ink);color:#fff;border-radius:28px;padding:56px;display:grid;grid-template-columns:auto 1fr;gap:40px;align-items:center}
.origin .big{width:120px;height:120px}
.origin h2{font-size:clamp(28px,3vw,40px);margin-bottom:12px}
.origin p{color:rgba(255,255,255,.78);margin:0 0 10px;font-size:17.5px}
@media (max-width:760px){.origin{grid-template-columns:1fr;padding:32px 24px}.origin .big{width:72px;height:72px}}

/* ¿Es para ti? */
.fit{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.fit .col{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:28px}
.fit h3{font-size:21px;margin-bottom:14px}
.fit ul{list-style:none;padding:0;margin:0;display:grid;gap:10px}
.fit li{display:flex;gap:10px}.fit li svg{width:20px;height:20px;margin-top:3px}
.fit .yes svg{color:var(--ok)}.fit .no svg{color:var(--muted)}
@media (max-width:760px){.fit{grid-template-columns:1fr}}

/* Precios */
.price{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:stretch}
.plan{background:var(--ink);color:#fff;border-radius:24px;padding:34px;position:relative;overflow:hidden}
.plan::after{content:"";position:absolute;right:-80px;top:-80px;width:240px;height:240px;border-radius:50%;background:radial-gradient(circle,rgba(242,182,196,.25),transparent 70%)}
.plan .tag{display:inline-block;background:var(--rose);color:var(--ink);font-weight:700;font-size:13px;padding:4px 10px;border-radius:999px}
.plan .amt{font:800 64px/1 var(--display);margin:18px 0 4px;letter-spacing:-.03em}
.plan .amt small{font:500 18px var(--body);color:rgba(255,255,255,.7);letter-spacing:0}
.plan ul{list-style:none;padding:0;margin:20px 0 26px;display:grid;gap:10px}
.plan li{display:flex;gap:10px;color:rgba(255,255,255,.86)}.plan li svg{color:var(--rose);width:20px;height:20px;margin-top:3px}
.calc{background:var(--surface);border:1px solid var(--line);border-radius:24px;padding:30px;display:flex;flex-direction:column;gap:20px}
.calc h3{font-size:22px}
.ctl{display:flex;align-items:center;justify-content:space-between;gap:12px}
.ctl label{font-weight:600}.ctl small{display:block;color:var(--muted);font-weight:400;font-size:14px}
.stepper{display:flex;align-items:center;border:1px solid var(--line);border-radius:999px;overflow:hidden;flex:none}
.ctl label{flex:1;min-width:0}
@media (max-width:420px){.stepper button{width:38px;height:42px}.stepper output{min-width:26px}.calc{padding:22px 18px}}
.stepper button{width:44px;height:44px;border:0;background:transparent;color:var(--fg);font:600 22px var(--body);cursor:pointer}
.stepper button:hover{background:var(--rose-soft)}
.stepper output{min-width:34px;text-align:center;font:700 18px var(--display)}
.total{margin-top:auto;padding-top:18px;border-top:1px dashed var(--line);display:flex;align-items:baseline;justify-content:space-between}
.total b{font:800 38px/1 var(--display)}
.calc .fine{font-size:14px;color:var(--muted);margin:0}
.pers{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;background:var(--bg);padding:5px;border-radius:14px;border:1px solid var(--line)}
.pers button{position:relative;border:0;background:transparent;color:var(--fg);border-radius:10px;padding:10px 4px;font:600 14px var(--body);cursor:pointer}
.pers button[aria-pressed="true"]{background:var(--wine);color:#fff}
.pers i{position:absolute;left:50%;top:-11px;transform:translateX(-50%);white-space:nowrap;font:700 10.5px var(--body);font-style:normal;background:var(--rose);color:var(--ink);padding:2px 7px;border-radius:999px}
.calc .pay{margin:-8px 0 0;font-size:15px;color:var(--muted)}.calc .pay b{color:var(--ok)}
@media (max-width:860px){.price{grid-template-columns:1fr}}

/* Agenda */
.demo{display:grid;grid-template-columns:.85fr 1.15fr;gap:40px;align-items:start}
.demo-copy ul{list-style:none;padding:0;margin:20px 0 0;display:grid;gap:12px}
.demo-copy li{display:flex;gap:10px}.demo-copy li svg{color:var(--ok);width:22px;height:22px;margin-top:2px}
.book{background:var(--surface);border:1px solid var(--line);border-radius:24px;padding:26px;box-shadow:var(--shadow)}
.book h3{font-size:19px;margin:0 0 12px}
.days{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 10px;scroll-snap-type:x mandatory}
.days button{flex:none;scroll-snap-align:start;width:68px;padding:10px 0;border-radius:14px;border:1.5px solid var(--line);background:transparent;color:var(--fg);cursor:pointer;font:500 13px var(--body);text-transform:capitalize}
.days button b{display:block;font:700 22px/1.1 var(--display)}
.days button[aria-pressed="true"]{background:var(--wine);border-color:var(--wine);color:#fff}
.slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:8px;margin:6px 0 18px}
.slots button{min-height:44px;border-radius:12px;border:1.5px solid var(--line);background:transparent;color:var(--fg);font:600 15px var(--body);cursor:pointer}
.slots button:hover{border-color:var(--wine)}
.slots button[aria-pressed="true"]{background:var(--rose);border-color:var(--rose);color:var(--ink)}
.form{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.form .full{grid-column:1/-1}
.form label{display:block;font-size:14px;font-weight:600;margin:0 0 5px}
.form input,.form select{width:100%;min-height:46px;padding:0 14px;border-radius:12px;border:1.5px solid var(--line);background:var(--bg);color:var(--fg);font:16px var(--body)}
.form input:focus,.form select:focus{outline:none;border-color:var(--wine)}
.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.pick{font-size:15px;color:var(--muted);margin:0 0 12px}.pick b{color:var(--fg)}
.err{color:#B3261E;font-size:14.5px;margin:4px 0 0}
.ok{text-align:center;padding:18px 6px}
.ok .big{width:64px;height:64px;border-radius:50%;background:var(--ok-soft);color:var(--ok);display:grid;place-items:center;margin:0 auto 14px;font-size:32px}
.ok h3{font-size:24px;margin-bottom:8px}.ok p{color:var(--muted);margin:0 0 18px}
.ok .cta{justify-content:center}
.empty{color:var(--muted);text-align:center;padding:24px}
@media (max-width:960px){.demo{grid-template-columns:1fr}}
@media (max-width:520px){.form{grid-template-columns:1fr}.book{padding:18px}}

/* Preguntas */
.faq{max-width:820px;margin:0 auto;display:grid;gap:10px}
.faq details{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:0 20px}
.faq summary{cursor:pointer;list-style:none;padding:18px 0;font-weight:600;font-size:17px;display:flex;justify-content:space-between;gap:16px}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";font:500 24px/1 var(--body);color:var(--wine);transition:transform .2s}
.faq details[open] summary::after{transform:rotate(45deg)}
.faq details p{margin:0 0 18px;color:var(--muted)}

/* Video, comparación y testimonios */
.vid{padding-bottom:0}
.vbox{max-width:900px;margin:0 auto;border-radius:20px;overflow:hidden;background:#000;box-shadow:var(--shadow)}
.vbox video{display:block;width:100%;max-height:80vh;background:#000}
.cmp{max-width:980px;margin:0 auto;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);overflow:hidden}
.cmp-row{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:16px;padding:16px 22px;border-top:1px solid var(--line);align-items:center;font-size:15.5px}
.cmp-row:first-child{border-top:0}
.cmp-head{background:var(--ink);color:#fff;font-weight:700;font-family:var(--display);font-size:16px}
.cmp-head span:last-child{display:flex;align-items:center;gap:8px;color:var(--rose)}
.cmp-a{color:var(--muted)}
.cmp-b{display:flex;align-items:center;gap:8px;font-weight:600}
.cmp-b svg{width:22px;height:22px;padding:3px;border-radius:50%;background:var(--ok-soft);color:var(--ok)}
.cmp-b em{font-style:normal}
@media (max-width:640px){.cmp-row{grid-template-columns:1fr 1fr;gap:6px 14px;padding:14px 16px}.cmp-row>span:first-child{grid-column:1/-1;font-weight:600}.cmp-head>span:first-child{display:none}}
.tgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
.tcard{margin:0;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:24px;display:flex;flex-direction:column;gap:18px}
.tcard blockquote{margin:0;font-size:17px;line-height:1.55}
.tcard figcaption{display:flex;align-items:center;gap:12px;margin-top:auto}
.tcard img,.tini{width:48px;height:48px;border-radius:50%;object-fit:cover;flex:none}
.tini{display:grid;place-items:center;background:var(--rose-soft);color:var(--wine);font:700 20px var(--display)}
.tcard small{display:block;color:var(--muted)}

/* Cierre y pie */
.final{background:var(--wine);color:#fff;text-align:center;padding:80px 0}
.final h2{font-size:clamp(30px,4vw,50px);max-width:760px;margin:0 auto 16px}
.final p{color:rgba(255,255,255,.8);margin:0 0 28px;font-size:18px}
.final .cta{justify-content:center}
.final .btn-main{background:#fff}
foot,footer{display:block;background:var(--ink);color:rgba(255,255,255,.65);padding:40px 0;font-size:14.5px}
footer .wrap{display:flex;gap:24px;justify-content:space-between;flex-wrap:wrap;align-items:center}
footer nav{display:flex;gap:16px;flex-wrap:wrap}
footer a{text-decoration:none}footer a:hover{color:#fff}
.wafab{position:fixed;right:18px;bottom:18px;z-index:30;display:flex;align-items:center;gap:8px;padding:0 18px 0 14px;height:52px;border-radius:999px;background:#25D366;color:#063D1E;font-weight:700;text-decoration:none;box-shadow:0 12px 30px -8px rgba(0,0,0,.35)}
.wafab svg{width:24px;height:24px}
@media (max-width:520px){.wafab span{display:none}.wafab{padding:0;width:56px;justify-content:center}}

.shot img{cursor:zoom-in}
.zoom{position:fixed;inset:0;z-index:50;background:rgba(20,16,21,.88);display:grid;place-items:center;padding:20px;cursor:zoom-out;animation:pop .2s ease}
.zoom img{max-width:min(1600px,100%);max-height:100%;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.reveal{opacity:0;transform:translateY(18px);transition:opacity .6s ease,transform .6s ease}
.reveal.in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}.reveal{opacity:1;transform:none;transition:none}.m{animation:none}.card:hover{transform:none}}
</style></head>
<body>
<header class="top"><div class="wrap">
  <a class="brand" href="/inicio">${MARK(30)}Control Total</a>
  <nav aria-label="Secciones"><a href="#como">Cómo funciona</a><a href="#funciones">Funciones</a><a href="#precios">Precios</a><a href="#demo">Demo</a><a href="#preguntas">Preguntas</a></nav>
  <div class="acts">${logged ? '<a class="btn btn-main" href="/">Abrir mi panel</a>' : `<a class="btn btn-ghost entrar" href="/entrar">Entrar</a><a class="btn btn-main" href="${startHref}">${P.open ? 'Probar gratis' : 'Agendar demo'}</a>`}</div>
</div></header>

<main>
<section class="hero"><div class="wrap">
  <div class="hero-copy">
    <span class="pill"><b>Nuevo</b> Hecho para marcas de ropa en Perú</span>
    <h1>Vende ropa por WhatsApp <em>aunque no estés</em> en el celular.</h1>
    <p class="lead">Un bot responde precios, tallas y colores al instante. La IA conversa con tus reglas y arma el pedido. Tu asesora solo atiende a quien ya quiere pagar.</p>
    <div class="cta"><a class="btn btn-main" href="${startHref}">${startTxt} ${I.arrow}</a><a class="btn btn-ghost" href="#demo">Agenda una demo de 30 min</a></div>
    <ul class="trust"><li>${I.check} ${P.open ? 'Sin tarjeta' : 'Te lo mostramos en vivo'}</li><li>${I.check} API oficial de WhatsApp</li><li>${I.check} En PC y celular</li></ul>
  </div>
  <div class="hero-art">
    <figure class="shot"><div class="bar"><i></i><i></i><i></i></div><img src="/landing/chats.webp" alt="Bandeja de chats de Control Total con una conversación atendida por el bot y la IA" width="1600" height="965" fetchpriority="high"></figure>
    <div class="float f1"><span class="ic">${I.bot}</span><span>Talla M reconocida<small>sin gastar IA</small></span></div>
    <div class="float f2"><span class="ic">${I.box}</span><span>Pedido #1 creado<small>Lima · llega HOY</small></span></div>
  </div>
</div></section>
<div class="strip"><div class="wrap"><span>${I.chat || I.people} Bandeja para tu equipo</span><span>${I.bot} Bot sin IA</span><span>${I.spark} IA con tus reglas</span><span>${I.box} Pedidos Lima y provincia</span><span>${I.chart} Reportes por anuncio</span></div></div>

${video ? `<section class="sec vid" id="video"><div class="wrap">
  <div class="sec-head reveal"><p class="kicker">Míralo en 1 minuto</p><h2>Así funciona Control Total.</h2></div>
  <div class="vbox reveal"><video controls playsinline preload="metadata" src="/inicio/media/${esc(video.name)}"></video></div>
</div></section>` : ''}

<section class="sec"><div class="wrap">
  <div class="sec-head reveal"><p class="kicker">El problema</p><h2>Vender por WhatsApp no debería ser correr detrás de cada chat.</h2></div>
  <div class="vs reveal">
    <div class="col bad"><h3>Hoy, sin sistema</h3><ul>
      <li>${I.x}<span>La clienta pregunta el precio a las 11 p. m. y nadie responde hasta mañana.</span></li>
      <li>${I.x}<span>Cada asesora contesta distinto y copia las mismas tablas de tallas una y otra vez.</span></li>
      <li>${I.x}<span>Los «lo pienso» y «yapeo más tarde» se pierden en el chat.</span></li>
      <li>${I.x}<span>Los pedidos viven en notas sueltas y capturas para el grupo.</span></li>
      <li>${I.x}<span>No sabes qué anuncio vende de verdad, solo cuál trae mensajes.</span></li></ul></div>
    <div class="col good"><h3>Con Control Total</h3><ul>
      <li>${I.check}<span>El bot responde en segundos, de día y de noche, con tu foto y tus precios.</span></li>
      <li>${I.check}<span>Todas responden igual: el flujo y la IA siguen tus reglas de tallas, colores y envíos.</span></li>
      <li>${I.check}<span>Seguimientos automáticos y una lista de «personas para llamar» cada día.</span></li>
      <li>${I.check}<span>El pedido se arma solo desde el chat y se copia al grupo con un toque.</span></li>
      <li>${I.check}<span>Reportes de ventas por anuncio, talla, color y distrito.</span></li></ul></div>
  </div>
</div></section>

<section class="sec" id="como" style="padding-top:0"><div class="wrap">
  <div class="sec-head reveal"><p class="kicker">Cómo funciona</p><h2>En marcha en una tarde.</h2><p>No necesitas programar ni saber de IA. Empiezas desde una plantilla pensada para vender ropa.</p></div>
  <div class="steps reveal">
    <div class="step"><h3>Conecta tu número</h3><p>Con un clic, con la API oficial de WhatsApp. Si ya usas WhatsApp Business en el celular, puedes seguir usándolo.</p></div>
    <div class="step"><h3>Elige la plantilla de ropa</h3><p>Precios por cantidad, tabla de tallas, colores por talla, envíos a Lima y provincia. Cambias lo que quieras.</p></div>
    <div class="step"><h3>Deja que atienda</h3><p>El bot y la IA responden, hacen seguimiento y pasan a tu asesora a quien ya está lista para pagar.</p></div>
    <div class="step"><h3>Mira qué vende</h3><p>Pedidos del día, cobros pendientes y reportes para decidir en qué anuncio poner más plata.</p></div>
  </div>
</div></section>

<section class="sec" id="probar" style="background:var(--surface);border-block:1px solid var(--line)"><div class="wrap try">
  <div class="reveal">
    <p class="kicker">Pruébalo aquí</p>
    <h2 style="font-size:clamp(30px,3.6vw,46px);font-weight:800">Así le responde tu tienda a una clienta.</h2>
    <p class="lead">Toca una talla como si fueras la clienta. Es una simulación para que veas el orden; en tu tienda usa tus fotos, tus precios y tus reglas.</p>
    <div class="legend">
      <div><b class="lg-bot">BOT</b><p>Mensajes fijos y reglas sin IA: precios, reconocer tallas y colores, poner etiquetas. No cuestan IA.</p></div>
      <div><b class="lg-ia">IA</b><p>Conversa cuando la clienta pregunta algo distinto, siempre con tu información y sin inventar precios.</p></div>
      <div><b class="lg-as">ASESORA</b><p>Entra cuando hay que cobrar, hay un reclamo o la clienta pide hablar con una persona.</p></div>
    </div>
  </div>
  <div class="phone reveal" aria-label="Simulación de chat">
    <div class="scr">
      <div class="hd"><span class="av">TU</span><span>Tu tienda<small>en línea</small></span></div>
      <div class="msgs" id="msgs" aria-live="polite"></div>
      <div class="chips" id="chips"></div>
    </div>
  </div>
</div></section>

<div class="wrap" id="funciones">
${feature({
  id: 'auto',
  kicker: 'Vende en automático',
  title: 'El bot hace lo repetitivo. La IA, lo que necesita conversación.',
  text: 'La clienta llega por tu anuncio y recibe al instante la foto y los precios. Elige su talla tocando un botón o escribiendo «uso 30 de jean», y el bot le manda los colores de esa talla.',
  bullets: ['Reconoce tallas, números de jean y sinónimos de color sin gastar IA', 'Listas y botones para tocar, como en las apps grandes', 'La IA usa tu prompt, tus fotos y videos, y nunca manda mensajes raros', 'Notas de voz pasadas a texto para que el bot y tu equipo las entiendan', 'Si la IA duda, pasa el chat a tu asesora y te avisa'],
  img: 'conversacion',
  alt: 'Conversación con mensajes del bot en verde y de la IA en azul',
})}
${feature({
  id: 'asesoras',
  kicker: 'Asesoras más efectivas',
  title: 'Tu equipo atiende a quien ya quiere comprar.',
  text: 'Cada asesora entra con su usuario y ve solo lo que le toca. Las etiquetas de colores ordenan el día y una franja arriba de los chats dice a quién llamar hoy.',
  bullets: ['«N personas para llamar»: Yape pendiente y Lima por confirmar, con resultado de cada llamada', 'Etiquetas con un toque: LIMA PENDIENTE, YAPE PENDIENTE, URGENTE…', 'Ficha de la clienta con talla, colores, distrito y su historial de compras', 'Roles: dueño, asesora, despacho Lima y despacho provincia', 'La asesora no ve utilidades ni configuración'],
  img: 'asesoras',
  alt: 'Lista de chats con la franja de personas para llamar y etiquetas',
  flip: true,
})}
${feature({
  id: 'pedidos',
  kicker: 'Pedidos sin desorden',
  title: 'Del chat al pedido, y del pedido al grupo de reparto.',
  text: 'La IA llena el pedido con los datos que dio la clienta y tu asesora lo corrige si algo cambia. Lima contra entrega y provincia por agencia, cada uno con sus estados.',
  bullets: ['Lima: nuevo, confirmado, en ruta, entregado o rechazado', 'Provincia: Yape por validar, enviado, en agencia, recogido', 'Botón «Copiar orden» listo para pegar en tu grupo', 'Vista por día con totales de prendas y ventas', 'Avisos automáticos a la clienta cuando su pedido sale o llega'],
  img: 'pedidos',
  alt: 'Lista de pedidos del día con estados de Lima y provincia',
})}
${feature({
  id: 'reportes',
  kicker: 'Reportes que dicen qué vende',
  title: 'Deja de adivinar qué anuncio funciona.',
  text: 'Mira mensajes, conversaciones nuevas, pedidos y tasa de cierre del día o del mes. Y cuáles son las tallas, colores y promociones que más salen.',
  bullets: ['Ventas y conversaciones por hora o por día', 'Tallas, colores, promociones y distritos más vendidos', 'Tabla de anuncios: conversaciones, ventas y tasa de cierre de cada uno', 'Envía cada compra a Meta para que tus anuncios aprendan de ventas reales'],
  img: 'reportes',
  alt: 'Reporte del día con pedidos, tasa de cierre y gráficos de tallas y colores',
  flip: true,
})}
${feature({
  id: 'clientes',
  kicker: 'Clientes y recompra',
  title: 'Tus clientas, ordenadas para volver a venderles.',
  text: 'Todas tus clientas en una tabla con lo que compraron y lo que el bot guardó. Encuentra a las que hace tiempo no compran y escríbeles.',
  bullets: ['Grupos listos: nuevas, compraron 1 vez, frecuentes, VIP y para reactivar', 'Ticket promedio y cuántas volvieron a comprar', 'Busca por nombre, celular, distrito o DNI', 'Descarga todo en Excel cuando quieras'],
  img: 'clientes',
  alt: 'Tabla de clientas con grupos y etiquetas',
})}
${feature({
  id: 'flujo',
  kicker: 'Tu flujo, a tu manera',
  title: 'Arma tu flujo como si dibujaras en una hoja.',
  text: 'Bloques y flechas: enviar foto, esperar respuesta, reconocer talla, poner etiqueta, pasar a la IA o a la asesora. Cada bloque muestra cuántos mensajes salieron, se leyeron y respondieron.',
  bullets: ['Plantilla «Venta de ropa» lista para usar', 'Números por bloque: enviados, leídos, fallidos y respondieron', 'Simulador para chatear como clienta antes de encenderlo', 'Bot apagado por defecto: lo enciendes cuando estés lista'],
  img: 'bot',
  alt: 'Editor de flujo con bloques conectados',
  flip: true,
})}
</div>

<section class="sec" id="seguimientos" style="background:var(--surface);border-block:1px solid var(--line)"><div class="wrap">
  <div class="sec-head reveal"><p class="kicker">Seguimientos</p><h2>Si la clienta se queda callada, tu tienda no.</h2><p>Mensajes automáticos que se detienen apenas ella responde. Cada uno con el formato que mejor funciona en ese momento.</p></div>
  <div class="timeline reveal">
    <div class="tl"><span class="dot">0</span><div><h3>Llega por tu anuncio</h3><p>Foto, precios y pregunta de talla.</p></div></div>
    <div class="tl"><span class="dot">15′</span><div><h3>Recordatorio</h3><p>Un mensaje corto con botones de talla.</p></div></div>
    <div class="tl"><span class="dot">40′</span><div><h3>Nota de voz</h3><p>Se siente como una persona.</p></div></div>
    <div class="tl"><span class="dot">3 h</span><div><h3>Video «así se ve puesto»</h3><p>Solo de 8 a. m. a 10 p. m.</p></div></div>
    <div class="tl win"><span class="dot">${I.check}</span><div><h3>Responde y compra</h3><p>Los seguimientos se cancelan solos.</p></div></div>
  </div>
  <div class="note-box reveal">${I.shield}<span>Control Total te muestra cuándo un chat está en la <b>ventana gratis de 72 horas</b> de los anuncios de clic a WhatsApp, para que tus seguimientos salgan sin costo de Meta.</span></div>
</div></section>

<section class="sec"><div class="wrap">
  <div class="sec-head reveal"><p class="kicker">Y además</p><h2>Todo lo que necesitas, en un solo lugar.</h2></div>
  <div class="grid reveal">
    <div class="card"><span class="ic">${I.target}</span><h3>Compras a Meta</h3><p>Cada pedido avisa a Meta de qué anuncio vino, para que tus campañas busquen compradoras y no solo mensajes.</p></div>
    <div class="card"><span class="ic">${I.mic}</span><h3>Notas de voz a texto</h3><p>Los audios de tus clientas aparecen escritos debajo, y el bot los entiende.</p></div>
    <div class="card"><span class="ic">${I.cart}</span><h3>¿Vendes en tu web?</h3><p>Conecta Shopify: confirma pedidos por WhatsApp y recupera carritos abandonados.</p></div>
    <div class="card"><span class="ic">${I.phone}</span><h3>App en PC y celular</h3><p>Se instala desde el navegador. Notificaciones de chats nuevos y notas de voz desde el celular.</p></div>
    <div class="card"><span class="ic">${I.people}</span><h3>Varias tiendas y números</h3><p>Cada número con su bot, sus etiquetas y sus pedidos. Cambias de tienda con un toque.</p></div>
    <div class="card"><span class="ic">${I.shield}</span><h3>API oficial de Meta</h3><p>Sin programas piratas ni celulares conectados a la fuerza. Tus datos, solo para tu equipo.</p></div>
  </div>
</div></section>

<section class="sec" id="comparar" style="padding-top:0"><div class="wrap">
  <div class="sec-head reveal"><p class="kicker">Compara</p><h2>Herramientas sueltas o todo en un solo lugar.</h2><p>Lo que normalmente se arma juntando una bandeja de chats, un bot aparte y un Excel.</p></div>
  <div class="cmp reveal" role="table" aria-label="Comparación">
    <div class="cmp-row cmp-head" role="row"><span role="columnheader"></span><span role="columnheader">Herramientas sueltas</span><span role="columnheader">${MARK(22)} Control Total</span></div>
    ${COMPARA.map(([q, a, b]) => `<div class="cmp-row" role="row"><span role="rowheader">${q}</span><span role="cell" class="cmp-a">${a}</span><span role="cell" class="cmp-b">${b === true ? `${I.check}<em>Incluido</em>` : `<b>${b}</b>`}</span></div>`).join('')}
  </div>
</div></section>

<section class="sec" style="padding-top:0"><div class="wrap">
  <div class="origin reveal">
    ${MARK(120).replace('width="120" height="120"', 'class="big" width="120" height="120"')}
    <div><p class="kicker" style="color:var(--rose)">Por qué existe</p>
    <h2>Lo hicimos para nuestra propia marca de ropa.</h2>
    <p>Control Total nació en Porte Perú, una marca de pantalones que vende con anuncios de clic a WhatsApp, envíos a Lima y por agencia a provincia.</p>
    <p>Cada función salió de un problema real del día a día: tallas de jean, «yapeo más tarde», sedes de Shalom, cortes de entrega a la 1 p. m. Por eso habla como tu tienda.</p></div>
  </div>
</div></section>

${testi.length ? `<section class="sec" id="testimonios" style="padding-top:0"><div class="wrap">
  <div class="sec-head reveal"><p class="kicker">Lo que dicen</p><h2>Tiendas que ya venden con Control Total.</h2></div>
  <div class="tgrid reveal">${testi.map((t) => `<figure class="tcard"><blockquote>«${esc(t.text)}»</blockquote><figcaption>${t.photo ? `<img src="/inicio/media/${esc(t.photo)}" alt="" width="48" height="48" loading="lazy">` : `<span class="tini">${esc((t.name || '?').trim().charAt(0).toUpperCase())}</span>`}<span><b>${esc(t.name)}</b>${t.brand ? `<small>${esc(t.brand)}</small>` : ''}</span></figcaption></figure>`).join('')}</div>
</div></section>` : ''}

<section class="sec" style="padding-top:0"><div class="wrap">
  <div class="sec-head reveal"><p class="kicker">¿Es para ti?</p><h2>Te va a servir si…</h2></div>
  <div class="fit reveal">
    <div class="col yes"><h3>Sí, si…</h3><ul>
      <li>${I.check}<span>Vendes ropa, calzado o accesorios por WhatsApp.</span></li>
      <li>${I.check}<span>Haces anuncios de clic a WhatsApp en Facebook o Instagram.</span></li>
      <li>${I.check}<span>Te llegan más chats de los que alcanzas a responder.</span></li>
      <li>${I.check}<span>Tienes o quieres tener asesoras y despacho.</span></li>
      <li>${I.check}<span>Envías a Lima contra entrega y a provincia por agencia.</span></li></ul></div>
    <div class="col no"><h3>Todavía no, si…</h3><ul>
      <li>${I.x}<span>Recibes pocos mensajes al día y los respondes tú sin problema.</span></li>
      <li>${I.x}<span>Quieres mandar mensajes masivos a gente que no te escribió.</span></li>
      <li>${I.x}<span>No quieres usar la API oficial de WhatsApp.</span></li></ul></div>
  </div>
</div></section>

<section class="sec" id="precios" style="background:var(--surface);border-block:1px solid var(--line)"><div class="wrap">
  <div class="sec-head reveal"><p class="kicker">Precios</p><h2>Un solo plan. Pagas por lo que usas.</h2><p>${P.trial ? `${P.trial} días gratis para probar todo, sin tarjeta.` : 'Prueba todo antes de pagar.'} Luego pagas mes a mes, o 3, 6 o 12 meses con descuento. Sin contrato.</p></div>
  <div class="price reveal">
    <div class="plan">
      <span class="tag">${P.trial ? `${P.trial} días gratis` : 'Plan único'}</span>
      <div class="amt">${cur}${P.base}<small> / mes</small></div>
      ${anual && anual.base_off ? `<p style="margin:0 0 6px;color:var(--rose);font-weight:600">o ${cur}${P.base - anual.base_off} al mes pagando 12 meses</p>` : ''}
      <p style="margin:0;color:rgba(255,255,255,.75)">Incluye 1 número de WhatsApp, tu cuenta de dueño y 1 trabajadora. Cada número o trabajadora extra: ${cur}${P.num} al mes, y menos desde ${P.pack} extras.</p>
      <ul>
        <li>${I.check}<span>Bandeja, etiquetas y llamadas</span></li>
        <li>${I.check}<span>Bot, seguimientos e IA con tus reglas</span></li>
        <li>${I.check}<span>Pedidos de Lima y provincia</span></li>
        <li>${I.check}<span>Clientes, reportes y compras a Meta</span></li>
      </ul>
      <a class="btn btn-main" href="${startHref}">${startTxt}</a>
    </div>
    <div class="calc" id="calc">
      <h3>Calcula tu plan</h3>
      <div class="pers" role="group" aria-label="Cuántos meses pagas">${P.periods.map((x, i) => `<button type="button" data-m="${x.months}" aria-pressed="${i === 0}">${x.months === 1 ? '1 mes' : `${x.months} meses`}${x.months === 12 ? '<i>mejor precio</i>' : ''}</button>`).join('')}</div>
      <div class="ctl"><label for="cn">Números de WhatsApp<small id="cnx">+${cur}${P.num} cada uno extra</small></label><div class="stepper"><button type="button" data-c="n" data-d="-1" aria-label="Menos números">−</button><output id="cn">1</output><button type="button" data-c="n" data-d="1" aria-label="Más números">+</button></div></div>
      <div class="ctl"><label for="cu">Trabajadoras<small id="cux">+${cur}${P.usr} cada una extra (el dueño no cuenta)</small></label><div class="stepper"><button type="button" data-c="u" data-d="-1" aria-label="Menos trabajadoras">−</button><output id="cu">1</output><button type="button" data-c="u" data-d="1" aria-label="Más trabajadoras">+</button></div></div>
      <div class="total"><span>Al mes</span><b id="ctot">${cur}${P.base}</b></div>
      <p class="pay" id="cpay" aria-live="polite">Pagas ${cur}${P.base} cada mes.</p>
      <p class="fine">Aparte, directo a cada proveedor: lo que Meta cobra por los mensajes (con tu tarjeta en Meta) y el consumo de la IA. <a href="/planes">Ver condiciones</a>.</p>
    </div>
  </div>
</div></section>

<section class="sec" id="demo"><div class="wrap demo">
  <div class="demo-copy reveal">
    <p class="kicker">Agenda una demo</p>
    <h2 style="font-size:clamp(30px,3.6vw,46px);font-weight:800">Te lo mostramos con tu producto.</h2>
    <p class="lead">Elige el día y la hora que te acomode. En 30 minutos vemos cómo quedaría tu flujo y resolvemos tus dudas.</p>
    <ul>
      <li>${I.check}<span>Cómo conectar tu número sin perder tus chats</span></li>
      <li>${I.check}<span>Tu flujo de venta con tus tallas, colores y precios</span></li>
      <li>${I.check}<span>Cuánto pagarías al mes con tu equipo</span></li>
    </ul>
    ${waLink ? `<p style="margin:22px 0 0;color:var(--muted)">¿Prefieres escribir? <a href="${esc(waLink)}" target="_blank" rel="noopener">Escríbenos por WhatsApp</a>.</p>` : ''}
  </div>
  <div class="book reveal" id="book"><p class="empty">Cargando horarios…</p></div>
</div></section>

<section class="sec" id="preguntas" style="padding-top:0"><div class="wrap">
  <div class="sec-head reveal"><p class="kicker">Preguntas frecuentes</p><h2>Lo que más nos preguntan.</h2></div>
  <div class="faq reveal">
    <details><summary>¿Es la API oficial de WhatsApp?</summary><p>Sí. Control Total usa la API oficial de WhatsApp de Meta (Cloud API). No usamos programas piratas ni conectamos tu celular a la fuerza.</p></details>
    <details><summary>¿Puedo seguir usando WhatsApp Business en mi celular?</summary><p>Sí. Al conectar eliges «Ya uso WhatsApp Business en el celular» y sigues respondiendo desde la app y desde Control Total con el mismo número.</p></details>
    <details><summary>¿Cuánto cobra Meta por los mensajes?</summary><p>Meta cobra aparte, directo a tu tarjeta, según el tipo de mensaje y el país. Cuando una clienta llega por un anuncio de clic a WhatsApp y respondes dentro de las primeras 24 horas, los mensajes de los siguientes 3 días son gratis. Control Total te muestra cuándo un chat está en esa ventana.</p></details>
    <details><summary>¿Necesito saber de IA o programar?</summary><p>No. Empiezas desde una plantilla de venta de ropa y cambias tus precios, tallas, colores y fotos. Antes de encender el bot, lo pruebas en el simulador.</p></details>
    <details><summary>¿Qué pasa si la IA no sabe responder?</summary><p>No inventa: pasa el chat a tu asesora y te deja un aviso. La IA solo habla de tus productos y la clienta puede pedir una persona cuando quiera.</p></details>
    <details><summary>¿Me pueden bloquear el número?</summary><p>Las reglas son las mismas que para cualquier herramienta oficial. Lo que causa bloqueos es que te reporten o mandar mensajes masivos a quien no te escribió. Control Total está hecho para responder a quien te escribe y hacer seguimiento dentro de lo que Meta permite.</p></details>
    <details><summary>¿Los números y trabajadoras extra son un pago único?</summary><p>No: se pagan junto con tu plan, cada mes o por el periodo que elijas. Si llevas ${P.pack} o más extras, cada uno sale más barato, y si pagas 3, 6 o 12 meses, más barato todavía.</p></details>
    <details><summary>¿Puedo cancelar cuando quiera?</summary><p>Sí, no hay contrato. Al cancelar no se cobra más y sigues usando lo que ya pagaste hasta que termine (1, 3, 6 o 12 meses). <a href="/planes">Ver condiciones</a>.</p></details>
    <details><summary>¿Quién puede ver mis chats?</summary><p>Solo tu equipo, cada persona con su usuario y su rol. Las claves de tu número se guardan cifradas. <a href="/privacidad">Política de privacidad</a>.</p></details>
  </div>
</div></section>

<section class="final"><div class="wrap">
  <h2>Que ninguna clienta se quede sin respuesta.</h2>
  <p>${P.open ? `Pruébalo ${P.trial} días gratis o agenda una demo con nosotros.` : 'Agenda una demo con nosotros.'}</p>
  <div class="cta">${P.open ? `<a class="btn btn-main" href="/registro">Crear mi cuenta gratis</a>` : ''}<a class="btn btn-ghost" href="#demo">Agendar demo</a></div>
</div></section>
</main>

<footer><div class="wrap">
  <a class="brand" href="/inicio" style="color:#fff">${MARK(26)}Control Total</a>
  <span>${plan.legal_name ? `${esc(plan.legal_name)}${plan.ruc ? ` · RUC ${esc(plan.ruc)}` : ''} · ` : ''}Lima, Perú · <a href="mailto:${esc(email)}">${esc(email)}</a></span>
  <nav><a href="/planes">Planes</a><a href="/terminos">Términos</a><a href="/privacidad">Privacidad</a><a href="/entrar">Entrar</a></nav>
</div></footer>
${waLink ? `<a class="wafab" href="${esc(waLink)}" target="_blank" rel="noopener" aria-label="Escríbenos por WhatsApp">${I.wa}<span>¿Dudas? Escríbenos</span></a>` : ''}

<script>
const P = ${JSON.stringify(P)};
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Aparecer al bajar
const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' }) : null;
document.querySelectorAll('.reveal').forEach((el) => (io ? io.observe(el) : el.classList.add('in')));

// Ver capturas en grande
document.addEventListener('click', (e) => {
  const img = e.target.closest('.shot img');
  if (!img) return;
  const z = document.createElement('div');
  z.className = 'zoom';
  z.setAttribute('role', 'dialog');
  z.setAttribute('aria-label', img.alt);
  z.innerHTML = '<img src="' + img.src + '" alt="">';
  const close = () => { z.remove(); document.removeEventListener('keydown', esc1); };
  const esc1 = (ev) => ev.key === 'Escape' && close();
  z.onclick = close;
  document.addEventListener('keydown', esc1);
  document.body.appendChild(z);
});

// Calculadora (misma cuenta que el sistema: pack y rebaja por meses)
const C = { n: 1, u: 1, m: 1 };
const money = (v) => P.cur + (Math.round(v * 100) / 100).toLocaleString('es-PE');
function calc() {
  const per = P.periods.find((x) => x.months === C.m) || { months: 1, base_off: 0, extra_off: 0, pack_off: 0 };
  const xn = Math.max(C.n - 1, 0), xu = Math.max(C.u - 1, 0);
  const pack = xn + xu >= P.pack;
  const off = pack ? per.pack_off : per.extra_off;
  const pn = Math.max(P.num - off, 0), pu = Math.max(P.usr - off, 0);
  const monthly = Math.max(P.base - per.base_off, 0) + xn * pn + xu * pu;
  const full = (P.base + xn * P.num + xu * P.usr) * per.months;
  const total = monthly * per.months;
  $('#cn').textContent = C.n;
  $('#cu').textContent = C.u;
  $('#cnx').textContent = '+' + money(pn) + ' cada uno extra' + (off ? ' (antes ' + money(P.num) + ')' : '');
  $('#cux').textContent = '+' + money(pu) + ' cada una extra' + (off ? ' (antes ' + money(P.usr) + ')' : '') + ' · el dueño no cuenta';
  $('#ctot').textContent = money(monthly);
  const save = Math.round((full - total) * 100) / 100;
  $('#cpay').innerHTML = (per.months === 1 ? 'Pagas ' + money(total) + ' cada mes.' : 'Pagas ' + money(total) + ' por ' + per.months + ' meses.') +
    (save > 0 ? ' <b>Ahorras ' + money(save) + '</b>' + (pack ? ' (precio pack)' : '') + '.' : (xn + xu === 1 ? ' Desde ' + P.pack + ' extras cada uno baja de precio.' : ''));
}
$('#calc').addEventListener('click', (e) => {
  const m = e.target.closest('[data-m]');
  if (m) {
    C.m = Number(m.dataset.m);
    $('#calc').querySelectorAll('[data-m]').forEach((b) => b.setAttribute('aria-pressed', String(b === m)));
    return calc();
  }
  const b = e.target.closest('[data-c]');
  if (!b) return;
  const k = b.dataset.c;
  C[k] = Math.min(Math.max(C[k] + Number(b.dataset.d), k === 'n' ? 1 : 0), 20);
  calc();
});
calc();

// Simulación del chat
const msgs = $('#msgs'), chips = $('#chips');
const wait = (ms) => new Promise((r) => setTimeout(r, still ? 0 : ms));
function add(cls, who, text) {
  const d = document.createElement('div');
  d.className = 'm ' + cls;
  d.innerHTML = (who ? '<span class="who">' + who + '</span>' : '') + esc(text);
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
}
async function typing(ms = 900) {
  const t = document.createElement('div');
  t.className = 'typing';
  t.innerHTML = '<i></i><i></i><i></i>';
  msgs.appendChild(t);
  msgs.scrollTop = msgs.scrollHeight;
  await wait(ms);
  t.remove();
}
function opts(list, fn) {
  chips.innerHTML = list.map((o) => '<button type="button">' + esc(o) + '</button>').join('');
  chips.querySelectorAll('button').forEach((b) => (b.onclick = () => { chips.innerHTML = ''; fn(b.textContent); }));
}
const COLORES = { XS: 'Negro, Perla y Vino', S: 'Negro, Gris oscuro, Perla y Beige', M: 'Negro, Vino, Azul noche y Beige', L: 'Negro, Gris claro y Azul noche', XL: 'Negro y Azul noche' };
async function sim() {
  msgs.innerHTML = '';
  chips.innerHTML = '';
  add('me', '', 'Hola, quiero información del pantalón 😊');
  await typing(700);
  add('bot', 'BOT', 'Hola 👋 Este es nuestro pantalón que estira.\\n1 a S/89 · 2 a S/139 · 3 a S/175\\nEnvío gratis 🚚');
  await typing(800);
  add('bot', 'BOT', '¿Qué talla usas normalmente? Elígela aquí abajo o escríbeme tu talla de jean 👇');
  opts(['XS', 'S', 'M', 'L', 'XL'], async (t) => {
    add('me', '', t);
    await typing(700);
    add('sys', '', 'Etiqueta puesta: Talla ' + t);
    add('bot', 'BOT', '¡Perfecto! En talla ' + t + ' tenemos: ' + COLORES[t] + '. Llevando 3 te sale a S/58.33 c/u 🔥');
    opts(['¿Llega hoy a Surco?', 'Quiero 2: negro y beige'], async (q) => {
      add('me', '', q);
      await typing(1300);
      if (q.startsWith('¿Llega')) add('ia', 'IA', 'Sí 🙌 Si confirmas antes de la 1 p. m. te llega HOY entre 2 y 8 p. m., y pagas al recibir. ¿Qué colores te gustaron?');
      else add('ia', 'IA', '¡Lindo combo! 😍 2 pantalones talla ' + t + ' (Negro y Beige): S/139 con envío gratis. ¿Para qué distrito sería?');
      await wait(400);
      opts(['Listo, te paso mis datos'], async (z) => {
        add('me', '', z);
        await typing(900);
        add('ia', 'IA', 'Genial 💕 Te paso con una asesora para confirmar tu pedido.');
        await wait(500);
        add('sys', '', 'Pedido creado · pasa a tu asesora');
        await wait(300);
        add('as', 'ASESORA', 'Hola, soy Ana 🙋‍♀️ Ya tengo tu pedido, ¿me confirmas tu dirección?');
        opts(['Ver otra vez'], sim);
      });
    });
  });
}
let simStarted = false;
const ph = $('.phone');
if (io) new IntersectionObserver((es, o) => { if (es[0].isIntersecting && !simStarted) { simStarted = true; sim(); o.disconnect(); } }, { threshold: 0.35 }).observe(ph);
else sim();

// Agenda
const book = $('#book');
const A = { days: [], day: 0, t: null, info: null };
function drawBook() {
  if (!A.info || !A.info.on || !A.days.length) {
    book.innerHTML = '<p class="empty">' + (A.info && A.info.on ? 'No quedan horarios libres en los próximos días.' : 'Por ahora no hay horarios de demo.') + (A.info && A.info.contact ? ' <a href="https://wa.me/' + esc(A.info.contact) + '" target="_blank" rel="noopener">Escríbenos por WhatsApp</a> y coordinamos.' : '') + '</p>';
    return;
  }
  const d = A.days[A.day];
  const pick = A.t ? d.slots.find((s) => s.t === A.t) : null;
  const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  book.innerHTML = '<h3>1. Elige el día</h3><div class="days" role="group" aria-label="Días">' +
    A.days.map((x, i) => '<button type="button" data-day="' + i + '" aria-pressed="' + (i === A.day) + '">' + DOW[x.dow] + '<b>' + x.d + '</b></button>').join('') + '</div>' +
    '<h3>2. Elige la hora <small style="font:400 13px var(--body);color:var(--muted)">(hora de Lima)</small></h3><div class="slots" role="group" aria-label="Horas">' +
    d.slots.map((s) => '<button type="button" data-t="' + s.t + '" aria-pressed="' + (s.t === A.t) + '">' + esc(s.hora) + '</button>').join('') + '</div>' +
    '<h3>3. Tus datos</h3>' + (pick ? '<p class="pick">Demo el <b>' + esc(d.label) + '</b> a las <b>' + esc(pick.hora) + '</b> · ' + A.info.dur_min + ' min</p>' : '<p class="pick">Elige una hora arriba.</p>') +
    '<form class="form" id="bf" novalidate>' +
    '<div><label for="bn">Tu nombre</label><input id="bn" name="name" autocomplete="name" required maxlength="60"></div>' +
    '<div><label for="bp">Tu WhatsApp</label><input id="bp" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="987 654 321" required></div>' +
    '<div><label for="bb">Tu marca</label><input id="bb" name="brand" maxlength="80" placeholder="Ej. Porte Perú"></div>' +
    '<div><label for="bv">Chats al día</label><select id="bv" name="volume"><option value="">Elige</option><option>Menos de 20</option><option>20 a 50</option><option>50 a 150</option><option>Más de 150</option></select></div>' +
    '<div class="full"><label for="bs">¿Qué vendes?</label><input id="bs" name="sells" maxlength="120" placeholder="Ej. pantalones de vestir, polos, leggings"></div>' +
    '<div class="hp" aria-hidden="true"><label>Web<input name="website" tabindex="-1" autocomplete="off"></label></div>' +
    '<div class="full"><p class="err" id="berr" hidden></p><button class="btn btn-wine" type="submit" style="width:100%"' + (pick ? '' : ' disabled') + '>Agendar mi demo</button></div></form>';
}
book.addEventListener('click', (e) => {
  const dy = e.target.closest('[data-day]');
  if (dy) { A.day = +dy.dataset.day; A.t = null; drawBook(); return; }
  const s = e.target.closest('[data-t]');
  if (s) {
    const keep = Object.fromEntries(new FormData($('#bf') || undefined));
    A.t = +s.dataset.t;
    drawBook();
    for (const [k, v] of Object.entries(keep)) { const i = $('#bf [name="' + k + '"]'); if (i) i.value = v; }
    $('.pick').scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'nearest' });
  }
});
book.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const data = Object.fromEntries(new FormData(f));
  const err = $('#berr');
  err.hidden = true;
  if (!data.name.trim()) { err.textContent = 'Escribe tu nombre.'; err.hidden = false; return; }
  if (String(data.phone).replace(/\\D/g, '').length < 9) { err.textContent = 'Escribe tu número de WhatsApp.'; err.hidden = false; return; }
  const btn = f.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Agendando…';
  try {
    const r = await fetch('/api/agenda', { method: 'POST', headers: { 'content-type': 'application/json', 'x-crm': '1' }, body: JSON.stringify({ ...data, t: A.t }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'No se pudo agendar. Intenta otra vez.');
    const d = j.demo;
    book.innerHTML = '<div class="ok"><div class="big">✓</div><h3>¡Listo, ' + esc(data.name.split(' ')[0]) + '!</h3><p>Tu demo es el <b>' + esc(d.dia) + '</b> a las <b>' + esc(d.hora) + '</b> (hora de Lima).<br>' + esc(d.where || '') + '</p><div class="cta"><a class="btn btn-wine" href="' + esc(d.gcal) + '" target="_blank" rel="noopener">Agregar a mi calendario</a>' + (A.info.contact ? '<a class="btn btn-ghost" style="color:var(--fg)" href="https://wa.me/' + esc(A.info.contact) + '?text=' + encodeURIComponent('Hola, agendé una demo de Control Total para el ' + d.dia + ' a las ' + d.hora) + '" target="_blank" rel="noopener">Avisar por WhatsApp</a>' : '') + '</div></div>';
  } catch (x) {
    err.textContent = x.message;
    err.hidden = false;
    btn.disabled = false;
    btn.textContent = 'Agendar mi demo';
    if (/ya no está libre/.test(x.message)) loadAgenda(true);
  }
});
async function loadAgenda(keepMsg) {
  try {
    const r = await fetch('/api/agenda');
    A.info = await r.json();
    A.days = A.info.days || [];
    A.day = Math.min(A.day, Math.max(A.days.length - 1, 0));
    A.t = null;
    const m = keepMsg && $('#berr') ? $('#berr').textContent : '';
    drawBook();
    if (m && $('#berr')) { $('#berr').textContent = m; $('#berr').hidden = false; }
  } catch {
    book.innerHTML = '<p class="empty">No se pudieron cargar los horarios. Recarga la página.</p>';
  }
}
loadAgenda();
</script>
</body></html>`;
}
