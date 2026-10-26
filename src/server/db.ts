/* SQLite (встроенный node:sqlite) в режиме WAL: одна база на всё —
   люди, сессии, доски, участники, история, метаданные файлов. */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { config } from "./config.ts";

/* В базе — сессии и хеши паролей: на Linux и macOS папку данных видит только владелец. */
fs.mkdirSync(config.storageDir, { recursive: true, mode: 0o700 });
if (process.platform !== "win32" && config.defaultStorage) {
  try {
    fs.chmodSync(config.storageDir, 0o700);
  } catch {
    /* чужая папка или файловая система без прав — не страшно */
  }
}

export const db = new DatabaseSync(path.join(config.storageDir, "space.db"));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
`);

/* Схема базы. IF NOT EXISTS — повторный запуск на готовой базе ничего не меняет. */
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL,
    login      TEXT UNIQUE COLLATE NOCASE,
    pass_hash  TEXT,
    created_at INTEGER NOT NULL,
    seen_at    INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent      TEXT,
    created_at INTEGER NOT NULL,
    seen_at    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
  CREATE TABLE IF NOT EXISTS login_links (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS boards (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    owner_id    TEXT NOT NULL REFERENCES users(id),
    link_access TEXT NOT NULL DEFAULT 'edit',
    state       BLOB,
    nodes       INTEGER NOT NULL DEFAULT 0,
    thumb_at    INTEGER,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    deleted_at  INTEGER
  );
  CREATE TABLE IF NOT EXISTS members (
    board_id  TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role      TEXT NOT NULL,
    pinned    INTEGER NOT NULL DEFAULT 0,
    opened_at INTEGER,
    PRIMARY KEY (board_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS members_user ON members(user_id);
  CREATE TABLE IF NOT EXISTS snapshots (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id   TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    authors    TEXT NOT NULL,
    nodes      INTEGER NOT NULL,
    label      TEXT,
    state      BLOB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS snapshots_board ON snapshots(board_id, created_at);
  CREATE TABLE IF NOT EXISTS files (
    hash       TEXT PRIMARY KEY,
    size       INTEGER NOT NULL,
    mime       TEXT NOT NULL,
    name       TEXT NOT NULL,
    uploader   TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS unfurls (
    url        TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS invites (
    code       TEXT PRIMARY KEY,
    rank       TEXT NOT NULL,
    uses       INTEGER NOT NULL DEFAULT 0,
    max_uses   INTEGER,
    expires_at INTEGER,
    note       TEXT,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS board_links (
    id         TEXT PRIMARY KEY,
    board_id   TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    role       TEXT NOT NULL,
    label      TEXT,
    uses       INTEGER NOT NULL DEFAULT 0,
    max_uses   INTEGER,
    expires_at INTEGER,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS board_links_board ON board_links(board_id);
  CREATE INDEX IF NOT EXISTS files_uploader ON files(uploader);
  CREATE INDEX IF NOT EXISTS boards_owner ON boards(owner_id);
  `);

/* Новые столбцы в старых базах: ALTER TABLE только если столбца ещё нет. */
function addColumn(table: string, column: string, def: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
}
addColumn("users", "rank", "TEXT NOT NULL DEFAULT 'member'");
addColumn("users", "banned_at", "INTEGER");
addColumn("boards", "settings", "TEXT");
/* Владелец сервера — самый первый аккаунт, если владельца ещё нет. */
db.exec(`UPDATE users SET rank = 'owner' WHERE id = (SELECT id FROM users ORDER BY created_at LIMIT 1)
         AND NOT EXISTS (SELECT 1 FROM users WHERE rank = 'owner')`);

const statements = new Map<string, StatementSync>();

/** Подготовленный запрос из кэша: SQL компилируется один раз. */
export function q(sql: string): StatementSync {
  let s = statements.get(sql);
  if (!s) {
    s = db.prepare(sql);
    statements.set(sql, s);
  }
  return s;
}

/** Несколько запросов одной транзакцией. */
export function tx<T>(fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function now(): number {
  return Date.now();
}
