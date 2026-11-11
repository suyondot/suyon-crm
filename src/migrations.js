// Migraciones de la base de datos. Se aplican solas al primer pedido después de cada deploy.
// Para cambiar el esquema: agrega una migración NUEVA al final (nunca edites una ya aplicada).

export const MIGRATIONS = [
  {
    id: 1,
    name: 'inicial',
    sql: [
      `CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL,
        pass_hash TEXT NOT NULL,
        pass_salt TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0,
        disabled INTEGER NOT NULL DEFAULT 0,
        failed_logins INTEGER NOT NULL DEFAULT 0,
        locked_until INTEGER,
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE password_resets (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_by INTEGER,
        expires_at INTEGER NOT NULL,
        used_at INTEGER
      )`,
      `CREATE TABLE companies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
      // role: dueno | asesora | despacho | despacho_prov
      `CREATE TABLE memberships (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        all_stores INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, company_id)
      )`,
      `CREATE TABLE member_stores (
        user_id INTEGER NOT NULL,
        store_id INTEGER NOT NULL,
        PRIMARY KEY (user_id, store_id)
      )`,
      `CREATE TABLE stores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#7A1F35',
        phone_display TEXT,
        phone_number_id TEXT UNIQUE,
        waba_id TEXT,
        token_secret TEXT NOT NULL DEFAULT 'WA_TOKEN',
        verified_name TEXT,
        status TEXT NOT NULL DEFAULT 'pendiente',
        connect_error TEXT,
        read_receipts INTEGER NOT NULL DEFAULT 1,
        rev INTEGER NOT NULL DEFAULT 0,
        last_webhook_at INTEGER,
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        user_agent TEXT
      )`,
      `CREATE TABLE invites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_hash TEXT NOT NULL UNIQUE,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        email TEXT NOT NULL COLLATE NOCASE,
        role TEXT NOT NULL,
        all_stores INTEGER NOT NULL DEFAULT 1,
        store_ids TEXT,
        created_by INTEGER,
        expires_at INTEGER NOT NULL,
        used_at INTEGER,
        created_at INTEGER NOT NULL
      )`,
      // handler: asesora | bot | ia | cerrado (bot e IA llegan en las fases 2 y 3)
      `CREATE TABLE chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        wa_id TEXT NOT NULL,
        name TEXT,
        profile_name TEXT,
        handler TEXT NOT NULL DEFAULT 'asesora',
        unread INTEGER NOT NULL DEFAULT 0,
        last_msg_at INTEGER,
        last_preview TEXT,
        last_dir TEXT,
        last_inbound_at INTEGER,
        ad_id TEXT,
        ad_headline TEXT,
        ad_source_url TEXT,
        ctwa_clid TEXT,
        referral_at INTEGER,
        referral_json TEXT,
        first_reply_at INTEGER,
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (store_id, wa_id)
      )`,
      `CREATE INDEX chats_store_last ON chats (store_id, last_msg_at DESC)`,
      `CREATE INDEX chats_store_updated ON chats (store_id, updated_at)`,
      `CREATE INDEX chats_store_unread ON chats (store_id) WHERE unread > 0`,
      // sender: cli | ase | bot | ia | sys | cel (enviado desde la app del celular)
      `CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        store_id INTEGER NOT NULL,
        wamid TEXT UNIQUE,
        direction TEXT NOT NULL,
        sender TEXT NOT NULL,
        user_id INTEGER,
        type TEXT NOT NULL,
        body TEXT,
        media_id TEXT,
        media_key TEXT,
        media_mime TEXT,
        media_name TEXT,
        media_size INTEGER,
        media_status TEXT,
        status TEXT,
        error TEXT,
        context_wamid TEXT,
        extra TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX messages_chat ON messages (chat_id, id)`,
      `CREATE INDEX messages_chat_updated ON messages (chat_id, updated_at)`,
      `CREATE TABLE labels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        auto INTEGER NOT NULL DEFAULT 0,
        sort INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        UNIQUE (store_id, name)
      )`,
      `CREATE TABLE chat_labels (
        chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
        user_id INTEGER,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (chat_id, label_id)
      )`,
      `CREATE INDEX chat_labels_label ON chat_labels (label_id)`,
      // Avisos de Meta que no se pudieron asociar a una tienda (para revisar la conexión)
      `CREATE TABLE webhook_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        received_at INTEGER NOT NULL,
        kind TEXT NOT NULL,
        phone_number_id TEXT,
        detail TEXT
      )`,
    ],
  },
  {
    id: 2,
    name: 'bot_suyon_ai',
    sql: [
      // Estado del bot en cada chat
      `ALTER TABLE chats ADD COLUMN bot_flow_id INTEGER`,
      `ALTER TABLE chats ADD COLUMN bot_node TEXT`,
      // 0 = no espera · 1 = espera respuesta · 2 = la IA está por responder · 3 = espera un tiempo
      `ALTER TABLE chats ADD COLUMN bot_wait INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE chats ADD COLUMN bot_vars TEXT`,
      `ALTER TABLE chats ADD COLUMN bot_paused INTEGER NOT NULL DEFAULT 0`,
      // De qué bloque salió cada mensaje del bot (para los números por bloque)
      `ALTER TABLE messages ADD COLUMN bot_flow_id INTEGER`,
      `ALTER TABLE messages ADD COLUMN bot_node TEXT`,
      `ALTER TABLE messages ADD COLUMN replied INTEGER`,
      `CREATE INDEX messages_bot ON messages (bot_flow_id, bot_node) WHERE bot_flow_id IS NOT NULL`,
      `CREATE TABLE bot_flows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 0,
        graph TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      // Ajustes del bot y de la IA por tienda (aquí van los datos de pago, nunca en el código)
      `CREATE TABLE bot_settings (
        store_id INTEGER PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
        bot_on INTEGER NOT NULL DEFAULT 0,
        audience TEXT NOT NULL DEFAULT 'equipo',
        test_numbers TEXT,
        ia_model TEXT,
        ia_secret TEXT,
        ia_daily_cap REAL,
        ia_prompt TEXT,
        ia_knowledge TEXT,
        ia_delay_s INTEGER,
        ia_history INTEGER,
        ia_follow_min INTEGER,
        ia_follow_text TEXT,
        pay_yape TEXT,
        pay_titular TEXT,
        pay_bcp TEXT,
        pay_cci TEXT,
        updated_at INTEGER
      )`,
      `CREATE TABLE bot_assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        name TEXT,
        mime TEXT NOT NULL,
        size INTEGER,
        r2_key TEXT NOT NULL,
        wa_media_id TEXT,
        wa_media_at INTEGER,
        created_at INTEGER NOT NULL,
        UNIQUE (store_id, key)
      )`,
      // Seguimientos y esperas programadas (los corre el cron de cada minuto)
      `CREATE TABLE bot_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL,
        chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        flow_id INTEGER NOT NULL,
        kind TEXT NOT NULL,
        seq_id TEXT,
        step INTEGER,
        node_id TEXT,
        cancel_on TEXT,
        run_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        done_at INTEGER,
        canceled_at INTEGER
      )`,
      `CREATE INDEX bot_jobs_due ON bot_jobs (run_at) WHERE done_at IS NULL AND canceled_at IS NULL`,
      `CREATE INDEX bot_jobs_chat ON bot_jobs (chat_id)`,
      `CREATE TABLE bot_counts (
        flow_id INTEGER NOT NULL,
        node_id TEXT NOT NULL,
        entered INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (flow_id, node_id)
      )`,
      // kind: error | ia | asesora | archivo | aviso
      `CREATE TABLE notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        chat_id INTEGER,
        title TEXT NOT NULL,
        body TEXT,
        created_at INTEGER NOT NULL,
        read_at INTEGER
      )`,
      `CREATE INDEX notifications_store ON notifications (store_id, id DESC)`,
      `CREATE TABLE ia_usage (
        store_id INTEGER NOT NULL,
        day TEXT NOT NULL,
        calls INTEGER NOT NULL DEFAULT 0,
        in_tokens INTEGER NOT NULL DEFAULT 0,
        out_tokens INTEGER NOT NULL DEFAULT 0,
        cost REAL NOT NULL DEFAULT 0,
        PRIMARY KEY (store_id, day)
      )`,
    ],
  },
  {
    id: 3,
    name: 'llamadas',
    sql: [
      // Resultado de cada llamada a clientas con YAPE PENDIENTE o LIMA PENDIENTE
      // result: cerro | lo_piensa | no_contesto
      `CREATE TABLE calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        label TEXT,
        result TEXT NOT NULL,
        user_id INTEGER,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX calls_chat ON calls (chat_id, id)`,
    ],
  },
  {
    id: 4,
    name: 'simulador',
    sql: [
      // Chat de prueba del simulador del bot (no sale en la bandeja ni en los números)
      `ALTER TABLE chats ADD COLUMN sim INTEGER NOT NULL DEFAULT 0`,
    ],
  },
  {
    id: 5,
    name: 'ajustes generales por tienda',
    sql: [
      `ALTER TABLE stores ADD COLUMN timezone TEXT NOT NULL DEFAULT 'America/Lima'`,
      `ALTER TABLE stores ADD COLUMN country TEXT NOT NULL DEFAULT 'PE'`,
      `ALTER TABLE stores ADD COLUMN currency TEXT NOT NULL DEFAULT 'PEN'`,
      `ALTER TABLE stores ADD COLUMN language TEXT NOT NULL DEFAULT 'es'`,
      `ALTER TABLE stores ADD COLUMN hour12 INTEGER NOT NULL DEFAULT 1`,
    ],
  },
  {
    id: 6,
    name: 'entregas lima (corte y días)',
    sql: [
      `ALTER TABLE bot_settings ADD COLUMN corte_h INTEGER`,
      `ALTER TABLE bot_settings ADD COLUMN entrega_sab INTEGER`,
      `ALTER TABLE bot_settings ADD COLUMN entrega_dom INTEGER`,
      `ALTER TABLE bot_settings ADD COLUMN entrega_horario TEXT`,
    ],
  },
  {
    id: 7,
    name: 'pedidos, shopify y mensajes automáticos',
    sql: [
      `CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        number INTEGER NOT NULL,
        chat_id INTEGER,
        source TEXT NOT NULL DEFAULT 'manual',
        ext_id TEXT,
        ext_name TEXT,
        checkout_token TEXT,
        modo TEXT NOT NULL DEFAULT 'lima',
        status TEXT NOT NULL,
        nombre TEXT, celular TEXT, dni TEXT, distrito TEXT, direccion TEXT, referencia TEXT, ciudad TEXT, sede TEXT,
        items TEXT,
        unidades INTEGER NOT NULL DEFAULT 0,
        total REAL NOT NULL DEFAULT 0,
        adelanto REAL NOT NULL DEFAULT 0,
        notas TEXT,
        ad_id TEXT,
        entrega TEXT,
        created_by INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        status_at INTEGER NOT NULL,
        UNIQUE (store_id, number)
      )`,
      `CREATE INDEX orders_store_created ON orders (store_id, created_at)`,
      `CREATE INDEX orders_chat ON orders (chat_id)`,
      `CREATE UNIQUE INDEX orders_ext ON orders (store_id, source, ext_id) WHERE ext_id IS NOT NULL`,
      `CREATE TABLE order_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        detail TEXT,
        user_id INTEGER,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX order_events_order ON order_events (order_id)`,
      `CREATE TABLE carts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        token TEXT NOT NULL,
        nombre TEXT, celular TEXT, total REAL, items TEXT, url TEXT,
        order_id INTEGER,
        sent_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (store_id, token)
      )`,
      `CREATE TABLE order_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL,
        order_id INTEGER,
        cart_id INTEGER,
        kind TEXT NOT NULL,
        run_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        done_at INTEGER,
        canceled_at INTEGER
      )`,
      `CREATE INDEX order_jobs_due ON order_jobs (run_at) WHERE done_at IS NULL AND canceled_at IS NULL`,
      `CREATE TABLE automations (
        store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        on_ INTEGER NOT NULL DEFAULT 0,
        text TEXT,
        delay_min INTEGER,
        tpl_name TEXT,
        tpl_status TEXT,
        tpl_vars TEXT,
        tpl_reason TEXT,
        updated_at INTEGER,
        PRIMARY KEY (store_id, key)
      )`,
      `ALTER TABLE stores ADD COLUMN order_cfg TEXT`,
      `ALTER TABLE stores ADD COLUMN shopify_key TEXT`,
      `ALTER TABLE stores ADD COLUMN shopify_secret TEXT`,
      `ALTER TABLE stores ADD COLUMN shopify_last_at INTEGER`,
    ],
  },
  {
    id: 8,
    name: 'cómo vende la tienda: mensajes o shopify',
    sql: [`ALTER TABLE stores ADD COLUMN canal TEXT NOT NULL DEFAULT 'mensajes'`],
  },
  {
    id: 9,
    name: 'notas de voz a texto y compra a Meta (CAPI)',
    sql: [
      `ALTER TABLE messages ADD COLUMN transcript TEXT`,
      `ALTER TABLE bot_settings ADD COLUMN voz_on INTEGER`,
      `ALTER TABLE stores ADD COLUMN capi_on INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE stores ADD COLUMN capi_dataset TEXT`,
      `ALTER TABLE stores ADD COLUMN capi_last TEXT`,
      `ALTER TABLE orders ADD COLUMN capi_at INTEGER`,
    ],
  },
  {
    id: 10,
    name: 'conectar WhatsApp con un clic (token cifrado por tienda)',
    sql: [
      `ALTER TABLE stores ADD COLUMN token_enc TEXT`,
      `ALTER TABLE stores ADD COLUMN wa_pin_enc TEXT`,
      `ALTER TABLE stores ADD COLUMN connected_via TEXT`,
    ],
  },
  {
    id: 11,
    name: 'planes de alumnos: prueba gratis, suscripción y Panel Suyon',
    sql: [
      // free = sin cobro (empresas de Jordan) · trial = prueba gratis · active = pagado hasta paid_until · blocked = bloqueada a mano
      `ALTER TABLE companies ADD COLUMN plan_status TEXT NOT NULL DEFAULT 'free'`,
      `ALTER TABLE companies ADD COLUMN trial_ends_at INTEGER`,
      `ALTER TABLE companies ADD COLUMN paid_until INTEGER`,
      `ALTER TABLE companies ADD COLUMN owner_user_id INTEGER`,
      `ALTER TABLE companies ADD COLUMN contact_phone TEXT`,
      `ALTER TABLE companies ADD COLUMN created_via TEXT`,
      `ALTER TABLE companies ADD COLUMN plan_note TEXT`,
      `CREATE TABLE platform_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)`,
      `CREATE TABLE payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        amount REAL NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'USD',
        months INTEGER NOT NULL DEFAULT 1,
        method TEXT,
        note TEXT,
        paid_from INTEGER,
        paid_to INTEGER,
        created_by INTEGER,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX payments_company ON payments (company_id, created_at)`,
    ],
  },
  {
    id: 12,
    name: 'demos agendadas desde la página pública',
    sql: [
      // status: nueva · confirmada · hecha · no_vino · cancelada
      `CREATE TABLE demos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        starts_at INTEGER NOT NULL,
        dur_min INTEGER NOT NULL DEFAULT 30,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        brand TEXT,
        sells TEXT,
        volume TEXT,
        note TEXT,
        status TEXT NOT NULL DEFAULT 'nueva',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX demos_start ON demos (starts_at)`,
      `CREATE INDEX demos_phone ON demos (phone, starts_at)`,
    ],
  },
  {
    id: 13,
    name: 'precios en soles: S/25 base, S/18 por número y por trabajadora (decisión de Jordan, 4 nov)',
    sql: [
      `UPDATE platform_settings SET value = json_set(value, '$.currency', 'PEN', '$.base', 25, '$.per_number', 18, '$.per_user', 18), updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE key = 'plan'`,
      `UPDATE payments SET currency = 'PEN'`,
    ],
  },
  {
    id: 14,
    name: 'trabajadora extra a S/10 al mes (decisión de Jordan, 4 nov)',
    sql: [`UPDATE platform_settings SET value = json_set(value, '$.per_user', 10), updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE key = 'plan'`],
  },
  {
    id: 15,
    name: 'agencias de Shalom guardadas (servicio externo) y guía en pedidos',
    sql: [
      `CREATE TABLE shalom_agencies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ext_id TEXT,
        dep TEXT, prov TEXT, dist TEXT,
        name TEXT NOT NULL,
        address TEXT,
        search TEXT NOT NULL,
        raw TEXT,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX shalom_agencies_search ON shalom_agencies (search)`,
      `ALTER TABLE orders ADD COLUMN guia TEXT`,
      `ALTER TABLE orders ADD COLUMN guia_codigo TEXT`,
      `ALTER TABLE orders ADD COLUMN guia_estado TEXT`,
      `ALTER TABLE orders ADD COLUMN guia_at INTEGER`,
    ],
  },
  {
    id: 16,
    name: 'agencias que el bot le ofreció a la clienta (para reconocer cuál tocó)',
    sql: [`ALTER TABLE chats ADD COLUMN bot_ag TEXT`],
  },
  {
    id: 17,
    name: 'envíos a provincia: courier, QR, fecha de la guía, seguimientos, no quiere recoger, remitente',
    sql: [
      `ALTER TABLE orders ADD COLUMN courier TEXT`,
      `ALTER TABLE orders ADD COLUMN guia_qr TEXT`,
      `ALTER TABLE orders ADD COLUMN enviado_at INTEGER`,
      `ALTER TABLE orders ADD COLUMN seg TEXT`,
      `ALTER TABLE orders ADD COLUMN no_quiere INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE orders ADD COLUMN rem TEXT`,
      `CREATE INDEX orders_store_modo ON orders (store_id, modo, status)`,
    ],
  },
  {
    id: 18,
    name: 'corregir ortografía de los mensajes del equipo (por tienda, encendido)',
    sql: [`ALTER TABLE stores ADD COLUMN autocorrect INTEGER NOT NULL DEFAULT 1`],
  },
  {
    id: 19,
    name: 'gasto de IA por proveedor y día (para el saldo de Claude / OpenAI)',
    sql: [`CREATE TABLE ia_spend (provider TEXT NOT NULL, day TEXT NOT NULL, calls INTEGER NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0, PRIMARY KEY (provider, day))`],
  },
  {
    id: 20,
    name: 'qué vende la tienda (ropa / sin variantes) y asistente de inicio',
    sql: [
      `ALTER TABLE stores ADD COLUMN rubro TEXT NOT NULL DEFAULT 'ropa'`,
      `ALTER TABLE stores ADD COLUMN setup INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE stores ADD COLUMN asistente TEXT`,
    ],
  },
  {
    id: 21,
    name: 'cuándo vence el permiso de Meta de la tienda (Conectar con un clic)',
    sql: [`ALTER TABLE stores ADD COLUMN token_exp INTEGER`],
  },
  {
    id: 22,
    name: 'billetera de IA por empresa (saldo en soles) y verificación de correo',
    sql: [
      `ALTER TABLE companies ADD COLUMN ia_saldo REAL NOT NULL DEFAULT 0`,
      `ALTER TABLE companies ADD COLUMN ia_gastado REAL NOT NULL DEFAULT 0`,
      `CREATE TABLE ia_recargas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        amount REAL NOT NULL,
        method TEXT,
        note TEXT,
        created_by INTEGER,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX ia_recargas_co ON ia_recargas (company_id, created_at)`,
      `ALTER TABLE users ADD COLUMN email_ok INTEGER NOT NULL DEFAULT 1`,
      `ALTER TABLE users ADD COLUMN email_code TEXT`,
      `ALTER TABLE users ADD COLUMN email_code_at INTEGER`,
      `ALTER TABLE users ADD COLUMN email_tries INTEGER NOT NULL DEFAULT 0`,
    ],
  },
  {
    id: 23,
    name: 'una sola respuesta de la IA a la vez por chat (candado) y último mensaje que ya leyó',
    sql: [
      `ALTER TABLE chats ADD COLUMN bot_lock INTEGER`,
      `ALTER TABLE chats ADD COLUMN bot_seen INTEGER`,
    ],
  },
  {
    id: 24,
    name: 'índices para que la bandeja, los reportes y el embudo carguen rápido',
    sql: [
      `CREATE INDEX IF NOT EXISTS chats_store_recent ON chats (store_id, COALESCE(last_msg_at, created_at) DESC)`,
      `CREATE INDEX IF NOT EXISTS chats_store_created ON chats (store_id, created_at)`,
      `CREATE INDEX IF NOT EXISTS messages_store_created ON messages (store_id, created_at)`,
      `CREATE INDEX IF NOT EXISTS notifications_unread ON notifications (store_id) WHERE read_at IS NULL`,
    ],
  },
  {
    id: 25,
    name: 'respuestas rápidas, stickers guardados y fotos de las plantillas',
    sql: [
      `CREATE TABLE quick_replies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        atajo TEXT NOT NULL,
        texto TEXT,
        media TEXT NOT NULL DEFAULT '[]',
        sort INTEGER NOT NULL DEFAULT 0,
        uses INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX quick_replies_store ON quick_replies (store_id, sort, id)`,
      `CREATE TABLE stickers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        media_key TEXT NOT NULL,
        mime TEXT NOT NULL DEFAULT 'image/webp',
        size INTEGER,
        animated INTEGER NOT NULL DEFAULT 0,
        uses INTEGER NOT NULL DEFAULT 0,
        last_used_at INTEGER,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX stickers_store ON stickers (store_id, id)`,
      `CREATE TABLE wa_templates (
        store_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        media_key TEXT,
        media_mime TEXT,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (store_id, name)
      )`,
    ],
  },
  {
    id: 26,
    name: 'índice para el rastreo de guías (no recorrer todos los pedidos)',
    sql: [
      `CREATE INDEX IF NOT EXISTS orders_track ON orders (guia_at) WHERE guia IS NOT NULL AND guia_codigo IS NOT NULL AND modo = 'agencia' AND status IN ('validado', 'enviado', 'en_camino', 'en_agencia')`,
    ],
  },
  {
    id: 27,
    name: 'seguimiento de la IA según el paso (talla, colores, distrito, datos, adelanto)',
    sql: [`ALTER TABLE bot_settings ADD COLUMN ia_follow_auto INTEGER`],
  },
  {
    id: 28,
    name: 'validación de pagos: marcas por captura y pagos que llegan de la app del celular',
    sql: [
      `CREATE TABLE pago_marks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL,
        chat_id INTEGER NOT NULL,
        msg_id INTEGER NOT NULL DEFAULT 0,
        order_id INTEGER,
        estado TEXT NOT NULL,
        monto REAL,
        nota TEXT,
        pago_id INTEGER,
        user_id INTEGER,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX pago_marks_chat ON pago_marks (chat_id, msg_id)`,
      `CREATE INDEX pago_marks_store ON pago_marks (store_id, created_at)`,
      `CREATE TABLE pagos_in (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL,
        monto REAL,
        nombre TEXT,
        texto TEXT,
        app TEXT,
        chat_id INTEGER,
        order_id INTEGER,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX pagos_in_store ON pagos_in (store_id, created_at)`,
      `ALTER TABLE stores ADD COLUMN pagos_key TEXT`,
      `ALTER TABLE stores ADD COLUMN pagos_last_at INTEGER`,
    ],
  },
  {
    id: 29,
    name: 'chats listos para agendar (arriba hasta que se abren)',
    sql: [`ALTER TABLE chats ADD COLUMN listo_at INTEGER`, `ALTER TABLE chats ADD COLUMN pin_visto INTEGER`],
  },
  {
    id: 30,
    name: 'pedido de Jordan (10 nov): el número de Porte (941, tienda 1) pasa a vender por Shopify',
    sql: [`UPDATE stores SET canal = 'shopify' WHERE id = 1 AND name = 'Porte' AND phone_number_id = '1438552302669955'`],
  },
];

let ready = null;

export function ensureSchema(db) {
  if (!ready) {
    ready = migrate(db).catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

async function migrate(db) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)`
  ).run();
  const { results } = await db.prepare('SELECT id FROM _migrations').all();
  const done = new Set(results.map((r) => r.id));
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    const stmts = m.sql.map((s) => db.prepare(s));
    stmts.push(db.prepare('INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)').bind(m.id, m.name, Date.now()));
    try {
      await db.batch(stmts);
    } catch (e) {
      // Otro pedido pudo aplicarla al mismo tiempo
      const again = await db.prepare('SELECT id FROM _migrations WHERE id = ?').bind(m.id).first();
      if (!again) throw e;
    }
  }
}
