// 数据库初始化模块
// 负责创建/连接 SQLite 数据库、执行建表 SQL、提供单例连接管理
const Database = require('better-sqlite3')
const storageService = require('../services/storageService.cjs')

// 模块级单例 db 实例（懒初始化，首次调用 getDb 时才创建）
let db = null

// 建表 SQL（全部 IF NOT EXISTS，可重复执行）
const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS workspaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    icon TEXT DEFAULT '🚀',
    shortcut_key TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS software (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    path TEXT NOT NULL,
    args TEXT DEFAULT '',
    icon TEXT DEFAULT '📦',
    icon_mode TEXT DEFAULT 'auto',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS workspace_software (
    workspace_id INTEGER NOT NULL,
    software_id INTEGER NOT NULL,
    launch_order INTEGER DEFAULT 0,
    delay_ms INTEGER DEFAULT 0,
    PRIMARY KEY (workspace_id, software_id),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (software_id) REFERENCES software(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS scripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('pre','post')),
    language TEXT DEFAULT 'cmd',
    content TEXT DEFAULT '',
    delay_ms INTEGER DEFAULT 0,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS bat_scripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    path TEXT NOT NULL,
    args TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS workspace_bat_scripts (
    workspace_id INTEGER NOT NULL,
    bat_script_id INTEGER NOT NULL,
    launch_order INTEGER DEFAULT 0,
    delay_ms INTEGER DEFAULT 0,
    PRIMARY KEY (workspace_id, bat_script_id),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (bat_script_id) REFERENCES bat_scripts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS launch_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER,
    software_id INTEGER,
    status TEXT NOT NULL,
    message TEXT DEFAULT '',
    message_key TEXT,
    message_params TEXT,
    timestamp TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ai_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pet_model_id TEXT NOT NULL DEFAULT 'builtin-launchbot',
    title TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    summary_message_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ai_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user','assistant','tool','system')),
    content TEXT NOT NULL DEFAULT '',
    metadata TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation
    ON ai_messages(conversation_id, id);

  CREATE TABLE IF NOT EXISTS ai_memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL DEFAULT 'preference',
    content TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0.8,
    source_message_id INTEGER,
    last_used_at TEXT,
    expires_at TEXT,
    confirmed INTEGER NOT NULL DEFAULT 1,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (source_message_id) REFERENCES ai_messages(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_ai_memories_active
    ON ai_memories(archived, updated_at DESC);

`

// 轻量迁移：为已存在的旧表补充新增列
// 旧数据库通过 CREATE TABLE IF NOT EXISTS 不会自动加列，需逐列检查后 ALTER TABLE ADD COLUMN
const MIGRATIONS = [
  {
    table: 'workspaces',
    columns: [
      { name: 'shortcut_key', definition: "TEXT DEFAULT ''" }
    ]
  },
  {
    table: 'software',
    columns: [
      { name: 'icon_mode', definition: "TEXT DEFAULT 'auto'" }
    ]
  },
  {
    table: 'launch_logs',
    columns: [
      { name: 'message_key', definition: 'TEXT' },
      { name: 'message_params', definition: 'TEXT' }
    ]
  },
  {
    table: 'ai_conversations',
    columns: [
      { name: 'pet_model_id', definition: "TEXT NOT NULL DEFAULT 'builtin-launchbot'" }
    ]
  },
  {
    table: 'ai_memories',
    columns: [
      { name: 'confirmed', definition: 'INTEGER NOT NULL DEFAULT 1' }
    ]
  }
]

function applyMigrations(database) {
  let addedConversationPetModel = false
  for (const migration of MIGRATIONS) {
    const cols = database.prepare(`PRAGMA table_info(${migration.table})`).all()
    const existing = new Set(cols.map((c) => c.name))
    for (const column of migration.columns) {
      if (!existing.has(column.name)) {
        database.exec(
          `ALTER TABLE ${migration.table} ADD COLUMN ${column.name} ${column.definition}`
        )
        if (migration.table === 'ai_conversations' && column.name === 'pet_model_id') {
          addedConversationPetModel = true
        }
      }
    }
  }
  // 升级时将旧会话归入当时正在使用的桌宠，避免切换模型后误以为历史丢失。
  if (addedConversationPetModel) {
    const row = database.prepare('SELECT value FROM app_settings WHERE key = ?').get('petModelId')
    let petModelId = 'builtin-launchbot'
    try { petModelId = String(JSON.parse(row?.value || '"builtin-launchbot"')) } catch (_) {}
    database.prepare('UPDATE ai_conversations SET pet_model_id = ?').run(petModelId)
  }
  database.exec('CREATE INDEX IF NOT EXISTS idx_ai_conversations_pet ON ai_conversations(pet_model_id, updated_at DESC)')
  // 旧版本用“非默认 📦 emoji”表示用户自定义图标，迁移后保留原有显示语义。
  database.prepare(`
    UPDATE software
    SET icon_mode = 'custom'
    WHERE icon_mode = 'auto' AND icon IS NOT NULL AND icon <> '📦'
  `).run()

  // FTS5 is bundled with better-sqlite3 in normal builds. Keep the base memory
  // table usable even on an unusual SQLite build where FTS5 is unavailable.
  try {
    database.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS ai_memories_fts USING fts5(
        content,
        content='ai_memories',
        content_rowid='id',
        tokenize='unicode61'
      );
      CREATE TRIGGER IF NOT EXISTS ai_memories_ai AFTER INSERT ON ai_memories BEGIN
        INSERT INTO ai_memories_fts(rowid, content) VALUES (new.id, new.content);
      END;
      CREATE TRIGGER IF NOT EXISTS ai_memories_ad AFTER DELETE ON ai_memories BEGIN
        INSERT INTO ai_memories_fts(ai_memories_fts, rowid, content)
        VALUES ('delete', old.id, old.content);
      END;
      CREATE TRIGGER IF NOT EXISTS ai_memories_au AFTER UPDATE OF content ON ai_memories BEGIN
        INSERT INTO ai_memories_fts(ai_memories_fts, rowid, content)
        VALUES ('delete', old.id, old.content);
        INSERT INTO ai_memories_fts(rowid, content) VALUES (new.id, new.content);
      END;
    `)
  } catch (error) {
    console.warn('[database] FTS5 unavailable; memory search will use fallback matching:', error.message)
  }
}

// 获取数据库连接（懒初始化）
// 首次调用时创建 Database 实例，开启 WAL 模式和外键，执行建表 SQL
function getDb() {
  if (db) return db

  const dbPath = storageService.getDatabasePath()
  db = new Database(dbPath)

  // 开启 WAL 模式，提升并发读写性能
  db.pragma('journal_mode = WAL')
  // 开启外键约束，使 ON DELETE CASCADE 生效
  db.pragma('foreign_keys = ON')

  // 执行建表
  db.exec(CREATE_TABLES_SQL)
  // 执行增量迁移（补齐旧表新增列）
  applyMigrations(db)

  return db
}

// 关闭数据库连接
function closeDb() {
  if (db) {
    db.close()
    db = null
  }
}

module.exports = {
  getDb,
  closeDb
}
