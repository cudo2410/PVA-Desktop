import Database from 'better-sqlite3'
import { DatabaseError } from '../../core/models/ModelError'
import type { RecurrenceRule } from '../../core/models/Recurrence'
import type {
  CreateTaskInput,
  Task,
  TaskListOptions,
  TaskStatus,
  UpdateTaskInput
} from '../../core/models/Task'
import type { TaskRepository } from '../../core/ports/TaskRepository'
import { getDatabase } from './database'

interface TaskRow {
  id: number
  title: string
  dueAt: string | null
  status: TaskStatus
  recurrence: RecurrenceRule
  createdAt: string
  updatedAt: string
}

const SELECT_TASK_COLUMNS = `
  id,
  title,
  due_at as dueAt,
  status,
  recurrence,
  created_at as createdAt,
  updated_at as updatedAt
`

export class SqliteTaskRepository implements TaskRepository {
  private readonly db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  private safeExecute<T>(fn: () => T, actionDesc: string): T {
    try {
      return fn()
    } catch (err: unknown) {
      if (err instanceof DatabaseError) {
        throw err
      }
      const detail = err instanceof Error ? err.message : String(err)
      throw new DatabaseError(`Không thể ${actionDesc} do cơ sở dữ liệu không khả dụng: ${detail}`)
    }
  }

  async create(input: CreateTaskInput): Promise<Task> {
    return this.safeExecute(() => {
      const now = new Date().toISOString()
      const recurrence: RecurrenceRule = input.recurrence ?? 'none'
      const stmt = this.db.prepare(
        'INSERT INTO tasks (title, due_at, status, recurrence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      const result = stmt.run(input.title, input.dueAt ?? null, 'open', recurrence, now, now)
      const newId = Number(result.lastInsertRowid)
      const created = this.db
        .prepare(`SELECT ${SELECT_TASK_COLUMNS} FROM tasks WHERE id = ?`)
        .get(newId) as TaskRow

      return created
    }, 'tạo công việc mới')
  }

  async findById(id: number): Promise<Task | null> {
    return this.safeExecute(() => {
      const row = this.db
        .prepare(`SELECT ${SELECT_TASK_COLUMNS} FROM tasks WHERE id = ?`)
        .get(id) as TaskRow | undefined

      return row ?? null
    }, 'tìm công việc')
  }

  async list(options?: TaskListOptions): Promise<Task[]> {
    return this.safeExecute(() => {
      const conditions: string[] = []
      const params: unknown[] = []

      if (options?.status && options.status !== 'all') {
        conditions.push('status = ?')
        params.push(options.status)
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      let orderClause = 'ORDER BY (due_at IS NULL) ASC, due_at ASC, id DESC'
      if (options?.sortBy === 'due_desc') {
        orderClause = 'ORDER BY (due_at IS NULL) ASC, due_at DESC, id DESC'
      } else if (options?.sortBy === 'created_desc') {
        orderClause = 'ORDER BY id DESC'
      }

      const rows = this.db
        .prepare(`SELECT ${SELECT_TASK_COLUMNS} FROM tasks ${whereClause} ${orderClause}`)
        .all(...params) as TaskRow[]

      return rows
    }, 'lấy danh sách công việc')
  }

  async update(id: number, input: UpdateTaskInput): Promise<Task | null> {
    return this.safeExecute(() => {
      const existing = this.db
        .prepare(`SELECT ${SELECT_TASK_COLUMNS} FROM tasks WHERE id = ?`)
        .get(id) as TaskRow | undefined

      if (!existing) {
        return null
      }

      const nextTitle = input.title !== undefined ? input.title : existing.title
      const nextDueAt = input.dueAt !== undefined ? input.dueAt : existing.dueAt
      const nextStatus = input.status !== undefined ? input.status : existing.status
      const nextRecurrence = input.recurrence !== undefined ? input.recurrence : existing.recurrence

      this.db
        .prepare('UPDATE tasks SET title = ?, due_at = ?, status = ?, recurrence = ? WHERE id = ?')
        .run(nextTitle, nextDueAt, nextStatus, nextRecurrence, id)

      const updated = this.db
        .prepare(`SELECT ${SELECT_TASK_COLUMNS} FROM tasks WHERE id = ?`)
        .get(id) as TaskRow

      return updated
    }, 'cập nhật công việc')
  }

  async delete(id: number): Promise<boolean> {
    return this.safeExecute(() => {
      const res = this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
      return res.changes > 0
    }, 'xóa công việc')
  }
}
