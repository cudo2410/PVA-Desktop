import { isValidTaskStatus } from '../models/Task'
import type {
  CreateTaskInput,
  Task,
  TaskListOptions,
  TaskSortBy,
  TaskStatusFilter,
  UpdateTaskInput
} from '../models/Task'
import { computeNextOccurrence, isValidRecurrenceRule } from '../models/Recurrence'
import type { RecurrenceRule } from '../models/Recurrence'
import { NotFoundError, ValidationError } from '../models/ModelError'
import type { TaskRepository } from '../ports/TaskRepository'

const MAX_TITLE_LENGTH = 200
const VALID_SORT_VALUES: readonly TaskSortBy[] = ['due_asc', 'due_desc', 'created_desc']

function normalizeTitle(rawTitle: unknown): string {
  if (typeof rawTitle !== 'string') {
    throw new ValidationError('Tiêu đề công việc không được để trống.')
  }
  const trimmed = rawTitle.trim().replace(/\s+/g, ' ')
  if (!trimmed) {
    throw new ValidationError('Tiêu đề công việc không được để trống.')
  }
  if (trimmed.length > MAX_TITLE_LENGTH) {
    throw new ValidationError(`Tiêu đề công việc tối đa ${MAX_TITLE_LENGTH} ký tự.`)
  }
  return trimmed
}

function normalizeDueAt(rawDueAt: unknown): string | null {
  if (rawDueAt === undefined || rawDueAt === null || rawDueAt === '') {
    return null
  }
  if (typeof rawDueAt !== 'string') {
    throw new ValidationError('Thời hạn công việc không hợp lệ.')
  }
  const trimmed = rawDueAt.trim()
  if (!trimmed) {
    return null
  }
  const parsed = Date.parse(trimmed)
  if (Number.isNaN(parsed)) {
    throw new ValidationError('Thời hạn công việc không đúng định dạng ngày giờ.')
  }
  return new Date(parsed).toISOString()
}

function normalizeRecurrence(raw: unknown): RecurrenceRule {
  if (raw === undefined || raw === null || raw === '') {
    return 'none'
  }
  if (!isValidRecurrenceRule(raw)) {
    throw new ValidationError('Chu kỳ lặp lại công việc không hợp lệ.')
  }
  return raw
}

function normalizeId(id: number): number {
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError('Mã công việc không hợp lệ.')
  }
  return id
}

function sortTasks(tasks: Task[], sortBy: TaskSortBy): Task[] {
  const cloned = [...tasks]
  if (sortBy === 'due_asc') {
    return cloned.sort((a, b) => {
      if (a.dueAt === null && b.dueAt === null) {
        return b.id - a.id
      }
      if (a.dueAt === null) return 1
      if (b.dueAt === null) return -1
      const diff = Date.parse(a.dueAt) - Date.parse(b.dueAt)
      return diff !== 0 ? diff : b.id - a.id
    })
  }

  if (sortBy === 'due_desc') {
    return cloned.sort((a, b) => {
      if (a.dueAt === null && b.dueAt === null) {
        return b.id - a.id
      }
      if (a.dueAt === null) return 1
      if (b.dueAt === null) return -1
      const diff = Date.parse(b.dueAt) - Date.parse(a.dueAt)
      return diff !== 0 ? diff : b.id - a.id
    })
  }

  return cloned.sort((a, b) => b.id - a.id)
}

export interface TaskServiceOptions {
  nowProvider?: () => Date
  onTaskDeleted?: (taskId: number) => Promise<void> | void
}

export class TaskService {
  private readonly repository: TaskRepository
  private readonly nowProvider: () => Date
  private readonly onTaskDeleted?: (taskId: number) => Promise<void> | void

  constructor(repository: TaskRepository, options?: TaskServiceOptions) {
    this.repository = repository
    this.nowProvider = options?.nowProvider ?? (() => new Date())
    this.onTaskDeleted = options?.onTaskDeleted
  }

  async createTask(input: CreateTaskInput): Promise<Task> {
    const title = normalizeTitle(input.title)
    const dueAt = normalizeDueAt(input.dueAt)
    const recurrence = normalizeRecurrence(input.recurrence)
    return await this.repository.create({ title, dueAt, recurrence })
  }

  async listTasks(options?: TaskListOptions): Promise<Task[]> {
    const status: TaskStatusFilter = options?.status ?? 'all'
    if (status !== 'all' && !isValidTaskStatus(status)) {
      throw new ValidationError('Bộ lọc trạng thái công việc không hợp lệ.')
    }

    const sortBy: TaskSortBy = options?.sortBy ?? 'due_asc'
    if (!VALID_SORT_VALUES.includes(sortBy)) {
      throw new ValidationError('Tùy chọn sắp xếp công việc không hợp lệ.')
    }

    const items = await this.repository.list({ status, sortBy })
    const filtered = status === 'all' ? items : items.filter((t) => t.status === status)
    return sortTasks(filtered, sortBy)
  }

  async getTaskById(id: number): Promise<Task | null> {
    const validId = normalizeId(id)
    return await this.repository.findById(validId)
  }

  async updateTask(id: number, input: UpdateTaskInput): Promise<Task> {
    const validId = normalizeId(id)
    const payload: UpdateTaskInput = {}

    if (input.title !== undefined) {
      payload.title = normalizeTitle(input.title)
    }
    if (input.dueAt !== undefined) {
      payload.dueAt = normalizeDueAt(input.dueAt)
    }
    if (input.status !== undefined) {
      if (!isValidTaskStatus(input.status)) {
        throw new ValidationError('Trạng thái công việc không hợp lệ.')
      }
      payload.status = input.status
    }
    if (input.recurrence !== undefined) {
      payload.recurrence = normalizeRecurrence(input.recurrence)
    }

    if (Object.keys(payload).length === 0) {
      const existing = await this.repository.findById(validId)
      if (!existing) {
        throw new NotFoundError('Không tìm thấy công việc cần cập nhật.')
      }
      return existing
    }

    const updated = await this.repository.update(validId, payload)
    if (!updated) {
      throw new NotFoundError('Không tìm thấy công việc cần cập nhật.')
    }
    return updated
  }

  async toggleTaskStatus(id: number): Promise<Task> {
    const validId = normalizeId(id)
    const existing = await this.repository.findById(validId)
    if (!existing) {
      throw new NotFoundError('Không tìm thấy công việc cần thay đổi trạng thái.')
    }

    const nextStatus = existing.status === 'open' ? 'done' : 'open'
    const updated = await this.repository.update(validId, { status: nextStatus })
    if (!updated) {
      throw new NotFoundError('Không tìm thấy công việc cần thay đổi trạng thái.')
    }

    // Nếu hoàn thành công việc có lặp lại -> giữ nguyên bản ghi đã xong trong lịch sử và tạo bản ghi mới cho chu kỳ kế tiếp
    if (nextStatus === 'done' && existing.recurrence !== 'none') {
      const baseIso = existing.dueAt ?? this.nowProvider().toISOString()
      const nextDueAt = computeNextOccurrence(baseIso, existing.recurrence)
      await this.repository.create({
        title: existing.title,
        dueAt: nextDueAt,
        recurrence: existing.recurrence
      })
    }

    return updated
  }

  async deleteTask(id: number): Promise<boolean> {
    const validId = normalizeId(id)
    const deleted = await this.repository.delete(validId)
    if (!deleted) {
      throw new NotFoundError('Không tìm thấy công việc để xóa.')
    }
    await this.onTaskDeleted?.(validId)
    return true
  }
}
