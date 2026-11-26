import { describe, it, expect } from 'vitest'
import { RuleRouter } from './RuleRouter'
import type { RoutedIntent } from '../ports/IntentRouter'

interface RouterSample {
  id: number
  input: string
  expectedType: RoutedIntent['type']
  expectedSubstring?: string
}

// Bộ 32 câu mẫu tiếng Việt chuẩn nghiệm thu FR-16 (yêu cầu >= 90% trên >= 30 câu mẫu)
const SAMPLE_BENCHMARK: RouterSample[] = [
  // Nhóm 1: Thêm công việc (8 câu)
  {
    id: 1,
    input: 'thêm việc nộp báo cáo tuần 4',
    expectedType: 'create_task',
    expectedSubstring: 'nộp báo cáo tuần 4'
  },
  {
    id: 2,
    input: 'Thêm công việc hoàn thành báo cáo đồ án vào danh sách',
    expectedType: 'create_task',
    expectedSubstring: 'hoàn thành báo cáo đồ án'
  },
  {
    id: 3,
    input: 'tạo việc ôn thi cuối kỳ trước 20h ngày mai',
    expectedType: 'create_task',
    expectedSubstring: 'ôn thi cuối kỳ'
  },
  {
    id: 4,
    input: 'tạo công việc sửa lỗi giao diện lúc 15h30',
    expectedType: 'create_task',
    expectedSubstring: 'sửa lỗi giao diện'
  },
  {
    id: 5,
    input: 'ghi việc mua sách lập trình TypeScript',
    expectedType: 'create_task',
    expectedSubstring: 'mua sách lập trình TypeScript'
  },
  {
    id: 6,
    input: 'thêm task kiểm thử nhắc nhở hạn ngày 25/11',
    expectedType: 'create_task',
    expectedSubstring: 'kiểm thử nhắc nhở'
  },
  {
    id: 7,
    input: 'Hãy thêm công việc mới chuẩn bị slide bảo vệ',
    expectedType: 'create_task',
    expectedSubstring: 'chuẩn bị slide bảo vệ'
  },
  {
    id: 8,
    input: 'lưu việc gửi email cho giảng viên vào thứ sáu',
    expectedType: 'create_task',
    expectedSubstring: 'gửi email cho giảng viên'
  },

  // Nhóm 2: Đặt nhắc nhở (9 câu)
  {
    id: 9,
    input: 'nhắc tôi uống nước sau 2 phút',
    expectedType: 'set_reminder',
    expectedSubstring: 'uống nước'
  },
  {
    id: 10,
    input: 'Nhắc tôi họp nhóm lúc 9 giờ sáng mai',
    expectedType: 'set_reminder',
    expectedSubstring: 'họp nhóm'
  },
  {
    id: 11,
    input: 'nhắc mình tắt bếp sau 15 phút',
    expectedType: 'set_reminder',
    expectedSubstring: 'tắt bếp'
  },
  {
    id: 12,
    input: 'Tạo nhắc nhở họp nhóm vào chín giờ sáng mai',
    expectedType: 'set_reminder',
    expectedSubstring: 'họp nhóm'
  },
  { id: 13, input: 'Đặt báo thức lúc sáu giờ ba mươi phút sáng mai', expectedType: 'set_reminder' },
  {
    id: 14,
    input: 'nhắc tôi gọi điện cho mẹ lúc 8 giờ rưỡi tối',
    expectedType: 'set_reminder',
    expectedSubstring: 'gọi điện cho mẹ'
  },
  {
    id: 15,
    input: 'lúc 14h30 nhắc tôi kiểm tra server',
    expectedType: 'set_reminder',
    expectedSubstring: 'kiểm tra server'
  },
  {
    id: 16,
    input: 'đặt nhắc nhở nghỉ giải lao nửa tiếng nữa',
    expectedType: 'set_reminder',
    expectedSubstring: 'nghỉ giải lao'
  },
  {
    id: 17,
    input: 'nhắc tôi gửi báo cáo sau 1 tiếng rưỡi',
    expectedType: 'set_reminder',
    expectedSubstring: 'gửi báo cáo'
  },

  // Nhóm 3: Mở ứng dụng / website (7 câu)
  {
    id: 18,
    input: 'Mở trình duyệt Google Chrome',
    expectedType: 'open_target',
    expectedSubstring: 'Google Chrome'
  },
  {
    id: 19,
    input: 'Mở ứng dụng Spotify',
    expectedType: 'open_target',
    expectedSubstring: 'Spotify'
  },
  {
    id: 20,
    input: 'mở VS Code giúp tôi',
    expectedType: 'open_target',
    expectedSubstring: 'VS Code'
  },
  {
    id: 21,
    input: 'mở trang youtube.com',
    expectedType: 'open_target',
    expectedSubstring: 'youtube.com'
  },
  {
    id: 22,
    input: 'khởi động phần mềm Notepad',
    expectedType: 'open_target',
    expectedSubstring: 'Notepad'
  },
  {
    id: 23,
    input: 'vào trang web github.com',
    expectedType: 'open_target',
    expectedSubstring: 'github.com'
  },
  { id: 24, input: 'mở Calculator', expectedType: 'open_target', expectedSubstring: 'Calculator' },

  // Nhóm 4: Hội thoại bình thường & dễ gây nhầm (6 câu)
  { id: 25, input: 'Xin chào, bạn tên là gì?', expectedType: 'chat' },
  { id: 26, input: 'Kể cho tôi nghe một câu chuyện cười ngắn', expectedType: 'chat' },
  { id: 27, input: 'Mở rộng kiến thức về trí tuệ nhân tạo bằng cách nào?', expectedType: 'chat' },
  { id: 28, input: 'Mở Chrome có tốn nhiều RAM không?', expectedType: 'chat' },
  { id: 29, input: 'Hôm nay tâm trạng của tôi không được tốt lắm', expectedType: 'chat' },
  { id: 30, input: 'Khởi động lại máy tính có mất file đang mở không?', expectedType: 'chat' },

  // Nhóm 5: Lệnh thiếu thông tin -> ambiguous để hỏi lại (2 câu)
  { id: 31, input: 'nhắc tôi nộp bài tập', expectedType: 'ambiguous' },
  { id: 32, input: 'thêm việc', expectedType: 'ambiguous' }
]

describe('RuleRouter v1 (FR-16)', () => {
  const router = new RuleRouter()
  const fixedNow = new Date(2026, 10, 22, 10, 0, 0, 0) // 22/11/2026 10:00

  it('đạt độ chính xác >= 90% trên bộ 32 câu mẫu tiếng Việt', async () => {
    let correct = 0
    const failures: string[] = []

    for (const sample of SAMPLE_BENCHMARK) {
      const result = await router.route(sample.input, fixedNow)
      let ok = result.type === sample.expectedType

      if (ok && sample.expectedSubstring) {
        const lowerExpected = sample.expectedSubstring.toLowerCase()
        if (result.type === 'create_task') {
          ok = result.title.toLowerCase().includes(lowerExpected)
        } else if (result.type === 'set_reminder') {
          ok = result.text.toLowerCase().includes(lowerExpected)
        } else if (result.type === 'open_target') {
          ok = result.target.toLowerCase().includes(lowerExpected)
        }
      }

      if (ok) {
        correct += 1
      } else {
        failures.push(`#${sample.id} "${sample.input}" -> got ${JSON.stringify(result)}`)
      }
    }

    const accuracy = correct / SAMPLE_BENCHMARK.length
    expect(failures, `Các câu sai:\n${failures.join('\n')}`).toEqual([])
    expect(accuracy).toBeGreaterThanOrEqual(0.9)
  })

  it('trích xuất đúng thời điểm remindAt khi đặt nhắc sau 2 phút', async () => {
    const res = await router.route('nhắc tôi uống nước sau 2 phút', fixedNow)
    expect(res.type).toBe('set_reminder')
    if (res.type === 'set_reminder') {
      expect(res.text).toBe('uống nước')
      expect(Date.parse(res.remindAt)).toBe(fixedNow.getTime() + 2 * 60 * 1000)
    }
  })

  it('trích xuất đúng hạn dueAt khi thêm việc có kèm thời gian', async () => {
    const res = await router.route('thêm việc nộp báo cáo trước 17h ngày 25/11', fixedNow)
    expect(res.type).toBe('create_task')
    if (res.type === 'create_task') {
      expect(res.title).toBe('nộp báo cáo')
      expect(res.dueAt).toBeDefined()
      const d = new Date(res.dueAt as string)
      expect(d.getDate()).toBe(25)
      expect(d.getHours()).toBe(17)
    }
  })

  it('nhận diện đúng chu kỳ lặp hàng ngày, hàng tuần và hàng tháng', async () => {
    const rDaily = await router.route('nhắc tôi uống nước lúc 8h sáng hàng ngày', fixedNow)
    expect(rDaily.type).toBe('set_reminder')
    if (rDaily.type === 'set_reminder') {
      expect(rDaily.recurrence).toBe('daily')
      expect(rDaily.text).toBe('uống nước')
    }

    const rWeekly = await router.route('thêm việc họp nhóm đồ án hàng tuần', fixedNow)
    expect(rWeekly.type).toBe('create_task')
    if (rWeekly.type === 'create_task') {
      expect(rWeekly.recurrence).toBe('weekly')
      expect(rWeekly.title).toBe('họp nhóm đồ án')
    }

    const rMonthly = await router.route('thêm việc đóng tiền trọ mỗi tháng', fixedNow)
    expect(rMonthly.type).toBe('create_task')
    if (rMonthly.type === 'create_task') {
      expect(rMonthly.recurrence).toBe('monthly')
      expect(rMonthly.title).toBe('đóng tiền trọ')
    }
  })
})
