import { ipcMain } from 'electron'
import { ReminderService } from '../../core/services/ReminderService'
import { DatabaseError, NotFoundError, ValidationError } from '../../core/models/ModelError'
import type { CreateReminderInput, Reminder, ReminderStateFilter } from '../../core/models/Reminder'

export interface ReminderIpcResponse {
  success: boolean
  reminder?: Reminder
  reminders?: Reminder[]
  code?: string
  error?: string
}

function mapReminderError(err: unknown): { code: string; error: string } {
  if (err instanceof ValidationError) {
    return { code: err.code, error: err.message }
  }
  if (err instanceof NotFoundError) {
    return { code: err.code, error: err.message }
  }
  if (err instanceof DatabaseError) {
    return {
      code: err.code,
      error: 'Cơ sở dữ liệu hiện không khả dụng. Vui lòng thử lại sau.'
    }
  }
  return {
    code: 'UNKNOWN_ERROR',
    error: err instanceof Error ? err.message : 'Đã xảy ra lỗi không xác định khi xử lý nhắc nhở.'
  }
}

export function registerRemindersIpc(reminderService: ReminderService): void {
  ipcMain.handle('reminders:list', async (_, state?: unknown): Promise<ReminderIpcResponse> => {
    try {
      const filter: ReminderStateFilter =
        typeof state === 'string' ? (state as ReminderStateFilter) : 'all'
      const reminders = await reminderService.listReminders(filter)
      return { success: true, reminders }
    } catch (err: unknown) {
      const mapped = mapReminderError(err)
      return { success: false, code: mapped.code, error: mapped.error }
    }
  })

  ipcMain.handle('reminders:create', async (_, input: unknown): Promise<ReminderIpcResponse> => {
    try {
      const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
      const payload: CreateReminderInput = {
        text: typeof raw.text === 'string' ? raw.text : '',
        remindAt: typeof raw.remindAt === 'string' ? raw.remindAt : '',
        taskId: typeof raw.taskId === 'number' ? raw.taskId : null,
        recurrence:
          typeof raw.recurrence === 'string'
            ? (raw.recurrence as CreateReminderInput['recurrence'])
            : undefined
      }
      const reminder = await reminderService.createReminder(payload)
      return { success: true, reminder }
    } catch (err: unknown) {
      const mapped = mapReminderError(err)
      return { success: false, code: mapped.code, error: mapped.error }
    }
  })

  ipcMain.handle('reminders:cancel', async (_, id: unknown): Promise<ReminderIpcResponse> => {
    try {
      const reminder = await reminderService.cancelReminder(Number(id))
      return { success: true, reminder }
    } catch (err: unknown) {
      const mapped = mapReminderError(err)
      return { success: false, code: mapped.code, error: mapped.error }
    }
  })

  ipcMain.handle('reminders:delete', async (_, id: unknown): Promise<ReminderIpcResponse> => {
    try {
      await reminderService.deleteReminder(Number(id))
      return { success: true }
    } catch (err: unknown) {
      const mapped = mapReminderError(err)
      return { success: false, code: mapped.code, error: mapped.error }
    }
  })
}
