import { describe, it, expect } from 'vitest'
import { parseVietnameseDateTime } from './VietnameseTimeParser'

describe('VietnameseTimeParser', () => {
  // Chủ Nhật 22/11/2026 10:00:00 giờ cục bộ
  const baseNow = new Date(2026, 10, 22, 10, 0, 0, 0)

  it('hiểu thời gian tương đối: sau 2 phút, 15 phút nữa, sau ba mươi phút', () => {
    const r1 = parseVietnameseDateTime('uống thuốc sau 2 phút', baseNow)
    expect(r1).not.toBeNull()
    expect(r1?.date.getTime()).toBe(baseNow.getTime() + 2 * 60 * 1000)
    expect(r1?.remainingText).toBe('uống thuốc')

    const r2 = parseVietnameseDateTime('tắt bếp 15 phút nữa', baseNow)
    expect(r2).not.toBeNull()
    expect(r2?.date.getTime()).toBe(baseNow.getTime() + 15 * 60 * 1000)

    const r3 = parseVietnameseDateTime('gọi điện sau ba mươi phút', baseNow)
    expect(r3).not.toBeNull()
    expect(r3?.date.getTime()).toBe(baseNow.getTime() + 30 * 60 * 1000)
  })

  it('hiểu giờ tương đối: sau 1 tiếng, sau 1 tiếng rưỡi, nửa tiếng nữa', () => {
    const r1 = parseVietnameseDateTime('nghỉ mắt sau 1 tiếng', baseNow)
    expect(r1?.date.getTime()).toBe(baseNow.getTime() + 60 * 60 * 1000)

    const r2 = parseVietnameseDateTime('kiểm tra mail sau 1 tiếng rưỡi', baseNow)
    expect(r2?.date.getTime()).toBe(baseNow.getTime() + 90 * 60 * 1000)

    const r3 = parseVietnameseDateTime('nửa tiếng nữa họp', baseNow)
    expect(r3?.date.getTime()).toBe(baseNow.getTime() + 30 * 60 * 1000)
  })

  it('hiểu giờ cụ thể: 14h30, 14:30, 8 giờ rưỡi tối, 8h kém 15 tối, 9 giờ sáng mai', () => {
    const r1 = parseVietnameseDateTime('họp lúc 14h30', baseNow)
    expect(r1?.date.getHours()).toBe(14)
    expect(r1?.date.getMinutes()).toBe(30)

    const r2 = parseVietnameseDateTime('nộp bài lúc 20:15 hôm nay', baseNow)
    expect(r2?.date.getHours()).toBe(20)
    expect(r2?.date.getMinutes()).toBe(15)

    const r3 = parseVietnameseDateTime('học bài lúc 8 giờ rưỡi tối', baseNow)
    expect(r3?.date.getHours()).toBe(20)
    expect(r3?.date.getMinutes()).toBe(30)

    const r4 = parseVietnameseDateTime('gọi về nhà lúc 8h kém 15 tối', baseNow)
    expect(r4?.date.getHours()).toBe(19)
    expect(r4?.date.getMinutes()).toBe(45)

    const r5 = parseVietnameseDateTime('họp nhóm vào chín giờ sáng mai', baseNow)
    expect(r5?.date.getDate()).toBe(23)
    expect(r5?.date.getHours()).toBe(9)
    expect(r5?.date.getMinutes()).toBe(0)
  })

  it('hiểu ngày cụ thể và thứ trong tuần: ngày 25/11, thứ sáu', () => {
    const r1 = parseVietnameseDateTime('nộp báo cáo ngày 25/11 lúc 17h', baseNow)
    expect(r1?.date.getMonth()).toBe(10) // November (0-indexed)
    expect(r1?.date.getDate()).toBe(25)
    expect(r1?.date.getHours()).toBe(17)

    // 22/11/2026 là Chủ Nhật -> thứ sáu tới là 27/11/2026
    const r2 = parseVietnameseDateTime('gặp giảng viên vào thứ sáu lúc 15h', baseNow)
    expect(r2?.date.getDate()).toBe(27)
    expect(r2?.date.getHours()).toBe(15)
  })

  it('trả về null khi câu không chứa biểu thức thời gian', () => {
    expect(parseVietnameseDateTime('mua sách lập trình TypeScript', baseNow)).toBeNull()
  })
})
