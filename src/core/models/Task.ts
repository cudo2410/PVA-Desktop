import type { RecurrenceRule } from './Recurrence'

export const TASK_STATUSES = ['open', 'done'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export type TaskStatusFilter = 'all' | TaskStatus

export type TaskSortBy = 'due_asc' | 'due_desc' | 'created_desc'

export function isValidTaskStatus(status: unknown): status is TaskStatus {
  return typeof status === 'string' && (TASK_STATUSES as readonly string[]).includes(status)
}

export interface Task {
  id: number
  title: string
  dueAt: string | null
  status: TaskStatus
  recurrence: RecurrenceRule
  createdAt: string
  updatedAt: string
}

export interface CreateTaskInput {
  title: string
  dueAt?: string | null
  recurrence?: RecurrenceRule
}

export interface UpdateTaskInput {
  title?: string
  dueAt?: string | null
  status?: TaskStatus
  recurrence?: RecurrenceRule
}

export interface TaskListOptions {
  status?: TaskStatusFilter
  sortBy?: TaskSortBy
}
