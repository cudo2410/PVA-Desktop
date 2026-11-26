import { ChatModel, ChatModelOptions, ChatModelHealth } from '../ports/ChatModel'
import { Message } from '../models/ChatMessage'
import {
  ConversationRecord,
  ConversationRepository,
  StoredMessage
} from '../ports/ConversationRepository'
import type { IntentRouter } from '../ports/IntentRouter'
import type { TaskService } from './TaskService'
import type { ReminderService } from './ReminderService'
import { RECURRENCE_LABELS } from '../models/Recurrence'
import { ValidationError } from '../models/ModelError'

export interface ChatServiceResponse {
  text: string
}

export const DEFAULT_SYSTEM_PROMPT =
  'Bạn là PVA (Personal Virtual Assistant), một trợ lý ảo cá nhân thông minh, thân thiện, bảo mật và hữu ích. Bạn luôn phản hồi bằng tiếng Việt rõ ràng, ngắn gọn, tự nhiên và chính xác.'

export const MAX_CONTEXT_TURNS = 10
export const MAX_CONTEXT_MESSAGES = MAX_CONTEXT_TURNS * 2

export interface ChatServiceOptions {
  systemPrompt?: string
  repository?: ConversationRepository
  intentRouter?: IntentRouter
  taskService?: TaskService
  reminderService?: ReminderService
  onTasksChanged?: () => void
  onRemindersChanged?: () => void
}

function formatLocalDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

export class ChatService {
  private readonly chatModel: ChatModel
  private readonly repository?: ConversationRepository
  private readonly intentRouter?: IntentRouter
  private readonly taskService?: TaskService
  private readonly reminderService?: ReminderService
  private readonly onTasksChanged?: () => void
  private readonly onRemindersChanged?: () => void
  private readonly systemPrompt: string
  private recentMessages: Message[] = []
  private activeConversationId?: number
  private persistenceEnabled = true

  constructor(chatModel: ChatModel, options?: ChatServiceOptions) {
    this.chatModel = chatModel
    this.repository = options?.repository
    this.intentRouter = options?.intentRouter
    this.taskService = options?.taskService
    this.reminderService = options?.reminderService
    this.onTasksChanged = options?.onTasksChanged
    this.onRemindersChanged = options?.onRemindersChanged
    this.systemPrompt = options?.systemPrompt || DEFAULT_SYSTEM_PROMPT
  }

  getRecentContext(): readonly Message[] {
    return this.recentMessages
  }

  getActiveConversationId(): number | undefined {
    return this.activeConversationId
  }

  async init(): Promise<void> {
    if (this.repository) {
      this.persistenceEnabled = await this.repository.getPersistenceEnabled()
      if (this.persistenceEnabled) {
        const conv = await this.repository.getOrCreateActiveConversation()
        this.activeConversationId = conv.id
        const stored = await this.repository.getRecentMessages(conv.id, MAX_CONTEXT_MESSAGES)
        this.recentMessages = stored.map((m) => ({
          role: m.role,
          content: m.content
        }))
      }
    }
  }

  async loadHistory(): Promise<StoredMessage[]> {
    if (this.repository) {
      this.persistenceEnabled = await this.repository.getPersistenceEnabled()
      if (this.persistenceEnabled) {
        const conv = await this.repository.getOrCreateActiveConversation()
        this.activeConversationId = conv.id
        const stored = await this.repository.getRecentMessages(conv.id, MAX_CONTEXT_MESSAGES)
        this.recentMessages = stored.map((m) => ({
          role: m.role,
          content: m.content
        }))
        return stored
      }
    }

    return this.recentMessages.map((m, idx) => ({
      id: idx + 1,
      conversationId: this.activeConversationId || 1,
      role: m.role,
      content: m.content,
      createdAt: new Date().toISOString()
    }))
  }

  async listConversations(): Promise<ConversationRecord[]> {
    if (this.repository) {
      return await this.repository.listConversations()
    }
    return [
      {
        id: this.activeConversationId || 1,
        title: 'Hội thoại hiện tại',
        createdAt: new Date().toISOString(),
        messageCount: this.recentMessages.length
      }
    ]
  }

  async getConversationMessages(conversationId: number): Promise<StoredMessage[]> {
    if (this.repository) {
      return await this.repository.getConversationMessages(conversationId)
    }
    return this.recentMessages.map((m, idx) => ({
      id: idx + 1,
      conversationId,
      role: m.role,
      content: m.content,
      createdAt: new Date().toISOString()
    }))
  }

  async switchConversation(conversationId: number): Promise<StoredMessage[]> {
    this.activeConversationId = conversationId
    if (this.repository) {
      const stored = await this.repository.getRecentMessages(conversationId, MAX_CONTEXT_MESSAGES)
      this.recentMessages = stored.map((m) => ({
        role: m.role,
        content: m.content
      }))
      return await this.repository.getConversationMessages(conversationId)
    }
    return []
  }

  async startNewConversation(title?: string): Promise<ConversationRecord> {
    this.recentMessages = []
    if (this.repository) {
      const conv = await this.repository.createConversation(title)
      this.activeConversationId = conv.id
      return conv
    }
    const dummy: ConversationRecord = {
      id: Date.now(),
      title: title || 'Hội thoại mới',
      createdAt: new Date().toISOString(),
      messageCount: 0
    }
    this.activeConversationId = dummy.id
    return dummy
  }

  async deleteConversation(conversationId: number): Promise<boolean> {
    if (this.repository) {
      const ok = await this.repository.deleteConversation(conversationId)
      if (this.activeConversationId === conversationId) {
        this.activeConversationId = undefined
        this.recentMessages = []
        const conv = await this.repository.getOrCreateActiveConversation()
        this.activeConversationId = conv.id
        const stored = await this.repository.getRecentMessages(conv.id, MAX_CONTEXT_MESSAGES)
        this.recentMessages = stored.map((m) => ({
          role: m.role,
          content: m.content
        }))
      }
      return ok
    }
    this.recentMessages = []
    return true
  }

  async getPersistenceEnabled(): Promise<boolean> {
    if (this.repository) {
      this.persistenceEnabled = await this.repository.getPersistenceEnabled()
    }
    return this.persistenceEnabled
  }

  async setPersistenceEnabled(enabled: boolean): Promise<void> {
    this.persistenceEnabled = enabled
    if (this.repository) {
      await this.repository.setPersistenceEnabled(enabled)
    }
  }

  async clearHistory(): Promise<void> {
    this.recentMessages = []
    if (this.repository && this.activeConversationId) {
      await this.repository.clearHistory(this.activeConversationId)
    }
  }

  private formatConversationTitle(question: string, maxLength = 80): string {
    const clean = (question || '')
      .trim()
      .replace(/\r?\n|\r/g, ' ')
      .replace(/\s+/g, ' ')
    if (!clean) return 'Cuộc trò chuyện mới'
    if (clean.length <= maxLength) return clean
    return clean.slice(0, maxLength).trim() + '...'
  }

  private buildContextPayload(userMessage: Message): Message[] {
    const payload: Message[] = [
      { role: 'system', content: this.systemPrompt },
      ...this.recentMessages.slice(-MAX_CONTEXT_MESSAGES),
      userMessage
    ]
    return payload
  }

  private async recordTurn(userMessage: Message, assistantMessage: Message): Promise<void> {
    this.recentMessages.push(userMessage)
    this.recentMessages.push(assistantMessage)

    if (this.recentMessages.length > MAX_CONTEXT_MESSAGES) {
      this.recentMessages = this.recentMessages.slice(-MAX_CONTEXT_MESSAGES)
    }

    if (this.repository) {
      this.persistenceEnabled = await this.repository.getPersistenceEnabled()
      if (this.persistenceEnabled) {
        if (!this.activeConversationId) {
          const conv = await this.repository.getOrCreateActiveConversation()
          this.activeConversationId = conv.id
        }

        // Tự động đặt tên cuộc hội thoại là câu hỏi đầu tiên của người dùng
        const existingMessages = await this.repository.getConversationMessages(
          this.activeConversationId
        )
        const isFirstTurn = existingMessages.length === 0

        await this.repository.saveTurnInTransaction(
          this.activeConversationId,
          { role: 'user', content: userMessage.content },
          { role: 'assistant', content: assistantMessage.content }
        )

        if (isFirstTurn) {
          const newTitle = this.formatConversationTitle(userMessage.content)
          await this.repository.updateConversationTitle(this.activeConversationId, newTitle)
        }
      }
    }
  }

  private async ensureConversationTitle(question: string): Promise<void> {
    if (this.repository) {
      this.persistenceEnabled = await this.repository.getPersistenceEnabled()
      if (this.persistenceEnabled) {
        if (!this.activeConversationId) {
          const conv = await this.repository.getOrCreateActiveConversation()
          this.activeConversationId = conv.id
        }
        const existingMessages = await this.repository.getConversationMessages(
          this.activeConversationId
        )
        if (existingMessages.length === 0) {
          const newTitle = this.formatConversationTitle(question)
          await this.repository.updateConversationTitle(this.activeConversationId, newTitle)
        }
      }
    }
  }

  private async tryHandleRoutedIntent(trimmed: string): Promise<string | null> {
    if (!this.intentRouter) {
      return null
    }

    const intent = await this.intentRouter.route(trimmed)

    if (intent.type === 'chat') {
      return null
    }

    if (intent.type === 'ambiguous') {
      return intent.reason
    }

    if (intent.type === 'create_task') {
      if (!this.taskService) {
        return 'Tính năng quản lý công việc hiện chưa sẵn sàng (cơ sở dữ liệu chưa khả dụng).'
      }
      try {
        const created = await this.taskService.createTask({
          title: intent.title,
          dueAt: intent.dueAt ?? null,
          recurrence: intent.recurrence ?? 'none'
        })
        this.onTasksChanged?.()
        const metaParts: string[] = []
        if (created.dueAt) {
          metaParts.push(`hạn: ${formatLocalDateTime(created.dueAt)}`)
        }
        if (created.recurrence !== 'none') {
          metaParts.push(`lặp: ${RECURRENCE_LABELS[created.recurrence]}`)
        }
        const metaNote = metaParts.length > 0 ? ` (${metaParts.join(', ')})` : ''
        return `Đã thêm công việc "${created.title}"${metaNote} vào danh sách công việc.`
      } catch (err: unknown) {
        if (err instanceof ValidationError) {
          return err.message
        }
        throw err
      }
    }

    if (intent.type === 'set_reminder') {
      if (!this.reminderService) {
        return 'Tính năng nhắc nhở hiện chưa sẵn sàng (cơ sở dữ liệu chưa khả dụng).'
      }
      try {
        const created = await this.reminderService.createReminder({
          text: intent.text,
          remindAt: intent.remindAt,
          recurrence: intent.recurrence ?? 'none'
        })
        this.onRemindersChanged?.()
        const repeatNote =
          created.recurrence !== 'none'
            ? `, lặp ${RECURRENCE_LABELS[created.recurrence].toLowerCase()}`
            : ''
        return `Đã đặt nhắc nhở "${created.text}" vào lúc ${formatLocalDateTime(created.remindAt)}${repeatNote}. (Lưu ý: chỉ nhắc khi PVA đang chạy.)`
      } catch (err: unknown) {
        if (err instanceof ValidationError) {
          return `${err.message} Bạn vui lòng chọn thời điểm ở tương lai nhé.`
        }
        throw err
      }
    }

    if (intent.type === 'open_target') {
      // FR-16: Không thực thi lệnh mở ứng dụng/website khi chưa đi qua PermissionGuard (triển khai ở Tuần 5)
      return `Tôi đã nhận diện yêu cầu mở "${intent.target}". Để đảm bảo an toàn, thao tác mở ứng dụng/website sẽ chỉ thực thi qua danh sách cho phép (PermissionGuard & Allowlist).`
    }

    return null
  }

  async send(content: string, opts?: Partial<ChatModelOptions>): Promise<ChatServiceResponse> {
    const trimmed = (content || '').trim()
    if (!trimmed) {
      throw new Error('Nội dung tin nhắn không được để trống.')
    }

    await this.ensureConversationTitle(trimmed)

    const userMessage: Message = {
      role: 'user',
      content: trimmed
    }

    const routedReply = await this.tryHandleRoutedIntent(trimmed)
    if (routedReply !== null) {
      const assistantMessage: Message = {
        role: 'assistant',
        content: routedReply
      }
      await this.recordTurn(userMessage, assistantMessage)
      return { text: routedReply }
    }

    const payload = this.buildContextPayload(userMessage)
    const result = await this.chatModel.complete(payload, opts)

    const assistantMessage: Message = {
      role: 'assistant',
      content: result.text
    }

    await this.recordTurn(userMessage, assistantMessage)

    return result
  }

  async sendStream(
    content: string,
    onChunk: (chunk: string) => void,
    opts?: Partial<ChatModelOptions> & { signal?: AbortSignal }
  ): Promise<ChatServiceResponse> {
    const trimmed = (content || '').trim()
    if (!trimmed) {
      throw new Error('Nội dung tin nhắn không được để trống.')
    }

    await this.ensureConversationTitle(trimmed)

    const userMessage: Message = {
      role: 'user',
      content: trimmed
    }

    const routedReply = await this.tryHandleRoutedIntent(trimmed)
    if (routedReply !== null) {
      onChunk(routedReply)
      const assistantMessage: Message = {
        role: 'assistant',
        content: routedReply
      }
      await this.recordTurn(userMessage, assistantMessage)
      return { text: routedReply }
    }

    const payload = this.buildContextPayload(userMessage)
    let fullText = ''

    for await (const chunk of this.chatModel.stream(payload, opts)) {
      fullText += chunk
      onChunk(chunk)
    }

    const assistantMessage: Message = {
      role: 'assistant',
      content: fullText
    }

    await this.recordTurn(userMessage, assistantMessage)

    return { text: fullText }
  }

  async checkHealth(): Promise<ChatModelHealth> {
    return await this.chatModel.health()
  }

  async restartModelServer(): Promise<boolean> {
    if (
      'startServer' in this.chatModel &&
      typeof (this.chatModel as unknown as { startServer: () => Promise<boolean> }).startServer ===
        'function'
    ) {
      return await (
        this.chatModel as unknown as { startServer: () => Promise<boolean> }
      ).startServer()
    }
    return false
  }
}
