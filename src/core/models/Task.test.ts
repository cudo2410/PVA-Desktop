import { describe, it, expect } from 'vitest'
import { TASK_STATUSES, isValidTaskStatus } from './Task'
import type { Task, TaskStatus } from './Task'

describe('Task Model & TaskStatus Constraints', () => {
  it('định nghĩa tập trạng thái hợp lệ đồng bộ với database (open, done)', () => {
    expect(TASK_STATUSES).toEqual(['open', 'done'])
  })

  it('xác thực đúng trạng thái hợp lệ bằng type guard isValidTaskStatus', () => {
    expect(isValidTaskStatus('open')).toBe(true)
    expect(isValidTaskStatus('done')).toBe(true)
  })

  it('từ chối trạng thái không hợp lệ (todo, in_progress, invalid, null, undefined)', () => {
    expect(isValidTaskStatus('todo')).toBe(false)
    expect(isValidTaskStatus('in_progress')).toBe(false)
    expect(isValidTaskStatus('invalid_status')).toBe(false)
    expect(isValidTaskStatus('')).toBe(false)
    expect(isValidTaskStatus(null)).toBe(false)
    expect(isValidTaskStatus(undefined)).toBe(false)
    expect(isValidTaskStatus(123)).toBe(false)
  })

  it('hỗ trợ gán kiểu Task và TaskStatus đồng bộ với schema SQLite', () => {
    const statusOpen: TaskStatus = 'open'
    const statusDone: TaskStatus = 'done'
    const sampleTask: Task = {
      id: 1,
      title: 'Hoàn thành báo cáo',
      dueAt: '2026-11-25T10:00:00.000Z',
      status: statusOpen,
      recurrence: 'daily',
      createdAt: '2026-11-22T09:00:00.000Z',
      updatedAt: '2026-11-22T09:00:00.000Z'
    }
    expect(statusOpen).toBe('open')
    expect(statusDone).toBe('done')
    expect(sampleTask.id).toBe(1)
    expect(sampleTask.dueAt).toBe('2026-11-25T10:00:00.000Z')
  })
})
