// Páginas públicas que pide Meta para publicar la app (política de privacidad, etc.)

const shell = (title, inner) => `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Control Total</title>
<style>
:root{--bg:#F4F2F3;--fg:#1F1A1D;--muted:#6D6469;--accent:#7A1F35;--surface:#fff;--line:#E1DADE}
@media (prefers-color-scheme:dark){:root{--bg:#141113;--fg:#EFE9EC;--muted:#A79DA2;--accent:#E07A93;--surface:#1C181A;--line:#352E32}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:720px;margin:0 auto;padding:32px 16px 64px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:24px}
h1{font-size:28px;line-height:1.2;margin:0 0 4px;color:var(--accent)} h2{font-size:18px;margin:24px 0 6px}
p,li{color:var(--fg)} small{color:var(--muted)} a{color:var(--accent)}
</style></head><body><main><div class="card">${inner}</div></main></body></html>`;

export function privacyPage(env) {
  const email = env.CONTACT_EMAIL || 'storesuyo@gmail.com';
  return shell('Política de privacidad', `
<h1>Política de privacidad</h1>
<small>Control Total · Última actualización: noviembre de 2026</small>
<p>Control Total es el sistema de atención por WhatsApp que usan las tiendas de Jordan Suyon (Lima, Perú), como Porte Perú y Orión, para responder a sus clientas y gestionar sus pedidos. Esta política explica qué datos tratamos y cómo los cuidamos.</p>
<h2>Qué datos tratamos</h2>
<ul>
<li>Tu número de WhatsApp y el nombre de tu perfil.</li>
<li>Los mensajes, fotos, audios, videos y documentos que intercambias con la tienda.</li>
<li>Los datos que nos das para un pedido: nombre, celular, DNI, dirección o sede de agencia y prendas elegidas.</li>
<li>Si nos escribes desde un anuncio, el identificador de ese anuncio.</li>
</ul>
<h2>Para qué los usamos</h2>
<ul>
<li>Responder tus consultas y atender tu compra.</li>
<li>Coordinar el envío o el recojo de tu pedido.</li>
<li>Medir qué anuncios funcionan, enviando a Meta un aviso de compra de forma segura.</li>
</ul>
<p>Algunas respuestas pueden ser automáticas o generadas con ayuda de inteligencia artificial, siempre limitadas a los productos de la tienda. Puedes pedir hablar con una persona en cualquier momento.</p>
<h2>Con quién los compartimos</h2>
<p>Solo con los proveedores necesarios para operar: Meta (WhatsApp), Cloudflare (servidores y almacenamiento), OpenAI (respuestas automáticas) y la empresa de envíos que elijas (por ejemplo, Shalom). No vendemos tus datos.</p>
<h2>Cuánto tiempo los guardamos</h2>
<p>Mientras sean necesarios para atenderte y para cumplir obligaciones legales y tributarias. Puedes pedir que los borremos antes.</p>
<h2>Tus derechos</h2>
<p>Según la Ley N.º 29733 de Protección de Datos Personales del Perú, puedes pedir acceso, corrección o eliminación de tus datos, u oponerte a su uso. Escríbenos a <a href="mailto:${email}">${email}</a> o pídelo por el mismo chat de WhatsApp. Ver también <a href="/eliminar-datos">cómo eliminar tus datos</a>.</p>
<h2>Seguridad</h2>
<p>Los datos viajan cifrados y solo el personal autorizado de cada tienda puede verlos, cada uno con su propio usuario.</p>
<h2>Contacto</h2>
<p>Jordan Suyon · Lima, Perú · <a href="mailto:${email}">${email}</a></p>`);
}

export function deletionPage(env) {
  const email = env.CONTACT_EMAIL || 'storesuyo@gmail.com';
  return shell('Eliminar tus datos', `
<h1>Cómo eliminar tus datos</h1>
<p>Para que borremos tu conversación y los datos de tus pedidos en Control Total:</p>
<ol>
<li>Escríbenos por el mismo WhatsApp de la tienda la frase <b>"Eliminar mis datos"</b>, o envía un correo a <a href="mailto:${email}">${email}</a> con tu número de celular.</li>
<li>Confirmaremos tu identidad respondiendo a ese mismo número.</li>
<li>Borraremos tus datos en un plazo máximo de 10 días hábiles y te avisaremos.</li>
</ol>
<p><small>Podemos conservar solo lo que la ley exige (por ejemplo, comprobantes de venta).</small></p>`);
}

export function termsPage(env) {
  const email = env.CONTACT_EMAIL || 'storesuyo@gmail.com';
  return shell('Términos de servicio', `
<h1>Términos de servicio</h1>
<p>Control Total es una herramienta interna para que las tiendas de Jordan Suyon atiendan a sus clientas por WhatsApp. Al escribirnos aceptas que usemos tus mensajes para atender tu consulta y tu pedido, según nuestra <a href="/privacidad">política de privacidad</a>.</p>
<p>Puedes dejar de recibir mensajes en cualquier momento escribiendo "STOP" o bloqueando el número.</p>
<p>Contacto: <a href="mailto:${email}">${email}</a></p>`);
}
