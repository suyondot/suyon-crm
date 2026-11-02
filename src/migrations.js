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
