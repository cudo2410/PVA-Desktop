import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OllamaProcessManager } from './OllamaProcessManager'

describe('OllamaProcessManager Adapter', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('isServerRunning() trả về true khi Ollama HTTP server phản hồi 200 OK', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200
    } as unknown as Response)

    const manager = new OllamaProcessManager('http://localhost:11434')
    const running = await manager.isServerRunning()
    expect(running).toBe(true)
  })

  it('isServerRunning() trả về false khi kết nối thất bại', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))

    const manager = new OllamaProcessManager('http://localhost:11434')
    const running = await manager.isServerRunning()
    expect(running).toBe(false)
  })

  it('startServer() trả về success: true ngay lập tức nếu server đã đang chạy', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200
    } as unknown as Response)

    const manager = new OllamaProcessManager('http://localhost:11434')
    const res = await manager.startServer()
    expect(res.success).toBe(true)
  })

  it('startServer() trả về lỗi rõ ràng khi không tìm thấy file thực thi ollama trên máy', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))

    const manager = new OllamaProcessManager('http://localhost:11434')
    vi.spyOn(manager, 'findOllamaBinary').mockReturnValue(null)

    const res = await manager.startServer()
    expect(res.success).toBe(false)
    expect(res.reason).toContain('OLLAMA_NOT_INSTALLED')
  })

  it('findOllamaBinary() trả về đường dẫn chuỗi hoặc null', () => {
    const manager = new OllamaProcessManager('http://localhost:11434')
    const binary = manager.findOllamaBinary()
    if (binary) {
      expect(typeof binary).toBe('string')
    } else {
      expect(binary).toBeNull()
    }
  })
})
