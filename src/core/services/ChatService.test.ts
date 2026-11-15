import { describe, it, expect, vi } from 'vitest'
import { ChatService, DEFAULT_SYSTEM_PROMPT } from './ChatService'
import { ChatModel, ChatModelHealth, ChatModelOptions } from '../ports/ChatModel'
import { Message } from '../models/ChatMessage'
import {
  ConversationRecord,
  ConversationRepository,
  StoredMessage
} from '../ports/ConversationRepository'

class MockChatModel implements ChatModel {
  lastReceivedMessages: Message[] = []

  async health(): Promise<ChatModelHealth> {
    return { ok: true }
  }

  async complete(
    messages: Message[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _opts?: Partial<ChatModelOptions>
  ): Promise<{ text: string }> {
    this.lastReceivedMessages = [...messages]
    const lastUserMsg = messages.filter((m) => m.role === 'user').pop()
    return { text: `Phản hồi: ${lastUserMsg?.content || ''}` }
  }

  async *stream(
    messages: Message[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _opts?: Partial<ChatModelOptions>
  ): AsyncIterable<string> {
    this.lastReceivedMessages = [...messages]
    const lastUserMsg = messages.filter((m) => m.role === 'user').pop()
    yield 'Phản '
    yield 'hồi '
    yield `stream: ${lastUserMsg?.content || ''}`
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

class MockConversationRepository implements ConversationRepository {
  savedTurns: Array<{
    conversationId: number
    user: { role: 'user'; content: string }
    assistant: { role: 'assistant'; content: string }
  }> = []
  persistenceEnabled = true

  async getOrCreateActiveConversation(): Promise<ConversationRecord> {
    return { id: 1, title: 'Test Conversation', createdAt: '2026-11-15' }
  }

  async getRecentMessages(): Promise<StoredMessage[]> {
    const list: StoredMessage[] = []
    let id = 1
    for (const turn of this.savedTurns) {
      list.push({
        id: id++,
        conversationId: 1,
        role: turn.user.role,
        content: turn.user.content,
        createdAt: '2026-11-15'
      })
      list.push({
        id: id++,
        conversationId: 1,
        role: turn.assistant.role,
        content: turn.assistant.content,
        createdAt: '2026-11-15'
      })
    }
    return list
  }

  async saveTurnInTransaction(
    conversationId: number,
    userMessage: { role: 'user'; content: string },
    assistantMessage: { role: 'assistant'; content: string }
  ): Promise<{ userMessageId: number; assistantMessageId: number }> {
    this.savedTurns.push({ conversationId, user: userMessage, assistant: assistantMessage })
    return {
      userMessageId: this.savedTurns.length * 2 - 1,
      assistantMessageId: this.savedTurns.length * 2
    }
  }

  async getPersistenceEnabled(): Promise<boolean> {
    return this.persistenceEnabled
  }

  async setPersistenceEnabled(enabled: boolean): Promise<void> {
    this.persistenceEnabled = enabled
  }

  async clearHistory(): Promise<void> {
    this.savedTurns = []
  }
}

describe('ChatService Domain Service', () => {
  it('send() gửi kèm system prompt và nhận phản hồi', async () => {
    const model = new MockChatModel()
    const service = new ChatService(model)

    const res = await service.send('Xin chào')
    expect(res.text).toBe('Phản hồi: Xin chào')
    expect(model.lastReceivedMessages[0].role).toBe('system')
    expect(model.lastReceivedMessages[0].content).toBe(DEFAULT_SYSTEM_PROMPT)
    expect(model.lastReceivedMessages[1].content).toBe('Xin chào')
  })

  it('send() ném lỗi khi tin nhắn rỗng hoặc chỉ có khoảng trắng', async () => {
    const model = new MockChatModel()
    const service = new ChatService(model)

    await expect(service.send('')).rejects.toThrow('Nội dung tin nhắn không được để trống.')
    await expect(service.send('   ')).rejects.toThrow('Nội dung tin nhắn không được để trống.')
  })

  it('sendStream() gọi onChunk cho từng chunk và tích lũy phản hồi', async () => {
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

  it('FR-01: Kiểm thử ngữ cảnh hội thoại đa lượt 3 lượt (3-turn context test)', async () => {
    const model = new MockChatModel()
    const service = new ChatService(model)

    // Lượt 1: Giới thiệu tên
    await service.send('Tôi tên là An')
    expect(model.lastReceivedMessages).toHaveLength(2) // system + turn 1 user

    // Lượt 2: Cung cấp tuổi
    await service.send('Tôi 25 tuổi')
    expect(model.lastReceivedMessages).toHaveLength(4) // system + turn 1 (user, assistant) + turn 2 user
    expect(model.lastReceivedMessages[1].content).toBe('Tôi tên là An')
    expect(model.lastReceivedMessages[2].content).toBe('Phản hồi: Tôi tên là An')
    expect(model.lastReceivedMessages[3].content).toBe('Tôi 25 tuổi')

    // Lượt 3: Hỏi lại thông tin đã cung cấp
    await service.send('Tôi tên gì và bao nhiêu tuổi?')
    expect(model.lastReceivedMessages).toHaveLength(6) // system + turn 1 (2) + turn 2 (2) + turn 3 user
    expect(model.lastReceivedMessages[0].role).toBe('system')
    expect(model.lastReceivedMessages[1].content).toBe('Tôi tên là An')
    expect(model.lastReceivedMessages[3].content).toBe('Tôi 25 tuổi')
    expect(model.lastReceivedMessages[5].content).toBe('Tôi tên gì và bao nhiêu tuổi?')
  })

  it('Duy trì cửa sổ trượt tối đa 10 lượt (20 tin nhắn) gần nhất', async () => {
    const model = new MockChatModel()
    const service = new ChatService(model)

    // Gửi 12 lượt
    for (let i = 1; i <= 12; i++) {
      await service.send(`Tin nhắn số ${i}`)
    }

    // Context gửi tới model gồm system prompt (1) + tối đa 20 messages gần nhất + current (đã gồm trong 20)
    // Tổng số message trong memory: 20 messages (tương đương 10 lượt gần nhất: từ lượt 3 đến lượt 12)
    const context = service.getRecentContext()
    expect(context).toHaveLength(20)
    expect(context[0].content).toBe('Tin nhắn số 3')
    expect(context[19].content).toBe('Phản hồi: Tin nhắn số 12')
  })

  it('Tích hợp ConversationRepository: lưu cặp tin nhắn khi persistence bật', async () => {
    const model = new MockChatModel()
    const repo = new MockConversationRepository()
    const service = new ChatService(model, { repository: repo })

    await service.send('Lưu tin nhắn này')
    expect(repo.savedTurns).toHaveLength(1)
    expect(repo.savedTurns[0].user.content).toBe('Lưu tin nhắn này')
    expect(repo.savedTurns[0].assistant.content).toBe('Phản hồi: Lưu tin nhắn này')
  })

  it('Tích hợp ConversationRepository: KHÔNG lưu vào DB khi persistence tắt', async () => {
    const model = new MockChatModel()
    const repo = new MockConversationRepository()
    repo.persistenceEnabled = false
    const service = new ChatService(model, { repository: repo })

    await service.send('Không lưu tin nhắn này')
    expect(repo.savedTurns).toHaveLength(0)
    // Nhưng vẫn lưu trong bộ nhớ tạm phiên làm việc
    expect(service.getRecentContext()).toHaveLength(2)
  })

  it('checkHealth() ủy quyền chính xác cho ChatModel', async () => {
    const model = new MockChatModel()
    const service = new ChatService(model)

    const health = await service.checkHealth()
    expect(health.ok).toBe(true)
  })
})
