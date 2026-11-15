import { ChatModel, ChatModelOptions, ChatModelHealth } from '../ports/ChatModel'
import { Message } from '../models/ChatMessage'
import {
  ConversationRecord,
  ConversationRepository,
  StoredMessage
} from '../ports/ConversationRepository'

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
}

export class ChatService {
  private readonly chatModel: ChatModel
  private readonly repository?: ConversationRepository
  private readonly systemPrompt: string
  private recentMessages: Message[] = []
  private activeConversationId?: number
  private persistenceEnabled = true

  constructor(chatModel: ChatModel, options?: ChatServiceOptions) {
    this.chatModel = chatModel
    this.repository = options?.repository
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
        await this.repository.saveTurnInTransaction(
          this.activeConversationId,
          { role: 'user', content: userMessage.content },
          { role: 'assistant', content: assistantMessage.content }
        )
      }
    }
  }

  async send(content: string, opts?: Partial<ChatModelOptions>): Promise<ChatServiceResponse> {
    const trimmed = (content || '').trim()
    if (!trimmed) {
      throw new Error('Nội dung tin nhắn không được để trống.')
    }

    const userMessage: Message = {
      role: 'user',
      content: trimmed
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

    const userMessage: Message = {
      role: 'user',
      content: trimmed
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
}
