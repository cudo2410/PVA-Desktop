export const RECURRENCE_RULES = ['none', 'daily', 'weekly', 'monthly'] as const
export type RecurrenceRule = (typeof RECURRENCE_RULES)[number]

export const RECURRENCE_LABELS: Record<RecurrenceRule, string> = {
  none: 'Không lặp',
  daily: 'Hàng ngày',
  weekly: 'Hàng tuần',
  monthly: 'Hàng tháng'
}

export function isValidRecurrenceRule(value: unknown): value is RecurrenceRule {
  return typeof value === 'string' && (RECURRENCE_RULES as readonly string[]).includes(value)
}

function addMonthsSafe(date: Date, months: number): Date {
  const result = new Date(date.getTime())
  const originalDay = result.getDate()
  result.setDate(1)
  result.setMonth(result.getMonth() + months)
  const lastDayOfTargetMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()
  result.setDate(Math.min(originalDay, lastDayOfTargetMonth))
  return result
}

function stepOnce(date: Date, rule: Exclude<RecurrenceRule, 'none'>): Date {
  if (rule === 'daily') {
    const next = new Date(date.getTime())
    next.setDate(next.getDate() + 1)
    return next
  }
  if (rule === 'weekly') {
    const next = new Date(date.getTime())
    next.setDate(next.getDate() + 7)
    return next
  }
  return addMonthsSafe(date, 1)
}

/**
 * Tính thời điểm chu kỳ kế tiếp cho công việc/nhắc nhở lặp lại.
 * - Nếu có `minAfter`, sẽ tịnh tiến cho đến khi lớn hơn `minAfter` (dùng khi nhắc nhở bị lỡ lúc app tắt).
 */
export function computeNextOccurrence(
  baseIso: string,
  rule: Exclude<RecurrenceRule, 'none'>,
  minAfter?: Date
): string {
  const parsed = Date.parse(baseIso)
  const start = Number.isNaN(parsed) ? new Date() : new Date(parsed)
  let next = stepOnce(start, rule)

  if (minAfter) {
    const minMs = minAfter.getTime()
    let guard = 0
    while (next.getTime() <= minMs && guard < 1000) {
      next = stepOnce(next, rule)
      guard += 1
    }
  }

  return next.toISOString()
}
