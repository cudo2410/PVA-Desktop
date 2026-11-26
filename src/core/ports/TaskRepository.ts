import type { CreateTaskInput, Task, TaskListOptions, UpdateTaskInput } from '../models/Task'

export interface TaskRepository {
  create(input: CreateTaskInput): Promise<Task>
  findById(id: number): Promise<Task | null>
  list(options?: TaskListOptions): Promise<Task[]>
  update(id: number, input: UpdateTaskInput): Promise<Task | null>
  delete(id: number): Promise<boolean>
}
