import { Message } from '../models/ChatMessage'

export interface ChatModelOptions {
  maxTokens?: number
  temperature?: number
}

export interface ChatModelHealth {
  ok: boolean
  reason?: string
}

export interface ChatModel {
  health(): Promise<ChatModelHealth>
  complete(messages: Message[], opts?: Partial<ChatModelOptions>): Promise<{ text: string }>
  stream(messages: Message[], opts?: Partial<ChatModelOptions>): AsyncIterable<string>
}
