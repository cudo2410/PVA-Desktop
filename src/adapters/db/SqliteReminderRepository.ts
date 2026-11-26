import Database from 'better-sqlite3'
import { DatabaseError } from '../../core/models/ModelError'
import type { RecurrenceRule } from '../../core/models/Recurrence'
import type {
  CreateReminderInput,
  Reminder,
  ReminderState,
  ReminderStateFilter
} from '../../core/models/Reminder'
import type { ReminderRepository } from '../../core/ports/ReminderRepository'
import { getDatabase } from './database'

interface ReminderRow {
  id: number
  taskId: number | null
  text: string
  remindAt: string
  state: ReminderState
  recurrence: RecurrenceRule
  firedAt: string | null
}

const SELECT_REMINDER_COLUMNS = `
  id,
  task_id as taskId,
  text,
  remind_at as remindAt,
  state,
  recurrence,
  fired_at as firedAt
`

export class SqliteReminderRepository implements ReminderRepository {
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

  async create(input: CreateReminderInput): Promise<Reminder> {
    return this.safeExecute(() => {
      const recurrence: RecurrenceRule = input.recurrence ?? 'none'
      const stmt = this.db.prepare(
        'INSERT INTO reminders (task_id, text, remind_at, state, recurrence, fired_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      const res = stmt.run(
        input.taskId ?? null,
        input.text,
        input.remindAt,
        'scheduled',
        recurrence,
        null
      )
      const newId = Number(res.lastInsertRowid)
      const row = this.db
        .prepare(`SELECT ${SELECT_REMINDER_COLUMNS} FROM reminders WHERE id = ?`)
        .get(newId) as ReminderRow

      return row
    }, 'tạo nhắc nhở mới')
  }

  async findById(id: number): Promise<Reminder | null> {
    return this.safeExecute(() => {
      const row = this.db
        .prepare(`SELECT ${SELECT_REMINDER_COLUMNS} FROM reminders WHERE id = ?`)
        .get(id) as ReminderRow | undefined

      return row ?? null
    }, 'tìm nhắc nhở')
  }

  async list(state: ReminderStateFilter = 'all'): Promise<Reminder[]> {
    return this.safeExecute(() => {
      if (state !== 'all') {
        return this.db
          .prepare(
            `SELECT ${SELECT_REMINDER_COLUMNS} FROM reminders WHERE state = ? ORDER BY remind_at ASC, id DESC`
          )
          .all(state) as ReminderRow[]
      }

      return this.db
        .prepare(
          `SELECT ${SELECT_REMINDER_COLUMNS} FROM reminders
           ORDER BY
             CASE state
               WHEN 'scheduled' THEN 0
               WHEN 'missed' THEN 1
               WHEN 'fired' THEN 2
               ELSE 3
             END ASC,
             remind_at ASC,
             id DESC`
        )
        .all() as ReminderRow[]
    }, 'lấy danh sách nhắc nhở')
  }

  async listScheduled(): Promise<Reminder[]> {
    return await this.list('scheduled')
  }

  async updateState(
    id: number,
    state: ReminderState,
    firedAt?: string | null
  ): Promise<Reminder | null> {
    return this.safeExecute(() => {
      const existing = this.db
        .prepare(`SELECT ${SELECT_REMINDER_COLUMNS} FROM reminders WHERE id = ?`)
        .get(id) as ReminderRow | undefined

      if (!existing) {
        return null
      }

      const nextFiredAt = firedAt !== undefined ? firedAt : existing.firedAt
      this.db
        .prepare('UPDATE reminders SET state = ?, fired_at = ? WHERE id = ?')
        .run(state, nextFiredAt, id)

      return this.db
        .prepare(`SELECT ${SELECT_REMINDER_COLUMNS} FROM reminders WHERE id = ?`)
        .get(id) as ReminderRow
    }, 'cập nhật trạng thái nhắc nhở')
  }

  async delete(id: number): Promise<boolean> {
    return this.safeExecute(() => {
      const res = this.db.prepare('DELETE FROM reminders WHERE id = ?').run(id)
      return res.changes > 0
    }, 'xóa nhắc nhở')
  }
}
