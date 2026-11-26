import { describe, it, expect, vi } from 'vitest'
import { ChatService, DEFAULT_SYSTEM_PROMPT } from './ChatService'
import { RuleRouter } from './RuleRouter'
import { TaskService } from './TaskService'
import { ReminderService } from './ReminderService'
import { InAppScheduler } from '../../adapters/scheduler/InAppScheduler'
import type { Task, CreateTaskInput } from '../models/Task'
import type { Reminder, CreateReminderInput } from '../models/Reminder'
import type { TaskRepository } from '../ports/TaskRepository'
import type { ReminderRepository } from '../ports/ReminderRepository'
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
  conversations: ConversationRecord[] = [
    { id: 1, title: 'Test Conversation', createdAt: '2026-11-15' }
  ]
  savedTurns: Array<{
    conversationId: number
    user: { role: 'user'; content: string }
    assistant: { role: 'assistant'; content: string }
  }> = []
  persistenceEnabled = true

  async getOrCreateActiveConversation(): Promise<ConversationRecord> {
    if (this.conversations.length === 0) {
      const newConv = { id: 1, title: 'Test Conversation', createdAt: '2026-11-15' }
      this.conversations.push(newConv)
      return newConv
    }
    return this.conversations[this.conversations.length - 1]
  }

  async createConversation(title?: string): Promise<ConversationRecord> {
    const newConv: ConversationRecord = {
      id: this.conversations.length + 1,
      title: title || `Hội thoại ${this.conversations.length + 1}`,
      createdAt: '2026-11-15',
      messageCount: 0
    }
    this.conversations.push(newConv)
    return newConv
  }

  async listConversations(): Promise<ConversationRecord[]> {
    return [...this.conversations].reverse()
  }

  async getConversationMessages(conversationId: number): Promise<StoredMessage[]> {
    const list: StoredMessage[] = []
    let id = 1
    for (const turn of this.savedTurns.filter((t) => t.conversationId === conversationId)) {
      list.push({
        id: id++,
        conversationId,
        role: turn.user.role,
        content: turn.user.content,
        createdAt: '2026-11-15'
      })
      list.push({
        id: id++,
        conversationId,
        role: turn.assistant.role,
        content: turn.assistant.content,
        createdAt: '2026-11-15'
      })
    }
    return list
  }

  async getRecentMessages(conversationId?: number): Promise<StoredMessage[]> {
    const targetId = conversationId || (this.conversations[0]?.id ?? 1)
    return await this.getConversationMessages(targetId)
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

  async deleteConversation(conversationId: number): Promise<boolean> {
    this.conversations = this.conversations.filter((c) => c.id !== conversationId)
    this.savedTurns = this.savedTurns.filter((t) => t.conversationId !== conversationId)
    return true
  }

  async updateConversationTitle(conversationId: number, title: string): Promise<void> {
    const conv = this.conversations.find((c) => c.id === conversationId)
    if (conv) conv.title = title
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
    expect(model.lastReceivedMessages).toHaveLength(2)

    // Lượt 2: Cung cấp tuổi
    await service.send('Tôi 25 tuổi')
    expect(model.lastReceivedMessages).toHaveLength(4)
    expect(model.lastReceivedMessages[1].content).toBe('Tôi tên là An')
    expect(model.lastReceivedMessages[2].content).toBe('Phản hồi: Tôi tên là An')
    expect(model.lastReceivedMessages[3].content).toBe('Tôi 25 tuổi')

    // Lượt 3: Hỏi lại thông tin đã cung cấp
    await service.send('Tôi tên gì và bao nhiêu tuổi?')
    expect(model.lastReceivedMessages).toHaveLength(6)
    expect(model.lastReceivedMessages[0].role).toBe('system')
    expect(model.lastReceivedMessages[1].content).toBe('Tôi tên là An')
    expect(model.lastReceivedMessages[3].content).toBe('Tôi 25 tuổi')
    expect(model.lastReceivedMessages[5].content).toBe('Tôi tên gì và bao nhiêu tuổi?')
  })

  it('Duy trì cửa sổ trượt tối đa 10 lượt (20 tin nhắn) gần nhất', async () => {
    const model = new MockChatModel()
    const service = new ChatService(model)

    for (let i = 1; i <= 12; i++) {
      await service.send(`Tin nhắn số ${i}`)
    }

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
    expect(service.getRecentContext()).toHaveLength(2)
  })

  it('UC-06: Quản lý danh sách, xem chi tiết, tạo mới và xóa cuộc hội thoại', async () => {
    const model = new MockChatModel()
    const repo = new MockConversationRepository()
    const service = new ChatService(model, { repository: repo })
    await service.init()

    // 1. Gửi tin nhắn ở cuộc hội thoại 1
    await service.send('Hỏi đáp ở hội thoại 1')
    expect(service.getActiveConversationId()).toBe(1)

    // 2. Tạo cuộc hội thoại mới
    const conv2 = await service.startNewConversation('Hội thoại số 2')
    expect(conv2.id).toBe(2)
    expect(service.getActiveConversationId()).toBe(2)
    expect(service.getRecentContext()).toHaveLength(0)

    // 3. Gửi tin nhắn ở cuộc hội thoại 2
    await service.send('Tin nhắn ở hội thoại 2')
    expect(service.getRecentContext()).toHaveLength(2)

    // 4. Lấy danh sách cuộc hội thoại
    const list = await service.listConversations()
    expect(list.length).toBe(2)

    // 5. Chuyển đổi quay lại cuộc hội thoại 1
    const msgs1 = await service.switchConversation(1)
    expect(msgs1).toHaveLength(2)
    expect(service.getActiveConversationId()).toBe(1)
    expect(service.getRecentContext()).toHaveLength(2)

    // 6. Xóa cuộc hội thoại 2
    const deleted = await service.deleteConversation(2)
    expect(deleted).toBe(true)
    const afterDelete = await service.listConversations()
    expect(afterDelete.some((c) => c.id === 2)).toBe(false)
  })

  it('checkHealth() ủy quyền chính xác cho ChatModel', async () => {
    const model = new MockChatModel()
    const service = new ChatService(model)

    const health = await service.checkHealth()
    expect(health.ok).toBe(true)
  })

  it('Tự động đặt tên cuộc hội thoại là câu hỏi đầu tiên của người dùng', async () => {
    const model = new MockChatModel()
    const repo = new MockConversationRepository()
    const service = new ChatService(model, { repository: repo })
    await service.init()

    const conv = await service.startNewConversation()
    expect(conv.id).toBe(2)

    await service.send('Lập kế hoạch tuần này giúp tôi nhé')

    const list = await service.listConversations()
    const target = list.find((c) => c.id === conv.id)
    expect(target?.title).toBe('Lập kế hoạch tuần này giúp tôi nhé')
  })

  it('định tuyến lệnh thêm việc, đặt nhắc và mở ứng dụng qua RuleRouter mà không gọi LLM', async () => {
    const model = new MockChatModel()
    const tasks: Task[] = []
    const fakeTaskRepo: TaskRepository = {
      async create(input: CreateTaskInput): Promise<Task> {
        const now = new Date().toISOString()
        const t: Task = {
          id: tasks.length + 1,
          title: input.title,
          dueAt: input.dueAt ?? null,
          status: 'open',
          recurrence: input.recurrence ?? 'none',
          createdAt: now,
          updatedAt: now
        }
        tasks.push(t)
        return t
      },
      async findById(id: number): Promise<Task | null> {
        return tasks.find((t) => t.id === id) ?? null
      },
      async list(): Promise<Task[]> {
        return [...tasks]
      },
      async update(): Promise<Task | null> {
        return null
      },
      async delete(): Promise<boolean> {
        return false
      }
    }

    const reminders: Reminder[] = []
    const fakeReminderRepo: ReminderRepository = {
      async create(input: CreateReminderInput): Promise<Reminder> {
        const r: Reminder = {
          id: reminders.length + 1,
          taskId: input.taskId ?? null,
          text: input.text,
          remindAt: input.remindAt,
          state: 'scheduled',
          recurrence: input.recurrence ?? 'none',
          firedAt: null
        }
        reminders.push(r)
        return r
      },
      async findById(id: number): Promise<Reminder | null> {
        return reminders.find((r) => r.id === id) ?? null
      },
      async list(): Promise<Reminder[]> {
        return [...reminders]
      },
      async listScheduled(): Promise<Reminder[]> {
        return reminders.filter((r) => r.state === 'scheduled')
      },
      async updateState(): Promise<Reminder | null> {
        return null
      },
      async delete(): Promise<boolean> {
        return false
      }
    }

    const scheduler = new InAppScheduler()
    const taskService = new TaskService(fakeTaskRepo)
    const reminderService = new ReminderService(fakeReminderRepo, scheduler, { notify: vi.fn() })
    const onTasksChanged = vi.fn()
    const onRemindersChanged = vi.fn()

    const service = new ChatService(model, {
      intentRouter: new RuleRouter(),
      taskService,
      reminderService,
      onTasksChanged,
      onRemindersChanged
    })

    const taskRes = await service.send('thêm việc ôn bài kiểm tra')
    expect(taskRes.text).toContain('ôn bài kiểm tra')
    expect(tasks).toHaveLength(1)
    expect(onTasksChanged).toHaveBeenCalledTimes(1)
    expect(model.lastReceivedMessages).toHaveLength(0)

    const remChunks: string[] = []
    const remRes = await service.sendStream('nhắc tôi uống nước sau 2 phút', (c) =>
      remChunks.push(c)
    )
    expect(remRes.text).toContain('uống nước')
    expect(remChunks.join('')).toBe(remRes.text)
    expect(reminders).toHaveLength(1)
    expect(onRemindersChanged).toHaveBeenCalledTimes(1)

    const openRes = await service.send('mở Google Chrome')
    expect(openRes.text).toContain('Google Chrome')
    expect(openRes.text).toContain('PermissionGuard')

    reminderService.dispose()
  })
})
