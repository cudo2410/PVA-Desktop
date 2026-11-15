import { MessageRole } from '../models/ChatMessage'

export interface StoredMessage {
  id: number
  conversationId: number
  role: MessageRole
  content: string
  createdAt: string
}

export interface ConversationRecord {
  id: number
  title: string
  createdAt: string
  messageCount?: number
  lastMessage?: string
}

export interface ConversationRepository {
  getOrCreateActiveConversation(defaultTitle?: string): Promise<ConversationRecord>
  getRecentMessages(conversationId: number, limit?: number): Promise<StoredMessage[]>
  saveTurnInTransaction(
    conversationId: number,
    userMessage: { role: 'user'; content: string },
    assistantMessage: { role: 'assistant'; content: string }
  ): Promise<{ userMessageId: number; assistantMessageId: number }>
  getPersistenceEnabled(): Promise<boolean>
  setPersistenceEnabled(enabled: boolean): Promise<void>
  clearHistory(conversationId?: number): Promise<void>
  listConversations(): Promise<ConversationRecord[]>
  getConversationMessages(conversationId: number): Promise<StoredMessage[]>
  deleteConversation(conversationId: number): Promise<boolean>
  createConversation(title?: string): Promise<ConversationRecord>
  updateConversationTitle(conversationId: number, title: string): Promise<void>
}
