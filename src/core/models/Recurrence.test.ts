import { describe, it, expect } from 'vitest'
import { RECURRENCE_RULES, isValidRecurrenceRule, computeNextOccurrence } from './Recurrence'

describe('Recurrence Model & Next Occurrence Calculation', () => {
  it('xác thực đúng tập giá trị recurrence hợp lệ', () => {
    expect(RECURRENCE_RULES).toEqual(['none', 'daily', 'weekly', 'monthly'])
    expect(isValidRecurrenceRule('daily')).toBe(true)
    expect(isValidRecurrenceRule('weekly')).toBe(true)
    expect(isValidRecurrenceRule('monthly')).toBe(true)
    expect(isValidRecurrenceRule('yearly')).toBe(false)
    expect(isValidRecurrenceRule(null)).toBe(false)
  })

  it('tính đúng chu kỳ lặp hàng ngày và hàng tuần', () => {
    const base = new Date(2026, 10, 22, 9, 30, 0, 0).toISOString()
    const nextDay = new Date(computeNextOccurrence(base, 'daily'))
    expect(nextDay.getDate()).toBe(23)
    expect(nextDay.getHours()).toBe(9)
    expect(nextDay.getMinutes()).toBe(30)

    const nextWeek = new Date(computeNextOccurrence(base, 'weekly'))
    expect(nextWeek.getDate()).toBe(29)
    expect(nextWeek.getHours()).toBe(9)
  })

  it('xử lý chuẩn cuối tháng (31/01 -> 28/02 không bị tràn sang tháng 3)', () => {
    const jan31 = new Date(2026, 0, 31, 8, 0, 0, 0).toISOString()
    const feb = new Date(computeNextOccurrence(jan31, 'monthly'))
    expect(feb.getMonth()).toBe(1) // Tháng 2
    expect(feb.getDate()).toBe(28)

    // Năm nhuận 2028
    const jan31Leap = new Date(2028, 0, 31, 8, 0, 0, 0).toISOString()
    const febLeap = new Date(computeNextOccurrence(jan31Leap, 'monthly'))
    expect(febLeap.getMonth()).toBe(1)
    expect(febLeap.getDate()).toBe(29)
  })

  it('tịnh tiến tới lần tương lai gần nhất khi có minAfter (phục hồi nhắc đã lỡ)', () => {
    const oldMissed = new Date(2026, 10, 19, 8, 0, 0, 0).toISOString()
    const now = new Date(2026, 10, 22, 10, 0, 0, 0)
    const nextFuture = new Date(computeNextOccurrence(oldMissed, 'daily', now))
    expect(nextFuture.getDate()).toBe(23)
    expect(nextFuture.getHours()).toBe(8)
    expect(nextFuture.getTime()).toBeGreaterThan(now.getTime())
  })
})
