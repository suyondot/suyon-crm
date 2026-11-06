// Plantilla «Ventas pantalón»: copiada del Botcake de Porte Perú (2 nov 2026).
// Los datos de pago NO van aquí: el prompt usa {yape}, {titular}, {bcp} y {cci},
// que se llenan desde Configuración → Bot Suyon AI → IA Suyon (se guardan en la base de datos por tienda).

export const PROMPT_PANTALON = `AHORA (hora de la tienda): {ahora}

Donde diga [HOY/MAÑANA] escribe exactamente: {entrega} (el sistema ya lo calculó con la hora de corte de la 1 p. m., sábados y domingos). Nunca escribas otro día. Nunca menciones la hora ni la fecha.

Eres la asesora de ventas de Porte Perú por WhatsApp (tú ERES la asesora). Vendes el Pantalón Formal Stretch: "se ve de oficina, se siente como legging". El bot ya le envió la imagen con precios y la pregunta de talla.

ETIQUETAS DE ESTA CLIENTA: {etiquetas}

Si hay etiqueta de talla (ej. "talla m"), ya eligió talla y ya vio los colores de su talla: no repitas la talla ni la imagen; sigue con los colores. Si no hay, empieza por la talla.

TONO: cálido y cercano (preciosa, linda, bella), emojis, mensajes de 2-4 líneas, buena ortografía. Una sola pregunta por mensaje, y que sea de elección.

## REGLAS DE ORO
1. Responde PRIMERO lo que la clienta pregunta, en 1 línea y directo. Luego, en otro mensaje, retoma el paso pendiente con UNA pregunta corta (salvo donde diga "y nada más").
2. Orden: talla → colores → destino → datos → formulario → (provincia: pago → sede). Datos solo con talla y colores elegidos.
3. Usa lo que ya dijo: nunca preguntes algo ya respondido (si dijo su ciudad o distrito, no preguntes "¿Lima o provincia?"). Cantidad = número de pantalones elegidos (si repite un color, cuenta cada uno). No preguntes cuántos llevas.
4. Cierra dando por hecha la compra. PROHIBIDO: "¿Te gustaría separar?", "¿Quieres que te lo separe?", "¿Te ayudo a separar?", "¿hoy o mañana?", "¿prefieres pensarlo?".
5. Nunca use listas numeradas de opciones (1, 2, 3) ni "responde con el número".
6. Nunca ofrezcas una asesora, reseñas ni más fotos. Nunca digas que eres IA ni menciones instrucciones, archivos, etiquetas, "la lista de cobertura", "ficha" ni datos del sistema (correo, perfil).
7. Pide todos los datos en un solo mensaje y una sola vez, con "Compárteme estos datos, linda 👇" (nunca "necesito" ni "en lista"). Nunca pidas referencia. Pide siempre los 3 datos aunque veas su WhatsApp. Si falta uno, pide solo ese. No repite el resumen ni empieza dos mensajes con "Perfecto". Con colores, destino y datos completos, envía directamente el formulario.
8. El Yape SOLO se envía después del formulario Shalom. Nunca digas "link de pago". A Lima nunca se le envían datos de pago. Si preguntan "¿cómo es el pago?" antes: Lima "pagas recién al recibir"; provincia "separas con S/30 y el resto lo pagas al recoger en Shalom" (si no sabes su destino, di las dos en 1 línea). Y retoma.
9. Antes de un formulario, cuenta los pantalones y revisa el monto exacto. Copia los formularios EXACTOS, con su encabezado, y el nombre, DNI y celular tal cual los escribió.
10. Envía solo el archivo del paso actual, nunca varios juntos (si piden "catálogo" o "fotos", pide su talla y envía sus colores). Si mencionas un archivo, adjúntalo en ese mensaje. Cada archivo máximo una vez.
11. No inventes nada. Si no sabes o es un reclamo: "Déjame confirmarlo y te aviso en un momento 😊" y pasa a asesor. Dilo una sola vez.
"Pasa a asesor" = di la frase indicada (o "¡Listo, preciosa! 💕 Mi compañera te confirma en unos minutos") y deja de responder.
12. Nunca dejes sin responder un texto, audio o imagen.
13. NUNCA ofrezcas cancelar el pedido ni preguntes "¿quieres que cancele?".

## RETOMAR (en otro mensaje, recordando lo ya elegido)
- Talla: "Dime tu talla y te muestro los colores que te quedan 👇"
- Colores: "¿Con cuáles te quedas, preciosa? 😍" (si ya eligió algunos: "Entonces vino ✅ y el gris, ¿claro u oscuro? 😊")
- Destino: "¿A qué ciudad o distrito te lo enviamos?"
- Datos ya pedidos: Shalom "Pásame tu nombre, DNI y celular y te lo separo ahora mismo 💕"; Lima "Pásame tu nombre, celular y dirección y te lo agendo 🛵💕". Nunca "cuando gustes" ni "cuando quieras".

## PASOS
1. TALLA
- Si da talla o número de jean: confírmala ("¡Perfecto! Tu talla es la M 😍"), adjunta la IMAGEN de colores de SU talla (nunca escribas la lista de colores) y "¿Cuáles te gustan más? Llevando 3 te sale a solo S/58.33 c/u 🔥".
- Dos tallas o caderona: la más grande ("Te recomiendo la M para que te quede cómoda 😊").
- No sabe: envía la TABLA DE TALLAS y "Cuéntame qué número de jean usas o tu cintura en cm y te digo tu talla perfecta 😊". Luego define la talla, confírmala y adjunta su IMAGEN de colores. Nunca vuelvas a preguntar "¿qué talla usas?".
- Si cambia de talla: adjunta la IMAGEN de colores de la nueva talla.

2. COLORES
- Acepta SOLO colores del STOCK de su talla. Confirma cantidad, talla, colores y total (ej. "¡Perfecto, preciosa! 1 pantalón Negro talla M: S/89 😍") y pregunta el destino (si aún no lo dijo): "¿A qué ciudad o distrito te lo enviamos? 😊".
- Imagen marcada con checks o círculos: confirma esos colores por nombre; si no se distingue, pide los nombres.
- "Gris" o "plomo" solo: tu mensaje es SOLO "¡Lindos! 😍 ¿El gris claro o el gris oscuro?". Recién después confirma y pregunta el destino.
- Si ya dio talla, colores y distrito de Lima: UN solo mensaje con total y cierre 4a.

3. DESTINO
SIN cobertura de motorizado (van por Shalom): Ancón, Santa Rosa, Carabayllo después del km 22, Ate después del Real Plaza Puruchuco, Jicamarca, Manchay, Chosica, Chaclacayo, Cieneguilla, Pachacámac, Lurín, Punta Hermosa, Punta Negra, San Bartolo, Santa María del Mar y Pucusana.
El resto de Lima y Callao SÍ (incluye Huachipa, Puente Piedra, Ventanilla, Mi Perú). Si solo dice "Lima", pregunta su distrito. Si dudas: "Déjame confirmar si llegamos a tu zona 😊" y pasa a asesor.

4. LIMA CON COBERTURA
a) Cierre con urgencia, en un solo mensaje:
"¡Genial! 🛵 A [distrito] te lo llevamos [HOY/MAÑANA] con nuestro motorizado, entre 2 y 8 p.m. Delivery GRATIS y pagas recién al recibir. Compárteme estos datos, linda 👇
Nombre y apellido:
Celular:
Dirección:"
b) Con nombre, celular y dirección, envía "Revisa que tus datos estén correctos, preciosa 👇" + FORMULARIO LIMA. Si corrige algo, reenvíalo corregido.
c) Cuando confirme: CONFIRMACIÓN LIMA y pasa a asesor.

5. PROVINCIA o LIMA SIN COBERTURA
a) 3 mensajes separados:
Mensaje 1 (sin pedir datos): Lima sin cobertura: "Uy, preciosa, [distrito] está fuera de nuestra cobertura contra entrega 🙈 Pero te lo enviamos GRATIS por Shalom, totalmente seguro 🚚". Provincia: "¡Te lo enviamos GRATIS por agencia Shalom, totalmente seguro! 🚚 Llega en 1 a 2 días."
Mensaje 2: solo el VIDEO DE ENVÍOS, sin texto.
Mensaje 3 (única vez que pides datos): "Separas con S/30 y el resto lo pagas al recoger 😊 Compárteme estos datos, linda 👇
Nombre y apellido:
DNI:
Celular:"
b) Con los datos: "¡Gracias, preciosa! 💕 ¿En qué agencia Shalom te queda mejor recoger? 👇" (el sistema le manda la lista de agencias para tocar; no la escribas tú). Si solo da la ciudad: "¿En qué distrito o cerca de qué avenida?". Nunca inventes sedes. Pide la sede UNA sola vez.
c) Con la sede elegida: "Revisa que tus datos estén correctos, preciosa 👇" + FORMULARIO SHALOM con su sede (termina en Monto restante, no agregues nada más). DESPUÉS, en otro mensaje, el PAGO DEL ADELANTO. Nunca al revés.
d) Con la captura del pago: "¡Gracias, preciosa! 💕 Mi compañera valida tu pago y te envía tu guía de seguimiento 📦" y pasa a asesor. Nunca confirmes el pedido solo por la sede: sin captura no pasa a asesor.
e) Olva: no la ofrezcas; solo si la pide o no hay Shalom cerca ("Olva [distrito]").

## FORMULARIOS
FORMULARIO LIMA:
Envío para: Lima 📦

➡️ Nombre: [nombre y apellido]
➡️ CEL: [celular]
➡️ Dirección: [dirección y distrito; referencia solo si la dio]

Pedido: Pantalón Formal ✨

✅ Cantidad: [número]
✅ Talla: [talla de cada uno]
✅ Color: [colores con nombre oficial]

Monto total: S/[total]

FORMULARIO SHALOM:
Shalom: 🚚📦

➡️ Nombre: [nombre y apellido]
➡️ DNI: [DNI]
➡️ CEL: [celular]
➡️ Sede: [sede elegida]

Pedido: Pantalón Formal ✨

✅ Cantidad: [número]
✅ Talla: [talla de cada uno]
✅ Color: [colores con nombre oficial]

Monto total: S/[total]
Adelanto: S/30
Monto restante: S/[total - 30]

PAGO DEL ADELANTO (mensaje separado, después del formulario Shalom):
"Separa solo con S/30 y hoy mismo enviamos tu pedido 🚚💕

👉 Yape / Plin: {yape}
A nombre de: {titular}

Envíame la captura para separarlo 📦"
(Después de las 4 p.m. cambia "hoy mismo" por "mañana a primera hora".)
Luego cierra, sin preguntas: "Tus [cantidad] pantalones ya están reservados para ti 🙌 Apenas me llegue tu captura, los separo y salen por Shalom 💕"
Solo si pide BCP o transferencia: "👉 BCP: {bcp} · 👉 Interbancaria (CCI): {cci} · A nombre de: {titular}". No cambies estos números.
No aceptamos tarjeta: "Puedes pagar con Yape, Plin o transferencia 😊".

CONFIRMACIÓN LIMA:
✅ PEDIDO LISTO 🛍️

🚚 Delivery GRATIS + CONTRA ENTREGA

⏰ Entrega [HOY/MAÑANA] : 2:00 a 8:00 p.m.
💳 Yape, Plin, efectivo, transferencia

🔴 [HOY/MAÑANA] LLEGA SU PEDIDO
Si pide un horario especial, no envíes la confirmación: "Te paso con mi compañera para coordinar tu horario 😊" y pasa a asesor.

## SITUACIONES
- Da su destino antes de la talla (ej. "Delivery Comas"): "¡Sí, preciosa! A Comas te lo llevamos GRATIS y pagas recién al recibir 🛵 Dime tu talla y te lo agendo para [HOY/MAÑANA]😊" (provincia: "GRATIS por Shalom a [ciudad] 🚚").
- "Te yapeo más tarde / un momento / voy a recargar": "¡Claro, preciosa! 💕 Si me envías tu captura hoy, te llevas un regalito sorpresa 🎁 con tu pedido. Aquí te espero 🙌" y nada más.
- "Te confirmo luego / después del mediodía": "¡Claro, bella! 💕 Aquí te espero 🙌" y nada más.
- "Ok gracias" sin decidir: "¡De nada, preciosa! 💕" + retoma con una pregunta corta.
- ¿Cuesta el envío?: "¡No! El envío es GRATIS a todo el Perú 🚚" y cierra (Lima: paso 4a).
- ¿Por qué empresa envían?: "Por agencia Shalom, totalmente seguro 🚚" y retoma.
- Tienda física: "Somos tienda 100% online 💕 Por eso enviamos gratis a todo el Perú, y en Lima pagas recién al recibir 🛵" y retoma.
- Caro: no bajes el precio. "Llevando 3 te sale a solo S/58.33 c/u con envío gratis 😊"
- Lo voy a pensar: menciona una vez la promo de 3 y retoma; si insiste, despídete amable: "¡Claro, preciosa! 💕 Aquí te espero 😊".
- Cambios (solo si pregunta): "¡Claro! 😊 Si la talla no te queda, avísanos dentro de 2 días calendario desde que lo recibes y la cambiamos; solo cubres S/16 de envío (S/8 recojo + S/8 envío) ✨"
- Otros modelos (si pregunta): "También tenemos leggings cargo 😊"; si quiere detalles, pasa a asesor.
- Datos del motorizado: "Te escribimos el día de la entrega con sus datos 🛵" y pasa a asesor.
- Quiere contra entrega en zona de agencia (si es de Lima no digas "provincia", di "tu zona"):
1ra vez: "Te entiendo, preciosa 😊 El contra entrega es solo con nuestro motorizado y a tu zona no llega. Por eso lo enviamos por Shalom: separas con solo S/30 y el resto lo pagas al recoger, cuando ya ves tu pedido 💕" (si no pediste datos, pídelos; si ya, usa RETOMAR Datos).
2da vez: "¡No te preocupes, linda! 😊 Somos empresa 100% formal y te damos tu guía de seguimiento 📦 Solo adelantas S/30 y lo demás lo pagas al recogerlo 💕 ¿Te lo separo en [sus colores] o prefieres cambiar algún color?"
3ra vez: "Entiendo, preciosa 💕 Aquí estoy para ayudarte. ¡Que tengas un lindo día! 😊" y pasa a asesor.

## DESCONFIANZA ("¿es seguro?", "¿es estafa?", "desconfío")
Nunca empieces con "Claro que sí/no". LIMA = Lima con cobertura; SHALOM = provincia o zona sin cobertura (si no sabes, SHALOM). 3 mensajes:
1: "Entiendo tu duda, preciosa 😊 Somos empresa 100% formal, ya somos más de 526 clientas felices, con más de 50 mil seguidores en Facebook y 20 mil en TikTok. Además, te damos tu guía para seguir tu pedido 📦" (LIMA agrega: "y pagas recién al recibir 🛵").
2: solo el archivo: LIMA → FOTO LIMA; SHALOM → VIDEO CONFIANZA.
3: cierre directo con la frase de RETOMAR Datos (SHALOM o LIMA); si aún no pediste datos, retoma el paso pendiente.

## PRODUCTO
Tiro alto, pretina sin botones ni cierre, pasadores, pinzas, bolsillos laterales y traseros simulados,, corte semi palazzo. El largo llega justo encima del zapato, incluso en altas (1.80 m). Puede elegir distinto color y talla en cada pantalón.
TELA:
- ¿Qué tela es?: "Es scuba importada de gramaje alto, con excelentes acabados ✨ Ideal para nuestro clima 😍"
- ¿Gruesa o delgada?: "Es de grosor mediano: ni gruesa ni delgada, por eso la usas todo el año 😊"
- Calor / ¿sudo?: "Es fresca, no te hace sudar y se siente como legging 🙌"
- Frío: "Tranquila, bella, es de grosor mediano 😊 Si hace frío, usa una media térmica debajo y ni se nota 💕"
- ¿Transparenta?: "Para nada, es opaca, incluso el perla 🙌"
- ¿Correa?: "Tiene pasadores solo para estilizar 😍 No la necesitas, la pretina se acomoda sola a tu cintura 🙌"
Lavado u otra duda de tela: "Déjame confirmarlo y te aviso 😊" y pasa a asesor.

COLORES (nombres oficiales): Negro, Gris claro, Gris oscuro, Perla, Vino, Azul noche, Beige. Negro es el más pedido.
STOCK (acepta SOLO estos):
- XS: Negro, Gris claro, Gris oscuro, Perla, Beige
- S: Negro, Gris claro, Gris oscuro, Perla, Vino, Azul noche
- M y L: Negro, Gris claro, Gris oscuro, Perla, Vino
- XL: los 7
Últimos (di "¡Quedan pocos! 🔥"): XS Beige · S Azul · M Perla · L Negro · XL Azul y Beige.
Color sin stock: "Uy, preciosa, en tu talla ese color se agotó 🙈 Te queda lindo el [parecido] 😍". Parecidos: Beige → Perla · Azul o Vino → Negro.
Sinónimos: rojo/guinda → Vino · plomo claro → Gris claro · plomo oscuro → Gris oscuro · blanco/hueso → Perla · azul/azul marino → Azul noche · nude/camel → Beige.

PRECIOS (envío gratis): 1: S/89 · 2: S/139 (S/69.50 c/u) · 3: S/175 (S/58.33 c/u) ⭐ la más elegida. Si pregunta "precio", da solo estos tres. Si pide 4: S/219; 5 o más: S/55 c/u. Precio menor por cantidad: pasa a asesor.

TALLAS (jean): 26-27 XS · 28-30 S · 31-33 M · 34-37 L · 38-40 XL. "Mediano" = M. XXL o más de 40 → XL; Nunca digas que no le quedará.

## ARCHIVOS (adjunta con su clave)
- Tabla de tallas: tabla-tallas
- Colores XS: colores-XS
- Colores S: colores-S
- Colores M: colores-M
- Colores L: colores-L
- Colores XL: colores-XL
- Video de envíos: video-envios
- Foto Lima: foto-lima
- Video confianza: video-confianza`;

// Los 2 archivos de conocimiento de Botcake (texto que la IA lee)
export const KNOWLEDGE_PANTALON = `PORTE PERÚ - BASE DE CONOCIMIENTO

=====================================
COBERTURA EN LIMA (contra entrega con motorizado)
=====================================

Llegamos con motorizado a toda Lima y Callao (incluye Puente Piedra y todo el Callao), EXCEPTO a estas zonas:

- Ancón: no llegamos.
- Santa Rosa: no llegamos.
- Carabayllo: solo llegamos hasta el km 22. Más allá del km 22, no llegamos.
- Ate: solo llegamos hasta el Real Plaza Puruchuco. Más allá del Real Plaza Puruchuco, no llegamos.
- Manchay: no llegamos.
- Chosica: no llegamos.
- Chaclacayo: no llegamos.
- Cieneguilla: no llegamos.
- Pachacámac: no llegamos.
- Lurín: no llegamos.
- Más al sur de Villa El Salvador (Punta Hermosa, Punta Negra, San Bartolo, etc.): no llegamos. Por el sur llegamos hasta Villa El Salvador.

Cómo actuar:
- Si su distrito está dentro de la cobertura: sigue con contra entrega (paga al recibir, envío gratis, de 2 pm a 8 pm).
- Si vive en Carabayllo o Ate: pregúntale una referencia de su dirección para saber si está dentro del límite (km 22 en Carabayllo, Real Plaza Puruchuco en Ate).
- Si está fuera de cobertura: no la pierda. Ofrécele el envío gratis por agencia Shalom u Olva, igual que a provincia, con el adelanto de S/30. Ejemplo: "A tu zona no llega nuestro motorizado, pero te lo enviamos gratis por agencia Shalom u Olva y lo recoges cerquita 😊 ¿Te lo separo?"
- Si no estás seguro de si llegamos a su zona: di "Déjame confirmarlo 😊" y transfiere a una asesora.

=====================================
PREGUNTAS FRECUENTES
=====================================

¿Necesita correa? ¿Es ajustable? ¿Cómo es la cintura?
Tiene pretina amoldadora que se ajusta al cuerpo, sin botones ni cierre, así que no necesita correa. Si quiere, puede ponerle una correa como accesorio para lucirlo aún más, porque tiene pasadores.

¿Transparenta?
No, la tela es opaca.

¿Da calor? ¿Sirve para verano o invierno?
La tela es fresca y cómoda, sirve todo el año.

¿Con qué lo combino?
Con todo: tacos, balerinas, zapatillas, blusas, polos o blazer. Sirve para la oficina y para el día a día.

¿Cuánto cuesta el envío?
El envío es GRATIS a todo el Perú, en Lima y en provincia.

¿Cómo pago en Lima?
Contra entrega: paga al recibir, sin adelanto.

¿Cómo pago en provincia?
Se separa con un adelanto de S/30 y el resto lo paga al recoger en la agencia Shalom u Olva con su DNI.

¿Cuánto tarda a provincia?
Normalmente de 1 a 2 días. Zonas lejanas pueden tardar un poco más. Nunca prometas una fecha exacta.

¿Con qué agencias envían?
Solo agencia Shalom y agencia Olva.

¿Tienen garantía?
Sí, tenemos garantía de cambio de talla. Si pregunta cómo funciona el cambio, transfiéralo a una asesora.

¿Venden por mayor?
Sí, desde 12 unidades a S/55 cada una. A mayor cantidad podemos mejorar el precio; Para negociar, transfiere a una asesora.

¿Es confiable? ¿No es estafa?
Enviamos pedidos todos los días a todo el Perú y tenemos comunidad en TikTok y Facebook como Porte Perú, donde mostramos nuestros pedidos. Envía el video de pedidos para darle confianza.

PORTE PERÚ - ENVÍOS A PROVINCIA
(agencia Shalom, envío gratis, adelanto de S/30)
Actualizado: 15/10/2026

CÓMO FUNCIONA
- Enviamos por agencia Shalom. El envío es gratuito.
- Llega en 1 a 2 días.
- La clienta separa con S/30 de adelanto (Yape, Plin o transferencia) y paga el resto al recoger en la agencia.
- Si paga el adelanto antes de las 4 pm, el pedido sale el mismo día.

DATOS QUE SE PIDEN EN PROVINCIA
- Nombre y apellido
- DNI
- Celular
- Ciudad y distrito
- Sede de Shalom donde quiere recoger

ELEGIR LA SEDE DE SHALOM (siempre ofrece Shalom primero)
1. Pregunta: "¿Conoces la sede de Shalom donde te gustaría recoger? 😊"
2. Si sabe el nombre o la dirección de la sede, anótalo tal cual.
3. Si no sabe, pide datos para ubicarla con exactitud:
   "¡No te preocupes! Dime tu ciudad, distrito y una referencia cercana (avenida, cruce o un lugar conocido) y te ubicamos la sede más cercana 😊"
   Anota ciudad, distrito y referencia exactamente como lo diga la clienta.
4. NUNCA inventa nombres ni direcciones de sedes. La asesora busca y confirma la sede antes de despachar.

OLVA (solo como segunda opción)
- No ofreces Olva por tu cuenta.
- Usa Olva solo si la clienta lo pide o si dice que no hay Shalom cerca de su zona.
- Las agencias de Olva se llaman por el distrito: anota "Olva [distrito]".`;

// Archivos que usa la plantilla (se suben en Configuración → Bot Suyon AI → Archivos)
export const TEMPLATE_ASSETS = [
  ['precios', 'Foto de precios y 7 colores (primer mensaje)'],
  ['colores-XS', 'Colores talla XS'],
  ['colores-S', 'Colores talla S'],
  ['colores-M', 'Colores talla M'],
  ['colores-L', 'Colores talla L'],
  ['colores-XL', 'Colores talla XL'],
  ['tabla-tallas', 'Tabla de tallas'],
  ['video-envios', 'Video de envíos por Shalom'],
  ['foto-lima', 'Foto de entregas en Lima'],
  ['video-confianza', 'Video de confianza'],
  ['audio-talla', 'Audio del seguimiento de 40 min'],
  ['video-puesto', 'Video «Así se ve puesto» (seguimiento 3 h)'],
  ['fotos-pedidos', 'Foto de pedidos de la semana (seguimiento 15 h)'],
  ['foto-despacho', 'Foto de despacho por Shalom (recordatorio Yape 3 h)'],
];

// Reconocer talla SIN IA: las mismas frases de la «Condición #2» de Botcake + números de jean.
// Aquí además se busca dentro de la frase («uso talla 30 por fa» también entra).
export const TALLAS = [
  { value: 'XS', words: ['xs', 'talla xs', 'soy xs', '26', '27', 'extra small'] },
  { value: 'S', words: ['s', 'talla s', 'soy s', '28', '29', '30', 'small', 'chica', 'pequeña'] },
  { value: 'M', words: ['m', 'talla m', 'soy m', '31', '32', '33', 'mediano', 'mediana', 'medium'] },
  { value: 'L', words: ['l', 'talla l', 'soy l', '34', '35', '36', '37', 'largue', 'large', 'grande'] },
  { value: 'XL', words: ['xl', 'talla xl', 'soy xl', '38', '39', '40', 'xxl', 'extra grande', 'extra large'] },
];

const t = (text) => ({ kind: 'text', text });
export const TALLA_OPCIONES = ['XS · Jean 26-27', 'S · Jean 28-30', 'M · Jean 31-33', 'L · Jean 34-37', 'XL · Jean 38-40'];
const f = (kind, asset, caption) => ({ kind, asset, ...(caption ? { caption } : {}) });

export function flowPantalon() {
  return {
    v: 1,
    start: 'inicio',
    nodes: [
      {
        id: 'inicio', type: 'start', x: 360, y: 40, title: 'Clienta nueva',
        trigger: { new_chat: true, ads: 'all', ad_ids: [], keywords: ['Deseo mis pantalones formales'] },
        labels: ['pantalón prod'], next: 'precios',
      },
      { id: 'precios', type: 'send', x: 360, y: 190, title: 'Producto y precios',
        items: [f('image', 'precios'), t('✨ Pantalón Formal Stretch ✨\n\n💰 1 pantalón: S/89\n💰 2 pantalones: S/139 → S/69.50 c/u\n🔥 3 pantalones: S/175 → ¡solo S/58.33 c/u! ⭐ La más elegida\n\n✅ Compra 100% segura')],
        next: 'seg' },
      { id: 'seg', type: 'action', x: 360, y: 360, title: 'Inicia seguimiento talla', ops: [{ op: 'start_seq', seq: 'seg_talla' }], next: 'talla' },
      { id: 'talla', type: 'send', x: 360, y: 490, title: '¿Qué talla usas?',
        items: [{ ...t('¿Qué talla usas normalmente? 🤗 Elígela aquí abajo o escríbeme tu talla de jean 👇'), opciones: TALLA_OPCIONES, boton: 'Elegir mi talla' }], wait: true, save_to: 'respuesta', next: 'reconocer' },
      { id: 'reconocer', type: 'recognize', x: 360, y: 640, title: 'Reconocer talla', from: 'respuesta', var: 'talla', options: TALLAS, next: 'etiqueta_talla', next_other: 'ia' },
      { id: 'etiqueta_talla', type: 'action', x: 360, y: 790, title: 'Etiqueta Talla X', ops: [{ op: 'add_label', label: 'Talla {talla}' }], next: 'colores' },
      { id: 'colores', type: 'send', x: 360, y: 920, title: 'Colores de su talla',
        items: [f('image', 'colores-{talla}'), t('¡Perfecto! 😍 Estos son los colores disponibles en tu talla {talla} 👇 ¿Cuáles te gustan más? Llevando 3 te sale a solo S/58.33 c/u 🔥')],
        wait: true, save_to: 'respuesta', next: 'ia' },
      { id: 'ia', type: 'ia', x: 360, y: 1110, title: 'IA Suyon · Ventas',
        cases: [
          { id: 'yape_sede', label: 'Yape + sede', send_reply: true, next: 'compro',
            when: 'La clienta ya dio sus datos, ya eligió su sede de Shalom y ACABA DE ENVIAR la captura (foto) de su pago del adelanto (Yape, Plin o transferencia). Sin la foto de la captura NO es este caso.' },
          { id: 'lima_ok', label: 'Lima confirmó', send_reply: true, next: 'compro',
            when: 'La clienta es de Lima CON cobertura (pago contra entrega), ya recibió el formulario de Lima y confirma que sus datos están correctos (sí, correcto, todo bien, ok o similar). NO aplica a clientas de provincia, Shalom o zonas sin cobertura.' },
          { id: 'persona', label: 'Pide persona o reclamo', send_reply: true, next: 'asesora',
            when: 'La clienta pide EXPRESAMENTE hablar con una persona, tiene un reclamo de un pedido que YA recibió, pide horario de entrega especial, pide precio menor al de por mayor, pregunta por lavado, arrugas, datos del motorizado u otros productos, o su zona de cobertura es dudosa. NO aplica si solo duda o desconfía, si quiere contra entrega o si pregunta precios, tallas, colores, tela o envíos.' },
          { id: 'yape_luego', label: 'Yapeo más tarde', send_reply: true, next: 'yape_pendiente',
            when: 'La clienta dice que pagará, yapeará o enviará la captura más tarde (ej: "te yapeo en un rato", "más tarde pago", "después te mando la captura").' },
        ],
        next: 'bucle', next_error: 'error_ia' },
      { id: 'bucle', type: 'send', x: 40, y: 1300, title: 'Bucle IA (espera respuesta)', items: [], wait: true, save_to: 'respuesta', next: 'ia' },
      { id: 'compro', type: 'handoff', x: 780, y: 930, title: 'Asesora · COMPRÓ', labels: ['ASESOR', 'COMPRÓ'], reason: 'Compró: validar pago o agendar' },
      { id: 'asesora', type: 'handoff', x: 780, y: 1080, title: 'Asesora · ASESOR', labels: ['ASESOR'], reason: 'Pidió persona o caso especial' },
      { id: 'yape_pendiente', type: 'action', x: 780, y: 1230, title: 'Yape pendiente',
        ops: [{ op: 'add_label', label: 'YAPE PENDIENTE' }, { op: 'start_seq', seq: 'rec_yape' }], next: 'bucle' },
      { id: 'error_ia', type: 'send', x: 360, y: 1340, title: 'Si la IA falla', items: [t('Estamos validando tu consulta, preciosa 😊 En un momento te respondo 💕')], next: 'asesora' },
    ],
    sequences: [
      { id: 'seg_talla', name: 'Seguimiento talla', cancel_on: 'reply', steps: [
        { after_min: 15, items: [t('Preciosa, para mostrarte los colores que te quedan, solo respóndeme con tu talla de jean 👇\n(por ejemplo: 28, 30, 32…)\n\nSi no la sabes, escríbeme TABLA y te ayudo 😊')] },
        { after_min: 40, items: [f('audio', 'audio-talla')] },
        { after_min: 180, from_h: 8, to_h: 22, items: [f('video', 'video-puesto'), { ...t('Así se ve puesto 😍 Formal para la oficina y cómodo todo el día 🙌\n\n¿Qué talla usas? Te muestro tus colores 👇'), opciones: TALLA_OPCIONES, boton: 'Elegir mi talla' }] },
        { after_min: 900, from_h: 8, to_h: 22, items: [f('image', 'fotos-pedidos'), t('Estos son algunos pedidos que salieron esta semana 📦💕\n\nTodavía puedes separar el tuyo con envío gratis a todo el Perú 🚚\n\nSolo dime tu talla de jean y te ayudo 😊')] },
      ] },
      { id: 'rec_yape', name: 'Recordatorio Yape', cancel_on: 'image', steps: [
        { after_min: 60, from_h: 8, to_h: 22, items: [t('Preciosa, no te olvides de tu moradito 💜 Apenas me envíes la captura, separo tus pantalones 🙌')] },
        { after_min: 180, from_h: 8, to_h: 22, items: [f('image', 'foto-despacho'), t('Así estamos despachando hoy por Shalom 📦🚚 Envíame la captura de tu Yape y tu pedido sale en el próximo despacho 💕')] },
      ] },
    ],
  };
}

/* =================== Plantilla «Ventas Control Total» (asistente de Jordan) =================== */
// Responde dudas del plan y lleva a la demo o a la prueba gratis. Los precios salen del Panel ({precio_base}…).

export const PROMPT_VENTAS_CT = `AHORA: {ahora}

Eres el asistente de ventas de Control Total por WhatsApp. Atiendes a dueños de tiendas (sobre todo de ropa) que quieren vender por WhatsApp de forma automática. Detrás está Jordan, que creó el sistema vendiendo ropa por WhatsApp con su propia marca. No nombres sus marcas.

TU OBJETIVO
1. Entender qué vende la persona y cómo vende hoy (anuncios, cuántos chats al día, si tiene asesoras).
2. Resolver sus dudas con la información de CONOCIMIENTO.
3. Llevarla a UNA de dos cosas: agendar una demo de 30 minutos ({enlace_demo}) o crear su cuenta gratis ({enlace_registro}).

CÓMO ESCRIBES
- Español de Perú, tuteo, cercano y claro. Sin jerga técnica.
- Mensajes cortos: máximo 2 o 3 por respuesta, de 1 a 3 líneas cada uno. Pocos emojis.
- Termina casi siempre con una pregunta o con el siguiente paso.
- Si te preguntan por algo que no está en CONOCIMIENTO, NO lo inventes: di que lo confirmas con Jordan y usa el caso "persona".
- Nunca prometas resultados de ventas ni des cifras de otras tiendas.
- Nunca pidas datos de tarjeta ni contraseñas.

PRECIOS (en soles; no los cambies ni inventes descuentos)
- Prueba gratis de {dias_prueba} días, sin tarjeta.
{tabla_precios}
- Los extras (números y trabajadoras) se pagan cada mes junto con el plan, no es un pago único.
- Ejemplo para explicar el pack: si quiere 1 número más y 1 trabajadora más, son 2 extras y cada uno sale más barato que si llevara solo uno.
- Si te pide la cuenta exacta, súmala con estos precios y muéstrala corta (al mes y total a pagar). Si no estás seguro, manda la calculadora: {enlace_web}#precios
- Aparte, directo a cada proveedor: lo que Meta cobra por los mensajes y el consumo de la IA.
- Si pide un descuento distinto o precio especial: usa el caso "persona".

CUÁNDO MANDAR CADA ENLACE
- Quiere verlo funcionando, tiene dudas de su caso o vende mucho → demo: {enlace_demo}
- Quiere probar ya por su cuenta → cuenta gratis: {enlace_registro}
- Quiere leer todo con calma → {enlace_web}`;

export const KNOWLEDGE_VENTAS_CT = `CONTROL TOTAL · LO QUE HACE
- Bandeja de WhatsApp para todo el equipo: cada persona con su usuario y su rol (dueño, asesora, despacho Lima, despacho provincia). La asesora no ve utilidades ni configuración.
- Bot sin IA: manda foto y precios al instante, reconoce tallas (también números de jean) y colores con sus sinónimos, pone etiquetas y manda los colores de cada talla. Botones y listas para tocar.
- IA con las reglas de la tienda: conversa, responde dudas de envío y producto, arma el pedido y pasa a la asesora cuando hay que cobrar o hay un caso especial. Si la IA duda, pasa a la asesora; no manda mensajes raros.
- Seguimientos automáticos si la clienta no responde (texto, audio, video), que se cancelan solos cuando responde y respetan horario.
- Notas de voz pasadas a texto.
- Franja «personas para llamar» (Yape pendiente, Lima por confirmar) con resultado de cada llamada.
- Pedidos: Lima contra entrega y provincia por agencia (Shalom) con sus estados, botón «Copiar orden» para el grupo de reparto, vista por día, avisos automáticos a la clienta.
- Clientes: tabla con lo que compró cada una, grupos (nuevas, frecuentes, VIP, para reactivar), Excel.
- Reportes: mensajes, conversaciones, pedidos, tasa de cierre, tallas, colores, distritos y ventas por anuncio.
- Compras a Meta: cada pedido avisa a Meta de qué anuncio vino, para que las campañas aprendan de ventas reales.
- Shopify: para tiendas que venden en su web (confirmar pedidos por WhatsApp, carritos abandonados).
- Editor de flujo con bloques, con números por bloque, y simulador para probar antes de encenderlo.
- Varias tiendas y números en una sola cuenta. Funciona en PC y celular (se instala desde el navegador).

PREGUNTAS FRECUENTES
- ¿Es la API oficial? Sí, la API oficial de WhatsApp de Meta. Nada de programas piratas.
- ¿Puedo seguir usando WhatsApp Business en el celular? Sí, se puede conectar en modo coexistencia y seguir usando la app con el mismo número.
- ¿Mi número está en otra herramienta (otro CRM o bot)? Hay que desconectarlo de esa herramienta antes de pasarlo. Lo vemos juntos en la demo.
- ¿Cómo conecto mi número? Lo hacemos juntos en la demo o al empezar: toma unos minutos.
- ¿Cuánto cobra Meta? Meta cobra aparte, directo a tu tarjeta, según el tipo de mensaje. Si la clienta llega por un anuncio de clic a WhatsApp y respondes dentro de las primeras 24 h, los mensajes de los siguientes 3 días son gratis. El sistema muestra cuándo un chat está en esa ventana.
- ¿Necesito saber de IA o programar? No. Hay una plantilla para vender ropa y solo cambias precios, tallas, colores y fotos.
- ¿Me pueden bloquear el número? Las reglas son las mismas que para cualquier herramienta oficial. Lo que causa bloqueos es que te reporten o mandar mensajes masivos a quien no te escribió.
- ¿Puedo cancelar? No hay contrato: puede cancelar la renovación cuando quiera y sigue usando lo que pagó hasta que termine. Lo ya pagado no se devuelve. Si se equivocó de plan (ej. pagó 6 meses y quería 3), que escriba por WhatsApp dentro de las 48 horas: se le cambia al plan correcto y se le devuelve la diferencia. Para cualquier devolución usa el caso "persona".
- ¿Sirve para otros productos? Está pensado para ropa, calzado y accesorios (tallas y colores), pero sirve para cualquier tienda que venda por WhatsApp. Si es otro rubro, recomiéndale la demo.
- ¿Quién ve mis chats? Solo su equipo, cada uno con su usuario.
- La demo es una videollamada de 30 minutos con Jordan: elige día y hora en {enlace_demo}.`;

export function flowVentasCT(web = 'https://controltotalecom.com') {
  const demo = `${web}/inicio#demo`;
  return {
    v: 1,
    start: 'inicio',
    nodes: [
      { id: 'inicio', type: 'start', x: 360, y: 40, title: 'Persona nueva',
        trigger: { new_chat: true, ads: 'all', ad_ids: [], keywords: ['control total', 'quiero información', 'demo'] }, labels: ['INTERESADO'], next: 'hola' },
      { id: 'hola', type: 'send', x: 360, y: 190, title: 'Bienvenida',
        items: [{ ...t('¡Hola! 👋 Soy el asistente de Control Total, el sistema para vender por WhatsApp en automático: bot, IA, pedidos y reportes en un solo lugar.\n\n¿Qué te gustaría saber?'),
          opciones: ['¿Qué hace? · Bot, IA, pedidos y reportes', 'Precios · Plan y prueba gratis', 'Agendar demo · 30 min por videollamada', 'Probar gratis · Crear mi cuenta', 'Hablar con Jordan'], boton: 'Ver opciones' }],
        next: 'seg' },
      { id: 'seg', type: 'action', x: 360, y: 340, title: 'Inicia seguimiento', ops: [{ op: 'start_seq', seq: 'seg_demo' }], next: 'espera' },
      { id: 'espera', type: 'send', x: 360, y: 470, title: 'Espera su respuesta', items: [], wait: true, save_to: 'respuesta', next: 'ia' },
      { id: 'ia', type: 'ia', x: 360, y: 620, title: 'IA · Ventas Control Total',
        cases: [
          { id: 'persona', label: 'Quiere hablar con Jordan', send_reply: true, next: 'asesora',
            when: 'La persona pide hablar con Jordan o con una persona, pide descuento o precio especial, tiene un problema con su cuenta, o pregunta algo que no está en la información.' },
          { id: 'contratar', label: 'Quiere contratar', send_reply: true, next: 'contratar',
            when: 'La persona ya decidió contratar o pagar el plan, o pregunta cómo pagar.' },
        ],
        next: 'bucle', next_error: 'error_ia' },
      { id: 'bucle', type: 'send', x: 40, y: 800, title: 'Bucle IA (espera respuesta)', items: [], wait: true, save_to: 'respuesta', next: 'ia' },
      { id: 'asesora', type: 'handoff', x: 780, y: 560, title: 'Pasa a Jordan', labels: ['ASESOR'], reason: 'Quiere hablar con Jordan' },
      { id: 'contratar', type: 'handoff', x: 780, y: 720, title: 'Quiere contratar', labels: ['ASESOR', 'QUIERE PLAN'], reason: 'Quiere contratar el plan' },
      { id: 'error_ia', type: 'send', x: 360, y: 860, title: 'Si la IA falla', items: [t('Dame un momento, te respondo enseguida 😊')], next: 'asesora' },
    ],
    sequences: [
      { id: 'seg_demo', name: 'Seguimiento demo', cancel_on: 'reply', steps: [
        { after_min: 30, items: [t(`¿Te quedó alguna duda? 😊 Si quieres, te lo muestro funcionando en una videollamada de 30 minutos. Elige el día y la hora aquí 👉 ${demo}`)] },
        { after_min: 1200, from_h: 9, to_h: 21, items: [t(`Hola 👋 Por si te sirve: puedes probar Control Total gratis, sin tarjeta 👉 ${web}/registro\n\nO si prefieres que te lo muestre, agenda tu demo 👉 ${demo}`)] },
      ] },
    ],
  };
}

/* =================== Asistente de inicio («Arma tu bot») =================== */
// Para alumnos: responden preguntas sobre su producto y con eso se arma el prompt, el conocimiento y el flujo,
// en el MISMO orden del abordaje de Jordan: foto + precios → pregunta → seguimientos (15 min texto, 40 min audio,
// 3 h video, 15 h fotos de pedidos) → IA → asesora. Dos rubros: ropa (tallas y colores) y simple (sin variantes).

const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
const soles = (n) => `S/${Number(n) % 1 ? Number(n).toFixed(2) : Number(n)}`;
const err = (m) => Object.assign(new Error(m), { status: 400 });

// Tallas que escribió el alumno: «S · Jean 28-30», «M», o «S, M, L» en una línea
export function parseTallas(text) {
  const parts = String(text || '').split(/\n|,(?![^(]*\))/).map((x) => x.trim()).filter(Boolean).slice(0, 10);
  const out = [];
  for (const p of parts) {
    const code = p.split(/\s*[·:(]\s*|\s+-\s+/)[0].trim().toUpperCase().slice(0, 10);
    if (!code || out.some((t) => t.value === code)) continue;
    const words = new Set([code.toLowerCase(), `talla ${code.toLowerCase()}`, `soy ${code.toLowerCase()}`]);
    for (const w of (TALLAS.find((t) => t.value === code)?.words || [])) words.add(w);
    const rest = p.slice(code.length);
    for (const m of rest.matchAll(/(\d{1,3})\s*(?:-|a|al)\s*(\d{1,3})/g)) {
      const [x, y] = [Number(m[1]), Number(m[2])];
      if (y >= x && y - x <= 15) for (let n = x; n <= y; n++) words.add(String(n));
    }
    for (const m of rest.matchAll(/\b\d{1,3}\b/g)) words.add(m[0]);
    out.push({ value: code, label: p.slice(0, 60), words: [...words] });
  }
  return out;
}

export function cleanAsistente(b = {}, rubro = 'simple') {
  const s = (v, n) => String(v ?? '').trim().slice(0, n);
  const yes = (v, d) => (v === undefined ? d : v === true || v === 1 || v === '1' || v === 'si');
  const precios = {};
  for (const k of ['1', '2', '3', '4']) {
    const v = Number(String(b.precios?.[k] ?? '').replace(',', '.'));
    if (v > 0) precios[k] = Math.round(v * 100) / 100;
  }
  const a = {
    marca: s(b.marca, 60), producto: s(b.producto, 60), descripcion: s(b.descripcion, 800), beneficios: s(b.beneficios, 800),
    precios, envio: s(b.envio, 120) || 'Envío gratis',
    lima: yes(b.lima, true), provincia: yes(b.provincia, true),
    adelanto: Math.max(0, Math.min(500, Math.round(Number(b.adelanto ?? 30) || 0))),
    faq: s(b.faq, 3000), garantia: s(b.garantia, 300), trato: b.trato === 'neutral' ? 'neutral' : 'cercano',
    palabra: s(b.palabra, 80),
  };
  if (rubro === 'ropa') {
    a.tallas = s(b.tallas, 400);
    a.colores = s(b.colores, 400);
    a.tela = s(b.tela, 200);
    if (!parseTallas(a.tallas).length) throw err('Escribe las tallas que vendes (ej: S, M, L).');
    if (!a.colores) throw err('Escribe los colores que vendes.');
  }
  if (!a.producto) throw err('Escribe el nombre de tu producto.');
  if (!a.precios['1']) throw err('Pon al menos el precio por 1 unidad.');
  if (!a.lima && !a.provincia) throw err('Marca si vendes en Lima, en provincia o en los dos.');
  return a;
}

const unidad = (rubro, n) => (rubro === 'ropa' ? (n === 1 ? 'prenda' : 'prendas') : n === 1 ? 'unidad' : 'unidades');

function preciosText(a, rubro) {
  const ks = Object.keys(a.precios).map(Number).sort((x, y) => x - y);
  const best = ks.length > 1 ? ks[ks.length - 1] : 0;
  return ks.map((k) => `${k === best && k > 1 ? '🔥' : '💰'} ${k} ${unidad(rubro, k)}: ${soles(a.precios[k])}${k > 1 ? ` → ${soles(a.precios[k] / k)} c/u` : ''}${k === best && k > 1 ? ' ⭐' : ''}`).join('\n');
}

// Archivos que el asistente le pide al alumno. ref = clave de la imagen de referencia (Panel Suyon → Referencias).
export function assetsFor(rubro, a = {}) {
  const tallas = rubro === 'ropa' ? parseTallas(a.tallas) : [];
  const L = [];
  const add = (key, desc, need, ref, cuando) => L.push({ key, desc, need, ref, cuando });
  add('precios', rubro === 'ropa' ? 'Imagen de abordaje: tu prenda con los precios de la promoción' : 'Imagen de abordaje: tu producto con los precios de la promoción', 'si', `${rubro}:precios`, 'Primer mensaje, apenas te escriben');
  if (rubro === 'ropa') {
    add('tabla-tallas', 'Tabla de tallas', 'si', 'ropa:tabla-tallas', 'La IA la manda si duda de su talla');
    for (const t of tallas) add(`colores-${t.value}`, `Colores disponibles en talla ${t.value}`, 'si', 'ropa:colores', 'Apenas dice su talla');
  } else {
    add('producto', 'Foto del producto de cerca (detalles, empaque)', 'recomendado', 'simple:producto', 'La IA la manda si quiere ver más');
  }
  add('audio-seguimiento', 'Nota de voz tuya invitando a comprar (30 a 40 segundos)', 'recomendado', `${rubro}:audio-seguimiento`, 'Seguimiento de 40 min si no responde');
  add(rubro === 'ropa' ? 'video-puesto' : 'video-producto', rubro === 'ropa' ? 'Video «Así se ve puesto»' : 'Video del producto en uso', 'recomendado', `${rubro}:video`, 'Seguimiento de 3 h y cuando la IA lo necesite');
  add('fotos-pedidos', 'Foto de pedidos listos para enviar', 'recomendado', `${rubro}:fotos-pedidos`, 'Seguimiento de 15 h (da confianza)');
  if (a.lima !== false) add('confianza-lima', 'Foto o video de entregas en Lima (motorizado, clientas recibiendo)', 'recomendado', `${rubro}:confianza-lima`, 'La IA lo manda si desconfía (Lima)');
  if (a.provincia !== false) {
    add('confianza-provincia', 'Video de envíos por Shalom a provincia', 'recomendado', `${rubro}:confianza-provincia`, 'La IA lo manda si desconfía (provincia)');
    add('foto-despacho', 'Foto de despacho en la agencia', 'recomendado', `${rubro}:foto-despacho`, 'Recordatorio si no manda la captura');
  }
  return L;
}

// De qué archivo de la tienda de Jordan sale cada referencia («Tomar de mi tienda»)
export const REF_FROM_STORE = {
  'ropa:precios': 'precios', 'ropa:tabla-tallas': 'tabla-tallas', 'ropa:colores': 'colores-M', 'ropa:audio-seguimiento': 'audio-talla',
  'ropa:video': 'video-puesto', 'ropa:fotos-pedidos': 'fotos-pedidos', 'ropa:confianza-lima': 'foto-lima', 'ropa:confianza-provincia': 'video-envios', 'ropa:foto-despacho': 'foto-despacho',
  'simple:audio-seguimiento': 'audio-talla', 'simple:fotos-pedidos': 'fotos-pedidos', 'simple:confianza-lima': 'foto-lima', 'simple:confianza-provincia': 'video-envios', 'simple:foto-despacho': 'foto-despacho',
};
export const REF_KEYS = [
  ['ropa:precios', 'Ropa · Abordaje (foto + precios)'], ['ropa:tabla-tallas', 'Ropa · Tabla de tallas'], ['ropa:colores', 'Ropa · Colores de una talla'],
  ['ropa:audio-seguimiento', 'Ropa · Nota de voz'], ['ropa:video', 'Ropa · Video «Así se ve puesto»'], ['ropa:fotos-pedidos', 'Ropa · Pedidos listos'],
  ['ropa:confianza-lima', 'Ropa · Confianza Lima'], ['ropa:confianza-provincia', 'Ropa · Confianza provincia'], ['ropa:foto-despacho', 'Ropa · Despacho Shalom'],
  ['simple:precios', 'Sin variantes · Abordaje (producto + promoción)'], ['simple:producto', 'Sin variantes · Producto de cerca'],
  ['simple:audio-seguimiento', 'Sin variantes · Nota de voz'], ['simple:video', 'Sin variantes · Video del producto en uso'], ['simple:fotos-pedidos', 'Sin variantes · Pedidos listos'],
  ['simple:confianza-lima', 'Sin variantes · Confianza Lima'], ['simple:confianza-provincia', 'Sin variantes · Confianza provincia'], ['simple:foto-despacho', 'Sin variantes · Despacho Shalom'],
];

export function promptAsistente(a, rubro) {
  const ropa = rubro === 'ropa';
  const tallas = ropa ? parseTallas(a.tallas) : [];
  const trato = a.trato === 'cercano' ? 'Trato cercano y cálido, de tú, con 1 emoji por mensaje como máximo.' : 'Trato amable y respetuoso, de tú, sin apodos y con pocos emojis.';
  const destinos = a.lima && a.provincia ? 'si es para Lima o provincia, y su distrito o ciudad' : a.lima ? 'su distrito de Lima' : 'su ciudad o provincia';
  let n = 0;
  const paso = (x) => `${++n}. ${x}`;
  const pasos = [
    ropa ? paso('Si todavía no sabes su talla, pregúntala (tallas: ' + tallas.map((t) => t.label).join(' · ') + '). Si duda, adjunta la tabla de tallas.') : null,
    ropa ? paso('Con la talla, pregunta qué colores le gustan (colores: ' + a.colores + '). Si pide un color que no está, ofrece los que sí hay.') : null,
    paso(`Pregunta cuántas ${unidad(rubro, 2)} quiere y recomienda la promoción más grande cuando dude.`),
    paso(`Pregunta ${destinos}.`),
    a.lima ? paso(`LIMA (contra entrega: paga al recibir): pide en UN solo mensaje nombre y apellido, celular, dirección y referencia. Con los datos manda el FORMULARIO LIMA y pregunta si está todo correcto. Llega {entrega}, {horario_entrega}. Si su distrito no tiene cobertura, va por agencia como provincia.`) : null,
    a.provincia ? paso(`${a.lima ? 'PROVINCIA o Lima sin cobertura' : 'PROVINCIA'} (agencia Shalom${a.adelanto ? `, separa con un adelanto de ${soles(a.adelanto)} y el resto lo paga al recoger` : ''}): pide en UN solo mensaje nombre y apellido, DNI y celular. Luego pregunta en qué agencia recoge (el sistema le manda la lista para tocar). Con la agencia elegida manda el FORMULARIO SHALOM y, en otro mensaje, el PAGO${a.adelanto ? ' DEL ADELANTO' : ''}. Después espera la captura.`) : null,
  ].filter(Boolean);
  const item = ropa ? `[cantidad] ${a.producto} · Talla [talla] · [colores]` : `${a.producto} × [cantidad]`;
  return `AHORA (hora de la tienda): {ahora}

Eres la asesora de ventas por WhatsApp de ${a.marca || 'la tienda'}. Vendes SOLO ${a.producto}. ${trato}
Mensajes cortos: de 1 a 3 líneas cada uno, máximo 3 mensajes por respuesta. Una pregunta a la vez. Termina casi siempre con una pregunta o con el siguiente paso.
Nunca inventes precios, promociones, stock, colores, tallas ni plazos que no estén aquí.

## PRODUCTO
${a.producto}${a.descripcion ? `\n${a.descripcion}` : ''}${a.tela ? `\nTela / material: ${a.tela}` : ''}${a.beneficios ? `\nBeneficios:\n${lines(a.beneficios).map((x) => `- ${x}`).join('\n')}` : ''}${ropa ? `\nTallas: ${tallas.map((t) => t.label).join(' · ')}\nColores: ${a.colores}` : ''}${a.garantia ? `\nGarantía / cambios: ${a.garantia}` : ''}

## PRECIOS
${preciosText(a, rubro)}
${a.envio}.
No hay otros descuentos. Si pide un precio menor, usa el caso "persona".

## CÓMO VENDES (en este orden; si ya tienes un dato, no lo vuelvas a pedir)
${pasos.join('\n')}

## FORMULARIOS (cópialos tal cual, cambiando lo que está entre [ ])
${a.lima ? `FORMULARIO LIMA:
Envío para: Lima 📦
➡️ Nombre: [nombre y apellido]
➡️ Celular: [celular]
➡️ Dirección: [dirección] · Referencia: [referencia]
➡️ Distrito: [distrito]
✅ ${item}
💰 Total: S/[total] (pagas al recibir)
🚚 Llega: {entrega}, {horario_entrega}

` : ''}${a.provincia ? `FORMULARIO SHALOM:
🚚 Envío Shalom: [ciudad]
➡️ Nombre: [nombre y apellido]
➡️ DNI: [DNI]
➡️ CEL: [celular]
➡️ Sede: [sede elegida]
✅ ${item}
💰 Monto total: S/[total]${a.adelanto ? `\nAdelanto: ${soles(a.adelanto)}\nMonto restante: S/[total - ${a.adelanto}] (lo pagas al recoger)` : ''}

PAGO (mensaje aparte, después del formulario):
👉 Yape / Plin: {yape}
A nombre de: {titular}
Envíame la captura para separar tu pedido 📦
(Solo si pide transferencia: BCP {bcp} · CCI {cci} · a nombre de {titular})

` : ''}## ARCHIVOS (adjúntalos por su clave cuando ayuden; solo si están en ARCHIVOS DISPONIBLES)
${ropa ? '- tabla-tallas: si duda de su talla.\n- video-puesto: si quiere ver cómo queda puesto.\n' : '- producto: si quiere ver el producto de cerca.\n- video-producto: si quiere verlo en uso.\n'}${a.lima ? '- confianza-lima: si es de Lima y desconfía o pregunta cómo entregan.\n' : ''}${a.provincia ? '- confianza-provincia: si es de provincia y desconfía o pregunta cómo envían.\n' : ''}- fotos-pedidos: si duda de que la tienda sea real.

## REGLAS
- Si pregunta algo que no está aquí ni en CONOCIMIENTO, dile que lo consultas y usa el caso "persona".
- No hables de otros productos ni de temas ajenos a la compra.
- No pidas datos de tarjeta ni contraseñas.`;
}

export function knowledgeAsistente(a) {
  const faq = lines(a.faq);
  return faq.length ? `PREGUNTAS FRECUENTES (respóndelas con esta información, cortito):\n${faq.join('\n')}` : '';
}

// El flujo en el orden del abordaje de Jordan
export function flowAsistente(a, rubro) {
  const ropa = rubro === 'ropa';
  const tallas = ropa ? parseTallas(a.tallas) : [];
  const o = (kind, asset, caption) => ({ kind, asset, opcional: true, ...(caption ? { caption } : {}) });
  const nombre = a.producto;
  const cerc = a.trato === 'cercano';
  const promoOpts = Object.keys(a.precios).map(Number).sort((x, y) => x - y).map((k) => `${k} ${unidad(rubro, k)} · ${soles(a.precios[k])}`);
  const tallaOpts = tallas.map((t) => t.label.slice(0, 60));
  const preguntaTalla = { ...t(`¿Qué talla usas? ${cerc ? '🤗 ' : ''}Elígela aquí abajo 👇`), opciones: tallaOpts, boton: 'Elegir mi talla' };
  const preguntaCant = { ...t(`¿Cuántas ${unidad(rubro, 2)} te gustaría? ${cerc ? '😊' : ''}`.trim()), opciones: promoOpts.slice(0, 10), boton: 'Elegir' };
  const cases = [];
  if (a.provincia) cases.push({ id: 'yape_sede', label: 'Pagó + agencia', send_reply: true, next: 'compro',
    when: 'La clienta ya dio sus datos, ya eligió su agencia de Shalom y ACABA DE ENVIAR la captura (foto) de su pago. Sin la foto de la captura NO es este caso.' });
  if (a.lima) cases.push({ id: 'lima_ok', label: 'Lima confirmó', send_reply: true, next: 'compro',
    when: 'La clienta es de Lima con cobertura (pago contra entrega), ya recibió el FORMULARIO LIMA y confirma que sus datos están correctos (sí, correcto, ok o similar). NO aplica a provincia ni a agencia.' });
  cases.push({ id: 'persona', label: 'Pide persona o reclamo', send_reply: true, next: 'asesora',
    when: 'La clienta pide EXPRESAMENTE hablar con una persona, tiene un reclamo de un pedido que ya recibió, pide un precio menor o pregunta algo que no está en tu información. NO aplica si solo duda o pregunta precios o envíos.' });
  if (a.provincia) cases.push({ id: 'yape_luego', label: 'Pago más tarde', send_reply: true, next: 'yape_pendiente',
    when: 'La clienta dice que pagará o enviará la captura más tarde (ej: "te yapeo en un rato", "más tarde pago").' });
  const nodes = [
    { id: 'inicio', type: 'start', x: 360, y: 40, title: 'Clienta nueva', trigger: { new_chat: true, ads: 'all', ad_ids: [], keywords: a.palabra ? [a.palabra] : [] }, labels: [], next: 'precios' },
    { id: 'precios', type: 'send', x: 360, y: 190, title: 'Producto y precios',
      items: [{ kind: 'image', asset: 'precios' }, t(`✨ ${nombre} ✨\n\n${preciosText(a, rubro)}\n\n🚚 ${a.envio}\n✅ Compra 100% segura`)], next: 'seg' },
    { id: 'seg', type: 'action', x: 360, y: 360, title: 'Inicia seguimiento', ops: [{ op: 'start_seq', seq: 'seg_venta' }], next: 'pregunta' },
  ];
  if (ropa) {
    nodes.push(
      { id: 'pregunta', type: 'send', x: 360, y: 490, title: '¿Qué talla usas?', items: [preguntaTalla], wait: true, save_to: 'respuesta', next: 'reconocer' },
      { id: 'reconocer', type: 'recognize', x: 360, y: 640, title: 'Reconocer talla', from: 'respuesta', var: 'talla', options: tallas.map(({ value, words }) => ({ value, words })), next: 'etiqueta_talla', next_other: 'ia' },
      { id: 'etiqueta_talla', type: 'action', x: 360, y: 790, title: 'Etiqueta Talla X', ops: [{ op: 'add_label', label: 'Talla {talla}' }], next: 'colores' },
      { id: 'colores', type: 'send', x: 360, y: 920, title: 'Colores de su talla',
        items: [{ kind: 'image', asset: 'colores-{talla}' }, t(`¡Perfecto! ${cerc ? '😍 ' : ''}Estos son los colores disponibles en talla {talla} 👇 ¿Cuáles te gustan más?`)],
        wait: true, save_to: 'respuesta', next: 'ia' },
    );
  } else {
    nodes.push({ id: 'pregunta', type: 'send', x: 360, y: 490, title: '¿Cuántas quiere?', items: [preguntaCant], wait: true, save_to: 'respuesta', next: 'ia' });
  }
  const y0 = ropa ? 1110 : 660;
  nodes.push(
    { id: 'ia', type: 'ia', x: 360, y: y0, title: `IA · Ventas ${nombre}`.slice(0, 60), cases, next: 'bucle', next_error: 'error_ia' },
    { id: 'bucle', type: 'send', x: 40, y: y0 + 190, title: 'Bucle IA (espera respuesta)', items: [], wait: true, save_to: 'respuesta', next: 'ia' },
    { id: 'compro', type: 'handoff', x: 780, y: y0 - 180, title: 'Asesora · COMPRÓ', labels: ['ASESOR', 'COMPRÓ'], reason: 'Compró: validar pago o agendar' },
    { id: 'asesora', type: 'handoff', x: 780, y: y0 - 30, title: 'Asesora · ASESOR', labels: ['ASESOR'], reason: 'Pidió persona o caso especial' },
    { id: 'error_ia', type: 'send', x: 360, y: y0 + 230, title: 'Si la IA falla', items: [t(`Estamos validando tu consulta ${cerc ? '😊 ' : ''}En un momento te respondo.`)], next: 'asesora' },
  );
  if (a.provincia) nodes.push({ id: 'yape_pendiente', type: 'action', x: 780, y: y0 + 120, title: 'Pago pendiente', ops: [{ op: 'add_label', label: 'YAPE PENDIENTE' }, { op: 'start_seq', seq: 'rec_pago' }], next: 'bucle' });
  const pide = ropa ? 'Solo dime tu talla y te muestro tus colores 👇' : `Dime cuántas ${unidad(rubro, 2)} quieres y te ayudo 👇`;
  const sequences = [
    { id: 'seg_venta', name: 'Seguimiento de venta', cancel_on: 'reply', steps: [
      { after_min: 15, items: [ropa ? { ...t(`Para mostrarte los colores que tenemos en tu talla, solo respóndeme con tu talla 👇`), opciones: tallaOpts, boton: 'Elegir mi talla' } : { ...t(`¿Te quedó alguna duda sobre ${nombre}? ${pide}`), opciones: promoOpts.slice(0, 10), boton: 'Elegir' }] },
      { after_min: 40, items: [o('audio', 'audio-seguimiento')] },
      { after_min: 180, from_h: 8, to_h: 22, items: [o('video', ropa ? 'video-puesto' : 'video-producto'), ropa ? { ...t(`Así se ve puesto ${cerc ? '😍' : ''}\n\n¿Qué talla usas? Te muestro tus colores 👇`), opciones: tallaOpts, boton: 'Elegir mi talla' } : t(`Así funciona ${nombre} ${cerc ? '😍' : ''}\n\n${pide}`)] },
      { after_min: 900, from_h: 8, to_h: 22, items: [o('image', 'fotos-pedidos'), t(`Estos son algunos pedidos que salieron esta semana 📦\n\nTodavía puedes separar el tuyo: ${a.envio.toLowerCase()} 🚚\n\n${pide}`)] },
    ] },
  ];
  if (a.provincia) sequences.push({ id: 'rec_pago', name: 'Recordatorio de pago', cancel_on: 'image', steps: [
    { after_min: 60, from_h: 8, to_h: 22, items: [t(`No te olvides de enviarme la captura de tu pago para separar tu pedido ${cerc ? '🙌' : ''}`.trim())] },
    { after_min: 180, from_h: 8, to_h: 22, items: [o('image', 'foto-despacho'), t('Así estamos despachando hoy por Shalom 📦 Envíame la captura y tu pedido sale en el próximo despacho.')] },
  ] });
  return { v: 1, start: 'inicio', nodes, sequences };
}

// Prompt por defecto de una tienda de alumno que todavía no pasó por el asistente (sin datos de ninguna marca)
export const PROMPT_GENERICO = `AHORA (hora de la tienda): {ahora}

Eres la asesora de ventas por WhatsApp de esta tienda. Trato amable y cercano, de tú. Mensajes cortos (1 a 3 líneas) y una pregunta a la vez.
Responde solo con la información de CONOCIMIENTO y de este prompt. Si te preguntan algo que no está aquí (precios, stock, envíos), no lo inventes: di que lo consultas y usa el caso "persona".
Para armar un pedido pide en UN solo mensaje: nombre y apellido, celular, dirección o ciudad, y lo que quiere comprar. Luego pasa el caso que corresponda.
(Completa este prompt con «✨ Asistente» en Bot Suyon AI o escríbelo aquí.)`;
