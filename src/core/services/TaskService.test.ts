import { describe, it, expect, beforeEach } from 'vitest'
import { TaskService } from './TaskService'
import { NotFoundError, ValidationError } from '../models/ModelError'
import type { CreateTaskInput, Task, TaskListOptions, UpdateTaskInput } from '../models/Task'
import type { TaskRepository } from '../ports/TaskRepository'

class FakeTaskRepository implements TaskRepository {
  private nextId = 1
  private items = new Map<number, Task>()

  async create(input: CreateTaskInput): Promise<Task> {
    const now = new Date().toISOString()
    const task: Task = {
      id: this.nextId++,
      title: input.title,
      dueAt: input.dueAt ?? null,
      status: 'open',
      recurrence: input.recurrence ?? 'none',
      createdAt: now,
      updatedAt: now
    }
    this.items.set(task.id, task)
    return { ...task }
  }

  async findById(id: number): Promise<Task | null> {
    const found = this.items.get(id)
    return found ? { ...found } : null
  }

  async list(options?: TaskListOptions): Promise<Task[]> {
    const all = Array.from(this.items.values()).map((t) => ({ ...t }))
    if (options?.status && options.status !== 'all') {
      return all.filter((t) => t.status === options.status)
    }
    return all
  }

  async update(id: number, input: UpdateTaskInput): Promise<Task | null> {
    const existing = this.items.get(id)
    if (!existing) return null

    const updated: Task = {
      ...existing,
      title: input.title !== undefined ? input.title : existing.title,
      dueAt: input.dueAt !== undefined ? input.dueAt : existing.dueAt,
      status: input.status !== undefined ? input.status : existing.status,
      recurrence: input.recurrence !== undefined ? input.recurrence : existing.recurrence,
      updatedAt: new Date().toISOString()
    }
    this.items.set(id, updated)
    return { ...updated }
  }

  async delete(id: number): Promise<boolean> {
    return this.items.delete(id)
  }
}

describe('TaskService (với FakeTaskRepository)', () => {
  let repo: FakeTaskRepository
  let service: TaskService

  beforeEach(() => {
    repo = new FakeTaskRepository()
    service = new TaskService(repo)
  })

  it('tạo công việc hợp lệ, chuẩn hóa khoảng trắng và lưu trạng thái mặc định open', async () => {
    const task = await service.createTask({
      title: '   Hoàn thành   báo cáo Tuần 4   ',
      dueAt: '2026-11-25T14:30:00+07:00'
    })

    expect(task.id).toBe(1)
    expect(task.title).toBe('Hoàn thành báo cáo Tuần 4')
    expect(task.status).toBe('open')
    expect(task.dueAt).toBe('2026-11-25T07:30:00.000Z')
  })

  it('tạo công việc không có hạn (dueAt = null)', async () => {
    const task = await service.createTask({ title: 'Mua tài liệu học tập' })
    expect(task.dueAt).toBeNull()
    expect(task.status).toBe('open')
  })

  it('từ chối tiêu đề rỗng, chỉ chứa khoảng trắng hoặc vượt quá 200 ký tự', async () => {
    await expect(service.createTask({ title: '' })).rejects.toThrow(ValidationError)
    await expect(service.createTask({ title: '     ' })).rejects.toThrow(ValidationError)
    await expect(service.createTask({ title: 'a'.repeat(201) })).rejects.toThrow(ValidationError)
  })

  it('từ chối dueAt sai định dạng ngày giờ', async () => {
    await expect(
      service.createTask({ title: 'Họp nhóm', dueAt: 'not-a-valid-date' })
    ).rejects.toThrow(ValidationError)
  })

  it('sửa tiêu đề, hạn và xóa hạn về null', async () => {
    const created = await service.createTask({
      title: 'Viết đặc tả',
      dueAt: '2026-11-24T09:00:00.000Z'
    })

    const updated = await service.updateTask(created.id, {
      title: 'Viết đặc tả SRS v2.1',
      dueAt: null
    })

    expect(updated.title).toBe('Viết đặc tả SRS v2.1')
    expect(updated.dueAt).toBeNull()
  })

  it('đánh dấu hoàn thành và mở lại công việc qua toggleTaskStatus', async () => {
    const created = await service.createTask({ title: 'Kiểm thử hộp đen' })

    const doneTask = await service.toggleTaskStatus(created.id)
    expect(doneTask.status).toBe('done')

    const reopenedTask = await service.toggleTaskStatus(created.id)
    expect(reopenedTask.status).toBe('open')
  })

  it('lọc công việc theo trạng thái all / open / done', async () => {
    const t1 = await service.createTask({ title: 'Việc 1' })
    const t2 = await service.createTask({ title: 'Việc 2' })
    await service.toggleTaskStatus(t2.id)

    const all = await service.listTasks({ status: 'all' })
    const open = await service.listTasks({ status: 'open' })
    const done = await service.listTasks({ status: 'done' })

    expect(all).toHaveLength(2)
    expect(open.map((t) => t.id)).toEqual([t1.id])
    expect(done.map((t) => t.id)).toEqual([t2.id])
  })

  it('sắp xếp công việc theo hạn (due_asc đưa việc không có hạn xuống cuối, due_desc, created_desc)', async () => {
    const noDue = await service.createTask({ title: 'Không hạn' })
    const late = await service.createTask({ title: 'Hạn muộn', dueAt: '2026-11-30T10:00:00.000Z' })
    const soon = await service.createTask({ title: 'Hạn sớm', dueAt: '2026-11-23T08:00:00.000Z' })

    const asc = await service.listTasks({ sortBy: 'due_asc' })
    expect(asc.map((t) => t.id)).toEqual([soon.id, late.id, noDue.id])

    const desc = await service.listTasks({ sortBy: 'due_desc' })
    expect(desc.map((t) => t.id)).toEqual([late.id, soon.id, noDue.id])

    const createdDesc = await service.listTasks({ sortBy: 'created_desc' })
    expect(createdDesc.map((t) => t.id)).toEqual([soon.id, late.id, noDue.id])
  })

  it('xóa công việc tồn tại và ném NotFoundError khi xóa hoặc sửa id không tồn tại', async () => {
    const t = await service.createTask({ title: 'Việc cần xóa' })
    expect(await service.deleteTask(t.id)).toBe(true)
    expect(await service.getTaskById(t.id)).toBeNull()

    await expect(service.deleteTask(999)).rejects.toThrow(NotFoundError)
    await expect(service.updateTask(999, { title: 'Mới' })).rejects.toThrow(NotFoundError)
    await expect(service.toggleTaskStatus(999)).rejects.toThrow(NotFoundError)
  })

  it('từ chối id không hợp lệ', async () => {
    await expect(service.deleteTask(0)).rejects.toThrow(ValidationError)
    await expect(service.updateTask(-5, { title: 'Test' })).rejects.toThrow(ValidationError)
  })

  it('hoàn thành công việc lặp hàng ngày sẽ giữ bản ghi done và tự tạo bản ghi chu kỳ tiếp theo', async () => {
    const created = await service.createTask({
      title: 'Viết nhật ký tiến độ',
      dueAt: '2026-11-22T13:00:00.000Z',
      recurrence: 'daily'
    })

    const completed = await service.toggleTaskStatus(created.id)
    expect(completed.status).toBe('done')

    const all = await service.listTasks({ status: 'all' })
    expect(all).toHaveLength(2)
    const nextOpen = all.find((t) => t.id !== created.id)
    expect(nextOpen?.status).toBe('open')
    expect(nextOpen?.recurrence).toBe('daily')
    expect(nextOpen?.dueAt).toBe('2026-11-23T13:00:00.000Z')
  })
})
