import { describe, it, expect, vi } from 'vitest'
import { ChatService } from './ChatService'
import { ChatModel, ChatModelHealth, ChatModelOptions } from '../ports/ChatModel'
import { Message } from '../models/ChatMessage'

class MockChatModel implements ChatModel {
  async health(): Promise<ChatModelHealth> {
    return { ok: true }
  }

  async complete(
    messages: Message[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _opts?: Partial<ChatModelOptions>
  ): Promise<{ text: string }> {
    return { text: `Phản hồi: ${messages[0].content}` }
  }

  async *stream(
    messages: Message[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _opts?: Partial<ChatModelOptions>
  ): AsyncIterable<string> {
    yield 'Phản '
    yield 'hồi '
    yield `stream: ${messages[0].content}`
  }

  async sendMessageStream(
    prompt: string,
    onChunk: (chunk: string) => void,
    opts?: Partial<ChatModelOptions>
  ): Promise<void> {
    for await (const chunk of this.stream([{ role: 'user', content: prompt }], opts)) {
      onChunk(chunk)
    }
  }
}

describe('ChatService Domain Service', () => {
  it('send() hoạt động đồng bộ bình thường và trả về kết quả', async () => {
    const model = new MockChatModel()
    const service = new ChatService(model)

    const res = await service.send('Xin chào')
    expect(res.text).toBe('Phản hồi: Xin chào')
  })

  it('send() ném lỗi khi tin nhắn rỗng hoặc chỉ có khoảng trắng', async () => {
    const model = new MockChatModel()
    const service = new ChatService(model)

    await expect(service.send('')).rejects.toThrow('Nội dung tin nhắn không được để trống.')
    await expect(service.send('   ')).rejects.toThrow('Nội dung tin nhắn không được để trống.')
  })

  it('sendStream() gọi onChunk cho từng chunk và trả về toàn bộ text tích lũy', async () => {
    const model = new MockChatModel()
    const service = new ChatService(model)

    const chunks: string[] = []
    const onChunk = vi.fn((chunk: string) => {
      chunks.push(chunk)
    })

    const result = await service.sendStream('Thử nghiệm stream', onChunk)

    expect(onChunk).toHaveBeenCalledTimes(3)
    expect(chunks).toEqual(['Phản ', 'hồi ', 'stream: Thử nghiệm stream'])
    expect(result.text).toBe('Phản hồi stream: Thử nghiệm stream')
  })

  it('sendStream() ném lỗi khi tin nhắn rỗng', async () => {
    const model = new MockChatModel()
    const service = new ChatService(model)

    const onChunk = vi.fn()
    await expect(service.sendStream('   ', onChunk)).rejects.toThrow(
      'Nội dung tin nhắn không được để trống.'
    )
    expect(onChunk).not.toHaveBeenCalled()
  })

  it('checkHealth() ủy quyền chính xác cho ChatModel', async () => {
    const model = new MockChatModel()
    const service = new ChatService(model)

    const health = await service.checkHealth()
    expect(health.ok).toBe(true)
  })
})
