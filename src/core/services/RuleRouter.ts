import type { IntentRouter, RoutedIntent } from '../ports/IntentRouter'
import type { RecurrenceRule } from '../models/Recurrence'
import { parseVietnameseDateTime } from './VietnameseTimeParser'

function extractRecurrence(raw: string): { recurrence: RecurrenceRule; cleaned: string } {
  const patterns: Array<{ rule: Exclude<RecurrenceRule, 'none'>; regex: RegExp }> = [
    { rule: 'daily', regex: /\b(?:lặp\s+)?(?:hàng|mỗi)\s+ngày\b/i },
    { rule: 'weekly', regex: /\b(?:lặp\s+)?(?:hàng|mỗi)\s+tuần\b/i },
    { rule: 'monthly', regex: /\b(?:lặp\s+)?(?:hàng|mỗi)\s+tháng\b/i }
  ]

  for (const item of patterns) {
    if (item.regex.test(raw)) {
      const cleaned = raw.replace(item.regex, ' ').replace(/\s+/g, ' ').trim()
      return { recurrence: item.rule, cleaned }
    }
  }

  return { recurrence: 'none', cleaned: raw }
}

const OPEN_FALSE_POSITIVE_REGEX =
  /^(?:mở\s+(?:rộng|đầu|lòng|mang|bài|cửa|ngoặc|khóa\s+học|màn|đường|bát|hàng|tài\s+khoản|công\s+ty|lớp)|khởi\s+động\s+(?:lại\s+máy|cơ\s+thể|bài))/i

const QUESTION_SUFFIX_REGEX =
  /(?:\?|là\s+gì|như\s+thế\s+nào|bao\s+nhiêu|được\s+không|có\s+tốn|tại\s+sao|vì\s+sao)$/i

function cleanTaskTitle(raw: string): string {
  return raw
    .replace(
      /\s+(?:vào\s+danh\s+sách(?:\s+công\s+việc)?|vào\s+todo|giúp\s+(?:tôi|mình)|hộ\s+(?:tôi|mình)|nhé|nha|với|đi)\s*$/gi,
      ''
    )
    .replace(/^(?:là|:|-|–)\s*/i, '')
    .replace(/[,.;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanReminderText(raw: string): string {
  return raw
    .replace(/^(?:là|về|việc|rằng|:|-|–)\s+/i, '')
    .replace(
      /\s+(?:vào\s+lúc|lúc|vào|sau|giúp\s+(?:tôi|mình)|hộ\s+(?:tôi|mình)|nhé|nha|với|đi)\s*$/gi,
      ''
    )
    .replace(/[,.;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanTargetName(raw: string): string {
  return raw
    .replace(/\s+(?:giúp\s+(?:tôi|mình)|hộ\s+(?:tôi|mình)|nhé|nha|với|đi|lên)\s*$/gi, '')
    .replace(/[,.;:!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export class RuleRouter implements IntentRouter {
  async route(input: string, now: Date = new Date()): Promise<RoutedIntent> {
    const trimmed = (input || '').trim().replace(/\s+/g, ' ')
    if (!trimmed) {
      return { type: 'chat', confidence: 1 }
    }

    // 1. Mẫu câu đặt nhắc nhở (FR-05 / FR-16)
    // 1a. Đảo thời gian lên trước: "lúc 8h nhắc tôi ...", "sau 5 phút nhắc mình ..."
    const leadingTimeReminderRegex =
      /^(?:vào\s+lúc|lúc|sau|trong)\s+(.+?)\s+(?:hãy\s+)?nhắc(?:\s+(?:tôi|mình|em|anh|chị))?\s+(.+)$/i
    const leadingReminderMatch = leadingTimeReminderRegex.exec(trimmed)
    if (leadingReminderMatch) {
      const { recurrence, cleaned: cleanedAll } = extractRecurrence(trimmed)
      const timePart = cleanedAll.slice(0, cleanedAll.toLowerCase().indexOf('nhắc')).trim()
      const afterVerb = cleanedAll
        .slice(cleanedAll.toLowerCase().indexOf('nhắc'))
        .replace(/^nhắc(?:\s+(?:tôi|mình|em|anh|chị))?\s*/i, '')
      const contentPart = cleanReminderText(afterVerb)
      const parsedTime = parseVietnameseDateTime(timePart, now)

      if (!contentPart) {
        return {
          type: 'ambiguous',
          suggestedIntent: 'set_reminder',
          reason: 'Bạn muốn tôi nhắc nội dung gì?',
          originalText: trimmed,
          confidence: 0.65
        }
      }

      if (!parsedTime) {
        return {
          type: 'ambiguous',
          suggestedIntent: 'set_reminder',
          reason: `Tôi chưa rõ thời điểm nhắc cho "${contentPart}". Bạn hãy ghi rõ giờ (ví dụ: "lúc 15h30" hoặc "sau 10 phút").`,
          originalText: trimmed,
          confidence: 0.6
        }
      }

      return {
        type: 'set_reminder',
        text: contentPart,
        remindAt: parsedTime.iso,
        rawTimeText: parsedTime.matchedText,
        ...(recurrence !== 'none' ? { recurrence } : {}),
        confidence: 0.95
      }
    }

    // 1b. Mẫu chuẩn: "nhắc tôi ... lúc ...", "nhắc mình ... sau ...", "tạo nhắc nhở ...", "đặt nhắc nhở ...", "đặt báo thức ...", "hẹn giờ ..."
    const reminderPrefixRegex =
      /^(?:(?:hãy|giúp\s+tôi|nhờ\s+bạn)\s+)?(?:nhắc(?:\s+(?:tôi|mình|nhở))?|tạo\s+nhắc\s+nhở|đặt\s+nhắc\s+nhở|thêm\s+nhắc\s+nhở|đặt\s+báo\s+thức|hẹn\s+giờ)(?:\s+(.*))?$/i
    const reminderMatch = reminderPrefixRegex.exec(trimmed)
    if (reminderMatch) {
      const rawRest = (reminderMatch[1] || '').trim()
      if (!rawRest) {
        return {
          type: 'ambiguous',
          suggestedIntent: 'set_reminder',
          reason: 'Bạn muốn đặt nhắc nhở nội dung gì và vào lúc nào?',
          originalText: trimmed,
          confidence: 0.6
        }
      }

      const { recurrence, cleaned: rest } = extractRecurrence(rawRest)
      const parsedTime = parseVietnameseDateTime(rest, now)
      if (!parsedTime) {
        return {
          type: 'ambiguous',
          suggestedIntent: 'set_reminder',
          reason: `Bạn muốn tôi nhắc "${cleanReminderText(rest)}" vào thời điểm nào?`,
          originalText: trimmed,
          confidence: 0.65
        }
      }

      const contentText = cleanReminderText(parsedTime.remainingText)
      if (!contentText) {
        const isAlarm = /báo\s+thức|hẹn\s+giờ/i.test(trimmed)
        if (isAlarm) {
          return {
            type: 'set_reminder',
            text: 'Báo thức',
            remindAt: parsedTime.iso,
            rawTimeText: parsedTime.matchedText,
            ...(recurrence !== 'none' ? { recurrence } : {}),
            confidence: 0.9
          }
        }
        return {
          type: 'ambiguous',
          suggestedIntent: 'set_reminder',
          reason: 'Bạn muốn tôi nhắc nội dung gì vào thời điểm đó?',
          originalText: trimmed,
          confidence: 0.6
        }
      }

      return {
        type: 'set_reminder',
        text: contentText,
        remindAt: parsedTime.iso,
        rawTimeText: parsedTime.matchedText,
        ...(recurrence !== 'none' ? { recurrence } : {}),
        confidence: 0.95
      }
    }

    // 2. Mẫu câu thêm công việc (FR-04 / FR-16)
    const taskPrefixRegex =
      /^(?:(?:hãy|giúp\s+tôi|nhờ\s+bạn)\s+)?(?:thêm|tạo|ghi|lưu)\s+(?:một\s+)?(?:công\s+việc|việc|task|đầu\s+việc)(?:\s+(?:mới|cần\s+làm))?(?:\s*[:,-]?\s*(.*))?$/i
    const taskMatch = taskPrefixRegex.exec(trimmed)
    if (taskMatch) {
      const rawRest = (taskMatch[1] || '').trim()
      if (!rawRest) {
        return {
          type: 'ambiguous',
          suggestedIntent: 'create_task',
          reason: 'Bạn muốn thêm công việc với tiêu đề là gì?',
          originalText: trimmed,
          confidence: 0.6
        }
      }

      const { recurrence, cleaned: rest } = extractRecurrence(rawRest)
      const parsedDue = parseVietnameseDateTime(rest, now)
      if (parsedDue) {
        const titleWithoutTime = cleanTaskTitle(parsedDue.remainingText)
        if (titleWithoutTime) {
          return {
            type: 'create_task',
            title: titleWithoutTime,
            dueAt: parsedDue.iso,
            rawTimeText: parsedDue.matchedText,
            ...(recurrence !== 'none' ? { recurrence } : {}),
            confidence: 0.94
          }
        }
      }

      const cleanTitle = cleanTaskTitle(rest)
      if (!cleanTitle) {
        return {
          type: 'ambiguous',
          suggestedIntent: 'create_task',
          reason: 'Bạn muốn thêm công việc với tiêu đề là gì?',
          originalText: trimmed,
          confidence: 0.6
        }
      }

      return {
        type: 'create_task',
        title: cleanTitle,
        ...(recurrence !== 'none' ? { recurrence } : {}),
        confidence: 0.95
      }
    }

    // 3. Mẫu câu mở ứng dụng / website (FR-10 / FR-16)
    if (!OPEN_FALSE_POSITIVE_REGEX.test(trimmed) && !QUESTION_SUFFIX_REGEX.test(trimmed)) {
      const openPrefixRegex =
        /^(?:(?:hãy|giúp\s+tôi|nhờ\s+bạn)\s+)?(?:mở|khởi\s+động|chạy)(?:\s+(?:ứng\s+dụng|phần\s+mềm|trình\s+duyệt|trang\s+web|trang|website|app))?\s+(.+)$/i
      const openMatch = openPrefixRegex.exec(trimmed)
      if (openMatch) {
        const target = cleanTargetName(openMatch[1])
        if (target) {
          return {
            type: 'open_target',
            target,
            confidence: 0.93
          }
        }
      }

      const visitWebRegex =
        /^(?:(?:hãy|giúp\s+tôi)\s+)?(?:vào|truy\s+cập)\s+(?:trang(?:\s+web)?|website)\s+(.+)$/i
      const visitMatch = visitWebRegex.exec(trimmed)
      if (visitMatch) {
        const target = cleanTargetName(visitMatch[1])
        if (target) {
          return {
            type: 'open_target',
            target,
            confidence: 0.92
          }
        }
      }
    }

    // 4. Mặc định là hội thoại thông thường
    return {
      type: 'chat',
      confidence: 0.9
    }
  }
}
