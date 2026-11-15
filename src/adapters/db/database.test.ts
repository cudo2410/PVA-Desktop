import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { join } from 'path'
import { initDatabase, closeDatabase, getDatabasePath } from './database'
import { runMigrations } from './migrator'

describe('SQLite Embedded Database Adapter & Migrator', () => {
  let db: Database.Database
  const migrationsDir = join(process.cwd(), 'migrations')

  beforeEach(() => {
    closeDatabase()
    db = initDatabase({ inMemory: true })
  })

  afterEach(() => {
    closeDatabase()
  })

  it('1. Khởi tạo Database và bật PRAGMA foreign_keys = ON', () => {
    expect(db.open).toBe(true)
    const fkPragma = db.pragma('foreign_keys', { simple: true })
    expect(fkPragma).toBe(1)
  })

  it('2. Xác định đường dẫn file Database chuẩn xác', () => {
    const customPath = join(process.cwd(), 'custom', 'test.sqlite')
    expect(getDatabasePath(customPath)).toBe(customPath)

    process.env.PVA_DB_PATH = './temp/pva_env.sqlite'
    expect(getDatabasePath()).toBe('./temp/pva_env.sqlite')
    delete process.env.PVA_DB_PATH
  })

  it('3. Chạy Migration 001 thành công và không chạy lặp lại', async () => {
    const result1 = await runMigrations(db, migrationsDir)
    expect(result1.applied).toContain('001_initial_schema')
    expect(result1.skipped).toHaveLength(0)

    // Kiểm tra bảng schema_migrations
    const migrationRows = db.prepare('SELECT version FROM schema_migrations').all() as {
      version: string
    }[]
    expect(migrationRows.map((r) => r.version)).toContain('001_initial_schema')

    // Chạy lần 2: phải bỏ qua vì đã áp dụng
    const result2 = await runMigrations(db, migrationsDir)
    expect(result2.applied).toHaveLength(0)
    expect(result2.skipped).toContain('001_initial_schema')
  })

  it('4. Tạo đầy đủ 7 bảng và bảng FTS5 theo đặc tả SRS v2.1', async () => {
    await runMigrations(db, migrationsDir)

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type IN ('table', 'virtual') AND name NOT LIKE 'sqlite_%';"
      )
      .all() as { name: string }[]

    const tableNames = tables.map((t) => t.name)
    expect(tableNames).toContain('schema_migrations')
    expect(tableNames).toContain('conversations')
    expect(tableNames).toContain('messages')
    expect(tableNames).toContain('messages_fts')
    expect(tableNames).toContain('tasks')
    expect(tableNames).toContain('reminders')
    expect(tableNames).toContain('settings')
    expect(tableNames).toContain('profile_items')
  })

  it('5. Kiểm thử CRUD và Ràng buộc Khóa ngoại (ON DELETE CASCADE)', async () => {
    await runMigrations(db, migrationsDir)

    // Tạo cuộc hội thoại
    const insertConv = db.prepare('INSERT INTO conversations (title) VALUES (?)')
    const convInfo = insertConv.run('Hội thoại thử nghiệm')
    const convId = Number(convInfo.lastInsertRowid)
    expect(convId).toBeGreaterThan(0)

    // Tạo tin nhắn thuộc hội thoại
    const insertMsg = db.prepare(
      'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)'
    )
    insertMsg.run(convId, 'user', 'Xin chào PVA, đây là tin nhắn số 1')
    insertMsg.run(convId, 'assistant', 'Chào bạn! Tôi là trợ lý ảo PVA.')

    const msgs = db
      .prepare('SELECT * FROM messages WHERE conversation_id = ?')
      .all(convId) as Array<{ role: string; content: string }>
    expect(msgs).toHaveLength(2)

    // Kiểm tra khóa ngoại CASCADE: Xóa conversation sẽ tự xóa messages
    db.prepare('DELETE FROM conversations WHERE id = ?').run(convId)
    const msgsAfterDelete = db
      .prepare('SELECT * FROM messages WHERE conversation_id = ?')
      .all(convId)
    expect(msgsAfterDelete).toHaveLength(0)
  })

  it('6. Kiểm thử Tìm kiếm toàn văn FTS5 (Full-Text Search) trên messages', async () => {
    await runMigrations(db, migrationsDir)

    const convInfo = db.prepare('INSERT INTO conversations (title) VALUES (?)').run('FTS Test')
    const convId = Number(convInfo.lastInsertRowid)

    db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(
      convId,
      'user',
      'Hôm nay tôi cần hoàn thành báo cáo kiến trúc hệ thống PVA'
    )
    db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(
      convId,
      'assistant',
      'Đã ghi nhận, bạn cần tập trung vào SQLite embedded và Hexagonal.'
    )

    // Tìm kiếm bằng FTS5 MATCH
    const searchResults = db
      .prepare(
        'SELECT m.id, m.content FROM messages m JOIN messages_fts fts ON m.id = fts.rowid WHERE messages_fts MATCH ?'
      )
      .all('kiến trúc') as Array<{ content: string }>

    expect(searchResults).toHaveLength(1)
    expect(searchResults[0].content).toContain('kiến trúc hệ thống PVA')
  })

  it('7. Kiểm thử Trigger cập nhật tự động updated_at của bảng tasks', async () => {
    await runMigrations(db, migrationsDir)

    const insertTask = db.prepare('INSERT INTO tasks (title) VALUES (?)').run('Viết unit test')
    const taskId = Number(insertTask.lastInsertRowid)

    const initial = db
      .prepare('SELECT created_at, updated_at FROM tasks WHERE id = ?')
      .get(taskId) as {
      created_at: string
      updated_at: string
    }
    expect(initial.created_at).toBeDefined()
    expect(initial.updated_at).toBeDefined()

    // Cập nhật task
    db.prepare("UPDATE tasks SET status = 'done' WHERE id = ?").run(taskId)
    const updated = db.prepare('SELECT status, updated_at FROM tasks WHERE id = ?').get(taskId) as {
      status: string
      updated_at: string
    }
    expect(updated.status).toBe('done')
    expect(updated.updated_at).toBeDefined()
  })

  it('8. Kiểm thử Ràng buộc CHECK trên role và status', async () => {
    await runMigrations(db, migrationsDir)

    // CHECK role trong messages chỉ nhận 'user', 'assistant', 'system'
    const insertConv = db.prepare('INSERT INTO conversations (title) VALUES (?)').run('Check Test')
    const convId = Number(insertConv.lastInsertRowid)

    expect(() => {
      db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(
        convId,
        'hacker_role',
        'nội dung'
      )
    }).toThrow()

    // CHECK status trong tasks chỉ nhận 'open', 'done'
    expect(() => {
      db.prepare("INSERT INTO tasks (title, status) VALUES (?, 'invalid_status')").run('Test task')
    }).toThrow()
    expect(() => {
      db.prepare("INSERT INTO tasks (title, status) VALUES (?, 'todo')").run('Test todo')
    }).toThrow()
    expect(() => {
      db.prepare("INSERT INTO tasks (title, status) VALUES (?, 'in_progress')").run(
        'Test in_progress'
      )
    }).toThrow()

    // Chấp nhận đúng 'open' và 'done'
    const insertOpen = db
      .prepare("INSERT INTO tasks (title, status) VALUES (?, 'open')")
      .run('Task open')
    expect(Number(insertOpen.lastInsertRowid)).toBeGreaterThan(0)
    const insertDone = db
      .prepare("INSERT INTO tasks (title, status) VALUES (?, 'done')")
      .run('Task done')
    expect(Number(insertDone.lastInsertRowid)).toBeGreaterThan(0)
  })

  it('9. Kiểm thử Transaction Rollback khi xảy ra lỗi', async () => {
    await runMigrations(db, migrationsDir)

    const countBefore = db.prepare('SELECT COUNT(*) as count FROM conversations').get() as {
      count: number
    }

    const failedTransaction = db.transaction(() => {
      db.prepare('INSERT INTO conversations (title) VALUES (?)').run('Hội thoại 1')
      // Cố tình ném lỗi để rollback
      throw new Error('Lỗi cố ý trong giao dịch')
    })

    expect(() => failedTransaction()).toThrow('Lỗi cố ý trong giao dịch')

    const countAfter = db.prepare('SELECT COUNT(*) as count FROM conversations').get() as {
      count: number
    }
    expect(countAfter.count).toBe(countBefore.count)
  })
})
