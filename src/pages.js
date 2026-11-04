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
