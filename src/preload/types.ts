export type StandardErrorCode =
  'MODEL_UNAVAILABLE' | 'MODEL_TIMEOUT' | 'MODEL_BAD_RESPONSE' | 'DB_UNAVAILABLE'

export interface ChatSendResponse {
  success: boolean
  text?: string
  code?: StandardErrorCode | string
  error?: string
}

export type ChatHealthStatus = 'healthy' | 'starting' | 'unhealthy' | 'model_missing'

export interface ChatHealthResponse {
  ok: boolean
  status?: ChatHealthStatus
  code?: StandardErrorCode
  reason?: string
}

export interface ChatStreamCallbacks {
  onChunk: (chunk: string) => void
  onComplete: (fullText: string) => void
  onError: (error: { code?: StandardErrorCode | string; message: string }) => void
}

export interface HistoryMessageItem {
  id: number
  conversationId: number
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
}

export interface ChatHistoryResponse {
  success: boolean
  messages?: HistoryMessageItem[]
  error?: string
}

export interface ChatPersistenceResponse {
  success: boolean
  enabled?: boolean
  error?: string
}

export interface ConversationItem {
  id: number
  title: string
  createdAt: string
  messageCount?: number
  lastMessage?: string
}

export interface ConversationListResponse {
  success: boolean
  conversations?: ConversationItem[]
  error?: string
}

export interface ConversationDetailResponse {
  success: boolean
  messages?: HistoryMessageItem[]
  error?: string
}

export interface ConversationActionResponse {
  success: boolean
  conversation?: ConversationItem
  error?: string
}

export interface PvaApi {
  chat: {
    send(content: string): Promise<ChatSendResponse>
    health(): Promise<ChatHealthResponse>
    startModel?(): Promise<{ success: boolean; error?: string }>
    stream(content: string, callbacks: ChatStreamCallbacks): () => void
    loadHistory(): Promise<ChatHistoryResponse>
    getPersistence(): Promise<ChatPersistenceResponse>
    setPersistence(enabled: boolean): Promise<ChatPersistenceResponse>
    clearHistory(): Promise<{ success: boolean; error?: string }>
    listConversations(): Promise<ConversationListResponse>
    getConversation(conversationId: number): Promise<ConversationDetailResponse>
    switchConversation(conversationId: number): Promise<ConversationDetailResponse>
    createConversation(title?: string): Promise<ConversationActionResponse>
    deleteConversation(conversationId: number): Promise<{ success: boolean; error?: string }>
  }
}
