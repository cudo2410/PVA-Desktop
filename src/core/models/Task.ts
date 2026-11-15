export const TASK_STATUSES = ['open', 'done'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export function isValidTaskStatus(status: unknown): status is TaskStatus {
  return typeof status === 'string' && (TASK_STATUSES as readonly string[]).includes(status)
}

export interface Task {
  id: string
  title: string
  description?: string
  dueDate?: string
  status: TaskStatus
  createdAt: number
  updatedAt: number
}
