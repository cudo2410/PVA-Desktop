import { Message } from '../models/ChatMessage'
import { StandardErrorCode } from '../models/ModelError'

export interface ChatModelOptions {
  maxTokens?: number
  temperature?: number
  numGpu?: number
}

export type ChatModelStatus = 'healthy' | 'starting' | 'unhealthy' | 'model_missing'

export interface ChatModelHealth {
  ok: boolean
  status?: ChatModelStatus
  code?: StandardErrorCode
  reason?: string
}

export interface ChatModel {
  health(): Promise<ChatModelHealth>
  complete(messages: Message[], opts?: Partial<ChatModelOptions>): Promise<{ text: string }>
  stream(messages: Message[], opts?: Partial<ChatModelOptions>): AsyncIterable<string>
  sendMessageStream(
    prompt: string,
    onChunk: (chunk: string) => void,
    opts?: Partial<ChatModelOptions>
  ): Promise<void>
}
