export type MessageRole = 'system' | 'user' | 'assistant'

export interface Message {
  role: MessageRole
  content: string
}

export interface ChatMessage extends Message {
  id?: string
  timestamp?: number
}
