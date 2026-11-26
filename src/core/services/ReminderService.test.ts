import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReminderService } from './ReminderService'
import { InAppScheduler } from '../../adapters/scheduler/InAppScheduler'
import { NotFoundError, ValidationError } from '../models/ModelError'
import type {
  CreateReminderInput,
  Reminder,
  ReminderState,
  ReminderStateFilter
} from '../models/Reminder'
import type { ReminderRepository } from '../ports/ReminderRepository'
import type { NotificationPayload, Notifier } from '../ports/Notifier'

class FakeReminderRepository implements ReminderRepository {
  private nextId = 1
  items = new Map<number, Reminder>()

  async create(input: CreateReminderInput): Promise<Reminder> {
    const reminder: Reminder = {
      id: this.nextId++,
      taskId: input.taskId ?? null,
      text: input.text,
      remindAt: input.remindAt,
      state: 'scheduled',
      recurrence: input.recurrence ?? 'none',
      firedAt: null
    }
    this.items.set(reminder.id, reminder)
    return { ...reminder }
  }

  async findById(id: number): Promise<Reminder | null> {
    const found = this.items.get(id)
    return found ? { ...found } : null
  }

  async list(state: ReminderStateFilter = 'all'): Promise<Reminder[]> {
    const all = Array.from(this.items.values()).map((r) => ({ ...r }))
    if (state === 'all') return all
    return all.filter((r) => r.state === state)
  }

  async listScheduled(): Promise<Reminder[]> {
    return await this.list('scheduled')
  }

  async updateState(
    id: number,
    state: ReminderState,
    firedAt?: string | null
  ): Promise<Reminder | null> {
    const existing = this.items.get(id)
    if (!existing) return null
    const updated: Reminder = {
      ...existing,
      state,
      firedAt: firedAt !== undefined ? firedAt : existing.firedAt
    }
    this.items.set(id, updated)
    return { ...updated }
  }

  async delete(id: number): Promise<boolean> {
    return this.items.delete(id)
  }
}

class FakeNotifier implements Notifier {
  notifications: NotificationPayload[] = []

  notify(payload: NotificationPayload): void {
    this.notifications.push(payload)
  }
}

describe('ReminderService (FR-05)', () => {
  let repo: FakeReminderRepository
  let scheduler: InAppScheduler
  let notifier: FakeNotifier
  let service: ReminderService

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-22T10:00:00.000Z'))
    repo = new FakeReminderRepository()
    scheduler = new InAppScheduler()
    notifier = new FakeNotifier()
    service = new ReminderService(repo, scheduler, notifier)
  })

  afterEach(() => {
    service.dispose()
    vi.useRealTimers()
  })

  it('nhắc đặt sau 2 phút hiện đúng giờ và cập nhật trạng thái fired', async () => {
    const target = new Date('2026-11-22T10:02:00.000Z').toISOString()
    const created = await service.createReminder({
      text: 'Kiểm tra nồi nước',
      remindAt: target
    })

    expect(created.state).toBe('scheduled')
    expect(notifier.notifications).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(120_000)

    expect(notifier.notifications).toHaveLength(1)
    expect(notifier.notifications[0].body).toBe('Kiểm tra nồi nước')
    expect(notifier.notifications[0].reminderId).toBe(created.id)

    const updated = await repo.findById(created.id)
    expect(updated?.state).toBe('fired')
    expect(updated?.firedAt).toBe('2026-11-22T10:02:00.000Z')
  })

  it('từ chối thời điểm ở quá khứ hoặc nội dung rỗng', async () => {
    await expect(
      service.createReminder({
        text: 'Nhắc quá khứ',
        remindAt: '2026-11-22T09:59:59.000Z'
      })
    ).rejects.toThrow(ValidationError)

    await expect(
      service.createReminder({
        text: '   ',
        remindAt: '2026-11-22T10:05:00.000Z'
      })
    ).rejects.toThrow(ValidationError)
  })

  it('restoreOnStartup() đánh dấu "missed" cho nhắc bị lỡ lúc app tắt và nạp lại nhắc còn hạn', async () => {
    const missedItem = await repo.create({
      text: 'Nhắc đã quá giờ khi tắt app',
      remindAt: '2026-11-22T09:30:00.000Z'
    })
    const futureItem = await repo.create({
      text: 'Nhắc sắp tới sau 2 phút',
      remindAt: '2026-11-22T10:02:00.000Z'
    })

    const summary = await service.restoreOnStartup()
    expect(summary.missed.map((r) => r.id)).toEqual([missedItem.id])
    expect(summary.rescheduled.map((r) => r.id)).toEqual([futureItem.id])

    expect((await repo.findById(missedItem.id))?.state).toBe('missed')
    expect(notifier.notifications).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(120_000)
    expect(notifier.notifications).toHaveLength(1)
    expect(notifier.notifications[0].body).toBe('Nhắc sắp tới sau 2 phút')
  })

  it('hủy nhắc nhở ngăn thông báo bắn và cập nhật state = cancelled', async () => {
    const created = await service.createReminder({
      text: 'Nhắc sẽ hủy',
      remindAt: '2026-11-22T10:02:00.000Z'
    })

    const cancelled = await service.cancelReminder(created.id)
    expect(cancelled.state).toBe('cancelled')

    await vi.advanceTimersByTimeAsync(180_000)
    expect(notifier.notifications).toHaveLength(0)
  })

  it('ném NotFoundError khi hủy hoặc xóa nhắc nhở không tồn tại', async () => {
    await expect(service.cancelReminder(404)).rejects.toThrow(NotFoundError)
    await expect(service.deleteReminder(404)).rejects.toThrow(NotFoundError)
  })

  it('nhắc lặp hàng ngày sau khi bắn sẽ lưu bản ghi fired và tự lập lịch ngày hôm sau', async () => {
    const first = await service.createReminder({
      text: 'Uống vitamin buổi sáng',
      remindAt: '2026-11-22T10:02:00.000Z',
      recurrence: 'daily'
    })

    await vi.advanceTimersByTimeAsync(120_000)
    expect(notifier.notifications).toHaveLength(1)

    const all = await repo.list('all')
    expect(all).toHaveLength(2)
    expect(all.find((r) => r.id === first.id)?.state).toBe('fired')

    const nextScheduled = all.find((r) => r.id !== first.id)
    expect(nextScheduled?.state).toBe('scheduled')
    expect(nextScheduled?.recurrence).toBe('daily')
    expect(nextScheduled?.remindAt).toBe('2026-11-23T10:02:00.000Z')
  })

  it('restoreOnStartup() đánh dấu missed cho nhắc lặp bị lỡ và tự sinh lịch tương lai gần nhất', async () => {
    await repo.create({
      text: 'Họp giao ban tuần',
      remindAt: '2026-11-15T10:00:00.000Z',
      recurrence: 'weekly'
    })

    const summary = await service.restoreOnStartup()
    expect(summary.missed).toHaveLength(1)
    expect(summary.regenerated).toHaveLength(1)
    expect(summary.regenerated[0].state).toBe('scheduled')
    expect(summary.regenerated[0].remindAt).toBe('2026-11-29T10:00:00.000Z')
  })
})
