-- =============================================================================
-- PVA (Personal Virtual Assistant) - Migration 001: Initial Schema (SQLite Embedded)
-- Theo đặc tả SRS v2.1 (Mục 8.4)
-- Engine: SQLite 3 / better-sqlite3 | Foreign Keys: Enabled | FTS5 Enabled
-- =============================================================================

PRAGMA foreign_keys = ON;

-- 1. Bảng theo dõi lịch sử chạy migration
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT NOT NULL PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. Bảng lưu các cuộc hội thoại
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations (created_at);

-- 3. Bảng lưu tin nhắn trong từng cuộc hội thoại
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT fk_messages_conversation
    FOREIGN KEY (conversation_id) REFERENCES conversations (id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages (conversation_id, created_at);

-- 3.1. Bảng FTS5 hỗ trợ tìm kiếm toàn văn (FULLTEXT) trên nội dung tin nhắn
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  content,
  content='messages',
  content_rowid='id'
);

-- Triggers đồng bộ tự động giữa bảng messages và messages_fts
CREATE TRIGGER IF NOT EXISTS trg_messages_fts_insert AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS trg_messages_fts_delete AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', old.id, old.content);
END;

CREATE TRIGGER IF NOT EXISTS trg_messages_fts_update AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', old.id, old.content);
  INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
END;

-- 4. Bảng quản lý danh sách công việc (Todo List)
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  due_at TEXT NULL DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON tasks (status, due_at);

-- Trigger tự động cập nhật trường updated_at khi sửa bản ghi tasks
CREATE TRIGGER IF NOT EXISTS trg_tasks_updated_at AFTER UPDATE ON tasks FOR EACH ROW BEGIN
  UPDATE tasks SET updated_at = datetime('now') WHERE id = OLD.id;
END;

-- 5. Bảng quản lý lịch nhắc nhở
CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NULL DEFAULT NULL,
  text TEXT NOT NULL,
  remind_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'scheduled' CHECK (state IN ('scheduled', 'fired', 'missed', 'cancelled')),
  fired_at TEXT NULL DEFAULT NULL,
  CONSTRAINT fk_reminders_task
    FOREIGN KEY (task_id) REFERENCES tasks (id)
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reminders_state_remind_at ON reminders (state, remind_at);
CREATE INDEX IF NOT EXISTS idx_reminders_task_id ON reminders (task_id);

-- 6. Bảng lưu cấu hình ứng dụng (key-value JSON)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT NOT NULL PRIMARY KEY,
  value TEXT NOT NULL
);

-- 7. Bảng lưu thông tin hồ sơ cá nhân do người dùng cung cấp
CREATE TABLE IF NOT EXISTS profile_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_profile_items_enabled ON profile_items (enabled);

-- Ghi nhận phiên bản migration 001 (an toàn khi chạy lại nhờ INSERT OR IGNORE)
INSERT OR IGNORE INTO schema_migrations (version)
VALUES ('001_initial_schema');
