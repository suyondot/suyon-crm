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
<small>Control Total · Última actualización: 6 de noviembre de 2026</small>
<p><b>Control Total</b> es un software en línea (suscripción) para negocios que venden por WhatsApp. Lo opera <b>NUTRICHIKEN E.I.R.L.</b> (Lima, Perú). Lo usan las marcas propias del titular (como Porte Perú y Orión) y otros negocios que contratan el servicio («los negocios»). Cada negocio conecta su propio número de WhatsApp Business mediante la API oficial de WhatsApp de Meta y atiende ahí a sus clientes («los clientes finales»).</p>
<p>Para los datos de los clientes finales, el responsable es cada negocio y Control Total actúa como encargado del tratamiento: solo los procesa para prestar el servicio a ese negocio.</p>
<h2>Qué datos tratamos</h2>
<ul>
<li><b>De los negocios:</b> nombre, correo, celular y contraseña (guardada cifrada) de cada usuario; datos de la empresa; y lo que el negocio autoriza al conectar su WhatsApp con Meta: identificadores de su cuenta de WhatsApp Business y de su número, nombre visible, perfil del negocio, plantillas de mensajes y un permiso de acceso (token) que guardamos cifrado.</li>
<li><b>De los clientes finales:</b> número de WhatsApp y nombre del perfil; mensajes, fotos, audios, videos y documentos intercambiados con el negocio; los datos que dan para un pedido (nombre, celular, DNI, dirección o agencia, productos); y, si llegaron desde un anuncio, el identificador de ese anuncio.</li>
</ul>
<h2>Para qué los usamos</h2>
<ul>
<li>Mostrar y responder los chats del negocio desde una bandeja compartida por su equipo.</li>
<li>Enviar las respuestas automáticas, seguimientos y avisos de pedido que el negocio configura.</li>
<li>Registrar y seguir los pedidos, y generar los reportes del negocio.</li>
<li>Si el negocio lo activa, avisar a Meta de una compra hecha por un cliente que llegó desde un anuncio (API de conversiones), para medir sus anuncios.</li>
</ul>
<p>Algunas respuestas pueden generarse con inteligencia artificial, siempre limitadas a los productos del negocio y con la opción de hablar con una persona. No usamos los datos de un negocio para otro negocio, no los vendemos y no los usamos para publicidad propia.</p>
<h2>Con quién los compartimos</h2>
<p>Solo con los proveedores necesarios para operar el servicio: Meta (WhatsApp Business Platform), Cloudflare (servidores, base de datos y almacenamiento), Anthropic y OpenAI (respuestas con IA, transcripción de notas de voz y lectura de guías de envío) y, cuando el negocio lo usa, servicios de envío (por ejemplo, la consulta de agencias y rastreo de Shalom) o su tienda Shopify. Cada uno recibe solo lo necesario para su tarea.</p>
<h2>Cuánto tiempo los guardamos</h2>
<p>Mientras el negocio tenga su cuenta activa y lo necesite, y lo que exija la ley. Si un negocio desconecta su número o quita el permiso de Control Total en Meta, dejamos de recibir sus mensajes y borramos su permiso de acceso. El negocio puede pedir que borremos todos sus datos; también puede borrar desde la app la conversación o los datos de un cliente final.</p>
<h2>Tus derechos</h2>
<p>Según la Ley N.º 29733 de Protección de Datos Personales del Perú, puedes pedir acceso, corrección o eliminación de tus datos, u oponerte a su uso. Si eres cliente final, pídeselo al negocio por el mismo chat o escríbenos a <a href="mailto:${email}">${email}</a> y lo coordinamos con el negocio. Ver <a href="/eliminar-datos">cómo eliminar tus datos</a>.</p>
<h2>Seguridad</h2>
<p>Los datos viajan cifrados (HTTPS). Los permisos de acceso de WhatsApp se guardan cifrados. Cada negocio solo ve sus propios datos, y dentro del negocio cada persona entra con su propio usuario y rol (dueño, asesora, despacho).</p>
<h2>Contacto</h2>
<p>NUTRICHIKEN E.I.R.L. · Control Total · Lima, Perú · <a href="mailto:${email}">${email}</a></p>
<hr>
<h2>Summary in English</h2>
<p>Control Total is a subscription software (operated by NUTRICHIKEN E.I.R.L., Lima, Peru) that lets businesses manage their own WhatsApp Business number through Meta's official WhatsApp Business Platform: a shared inbox, automated replies, order tracking and reports. Businesses connect their number via Embedded Signup; we store the identifiers of their WhatsApp Business Account and phone number, their business profile, message templates and an encrypted access token. We process their customers' messages and order details only to provide the service to that business (we act as data processor). We share data only with the providers required to run the service (Meta, Cloudflare, Anthropic, OpenAI and, when the business uses them, shipping or Shopify integrations). We never sell data or use it for our own advertising. Businesses can disconnect at any time and request deletion; end customers can request deletion through the business or at <a href="mailto:${email}">${email}</a>.</p>`);
}

export function deletionPage(env) {
  const email = env.CONTACT_EMAIL || 'storesuyo@gmail.com';
  return shell('Eliminar tus datos', `
<h1>Cómo eliminar tus datos</h1>
<h2>Si eres cliente de una tienda</h2>
<ol>
<li>Escríbele a la tienda, por el mismo WhatsApp, la frase <b>"Eliminar mis datos"</b>, o envía un correo a <a href="mailto:${email}">${email}</a> con tu número de celular y el nombre de la tienda.</li>
<li>Confirmamos tu identidad respondiendo a ese mismo número.</li>
<li>Borramos tu conversación y los datos de tus pedidos en un plazo máximo de 10 días hábiles y te avisamos.</li>
</ol>
<h2>Si eres un negocio que usa Control Total</h2>
<ol>
<li>Para desconectar tu WhatsApp: en Meta (Configuración del negocio → Integraciones → Apps conectadas) quita «Control Total», o escríbenos.</li>
<li>Para borrar tu cuenta y todos sus datos (chats, clientes, pedidos y archivos), escríbenos a <a href="mailto:${email}">${email}</a> desde el correo de tu cuenta. Lo hacemos en un plazo máximo de 10 días hábiles.</li>
</ol>
<p><small>Podemos conservar solo lo que la ley exige (por ejemplo, comprobantes de pago). · English: to delete your data, email ${email} with your phone number (end customers) or from your account email (businesses); we delete it within 10 business days.</small></p>`);
}

export function termsPage(env) {
  const email = env.CONTACT_EMAIL || 'storesuyo@gmail.com';
  return shell('Términos de servicio', `
<h1>Términos de servicio</h1>
<small>Control Total · Última actualización: 6 de noviembre de 2026</small>
<p><b>Control Total</b> (operado por NUTRICHIKEN E.I.R.L., Lima, Perú) es un software en línea para que los negocios atiendan a sus clientes por WhatsApp con la API oficial de Meta. Ver <a href="/planes">planes y precios</a>.</p>
<h2>Para los negocios</h2>
<ul>
<li>Conectas tu propio número y tu propia cuenta de WhatsApp Business. Sigues siendo dueño de tu número y de tus datos, y puedes desconectarlo cuando quieras.</li>
<li>Meta te cobra directamente los mensajes que no son gratis, con el método de pago de tu cuenta. Control Total cobra solo su suscripción.</li>
<li>Debes cumplir las políticas de WhatsApp Business y de Meta: escribir solo a personas que te dieron su número, no enviar spam y ofrecer siempre la opción de hablar con una persona.</li>
<li>Eres responsable de los datos de tus clientes y de lo que envías. Nosotros los tratamos solo para darte el servicio, según la <a href="/privacidad">política de privacidad</a>.</li>
</ul>
<h2>Para los clientes de las tiendas</h2>
<p>Al escribirle a una tienda que usa Control Total, tus mensajes se usan para atender tu consulta y tu pedido. Puedes dejar de recibir mensajes escribiendo "STOP" o bloqueando el número, y pedir hablar con una persona en cualquier momento.</p>
<p>Contacto: <a href="mailto:${email}">${email}</a></p>`);
}

// Página pública de planes y condiciones de la suscripción (la revisan Culqi / Mercado Pago)
export function plansPage(env, plan, opts = []) {
  const email = env.CONTACT_EMAIL || 'storesuyo@gmail.com';
  const m = (n) => `S/${(Math.round(Number(n) * 100) / 100).toLocaleString('es-PE')}`;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
  const wa = plan.contact ? `<li>WhatsApp: <a href="https://wa.me/${esc(String(plan.contact).replace(/\D/g, ''))}">+${esc(String(plan.contact).replace(/\D/g, ''))}</a></li>` : '';
  const titular = plan.legal_name ? `<li>Titular: ${esc(plan.legal_name)}${plan.ruc ? ` · RUC ${esc(plan.ruc)}` : ''}</li>` : '';
  const per = (x) => (x === 1 ? '1 mes' : `${x} meses`);
  const pk = plan.pack_min || 2;
  const ej = opts.length ? opts : [];
  return shell('Planes y precios', `
<h1>Control Total · Planes y precios</h1>
<small>Sistema para vender ropa por WhatsApp · Precios en soles (S/) · Última actualización: noviembre de 2026</small>
<p>Control Total es un software en línea (suscripción) para marcas que venden por WhatsApp: bandeja de chats del equipo, bot y asistente con IA, etiquetas, llamadas, pedidos de Lima y provincia, clientes y reportes. Se usa desde el navegador, en computadora o celular, con la API oficial de WhatsApp.</p>
<h2>Precios</h2>
<ul>
<li><b>Prueba gratis de ${esc(plan.trial_days)} días</b>, sin tarjeta.</li>
<li><b>Plan base: ${m(plan.base)} al mes</b>. Incluye 1 número de WhatsApp, la cuenta del dueño y 1 trabajadora.</li>
<li><b>Número de WhatsApp adicional: ${m(plan.per_number)} al mes</b> cada uno.</li>
<li><b>Trabajadora adicional: ${m(plan.per_user)} al mes</b> cada una.</li>
<li><b>Pack:</b> desde ${pk} adicionales (números y trabajadoras sumados), cada número adicional tiene un precio menor.</li>
<li>Los adicionales se pagan junto con el plan, en cada periodo; no son un pago único.</li>
</ul>
<h2>Pagando varios meses</h2>
<p>Puedes pagar 1, 3, 6 o 12 meses de una vez. Mientras más meses, menor el precio por mes:</p>
<table style="width:100%;border-collapse:collapse;font-size:15px"><thead><tr style="text-align:left;border-bottom:1px solid var(--line)"><th style="padding:6px 4px">Pagas</th><th>Plan base al mes</th><th>Número adicional</th><th>Número adicional en pack</th><th>Trabajadora adicional</th></tr></thead><tbody>
${(plan.periods || []).map((x) => `<tr style="border-bottom:1px solid var(--line)"><td style="padding:6px 4px">${per(x.months)}</td><td>${m(plan.base - x.base_off)}</td><td>${m(plan.per_number - x.extra_off)}</td><td>${m(plan.per_number - x.pack_off)}</td><td>${m(plan.per_user - (x.user_off || 0))}</td></tr>`).join('')}
</tbody></table>
${ej.length ? `<p>Ejemplo con 2 números y 2 trabajadoras (2 adicionales, precio pack): ${ej.map((o) => `${per(o.months)} = <b>${m(o.total)}</b> (${m(o.monthly)} al mes)`).join(' · ')}.</p>` : ''}
<p><small>No incluido: lo que Meta cobra por los mensajes de WhatsApp (se paga directo a Meta con la tarjeta del cliente) y el consumo de inteligencia artificial (con la clave propia del cliente o con saldo prepagado).</small></p>
<h2>Cómo se cobra</h2>
<p>Al terminar la prueba, eliges pagar 1, 3, 6 o 12 meses, con tarjeta de crédito o débito a través de una pasarela de pagos autorizada. El cobro se renueva automáticamente al final de cada periodo por el monto del plan según los números y trabajadoras activos. Control Total no guarda los datos de la tarjeta: los procesa la pasarela de pagos.</p>
<h2>Cancelación</h2>
<p>Puedes cancelar la renovación cuando quieras desde «Mi plan» o escribiéndonos. Al cancelar no se hacen más cobros y el acceso sigue hasta el final del periodo ya pagado (1, 3, 6 o 12 meses). Un periodo ya pagado no se cancela ni se devuelve. Tus datos se conservan 30 días por si vuelves; después puedes pedir que los borremos.</p>
<h2>Reembolsos</h2>
<p>Los pagos no tienen devolución. Hay dos excepciones:</p><ul><li><b>Te equivocaste de plan</b> (por ejemplo, pagaste 6 meses y querías 3): escríbenos por WhatsApp dentro de las 48 horas siguientes al pago. Te cambiamos al plan correcto y te devolvemos la diferencia. No se cancela el pago completo.</li><li><b>Cobro duplicado o error del sistema de pagos:</b> te devolvemos el cobro que no correspondía.</li></ul>
<h2>Contacto</h2>
<ul>
${titular}
<li>Correo: <a href="mailto:${esc(email)}">${esc(email)}</a></li>
${wa}
<li>Lima, Perú</li>
</ul>
<p><a href="/registro"><b>Crear mi cuenta gratis</b></a> · <a href="/terminos">Términos del servicio</a> · <a href="/privacidad">Política de privacidad</a></p>`);
}
