// 数据库初始化模块
// 负责创建/连接 SQLite 数据库、执行建表 SQL、提供单例连接管理
const Database = require('better-sqlite3')
const path = require('path')
const { app } = require('electron')

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
    table: 'launch_logs',
    columns: [
      { name: 'message_key', definition: 'TEXT' },
      { name: 'message_params', definition: 'TEXT' }
    ]
  }
]

function applyMigrations(database) {
  for (const migration of MIGRATIONS) {
    const cols = database.prepare(`PRAGMA table_info(${migration.table})`).all()
    const existing = new Set(cols.map((c) => c.name))
    for (const column of migration.columns) {
      if (!existing.has(column.name)) {
        database.exec(
          `ALTER TABLE ${migration.table} ADD COLUMN ${column.name} ${column.definition}`
        )
      }
    }
  }
}

// 获取数据库连接（懒初始化）
// 首次调用时创建 Database 实例，开启 WAL 模式和外键，执行建表 SQL
function getDb() {
  if (db) return db

  const dbPath = path.join(app.getPath('userData'), 'workspace-launcher.db')
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
