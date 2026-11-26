export interface ParsedVietnameseTime {
  date: Date
  iso: string
  matchedText: string
  remainingText: string
}

const VIETNAMESE_NUMBER_MAP: Record<string, number> = {
  không: 0,
  một: 1,
  mốt: 1,
  hai: 2,
  ba: 3,
  bốn: 4,
  tư: 4,
  năm: 5,
  lăm: 5,
  sáu: 6,
  bảy: 7,
  bẩy: 7,
  tám: 8,
  chín: 9,
  mười: 10
}

function parseVietnameseNumber(raw: string): number | null {
  const clean = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!clean) return null

  if (/^\d+$/.test(clean)) {
    return parseInt(clean, 10)
  }

  if (clean in VIETNAMESE_NUMBER_MAP) {
    return VIETNAMESE_NUMBER_MAP[clean]
  }

  const parts = clean.split(' ')
  if (parts.length === 2 && parts[0] === 'mười' && parts[1] in VIETNAMESE_NUMBER_MAP) {
    return 10 + VIETNAMESE_NUMBER_MAP[parts[1]]
  }

  if (parts.length === 2 && parts[1] === 'mươi' && parts[0] in VIETNAMESE_NUMBER_MAP) {
    return VIETNAMESE_NUMBER_MAP[parts[0]] * 10
  }

  if (
    parts.length === 3 &&
    parts[1] === 'mươi' &&
    parts[0] in VIETNAMESE_NUMBER_MAP &&
    parts[2] in VIETNAMESE_NUMBER_MAP
  ) {
    return VIETNAMESE_NUMBER_MAP[parts[0]] * 10 + VIETNAMESE_NUMBER_MAP[parts[2]]
  }

  if (
    parts.length === 2 &&
    parts[0] in VIETNAMESE_NUMBER_MAP &&
    parts[1] in VIETNAMESE_NUMBER_MAP
  ) {
    const tens = VIETNAMESE_NUMBER_MAP[parts[0]]
    const ones = VIETNAMESE_NUMBER_MAP[parts[1]]
    if (tens >= 2 && tens <= 5 && ones >= 1 && ones <= 9) {
      return tens * 10 + ones
    }
  }

  return null
}

const NUM_TOKEN =
  '(?:\\d+|(?:hai|ba|bốn|năm)\\s+mươi(?:\\s+(?:mốt|hai|ba|bốn|tư|lăm|sáu|bảy|tám|chín))?|mười(?:\\s+(?:một|hai|ba|bốn|lăm|sáu|bảy|tám|chín))?|không|một|hai|ba|bốn|năm|sáu|bảy|tám|chín)'

function removeSpan(text: string, start: number, end: number): string {
  const before = text.slice(0, start)
  const after = text.slice(end)
  return `${before} ${after}`.replace(/\s+/g, ' ').trim()
}

function getNextWeekdayDate(base: Date, targetDow: number, forceNextWeek: boolean): Date {
  const result = new Date(base.getTime())
  const currentDow = result.getDay()
  let diff = (targetDow - currentDow + 7) % 7
  if (diff === 0) {
    diff = 7
  }
  if (forceNextWeek) {
    diff += 7
  }
  result.setDate(result.getDate() + diff)
  return result
}

function applyPeriodToHour(hour: number, period: string | undefined): number {
  if (!period) return hour
  const p = period.toLowerCase()
  if (p === 'chiều' || p === 'tối' || p === 'đêm') {
    if (hour >= 1 && hour <= 11) {
      return hour + 12
    }
    if (p === 'đêm' && hour === 12) {
      return 0
    }
    return hour
  }
  if (p === 'trưa') {
    if (hour >= 1 && hour <= 11) {
      return hour + 12
    }
    return hour
  }
  if (p === 'sáng' && hour === 12) {
    return 0
  }
  return hour
}

/**
 * Phân tích biểu thức ngày/giờ tiếng Việt cơ bản trong câu nhập tự nhiên.
 * Hỗ trợ:
 * - Tương đối: "sau 2 phút", "5 phút nữa", "sau 1 tiếng rưỡi", "nửa tiếng nữa", "sau ba mươi phút"
 * - Giờ cụ thể: "lúc 14h30", "lúc 14:30", "8 giờ rưỡi", "8h kém 15", "9 giờ sáng mai", "3 giờ chiều"
 * - Ngày: "hôm nay", "ngày mai" / "mai", "ngày kia", "thứ hai..chủ nhật", "ngày 25/11"
 */
export function parseVietnameseDateTime(
  input: string,
  now: Date = new Date()
): ParsedVietnameseTime | null {
  const text = input.trim()
  if (!text) return null

  // 1. Trường hợp đặc biệt: "nửa tiếng nữa" / "sau nửa tiếng"
  const halfHourRegex = /(?:^|\s)((?:sau\s+)?nửa\s+(?:tiếng|giờ)(?:\s+nữa)?)(?=\s|$|[.,!?])/i
  const halfHourMatch = halfHourRegex.exec(text)
  if (halfHourMatch) {
    const matched = halfHourMatch[1].trim()
    const matchStart = halfHourMatch.index + halfHourMatch[0].indexOf(matched)
    const target = new Date(now.getTime() + 30 * 60 * 1000)
    return {
      date: target,
      iso: target.toISOString(),
      matchedText: matched,
      remainingText: removeSpan(text, matchStart, matchStart + matched.length)
    }
  }

  // 2. Thời gian tương đối dạng "sau X giờ Y phút", "sau X tiếng rưỡi", "X phút nữa"
  const relHourMinRegex = new RegExp(
    `(?:^|\\s)((?:sau\\s+|trong\\s+)?(${NUM_TOKEN})\\s*(?:tiếng|giờ)(?:\\s*(rưỡi)|\\s+(${NUM_TOKEN})\\s*(?:phút|p))?(?:\\s+(?:nữa|sau))?)(?=\\s|$|[.,!?])`,
    'i'
  )
  const relHourMinMatch = relHourMinRegex.exec(text)
  if (relHourMinMatch) {
    const full = relHourMinMatch[1].trim()
    const hasRelativeMarker = /\b(?:sau|trong|nữa)\b/i.test(full) || /tiếng/i.test(full)
    if (hasRelativeMarker) {
      const hours = parseVietnameseNumber(relHourMinMatch[2])
      if (hours !== null && hours >= 0) {
        let extraMinutes = 0
        if (relHourMinMatch[3]) {
          extraMinutes = 30
        } else if (relHourMinMatch[4]) {
          extraMinutes = parseVietnameseNumber(relHourMinMatch[4]) ?? 0
        }
        const totalMs = (hours * 60 + extraMinutes) * 60 * 1000
        if (totalMs > 0) {
          const start = relHourMinMatch.index + relHourMinMatch[0].indexOf(full)
          const target = new Date(now.getTime() + totalMs)
          return {
            date: target,
            iso: target.toISOString(),
            matchedText: full,
            remainingText: removeSpan(text, start, start + full.length)
          }
        }
      }
    }
  }

  const relMinSecRegex = new RegExp(
    `(?:^|\\s)((?:sau\\s+|trong\\s+)?(${NUM_TOKEN})\\s*(phút|giây)(?:\\s+(?:nữa|sau))?)(?=\\s|$|[.,!?])`,
    'i'
  )
  const relMinSecMatch = relMinSecRegex.exec(text)
  if (relMinSecMatch) {
    const full = relMinSecMatch[1].trim()
    const hasRelativeMarker = /\b(?:sau|trong|nữa)\b/i.test(full)
    if (hasRelativeMarker) {
      const amount = parseVietnameseNumber(relMinSecMatch[2])
      const unit = relMinSecMatch[3].toLowerCase()
      if (amount !== null && amount > 0) {
        const multiplier = unit === 'giây' ? 1000 : 60 * 1000
        const start = relMinSecMatch.index + relMinSecMatch[0].indexOf(full)
        const target = new Date(now.getTime() + amount * multiplier)
        return {
          date: target,
          iso: target.toISOString(),
          matchedText: full,
          remainingText: removeSpan(text, start, start + full.length)
        }
      }
    }
  }

  // 3. Phân tích giờ cụ thể và ngày cụ thể / tương đối
  let working = text
  const matchedParts: string[] = []
  let parsedHour: number | null = null
  let parsedMinute = 0
  let periodHint: string | undefined

  // 3a. Giờ kém: "8h kém 15", "8 giờ kém 15 phút"
  const kemRegex = new RegExp(
    `(?:^|\\s)((?:vào\\s+lúc\\s+|vào\\s+|lúc\\s+|trước\\s+|hạn\\s+)?(${NUM_TOKEN})\\s*(?:giờ|h)\\s*kém\\s*(${NUM_TOKEN})(?:\\s*phút)?(?:\\s+(sáng|trưa|chiều|tối|đêm))?)(?=\\s|$|[.,!?])`,
    'i'
  )
  const kemMatch = kemRegex.exec(working)
  if (kemMatch) {
    const h = parseVietnameseNumber(kemMatch[2])
    const m = parseVietnameseNumber(kemMatch[3])
    if (h !== null && m !== null && h >= 0 && h <= 24 && m > 0 && m < 60) {
      periodHint = kemMatch[4]?.toLowerCase()
      const adjHour = applyPeriodToHour(h, periodHint)
      parsedHour = (adjHour + 23) % 24
      parsedMinute = 60 - m
      const matched = kemMatch[1].trim()
      const start = kemMatch.index + kemMatch[0].indexOf(matched)
      matchedParts.push(matched)
      working = removeSpan(working, start, start + matched.length)
    }
  }

  // 3b. Giờ chuẩn dạng 14:30, 14h30, 8 giờ 15 phút, 8 giờ rưỡi, 9 giờ sáng
  if (parsedHour === null) {
    const colonOrHRegex =
      /(?:^|\s)((?:vào\s+lúc\s+|vào\s+|lúc\s+|trước\s+|hạn\s+)?(\d{1,2})\s*(?::|h)\s*(\d{1,2}|rưỡi)?(?:\s*phút)?(?:\s+(sáng|trưa|chiều|tối|đêm))?)(?=\s|$|[.,!?])/i
    const colonMatch = colonOrHRegex.exec(working)
    if (colonMatch) {
      const h = parseInt(colonMatch[2], 10)
      const rawMin = colonMatch[3]
      const m = rawMin ? (rawMin.toLowerCase() === 'rưỡi' ? 30 : parseInt(rawMin, 10)) : 0
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        periodHint = colonMatch[4]?.toLowerCase()
        parsedHour = applyPeriodToHour(h, periodHint)
        parsedMinute = m
        const matched = colonMatch[1].trim()
        const start = colonMatch.index + colonMatch[0].indexOf(matched)
        matchedParts.push(matched)
        working = removeSpan(working, start, start + matched.length)
      }
    }
  }

  if (parsedHour === null) {
    const wordClockRegex = new RegExp(
      `(?:^|\\s)((?:vào\\s+lúc\\s+|vào\\s+|lúc\\s+|trước\\s+|hạn\\s+)?(${NUM_TOKEN})\\s*giờ(?:\\s*(rưỡi)|\\s+(${NUM_TOKEN})(?:\\s*phút)?)?(?:\\s+(sáng|trưa|chiều|tối|đêm))?)(?=\\s|$|[.,!?])`,
      'i'
    )
    const wordMatch = wordClockRegex.exec(working)
    if (wordMatch) {
      const h = parseVietnameseNumber(wordMatch[2])
      let m = 0
      if (wordMatch[3]) {
        m = 30
      } else if (wordMatch[4]) {
        m = parseVietnameseNumber(wordMatch[4]) ?? 0
      }
      if (h !== null && h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        periodHint = wordMatch[5]?.toLowerCase()
        parsedHour = applyPeriodToHour(h, periodHint)
        parsedMinute = m
        const matched = wordMatch[1].trim()
        const start = wordMatch.index + wordMatch[0].indexOf(matched)
        matchedParts.push(matched)
        working = removeSpan(working, start, start + matched.length)
      }
    }
  }

  // 3c. Phân tích ngày (hôm nay, mai, ngày kia, thứ X, ngày dd/mm)
  const targetDate = new Date(now.getTime())
  let hasExplicitDate = false

  // Ngày dd/mm(/yyyy) hoặc ngày dd tháng mm
  const dateSlashRegex =
    /(?:^|\s)((?:vào\s+|trước\s+|hạn\s+)?(?:ngày\s+)?(\d{1,2})\s*[/-]\s*(\d{1,2})(?:\s*[/-]\s*(\d{4}))?)(?=\s|$|[.,!?])/i
  const dateSlashMatch = dateSlashRegex.exec(working)
  if (dateSlashMatch) {
    const day = parseInt(dateSlashMatch[2], 10)
    const month = parseInt(dateSlashMatch[3], 10)
    const year = dateSlashMatch[4] ? parseInt(dateSlashMatch[4], 10) : now.getFullYear()
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      targetDate.setFullYear(year, month - 1, day)
      hasExplicitDate = true
      const matched = dateSlashMatch[1].trim()
      const start = dateSlashMatch.index + dateSlashMatch[0].indexOf(matched)
      matchedParts.push(matched)
      working = removeSpan(working, start, start + matched.length)
    }
  }

  if (!hasExplicitDate) {
    const dateMonthWordRegex =
      /(?:^|\s)((?:vào\s+|trước\s+|hạn\s+)?ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})(?:\s+năm\s+(\d{4}))?)(?=\s|$|[.,!?])/i
    const dmMatch = dateMonthWordRegex.exec(working)
    if (dmMatch) {
      const day = parseInt(dmMatch[2], 10)
      const month = parseInt(dmMatch[3], 10)
      const year = dmMatch[4] ? parseInt(dmMatch[4], 10) : now.getFullYear()
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        targetDate.setFullYear(year, month - 1, day)
        hasExplicitDate = true
        const matched = dmMatch[1].trim()
        const start = dmMatch.index + dmMatch[0].indexOf(matched)
        matchedParts.push(matched)
        working = removeSpan(working, start, start + matched.length)
      }
    }
  }

  if (!hasExplicitDate) {
    const relDayRegex =
      /(?:^|\s)((?:vào\s+|trước\s+|hạn\s+)?(?:(sáng|trưa|chiều|tối|đêm)\s+)?(hôm\s+nay|nay|ngày\s+mai|mai|ngày\s+kia|ngày\s+mốt))(?=\s|$|[.,!?])/i
    const relDayMatch = relDayRegex.exec(working)
    if (relDayMatch) {
      const periodFromDay = relDayMatch[2]?.toLowerCase()
      const dayToken = relDayMatch[3].toLowerCase().replace(/\s+/g, ' ')
      if (dayToken === 'ngày mai' || dayToken === 'mai') {
        targetDate.setDate(targetDate.getDate() + 1)
      } else if (dayToken === 'ngày kia' || dayToken === 'ngày mốt') {
        targetDate.setDate(targetDate.getDate() + 2)
      }
      if (!periodHint && periodFromDay) {
        periodHint = periodFromDay
        if (parsedHour !== null) {
          parsedHour = applyPeriodToHour(parsedHour, periodHint)
        }
      }
      hasExplicitDate = true
      const matched = relDayMatch[1].trim()
      const start = relDayMatch.index + relDayMatch[0].indexOf(matched)
      matchedParts.push(matched)
      working = removeSpan(working, start, start + matched.length)
    }
  }

  if (!hasExplicitDate) {
    const weekdayRegex =
      /(?:^|\s)((?:vào\s+|trước\s+|hạn\s+)?(?:(sáng|trưa|chiều|tối)\s+)?(thứ\s+(?:hai|2|ba|3|tư|4|năm|5|sáu|6|bảy|7)|chủ\s+nhật|cn)(?:\s+(tuần\s+sau|tuần\s+tới|tuần\s+này))?)(?=\s|$|[.,!?])/i
    const wdMatch = weekdayRegex.exec(working)
    if (wdMatch) {
      const wdText = wdMatch[3].toLowerCase().replace(/\s+/g, ' ')
      const dowMap: Record<string, number> = {
        'chủ nhật': 0,
        cn: 0,
        'thứ hai': 1,
        'thứ 2': 1,
        'thứ ba': 2,
        'thứ 3': 2,
        'thứ tư': 3,
        'thứ 4': 3,
        'thứ năm': 4,
        'thứ 5': 4,
        'thứ sáu': 5,
        'thứ 6': 5,
        'thứ bảy': 6,
        'thứ 7': 6
      }
      const targetDow = dowMap[wdText]
      if (targetDow !== undefined) {
        const forceNextWeek = Boolean(wdMatch[4] && /sau|tới/i.test(wdMatch[4]))
        const nextDate = getNextWeekdayDate(now, targetDow, forceNextWeek)
        targetDate.setFullYear(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate())
        if (!periodHint && wdMatch[2]) {
          periodHint = wdMatch[2].toLowerCase()
          if (parsedHour !== null) {
            parsedHour = applyPeriodToHour(parsedHour, periodHint)
          }
        }
        hasExplicitDate = true
        const matched = wdMatch[1].trim()
        const start = wdMatch.index + wdMatch[0].indexOf(matched)
        matchedParts.push(matched)
        working = removeSpan(working, start, start + matched.length)
      }
    }
  }

  if (parsedHour === null && !hasExplicitDate) {
    return null
  }

  if (parsedHour !== null) {
    targetDate.setHours(parsedHour, parsedMinute, 0, 0)
  } else {
    // Chỉ có ngày/buổi mà không nêu giờ cụ thể -> mặc định theo buổi (hoặc 09:00)
    const defaultHourByPeriod: Record<string, number> = {
      sáng: 8,
      trưa: 12,
      chiều: 14,
      tối: 20,
      đêm: 22
    }
    const defaultHour = periodHint ? (defaultHourByPeriod[periodHint] ?? 9) : 9
    targetDate.setHours(defaultHour, 0, 0, 0)
  }

  return {
    date: targetDate,
    iso: targetDate.toISOString(),
    matchedText: matchedParts.join(' ').trim(),
    remainingText: working
  }
}
