import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initDatabase, closeDatabase } from './database'
import { runMigrations } from './migrator'
import { SqliteReminderRepository } from './SqliteReminderRepository'
import { SqliteTaskRepository } from './SqliteTaskRepository'
import { DatabaseError } from '../../core/models/ModelError'

describe('SqliteReminderRepository (SQLite in-memory)', () => {
  let db: Database.Database
  let reminderRepo: SqliteReminderRepository
  let taskRepo: SqliteTaskRepository

  beforeEach(async () => {
    closeDatabase()
    db = initDatabase({ inMemory: true })
    await runMigrations(db)
    reminderRepo = new SqliteReminderRepository(db)
    taskRepo = new SqliteTaskRepository(db)
  })

  afterEach(() => {
    closeDatabase()
  })

  it('tạo, truy vấn, cập nhật trạng thái và xóa nhắc nhở trên SQLite', async () => {
    const created = await reminderRepo.create({
      text: 'Uống nước',
      remindAt: '2026-11-22T12:00:00.000Z',
      recurrence: 'daily'
    })

    expect(created.id).toBeGreaterThan(0)
    expect(created.state).toBe('scheduled')
    expect(created.recurrence).toBe('daily')
    expect(created.firedAt).toBeNull()

    const fired = await reminderRepo.updateState(created.id, 'fired', '2026-11-22T12:00:00.500Z')
    expect(fired?.state).toBe('fired')
    expect(fired?.firedAt).toBe('2026-11-22T12:00:00.500Z')

    expect(await reminderRepo.delete(created.id)).toBe(true)
    expect(await reminderRepo.findById(created.id)).toBeNull()
  })

  it('đặt task_id về NULL khi công việc liên kết bị xóa (FK ON DELETE SET NULL)', async () => {
    const task = await taskRepo.create({ title: 'Họp nhóm', dueAt: null })
    const reminder = await reminderRepo.create({
      text: 'Chuẩn bị slide họp nhóm',
      remindAt: '2026-11-23T08:00:00.000Z',
      taskId: task.id
    })

    expect(reminder.taskId).toBe(task.id)

    await taskRepo.delete(task.id)
    const reloaded = await reminderRepo.findById(reminder.id)
    expect(reloaded).not.toBeNull()
    expect(reloaded?.taskId).toBeNull()
  })

  it('ném DatabaseError khi database đã đóng', async () => {
    db.close()
    await expect(reminderRepo.list()).rejects.toThrow(DatabaseError)
  })
})
