import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initDatabase, closeDatabase } from './database'
import { runMigrations } from './migrator'
import { SqliteTaskRepository } from './SqliteTaskRepository'
import { TaskService } from '../../core/services/TaskService'
import { DatabaseError } from '../../core/models/ModelError'

describe('SqliteTaskRepository & TaskService Integration (SQLite in-memory)', () => {
  let db: Database.Database
  let repo: SqliteTaskRepository
  let service: TaskService

  beforeEach(async () => {
    closeDatabase()
    db = initDatabase({ inMemory: true })
    await runMigrations(db)
    repo = new SqliteTaskRepository(db)
    service = new TaskService(repo)
  })

  afterEach(() => {
    closeDatabase()
  })

  it('thêm, đọc, sửa, đổi trạng thái và xóa công việc trực tiếp trên SQLite', async () => {
    const created = await service.createTask({
      title: 'Nộp đồ án Project III',
      dueAt: '2026-12-20T09:00:00.000Z',
      recurrence: 'weekly'
    })

    expect(created.id).toBeGreaterThan(0)
    expect(created.status).toBe('open')
    expect(created.recurrence).toBe('weekly')

    const found = await service.getTaskById(created.id)
    expect(found?.title).toBe('Nộp đồ án Project III')

    const updated = await service.updateTask(created.id, {
      title: 'Nộp báo cáo cuối kỳ',
      status: 'done'
    })
    expect(updated.title).toBe('Nộp báo cáo cuối kỳ')
    expect(updated.status).toBe('done')

    await service.deleteTask(created.id)
    expect(await service.getTaskById(created.id)).toBeNull()
  })

  it('lọc theo trạng thái và sắp xếp theo hạn đúng trên SQLite (NULL xuống cuối)', async () => {
    const noDue = await service.createTask({ title: 'Không có hạn' })
    const late = await service.createTask({ title: 'Hạn sau', dueAt: '2026-12-10T10:00:00.000Z' })
    const early = await service.createTask({ title: 'Hạn đầu', dueAt: '2026-11-25T10:00:00.000Z' })
    await service.toggleTaskStatus(late.id)

    const allAsc = await service.listTasks({ status: 'all', sortBy: 'due_asc' })
    expect(allAsc.map((t) => t.id)).toEqual([early.id, late.id, noDue.id])

    const onlyOpen = await service.listTasks({ status: 'open', sortBy: 'due_asc' })
    expect(onlyOpen.map((t) => t.id)).toEqual([early.id, noDue.id])

    const onlyDone = await service.listTasks({ status: 'done', sortBy: 'due_desc' })
    expect(onlyDone.map((t) => t.id)).toEqual([late.id])
  })

  it('ném DatabaseError khi database đã đóng', async () => {
    db.close()
    await expect(repo.list()).rejects.toThrow(DatabaseError)
  })
})
