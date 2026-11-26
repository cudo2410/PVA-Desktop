import type {
  CreateReminderInput,
  Reminder,
  ReminderState,
  ReminderStateFilter
} from '../models/Reminder'

export interface ReminderRepository {
  create(input: CreateReminderInput): Promise<Reminder>
  findById(id: number): Promise<Reminder | null>
  list(state?: ReminderStateFilter): Promise<Reminder[]>
  listScheduled(): Promise<Reminder[]>
  updateState(id: number, state: ReminderState, firedAt?: string | null): Promise<Reminder | null>
  delete(id: number): Promise<boolean>
}
