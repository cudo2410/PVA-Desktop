import { ipcMain } from 'electron'
import { TaskService } from '../../core/services/TaskService'
import { DatabaseError, NotFoundError, ValidationError } from '../../core/models/ModelError'
import type {
  CreateTaskInput,
  Task,
  TaskListOptions,
  TaskSortBy,
  TaskStatusFilter,
  UpdateTaskInput
} from '../../core/models/Task'

export interface TaskIpcResponse {
  success: boolean
  task?: Task
  tasks?: Task[]
  code?: string
  error?: string
}

function mapTaskError(err: unknown): { code: string; error: string } {
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
    error: err instanceof Error ? err.message : 'Đã xảy ra lỗi không xác định khi xử lý công việc.'
  }
}

export function registerTasksIpc(taskService: TaskService): void {
  ipcMain.handle('tasks:list', async (_, options?: unknown): Promise<TaskIpcResponse> => {
    try {
      const optsObj = (options && typeof options === 'object' ? options : {}) as Record<
        string,
        unknown
      >
      const listOpts: TaskListOptions = {
        status:
          typeof optsObj.status === 'string' ? (optsObj.status as TaskStatusFilter) : undefined,
        sortBy: typeof optsObj.sortBy === 'string' ? (optsObj.sortBy as TaskSortBy) : undefined
      }
      const tasks = await taskService.listTasks(listOpts)
      return { success: true, tasks }
    } catch (err: unknown) {
      const mapped = mapTaskError(err)
      return { success: false, code: mapped.code, error: mapped.error }
    }
  })

  ipcMain.handle('tasks:create', async (_, input: unknown): Promise<TaskIpcResponse> => {
    try {
      const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
      const payload: CreateTaskInput = {
        title: typeof raw.title === 'string' ? raw.title : '',
        dueAt: typeof raw.dueAt === 'string' || raw.dueAt === null ? raw.dueAt : undefined,
        recurrence:
          typeof raw.recurrence === 'string'
            ? (raw.recurrence as CreateTaskInput['recurrence'])
            : undefined
      }
      const task = await taskService.createTask(payload)
      return { success: true, task }
    } catch (err: unknown) {
      const mapped = mapTaskError(err)
      return { success: false, code: mapped.code, error: mapped.error }
    }
  })

  ipcMain.handle(
    'tasks:update',
    async (_, id: unknown, input: unknown): Promise<TaskIpcResponse> => {
      try {
        const numericId = Number(id)
        const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
        const payload: UpdateTaskInput = {}
        if (raw.title !== undefined) {
          payload.title = typeof raw.title === 'string' ? raw.title : ''
        }
        if (raw.dueAt !== undefined) {
          payload.dueAt = typeof raw.dueAt === 'string' ? raw.dueAt : null
        }
        if (raw.status !== undefined && typeof raw.status === 'string') {
          payload.status = raw.status as UpdateTaskInput['status']
        }
        if (raw.recurrence !== undefined && typeof raw.recurrence === 'string') {
          payload.recurrence = raw.recurrence as UpdateTaskInput['recurrence']
        }

        const task = await taskService.updateTask(numericId, payload)
        return { success: true, task }
      } catch (err: unknown) {
        const mapped = mapTaskError(err)
        return { success: false, code: mapped.code, error: mapped.error }
      }
    }
  )

  ipcMain.handle('tasks:toggle', async (_, id: unknown): Promise<TaskIpcResponse> => {
    try {
      const task = await taskService.toggleTaskStatus(Number(id))
      return { success: true, task }
    } catch (err: unknown) {
      const mapped = mapTaskError(err)
      return { success: false, code: mapped.code, error: mapped.error }
    }
  })

  ipcMain.handle('tasks:delete', async (_, id: unknown): Promise<TaskIpcResponse> => {
    try {
      await taskService.deleteTask(Number(id))
      return { success: true }
    } catch (err: unknown) {
      const mapped = mapTaskError(err)
      return { success: false, code: mapped.code, error: mapped.error }
    }
  })
}
