/**
 * Định dạng thời gian chuẩn theo thiết kế Figma:
 * - Cùng ngày hôm nay: "Hôm nay, HH:mm" (VD: "Hôm nay, 21:33")
 * - Ngày hôm qua: "Hôm qua, HH:mm" (VD: "Hôm qua, 10:11")
 * - Các ngày khác: "dd/mm/yyyy, HH:mm" (VD: "14/11/2026, 09:15")
 */
export function parseSafeDate(dateInput?: string | Date | number): Date | null {
  if (!dateInput) return null
  if (dateInput instanceof Date) {
    return isNaN(dateInput.getTime()) ? null : dateInput
  }
  if (typeof dateInput === 'number') {
    const d = new Date(dateInput)
    return isNaN(d.getTime()) ? null : d
  }
  const trimmed = dateInput.trim()
  if (!trimmed) return null

  // Nếu chuỗi từ SQLite dạng "YYYY-MM-DD HH:MM:SS" (UTC) không có timezone
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    const d = new Date(trimmed.replace(' ', 'T') + 'Z')
    if (!isNaN(d.getTime())) return d
  }

  const d = new Date(trimmed)
  return isNaN(d.getTime()) ? null : d
}

export function formatTimeHHmm(dateInput?: string | Date | number): string {
  const d = parseSafeDate(dateInput)
  if (!d) return ''
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

export function formatFigmaTimestamp(dateInput?: string | Date | number): string {
  const d = parseSafeDate(dateInput)
  if (!d) return ''

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(todayStart.getDate() - 1)

  const targetDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const timeStr = formatTimeHHmm(d)

  if (targetDay.getTime() === todayStart.getTime()) {
    return `Hôm nay, ${timeStr}`
  }

  if (targetDay.getTime() === yesterdayStart.getTime()) {
    return `Hôm qua, ${timeStr}`
  }

  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()

  return `${dd}/${mm}/${yyyy}, ${timeStr}`
}
