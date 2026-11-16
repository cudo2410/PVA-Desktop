import { describe, it, expect, vi } from 'vitest'
import { AppStateStore } from './appStateStore'

describe('AppStateStore (Nhiệm vụ 6)', () => {
  it('khởi tạo với trạng thái mặc định là Idle', () => {
    const store = new AppStateStore()
    const snapshot = store.getSnapshot()
    expect(snapshot.state).toBe('Idle')
    expect(snapshot.label).toBe('Sẵn sàng')
    expect(snapshot.detail).toContain('Sẵn sàng')
  })

  it('chuyển đổi chính xác qua 5 trạng thái: Idle, Listening, Processing, Speaking, Error', () => {
    const store = new AppStateStore()

    // 1. Listening (khi bấm mic)
    store.setListening('Đang ghi âm giọng nói...')
    expect(store.getSnapshot().state).toBe('Listening')
    expect(store.getSnapshot().label).toBe('Đang lắng nghe...')
    expect(store.getSnapshot().detail).toBe('Đang ghi âm giọng nói...')

    // 2. Processing (khi gửi tin nhắn / phân tích)
    store.setProcessing('Đang suy nghĩ...')
    expect(store.getSnapshot().state).toBe('Processing')
    expect(store.getSnapshot().label).toBe('Đang xử lý...')
    expect(store.getSnapshot().detail).toBe('Đang suy nghĩ...')

    // 3. Speaking (khi stream câu trả lời / đọc TTS)
    store.setSpeaking('Đang đọc to phản hồi...')
    expect(store.getSnapshot().state).toBe('Speaking')
    expect(store.getSnapshot().label).toBe('Đang trả lời...')
    expect(store.getSnapshot().detail).toBe('Đang đọc to phản hồi...')

    // 4. Error (khi gặp lỗi)
    store.setError('MODEL_UNAVAILABLE', 'Không thể kết nối Ollama')
    expect(store.getSnapshot().state).toBe('Error')
    expect(store.getSnapshot().label).toBe('Báo lỗi')
    expect(store.getSnapshot().errorCode).toBe('MODEL_UNAVAILABLE')
    expect(store.getSnapshot().detail).toBe('Không thể kết nối Ollama')

    // 5. Quay về Idle (khi hoàn thành hoặc reset)
    store.setIdle()
    expect(store.getSnapshot().state).toBe('Idle')
    expect(store.getSnapshot().label).toBe('Sẵn sàng')
  })

  it('thông báo cho các subscriber khi trạng thái thay đổi', () => {
    const store = new AppStateStore()
    const listener = vi.fn()

    const unsubscribe = store.subscribe(listener)
    expect(listener).not.toHaveBeenCalled()

    store.setListening()
    expect(listener).toHaveBeenCalledTimes(1)

    store.setProcessing()
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    store.setIdle()
    expect(listener).toHaveBeenCalledTimes(2) // Không gọi thêm sau khi unsubscribe
  })
})
