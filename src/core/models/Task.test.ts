import { describe, it, expect } from 'vitest'
import { TASK_STATUSES, isValidTaskStatus, TaskStatus } from './Task'

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

  it('hỗ trợ gán kiểu TaskStatus hợp lệ', () => {
    const statusOpen: TaskStatus = 'open'
    const statusDone: TaskStatus = 'done'
    expect(statusOpen).toBe('open')
    expect(statusDone).toBe('done')
  })
})
