# Suyon CRM — contexto del proyecto

CRM propio de Jordan Suyon (Perú) para vender por WhatsApp. Reemplaza Pancake (bandeja) + Botcake (bot/IA) + Pancake POS (pedidos/CAPI). Primero para sus tiendas; más adelante se venderá a sus alumnos (multi-empresa desde el día 1).

## Cómo trabajar con Jordan
- Español, frases cortas, sin jerga técnica. Pasos numerados cuando él tenga que hacer algo.
- Él no es programador: tú escribes, pruebas y subes el código; él solo hace clics en Meta/Cloudflare cuando haga falta.
- **Nunca** pedir ni escribir claves (tokens de WhatsApp, OpenAI, Cloudflare) en el chat ni en el repo. Él las pone como secretos en Cloudflare (`wrangler secret` / dashboard).
- No guardar en el repo datos de pago del negocio (Yape/Plin, cuentas): son configuración por tienda en la base de datos.

## Stack decidido
- **Cloudflare Workers** (API + webhook de Meta) · **D1** (base de datos `suyon-crm-db`, database_id `e329743f-686b-4721-b078-1bdd2999d816`, cuenta Cloudflare storesuyo@gmail.com) · **R2** (fotos/audios/videos) · Cron Triggers / Queues para seguimientos.
- **WhatsApp Cloud API** oficial con app propia de Meta **"SUYON CRM"** (tipo Integrar con la API, en modo desarrollo; se publica en Fase 1 — necesita URL de política de privacidad, la servimos desde el Worker).
- **IA Suyon**: proveedor elegible por tienda (OpenAI o Anthropic). Precios vistos 2 nov 2026 por millón de tokens: GPT-5 mini US$0.25 entrada / US$2.00 salida; Claude Haiku 5.5 US$0.10 / US$0.50 (hasta 100K de prompt; caché hasta −90%). Plan: arrancar con Haiku 5.5 y comparar con chats reales. Clave propia por tienda, tope diario de gasto.
- **Meta CAPI**: evento Compra al **crear** el pedido (no al confirmar), con el ID del anuncio de origen (referral de Click-to-WhatsApp).
- Front: app web instalable (PWA), PC y celular. Diseño de referencia: `docs/prototipo.html` (también publicado como artifact).

## Modelo de datos (multi-tenant)
- **Empresa** (Porte Perú, Orión…) → **Tiendas** = un número de WhatsApp cada una (Porte · Pantalón formal, Porte · Leggings cargo, Orión · Polos y pijamas). Todo es por tienda: chats, pedidos, bot, prompt IA, archivos, saldo/clave OpenAI, stock, respuestas rápidas, etiquetas.
- Selector de tienda arriba a la izquierda (debajo de "Suyon CRM").
- **Roles**: Dueño (todo) · Asesora (chats, pedidos y sus métricas; SIN configuración, gastos ni utilidades) · Despacho (pedidos) · Despacho provincia (pedidos provincia + guías Shalom). Acceso por invitación con correo.

## Número piloto
- Número del **"pantalón de rayas"** (producto que no pegó): ya registrado en la API vía Pancake, **sin anuncios**. Jordan lo desconectará de Botcake/Pancake.
- OJO: antes de quitar a Pancake como socio en Meta, verificar que ese número **no comparta cuenta de WhatsApp (WABA)** con el número principal del pantalón formal; si la comparte, solo quitarlo de Pancake/Botcake.
- Al ser solo-API no tiene coexistencia. El chip nuevo del cargo sí debe entrar con **coexistencia** (app WhatsApp Business + API) para mandar guías gratis desde el celular.
- Piloto necesita tráfico: campaña chica de clic a WhatsApp (~S/20–30/día).

## Número piloto conectado (datos públicos, no son claves)
- +51 941 010 752 · AHORA (desde 2 nov 15:25) en cuenta de mensajes propia **"Orión" `4467572743460773`** · phone_number_id **`1438552302669955`** (portafolio Orión, business `27970507489211613`). Antes estaba en "Orión - Pancake Singapore" `2306137423565969` (phone id `1395172913681493`), con línea de crédito de Pancake (CAKE COMM PTE. LTD.) → no se podía enviar (código 10). Se borró y se volvió a agregar.
- Límite Meta sin verificar: 2 números por empresa al agregar desde la app (sube a 20 con verificación).
- OJO Meta 2026: la "cuenta de WhatsApp" del número (`1434395304770204`, la que sale en Configuración del negocio → Cuentas de WhatsApp) NO sirve para `subscribed_apps` ("This API is not supported for this WhatsApp Business Account"). Hay que usar la **cuenta de mensajes** (Messaging accounts → Linked accounts) y asignársela al usuario del sistema con acceso total.
- RESUELTO 2 nov 15:39: con la cuenta propia (ownership_type SELF) recibir y ENVIAR funcionan. Lección: un número dado de alta con el botón de Pancake queda en una cuenta con línea de crédito de Pancake → otra app recibe pero no envía (código 10). Solución: borrar el número de esa cuenta y agregarlo de nuevo desde la app SUYON CRM (cuenta nueva, PEN, Lima) con SMS al chip. Ojo límite de 2 números sin verificación.
- Estado de la cuenta propia: name_status PENDING_REVIEW (nombre «Porte Perú»), business_verification_status **rejected** (hay que volver a pedir la verificación con RUC). Sin tarjeta todavía (las 2 tarjetas fallaron); responder clientas funciona sin tarjeta dentro de los 1,000 gratis/mes.
- Hay DOS cuentas llamadas "Orión - Pancake Singapore": no quitar Pancake de la equivocada (la otra puede tener Orión Perú).
- Solo 1 usuario del sistema Admin permitido (negocio sin verificar): el nuestro es rol Empleado.

## Reglas de Meta que importan
- Ventana gratis de **72 h** si la clienta llega por anuncio de clic a WhatsApp y se responde dentro de 24 h (todo tipo de mensaje gratis).
- Desde **1 oct 2026**: mensajes de servicio y plantillas de utilidad dentro de la ventana de 24 h se cobran (1,000 de servicio gratis/mes por número; Perú ~US$0.03). Plantillas marketing Perú ~US$0.08.
- Desde 15 ene 2026 se prohíben chatbots de propósito general; permitido IA acotada a los productos del negocio con pase a humano (nuestro caso).
- Riesgo de baneo = el mismo que Pancake (misma API). Lo peligroso: bloqueos/reportes, marketing masivo sin opt-in, herramientas no oficiales.

## Flujo de venta (copiado de su Botcake "ventas pantalón")
1. Entrada por ID de anuncio → imagen del producto + precios (bot fijo, sin IA).
2. "¿Qué talla usamos normalmente? (XS, S, M, L, XL o tu talla de jean)".
3. Reconocer talla SIN IA (palabras clave y números de jean) → etiqueta "Talla X" → imagen de colores de esa talla.
4. Si no responde: seguimientos 15 min (texto; en Botcake fallaba 0/6,285), 40 min (audio), 3 h (video "Así se ve puesto", 8 a.m.–10 p.m.), 15 h (texto cierre).
5. Al responder entra la IA: colores → destino → datos → formulario → (provincia) adelanto S/30 → sede Shalom.
6. Pasa a asesora (etiqueta ASESOR, pausa IA): Yape + sede · Lima confirmó datos · pide persona/reclamo/horario especial/zona dudosa. "Yapeo más tarde" → YAPE PENDIENTE + recordatorio (1 h texto, 3 h foto despacho; 8–22 h; se cancela si manda foto).
- Ahorro IA: su prompt en Botcake ocupa 15,000/15,000 caracteres en cada respuesta. Aquí: prompt base corto + instrucciones de la etapa actual + reglas fijas sin IA (tallas, sinónimos de color, stock, precios, cobertura, corte HOY/MAÑANA, formularios).
- El prompt usa **archivos** (tabla de tallas, colores por talla, video de envíos, foto Lima, video confianza) que la IA adjunta por clave; son clave para la confianza y el cierre.

## Etiquetas
- Automáticas (las pone el bot): Talla XS/S/M/L/XL, ASESOR, COMPRÓ, YAPE PENDIENTE.
- Manuales (equipo, venían de Pancake): LIMA PENDIENTE, ✅ LIMA, ✅ PROVINCIA, 🔥 URGENTE.
- Filtro por etiqueta junto al buscador. Franja arriba de los chats: "N personas para llamar" (YAPE PENDIENTE + LIMA PENDIENTE) con resultado de llamada: Cerró / Contestó, lo piensa / No contestó.

## Pedidos
- Estados Lima: Nuevo → Confirmado → En ruta → Entregado / Rechazado.
- Estados Provincia: Yape por validar → Validado → Enviado → En agencia → Recogido / No recogido.
- La IA llena el pedido desde su formulario; la asesora puede **editarlo** (la clienta cambia colores, etc.) antes y después de crearlo.
- Botón **Copiar orden**: texto con "✅ AGENDADO · Pedido #N" + formulario Lima o Shalom, para pegar en su grupo de reporte.
- Pedido de provincia → agrega fila a su **Google Sheet de Shalom** (pendiente: link del Sheet). Futuro: API de Shalom para guías.
- Utilidad (solo dueño): costo prenda + S/1 packaging + envío (Lima S/10–15 motorizado, provincia S/12–15 Shalom).

## Datos del negocio (Porte · Pantalón formal)
- Precios: 1 S/89 · 2 S/139 · 3 S/175 · 4 S/219 · por mayor desde 5 a S/55 c/u. Envío gratis.
- Tallas jean: 26-27 XS · 28-30 S · 31-33 M · 34-37 L · 38-40 XL (XXL → XL).
- Colores oficiales: Negro, Gris claro, Gris oscuro, Perla, Vino, Azul noche, Beige. Sinónimos: rojo/guinda→Vino, plomo claro→Gris claro, plomo oscuro→Gris oscuro, blanco/hueso→Perla, azul→Azul noche, nude/camel→Beige.
- Leggings cargo: S, M, L · Negro, Azul noche, Beige, Celeste bebé · 1 S/109 · 2 S/169 · 3 S/209 · 4 S/265.
- Lima: motorizado propio, contra entrega, entregas 2–8 p.m.; corte 1 p.m. (antes → HOY, después → MAÑANA); sábado hasta 1 p.m., luego lunes.
- Sin cobertura (van por Shalom): Ancón, Santa Rosa, Carabayllo >km 22, Ate después del Real Plaza Puruchuco, Jicamarca, Manchay, Chosica, Chaclacayo, Cieneguilla, Pachacámac, Lurín, Punta Hermosa, Punta Negra, San Bartolo, Santa María del Mar, Pucusana.
- Provincia: Shalom (Olva solo si la pide), adelanto S/30, despacho 4 p.m., llega en 1–2 días.

## Fases
- [x] 0 · Meta app SUYON CRM creada y probada (número de prueba OK), Cloudflare, D1 creada, GitHub + este repo.
- [ ] 0 · Pendientes de Jordan: verificación del negocio en Meta (Ficha RUC), proyecto OpenAI "Pantalón rayas", datos del pantalón de rayas.
- [x] 1 · Login/roles, empresas y tiendas, webhook de Meta, bandeja real (recibir/enviar texto, fotos, audios, videos), etiquetas. (Código listo y probado, 2 nov 2026.)
- [x] 1 · En línea (2 nov 2026): https://suyon-crm.storesuyo.workers.dev · R2, Workers Builds desde GitHub, 4 secretos, usuario del sistema `suyon-crm` (Empleado, portafolio Orión), webhook verificado, app de Meta publicada. Primer mensaje real recibido.
- [x] 1 · Primer envío real desde el CRM (2 nov 15:39).
- [ ] 1 · Pendiente: nombre «Porte Perú» en revisión; tarjeta en la cuenta Orión `4467572743460773`; volver a pedir verificación del negocio (estaba rejected); probar fotos/audios/notas de voz reales.
- [ ] 2 · Bot fijo + seguimientos dentro de la ventana gratis. Muestra aprobada pendiente: canvas "Suyon CRM · Flujo del bot y Clientes" (https://claude.ai/artifact/5s8ng1dGrAeWZnZNYdxKUd): editor de flujo con bloques (Inicio por anuncio, Enviar texto/foto/audio/video, Esperar respuesta con 3 caminos, Reconocer talla/color sin IA, Guardar dato, Poner etiqueta, Seguimiento, Horario, IA Suyon, Ir a otro paso = bucle, Pasar a asesora) + "datos que guarda el bot" (variables por chat: talla, colores, cantidad, destino, distrito, nombre, celular, dni, sede_shalom, anuncio — NO son etiquetas de asesora). Nuevas secciones en el menú: **Clientes** (tabla con datos guardados y pedidos de cada clienta) y **Pedidos por día** (Lima/Provincia, tira de días, totales, Copiar orden). La IA se llama **IA Suyon**.
- Etiquetas rápidas ya hechas: barra de colores encima del cuadro de escribir (LIMA PENDIENTE, YAPE PENDIENTE, URGENTE, ✅ LIMA, ✅ PROVINCIA + manuales nuevas).
- [ ] 2b · **Bot Suyon AI** dentro de Configuración → **Herramientas**: Jordan quiere que se revise TODO Botcake por dentro (editor de flujos, tipos de bloque y opciones, reglas/palabras clave, secuencias, condiciones, campos, etiquetas automáticas, agente IA, configuración: idioma, país, enfoque, estadísticas por bloque) y se replique su funcionamiento con nombres, colores y código propios (no copiar código ni diseño de Pancake). Formato preferido del flujo: lienzo con bloques y flechas + números por bloque (enviados, entregados, leídos, fallidos, respondieron).
  - **Revisión de Botcake hecha (2 nov 2026, solo lectura)** · muestra para aprobar: canvas "Bot Suyon AI · Muestra" (https://claude.ai/artifact/Y2hJYZ8vM68hE15VC6a6oM) con 5 pantallas: Lienzo del flujo · Tipos de bloque · Disparadores y seguimientos · IA Suyon · Ajustes y números. Pendiente: aprobación de Jordan.
  - Página Botcake "Porte Perú" (waba_1454245654419307, +51 924 616 705). Flujo «ventas pantalón» (20 pasos): Flujo#1 foto+precios (10,523 enviados, 10,521 éxito, 9,161 leídos, 284 dejaron teléfono) → Acción inicia secuencia «seguimiento de talla» → pregunta talla guardando en campo «respuesta cliente» → Condición#2 (5 grupos, cada uno 9–12 frases EXACTAS: m/M/talla m/soy m/31/32/33/mediano…; si no coincide → AI) → por talla: Acción etiqueta «talla X» + mensaje de colores «Llevando 3 te sale a S/58.33 c/u» → AI#6 ↔ «BUCLE IA» (espera respuesta y vuelve a la IA).
  - AI#6: entrada = «respuesta cliente», guarda en «respuesta ia», agente «Agente Ventas v2» (GPT-5 mini, 15,000/15,000 caracteres, 2 archivos TXT de conocimiento). Error de IA → mensaje «Estamos validando tu consulta…» → asesora. 4 «casos especiales» (ignoran la respuesta IA): Yape+sede → ASESOR+COMPRÓ; Lima confirmó datos → ASESOR+COMPRÓ; pide persona/reclamo/etc. → ASESOR; «yapeo más tarde» → secuencia «Recordatorio yape» y vuelve al bucle. Asesora = etiqueta + pausar bot + asignar personal + marcar no leído.
  - Secuencias: «seguimiento de talla» (4,657 suscritas): 15 min texto 0/6,560 entregados (falla total), 40 min audio 5,700/5,739, 3 h (8–22 h) «Así se ve puesto» 5,051/5,122, 15 h (8–22 h) fotos pedidos 4,272/4,648. «Recordatorio yape»: 1 h texto 0/20 (falla total), 3 h foto despacho Shalom 16/18. Los seguimientos SOLO TEXTO fallan siempre: revisar el motivo con nuestro envío (guardar código de error de Meta por mensaje).
  - Reglas: «Anuncios pantalón» = Nuevo suscriptor + ADS por ID (65 anuncios) → etiqueta «pantalón prod» + iniciar flujo (siempre). «NUEVO CLIENTE» = ADS «no igual» a esa lista → mismo flujo. Palabra clave «Deseo mis pantalones formales» (contiene) → mismo flujo. Respuesta predeterminada vacía. Herramientas (QR, cupones, ruleta…) sin usar. Horario de funcionamiento apagado. Evento de conversión Meta CAPI apagado.
  - Ajustes IA en Botcake: retraso 5 s, máx 200 caracteres por mensaje, historial 50 mensajes, seguimiento IA 30 min (1 mensaje manual), voz a texto disponible, audiencia todos. Ajustes generales: GMT-5 Lima, Perú, 12 h, bot responde a todos, imágenes agrupadas.
  - Botcake NO da números por bloque (solo del flujo entero y por mensaje de secuencia) ni mide «respondieron».
- [x] 2b · **Construido y en línea (2 nov 2026)**: Configuración → **Bot Suyon AI** (pestañas Flujo · Seguimientos · IA Suyon · Archivos) + sección **Avisos** en el menú (campana con número). Botón «Crear desde Ventas pantalón» copia TODO su Botcake: flujo gratis (precios → talla con todas las frases + números de jean dentro de la frase → etiqueta Talla X → foto colores-{talla}), IA con su prompt COMPLETO (15k) + los 2 TXT de conocimiento, 4 casos especiales, «Estamos validando…» si la IA falla, seguimientos talla (15 min, 40 min, 3 h, 15 h) y Yape (1 h, 3 h). Lienzo editable: arrastrar bloques, panel para editar, zoom, números por bloque (enviados, entregados, leídos, fallidos, respondieron, pasaron). Ficha del chat: estado del bot, datos guardados, Pausar/Reanudar/Iniciar flujo.
  - Seguro por defecto: bot apagado y «solo números de prueba». Jordan debe: (1) crear el flujo desde plantilla, (2) subir los 14 archivos en Archivos, (3) llenar datos de pago en IA Suyon (NO van al código: placeholders {yape} {titular} {bcp} {cci}), (4) poner secreto `ANTHROPIC_API_KEY` en Cloudflare, (5) encender con su número de prueba.
  - Decisiones: casos especiales mandan igual la respuesta de la IA (en Botcake decía «Ignorar respuesta», pero el prompt define qué decir en cada caso; se puede apagar por caso). Si la asesora escribe a mano en un chat del bot, el bot se pausa (botón Reanudar). Notas de voz: la IA aún no las escucha. La IA responde JSON {mensajes[], caso, datos}; los datos van a `chats.bot_vars`.
- [x] 2c · (2 nov 2026) **Franja de llamadas** arriba de los chats: «N para llamar» (YAPE PENDIENTE + LIMA PENDIENTE sin llamada hoy), agrupadas por el día en que se puso la etiqueta, botón Llamar (tel:) y resultado Cerró / Lo piensa / No contestó (tabla `calls`, migración 3). Cerró quita la etiqueta pendiente y pone ✅ LIMA (Lima) o COMPRÓ (Yape). Pulido visual: color propio por tipo de bloque con íconos, etiquetas con fondo de su color, burbujas IA (azul) y bot (verde), animaciones suaves (respeta «reducir movimiento»).
- [ ] 3 · IA por etapa (prompt más corto), voz a texto, comparar Haiku 5.5 vs GPT-5 mini con chats reales.
- [ ] Ideas de Jordan para después: IA como «herramienta» que se activa por tienda y se cobra a alumnos con margen (va con la billetera de la fase 7); llamadas desde el CRM con sus propios números (NO falsear números ajenos: se le explicó que no se construye). Asistente «Crear flujo para mi producto» para alumnos (preguntas + fotos por talla → flujo y prompt) y «Copiar flujo a otra tienda».
- [ ] 4 · Pedidos, editar, copiar orden, Sheet de Shalom, CAPI.
- [ ] 5 · Control: embudo, CPA real por anuncio, llamadas.
- [ ] 6 · Piloto 1 semana; luego migrar pantalón formal.
- [ ] 7 · Billetera para alumnos (idea de Jordan, 2 nov 2026): saldo prepagado por empresa que se recarga con tarjeta peruana (Culqi/Izipay/Mercado Pago) y se reparte entre "destinatarios": WhatsApp (Meta) e IA (OpenAI). Requisitos: negocio verificado en Meta + ser **Proveedor de tecnología / Solution Partner** con línea de crédito compartida (así lo hace Pancake); OpenAI con clave central y consumo medido por tienda. Mientras tanto: cada tienda usa su propia tarjeta en Meta y su propia clave de OpenAI.
- Estimado realista: 2–4 semanas por sesiones.

## Notas técnicas (para la próxima sesión)
- Estructura: `src/index.js` (Hono: rutas, webhook, páginas /privacidad /eliminar-datos /terminos, cron de limpieza) · `src/api.js` (API de la app) · `src/webhook.js` (entrantes, estados, reacciones, ecos de coexistencia `smb_message_echoes`, media → R2) · `src/whatsapp.js` (Graph API + errores en español) · `src/auth.js` (sesiones por cookie, acceso por empresa/tienda) · `src/migrations.js`.
- **Migraciones**: se aplican solas desde el Worker (tabla `_migrations`). Para cambiar el esquema, agregar una migración nueva al final; nunca editar la 1.
- Primer dueño: pantalla de configuración inicial con el secreto `SETUP_CODE` (también sirve para recuperar la cuenta del administrador). Invitaciones y cambios de clave son enlaces (no hay envío de correos).
- Token por tienda: columna `stores.token_secret` = nombre del secreto en Cloudflare (por defecto `WA_TOKEN`).
- Tiempo real: la app consulta `/api/sync` cada 3 s (15 s en segundo plano); usa `stores.rev` y luego pide solo lo cambiado (`updated_at`).
- Ventana para responder: 24 h desde el último mensaje de la clienta, o 72 h si llegó por anuncio y se respondió en las primeras 24 h.
- Notas de voz: Chrome graba WebM; `public/ogg.js` lo pasa a OGG/Opus sin recodificar (WhatsApp lo muestra como nota de voz). Safari graba MP4/AAC.
- Front sin build (JS módulo + CSS del prototipo). PWA: `public/sw.js` (red primero), notificaciones del navegador si se activan en Mi cuenta.
- Pruebas: `npm test` levanta `wrangler dev` con base temporal, un Meta falso y una IA falsa (60 pruebas). Los secretos de prueba van por `--var` (no hace falta .dev.vars).
- Bot: `src/bot.js` (motor: onInbound, runFrom, runIA, runJobs, flowStats) · `src/bot-template.js` (prompt, conocimiento, flujo «Ventas pantalón», TALLAS) · `src/api-bot.js` (API del bot, archivos, avisos) · `public/bot.js` (lienzo y Avisos). Migración 2 = tablas bot_flows, bot_settings, bot_assets, bot_jobs, bot_counts, notifications, ia_usage + columnas bot_* en chats/messages.
- Cron: `* * * * *` corre seguimientos/esperas (runJobs); `0 8 * * *` limpieza. `/__test/jobs` solo existe con TEST_MODE.
- Estado del bot en chats: bot_wait 0 nada · 1 espera respuesta · 2 IA por responder (espera `ia_delay_s` y si llega otro mensaje responde ese) · 3 espera tiempo.
