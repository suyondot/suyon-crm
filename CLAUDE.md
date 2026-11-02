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
- **OpenAI GPT-5 mini**, razonamiento mínimo, clave propia por tienda, tope diario de gasto.
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
- +51 941 010 752 · phone_number_id `1395172913681493` · cuenta de mensajes "Orión - Pancake Singapore" `2306137423565969` (portafolio Orión, business `27970507489211613`).
- OJO Meta 2026: la "cuenta de WhatsApp" del número (`1434395304770204`, la que sale en Configuración del negocio → Cuentas de WhatsApp) NO sirve para `subscribed_apps` ("This API is not supported for this WhatsApp Business Account"). Hay que usar la **cuenta de mensajes** (Messaging accounts → Linked accounts) y asignársela al usuario del sistema con acceso total.
- Recibir funciona; ENVIAR falla con código 10 aunque el token tiene whatsapp_business_messaging para todas. Pancake sí puede enviar → probable causa: la cuenta usa la línea de crédito (billetera) de Pancake. Plan: quitar socio Pancake Singapore SOLO de +51 941 010 752 y poner tarjeta propia en el Administrador de WhatsApp.
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
6. Pasa a asesora (etiqueta ASESOR, pausa IA): Yape + sede · Lima confirmó datos · pide persona/reclamo/horario especial/zona dudosa. "Yapeo más tarde" → YAPE PENDIENTE + recordatorio (2 h, 20 h).
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
- [ ] 1 · Pendiente: nombre visible "Orión Formal Rayas" RECHAZADO por Meta (pedir uno nuevo antes de vender); apagar Botcake/Pancake en el número piloto; verificación del negocio.
- [ ] 2 · Bot fijo + seguimientos dentro de la ventana gratis.
- [ ] 3 · IA por etapa, archivos del prompt, tope de gasto.
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
- Pruebas: `npm test` levanta `wrangler dev` con base temporal y un Meta falso (44 pruebas).
