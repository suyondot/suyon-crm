# Suyon CRM

CRM propio para vender por WhatsApp (API oficial) con bot, IA y control de pedidos.

**Fase 1 lista:** entrar con usuario, roles, empresas y tiendas, recibir y responder chats de WhatsApp (texto, fotos, audios, notas de voz, videos y documentos) y etiquetas. Funciona en PC y celular (se instala como app).

---

## Ponerlo en línea (una sola vez)

Necesitas: tu cuenta de Cloudflare (storesuyo@gmail.com), tu cuenta de Meta con la app **SUYON CRM**, y este repo en GitHub.

### 1. Plan de Cloudflare y almacenamiento de archivos
1. Entra a [dash.cloudflare.com](https://dash.cloudflare.com).
2. Recomendado: **Workers & Pages → Plans → Workers Paid** (US$5 al mes). El plan gratis se queda corto con fotos y videos.
3. Ve a **R2 Object Storage**. Si te lo pide, actívalo (pide tarjeta, pero los primeros 10 GB son gratis).
4. **Create bucket** → nombre exacto: `suyon-crm-media` → Create.

### 2. Conectar el repo para que se publique solo
1. **Workers & Pages → Create → Import a repository**.
2. Elige GitHub → `suyondot/suyon-crm`.
3. Deja todo como viene (comando de deploy: `npx wrangler deploy`) y dale **Deploy**.
4. Al terminar te da una dirección tipo `https://suyon-crm.TU-USUARIO.workers.dev`. Esa es tu app.

Desde ahora, cada cambio que se suba al repo se publica solo.

### 3. Poner las claves secretas
En **Workers & Pages → suyon-crm → Settings → Variables and Secrets → Add**, tipo **Secret**:

| Nombre | Qué poner |
|---|---|
| `SETUP_CODE` | Una clave que inventes para crear tu cuenta de dueño (y recuperarla si la olvidas). Guárdala. |
| `WA_VERIFY_TOKEN` | Una palabra que inventes, ej. `suyon-verifica-2026`. La vas a pegar también en Meta. |
| `META_APP_SECRET` | Meta → tu app SUYON CRM → **Configuración de la app → Básica → Clave secreta de la app** (botón Mostrar). |
| `WA_TOKEN` | El token permanente del paso 5. |

Después de agregarlas, dale **Deploy** otra vez (o espera al siguiente cambio).

### 4. Crear tu cuenta
1. Abre tu dirección `https://suyon-crm.….workers.dev`.
2. Pon tu `SETUP_CODE`, tu nombre, correo y contraseña. Listo, eres el dueño.
3. Para agregar a Jade: **Configuración → Equipo → Invitar** → le mandas el enlace por WhatsApp.

### 5. Token permanente de WhatsApp (Meta)
1. [business.facebook.com](https://business.facebook.com) → **Configuración del negocio → Usuarios → Usuarios del sistema → Agregar** (rol Administrador).
2. Al usuario del sistema: **Asignar activos** → la app **SUYON CRM** (control total) y la **cuenta de WhatsApp** del número piloto (control total).
3. **Generar token** → app SUYON CRM → vencimiento **Nunca** → permisos `whatsapp_business_messaging` y `whatsapp_business_management`.
4. Copia el token y pégalo en Cloudflare como `WA_TOKEN` (paso 3). No lo mandes por chat.

### 6. Conectar el número piloto (pantalón de rayas)
1. Meta → app SUYON CRM → **WhatsApp → Configuración de la API**: copia el **Identificador del número de teléfono** y el **Identificador de la cuenta de WhatsApp Business**.
2. En el CRM: selector de tienda (arriba a la izquierda) → **+ Agregar tienda** → "Pantalón de rayas".
3. **Configuración → Número de WhatsApp** → pega los dos identificadores → **Guardar** → **Conectar número**.
4. En la misma pantalla está la **URL del webhook**. Ve a Meta → app SUYON CRM → **WhatsApp → Configuración → Webhook → Editar**:
   - URL de devolución de llamada: la que copiaste del CRM.
   - Token de verificación: tu `WA_VERIFY_TOKEN`.
   - **Administrar campos** → suscribe `messages`.
5. Antes de quitar a Pancake: revisa que ese número **no comparta cuenta de WhatsApp** con el pantalón formal. Si la comparte, solo desconéctalo de Pancake/Botcake.

### 7. Publicar la app de Meta
Meta → app SUYON CRM → **Configuración de la app → Básica**: pega la **Política de privacidad**, **Eliminación de datos** y **Condiciones** (los enlaces están en el CRM, en Configuración → Número). Elige categoría e ícono, y cambia el modo de **Desarrollo** a **Activo**.

### 8. Probar
Escribe desde tu celular personal al número piloto. Debe aparecer en **Chats** en unos segundos, con sonido. Respóndele desde el CRM.

Si algo no llega: **Configuración → Número de WhatsApp → Webhook de Meta** muestra qué secretos faltan, cuándo llegó el último aviso y un registro de avisos raros.

---

## Para desarrollo
- `npm install` · `npm run dev` (local con `.dev.vars`) · `npm test` (44 pruebas con un WhatsApp simulado).
- Código: `src/` (Worker: API, webhook, migraciones automáticas de D1), `public/` (app web sin build).
