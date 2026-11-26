import { isValidReminderState } from '../models/Reminder'
import type {
  CreateReminderInput,
  Reminder,
  ReminderRestoreSummary,
  ReminderStateFilter
} from '../models/Reminder'
import { computeNextOccurrence, isValidRecurrenceRule } from '../models/Recurrence'
import type { RecurrenceRule } from '../models/Recurrence'
import { NotFoundError, ValidationError } from '../models/ModelError'
import type { ReminderRepository } from '../ports/ReminderRepository'
import type { Scheduler } from '../ports/Scheduler'
import type { Notifier } from '../ports/Notifier'

const MAX_REMINDER_TEXT_LENGTH = 300

export interface ReminderServiceOptions {
  nowProvider?: () => Date
  onStateChanged?: (reminder: Reminder) => void
}

function getJobId(reminderId: number): string {
  return `reminder:${reminderId}`
}

export class ReminderService {
  private readonly repository: ReminderRepository
  private readonly scheduler: Scheduler
  private readonly notifier: Notifier
  private readonly nowProvider: () => Date
  private readonly onStateChanged?: (reminder: Reminder) => void

  constructor(
    repository: ReminderRepository,
    scheduler: Scheduler,
    notifier: Notifier,
    options?: ReminderServiceOptions
  ) {
    this.repository = repository
    this.scheduler = scheduler
    this.notifier = notifier
    this.nowProvider = options?.nowProvider ?? (() => new Date())
    this.onStateChanged = options?.onStateChanged
  }

  async createReminder(input: CreateReminderInput): Promise<Reminder> {
    if (typeof input.text !== 'string') {
      throw new ValidationError('Nội dung nhắc nhở không được để trống.')
    }

    const text = input.text.trim().replace(/\s+/g, ' ')
    if (!text) {
      throw new ValidationError('Nội dung nhắc nhở không được để trống.')
    }
    if (text.length > MAX_REMINDER_TEXT_LENGTH) {
      throw new ValidationError(`Nội dung nhắc nhở tối đa ${MAX_REMINDER_TEXT_LENGTH} ký tự.`)
    }

    if (typeof input.remindAt !== 'string' || !input.remindAt.trim()) {
      throw new ValidationError('Vui lòng chọn thời điểm nhắc nhở.')
    }

    const parsedMs = Date.parse(input.remindAt)
    if (Number.isNaN(parsedMs)) {
      throw new ValidationError('Thời điểm nhắc nhở không đúng định dạng ngày giờ.')
    }

    const nowMs = this.nowProvider().getTime()
    if (parsedMs <= nowMs) {
      throw new ValidationError('Thời điểm nhắc nhở phải ở tương lai.')
    }

    let taskId: number | null = null
    if (input.taskId !== undefined && input.taskId !== null) {
      if (!Number.isInteger(input.taskId) || input.taskId <= 0) {
        throw new ValidationError('Mã công việc liên kết không hợp lệ.')
      }
      taskId = input.taskId
    }

    let recurrence: RecurrenceRule = 'none'
    if (input.recurrence !== undefined && input.recurrence !== null) {
      if (!isValidRecurrenceRule(input.recurrence)) {
        throw new ValidationError('Chu kỳ lặp lại nhắc nhở không hợp lệ.')
      }
      recurrence = input.recurrence
    }

    const remindAtIso = new Date(parsedMs).toISOString()
    const created = await this.repository.create({
      text,
      remindAt: remindAtIso,
      taskId,
      recurrence
    })

    this.scheduleReminder(created)
    this.onStateChanged?.(created)
    return created
  }

  async listReminders(state: ReminderStateFilter = 'all'): Promise<Reminder[]> {
    if (state !== 'all' && !isValidReminderState(state)) {
      throw new ValidationError('Bộ lọc trạng thái nhắc nhở không hợp lệ.')
    }
    return await this.repository.list(state)
  }

  async restoreOnStartup(): Promise<ReminderRestoreSummary> {
    const scheduled = await this.repository.listScheduled()
    const now = this.nowProvider()
    const nowMs = now.getTime()
    const rescheduled: Reminder[] = []
    const missed: Reminder[] = []
    const regenerated: Reminder[] = []

    for (const item of scheduled) {
      const targetMs = Date.parse(item.remindAt)
      if (Number.isNaN(targetMs) || targetMs <= nowMs) {
        const marked = await this.repository.updateState(item.id, 'missed', null)
        if (marked) {
          missed.push(marked)
          this.onStateChanged?.(marked)

          // Nếu là nhắc lặp lại -> giữ bản ghi đã lỡ trong lịch sử và tạo lịch chu kỳ tương lai gần nhất
          if (item.recurrence !== 'none') {
            const nextRemindAt = computeNextOccurrence(item.remindAt, item.recurrence, now)
            const nextItem = await this.repository.create({
              text: item.text,
              remindAt: nextRemindAt,
              taskId: item.taskId,
              recurrence: item.recurrence
            })
            this.scheduleReminder(nextItem)
            regenerated.push(nextItem)
            this.onStateChanged?.(nextItem)
          }
        }
      } else {
        this.scheduleReminder(item)
        rescheduled.push(item)
      }
    }

    return { rescheduled, missed, regenerated }
  }

  async cancelReminder(id: number): Promise<Reminder> {
    if (!Number.isInteger(id) || id <= 0) {
      throw new ValidationError('Mã nhắc nhở không hợp lệ.')
    }

    const existing = await this.repository.findById(id)
    if (!existing) {
      throw new NotFoundError('Không tìm thấy nhắc nhở cần hủy.')
    }

    this.scheduler.cancel(getJobId(id))

    const updated = await this.repository.updateState(id, 'cancelled', existing.firedAt)
    if (!updated) {
      throw new NotFoundError('Không tìm thấy nhắc nhở cần hủy.')
    }

    this.onStateChanged?.(updated)
    return updated
  }

  async cancelScheduledForTask(taskId: number): Promise<void> {
    const scheduled = await this.repository.listScheduled()
    for (const item of scheduled) {
      if (item.taskId === taskId) {
        this.scheduler.cancel(getJobId(item.id))
        const updated = await this.repository.updateState(item.id, 'cancelled', item.firedAt)
        if (updated) {
          this.onStateChanged?.(updated)
        }
      }
    }
  }

  async deleteReminder(id: number): Promise<boolean> {
    if (!Number.isInteger(id) || id <= 0) {
      throw new ValidationError('Mã nhắc nhở không hợp lệ.')
    }

    this.scheduler.cancel(getJobId(id))
    const deleted = await this.repository.delete(id)
    if (!deleted) {
      throw new NotFoundError('Không tìm thấy nhắc nhở để xóa.')
    }
    return true
  }

  dispose(): void {
    this.scheduler.cancelAll()
  }

  private scheduleReminder(reminder: Reminder): void {
    const jobId = getJobId(reminder.id)
    const runAt = new Date(reminder.remindAt)
    this.scheduler.schedule(jobId, runAt, async () => {
      await this.handleReminderFire(reminder.id)
    })
  }

  private async handleReminderFire(reminderId: number): Promise<void> {
    const latest = await this.repository.findById(reminderId)
    if (!latest || latest.state !== 'scheduled') {
      return
    }

    const now = this.nowProvider()
    const firedAt = now.toISOString()
    const fired = await this.repository.updateState(reminderId, 'fired', firedAt)
    if (!fired) {
      return
    }

    this.notifier.notify({
      reminderId: fired.id,
      taskId: fired.taskId,
      title: 'Nhắc nhở từ Asada Sinon',
      body: fired.text,
      firedAt
    })

    // Nếu nhắc nhở có lặp lại -> giữ bản ghi đã nhắc trong lịch sử và tự lập lịch chu kỳ kế tiếp
    if (fired.recurrence !== 'none') {
      const nextRemindAt = computeNextOccurrence(fired.remindAt, fired.recurrence, now)
      const nextItem = await this.repository.create({
        text: fired.text,
        remindAt: nextRemindAt,
        taskId: fired.taskId,
        recurrence: fired.recurrence
      })
      this.scheduleReminder(nextItem)
    }

    this.onStateChanged?.(fired)
  }
}
