import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OllamaChatModel } from './OllamaChatModel'
import { ModelError } from '../../core/models/ModelError'

describe('OllamaChatModel Adapter', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('stream() phân tích đúng các dòng NDJSON và truyền từng chunk văn bản', async () => {
    const ndjsonChunks = [
      JSON.stringify({ message: { role: 'assistant', content: 'Xin ' } }) + '\n',
      JSON.stringify({ message: { role: 'assistant', content: 'chào ' } }) +
        '\n' +
        JSON.stringify({ message: { role: 'assistant', content: 'bạn!' } }) +
        '\n'
    ]

    const encoder = new TextEncoder()
    const readableStream = new ReadableStream({
      start(controller) {
        for (const chunk of ndjsonChunks) {
          controller.enqueue(encoder.encode(chunk))
        }
        controller.close()
      }
    })

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: readableStream
    } as unknown as Response)

    const model = new OllamaChatModel({ baseUrl: 'http://localhost:11434', model: 'qwen3:1.7b' })
    const chunks: string[] = []

    for await (const chunk of model.stream([{ role: 'user', content: 'Alo' }])) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual(['Xin ', 'chào ', 'bạn!'])
  })

  it('stream() xử lý trường hợp dòng NDJSON bị chia cắt giữa các lần đọc HTTP', async () => {
    const fullLine1 = JSON.stringify({ message: { role: 'assistant', content: 'Một ' } }) + '\n'
    const fullLine2 = JSON.stringify({ message: { role: 'assistant', content: 'Hai ' } }) + '\n'

    // Chia fullLine1 thành 2 phần
    const part1 = fullLine1.slice(0, 15)
    const part2 = fullLine1.slice(15)

    const encoder = new TextEncoder()
    const readableStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(part1))
        controller.enqueue(encoder.encode(part2 + fullLine2))
        controller.close()
      }
    })

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: readableStream
    } as unknown as Response)

    const model = new OllamaChatModel()
    const chunks: string[] = []

    for await (const chunk of model.stream([{ role: 'user', content: 'Đếm' }])) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual(['Một ', 'Hai '])
  })

  it('stream() tự động lọc sạch thẻ suy nghĩ lý luận <think>...</think>', async () => {
    const ndjsonChunks = [
      JSON.stringify({
        message: { role: 'assistant', content: '<think>Tôi cần trả lời ngắn gọn.' }
      }) + '\n',
      JSON.stringify({
        message: { role: 'assistant', content: ' Suy nghĩ thêm.</think>\nCâu trả lời chính thức.' }
      }) + '\n'
    ]

    const encoder = new TextEncoder()
    const readableStream = new ReadableStream({
      start(controller) {
        for (const chunk of ndjsonChunks) {
          controller.enqueue(encoder.encode(chunk))
        }
        controller.close()
      }
    })

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: readableStream
    } as unknown as Response)

    const model = new OllamaChatModel()
    const chunks: string[] = []

    for await (const chunk of model.stream([{ role: 'user', content: 'Hỏi' }])) {
      chunks.push(chunk)
    }

    const fullResult = chunks.join('')
    expect(fullResult).not.toContain('<think>')
    expect(fullResult).not.toContain('</think>')
    expect(fullResult).not.toContain('Tôi cần trả lời ngắn gọn.')
    expect(fullResult).toContain('Câu trả lời chính thức.')
  })

  it('sendMessageStream() gọi callback onChunk đầy đủ và ném lỗi khi prompt rỗng', async () => {
    const ndjson =
      JSON.stringify({ message: { role: 'assistant', content: 'PVA phản hồi' } }) + '\n'
    const encoder = new TextEncoder()
    const readableStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(ndjson))
        controller.close()
      }
    })

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: readableStream
    } as unknown as Response)

    const model = new OllamaChatModel()
    const received: string[] = []

    await model.sendMessageStream('Test', (chunk) => received.push(chunk))
    expect(received).toEqual(['PVA phản hồi'])

    await expect(model.sendMessageStream('', () => {})).rejects.toThrow(
      'Nội dung tin nhắn không được để trống.'
    )
  })

  it('stream() ném ModelError khi Ollama trả về HTTP lỗi', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ error: 'Mô hình lỗi' })
    } as unknown as Response)

    const model = new OllamaChatModel()

    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of model.stream([{ role: 'user', content: 'Lỗi' }])) {
        // do nothing
      }
    }).rejects.toThrow(ModelError)
  })

  it('health() trả về healthy khi Ollama đang chạy và model đã có sẵn', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/version')) {
        return Promise.resolve({ ok: true, status: 200 } as unknown as Response)
      }
      if (url.includes('/api/tags')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ models: [{ name: 'qwen3:1.7b' }] })
        } as unknown as Response)
      }
      return Promise.reject(new Error('Unknown endpoint'))
    })

    const model = new OllamaChatModel({ model: 'qwen3:1.7b' })
    const health = await model.health()
    expect(health.ok).toBe(true)
    expect(health.status).toBe('healthy')
  })

  it('health() trả về model_missing khi Ollama đang chạy nhưng chưa tải model', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/version')) {
        return Promise.resolve({ ok: true, status: 200 } as unknown as Response)
      }
      if (url.includes('/api/tags')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ models: [{ name: 'llama3:8b' }] })
        } as unknown as Response)
      }
      return Promise.reject(new Error('Unknown endpoint'))
    })

    const model = new OllamaChatModel({ model: 'qwen3:1.7b' })
    const health = await model.health()
    expect(health.ok).toBe(false)
    expect(health.status).toBe('model_missing')
    expect(health.code).toBe('MODEL_UNAVAILABLE')
    expect(health.reason).toContain('chưa được tải về máy')
  })

  it('health() trả về MODEL_UNAVAILABLE khi Ollama không chạy (tắt kết nối)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('fetch failed (ECONNREFUSED)'))

    const model = new OllamaChatModel({ model: 'qwen3:1.7b' })
    const health = await model.health()
    expect(health.ok).toBe(false)
    expect(health.status).toBe('unhealthy')
    expect(health.code).toBe('MODEL_UNAVAILABLE')
    expect(health.reason).toContain('MODEL_UNAVAILABLE')
  })

  it('complete() ném MODEL_UNAVAILABLE khi không thể kết nối tới Ollama', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'))

    const model = new OllamaChatModel()
    await expect(model.complete([{ role: 'user', content: 'Alo' }])).rejects.toMatchObject({
      code: 'MODEL_UNAVAILABLE'
    })
  })

  it('complete() ném MODEL_TIMEOUT khi quá thời gian chờ', async () => {
    const timeoutErr = new Error('The operation was aborted due to timeout')
    timeoutErr.name = 'TimeoutError'
    global.fetch = vi.fn().mockRejectedValue(timeoutErr)

    const model = new OllamaChatModel()
    await expect(model.complete([{ role: 'user', content: 'Alo' }])).rejects.toMatchObject({
      code: 'MODEL_TIMEOUT'
    })
  })

  it('complete() ném MODEL_BAD_RESPONSE khi Ollama trả về HTTP 500 hoặc format sai', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ error: 'Ollama internal crash' })
    } as unknown as Response)

    const model = new OllamaChatModel()
    await expect(model.complete([{ role: 'user', content: 'Alo' }])).rejects.toMatchObject({
      code: 'MODEL_BAD_RESPONSE'
    })
  })

  it('gửi think: false trong payload tới Ollama /api/chat', async () => {
    let capturedBody = ''
    global.fetch = vi.fn().mockImplementation((_, init?: RequestInit) => {
      capturedBody = init?.body as string
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          message: { role: 'assistant', content: 'Phản hồi không nghĩ' }
        })
      } as unknown as Response)
    })

    const model = new OllamaChatModel({ model: 'qwen3:1.7b' })
    await model.complete([{ role: 'user', content: 'Chào bạn' }])

    expect(capturedBody).toBeTruthy()
    const parsed = JSON.parse(capturedBody)
    expect(parsed.think).toBe(false)
  })
})
