import type { RecurrenceRule } from './Recurrence'

export const REMINDER_STATES = ['scheduled', 'fired', 'missed', 'cancelled'] as const
export type ReminderState = (typeof REMINDER_STATES)[number]

export type ReminderStateFilter = 'all' | ReminderState

export function isValidReminderState(state: unknown): state is ReminderState {
  return typeof state === 'string' && (REMINDER_STATES as readonly string[]).includes(state)
}

export interface Reminder {
  id: number
  taskId: number | null
  text: string
  remindAt: string
  state: ReminderState
  recurrence: RecurrenceRule
  firedAt: string | null
}

export interface CreateReminderInput {
  text: string
  remindAt: string
  taskId?: number | null
  recurrence?: RecurrenceRule
}

export interface ReminderRestoreSummary {
  rescheduled: Reminder[]
  missed: Reminder[]
  regenerated: Reminder[]
}
