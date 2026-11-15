import { ChatModel, ChatModelOptions, ChatModelHealth } from '../ports/ChatModel'
import { Message } from '../models/ChatMessage'

export interface ChatServiceResponse {
  text: string
}

export class ChatService {
  private chatModel: ChatModel

  constructor(chatModel: ChatModel) {
    this.chatModel = chatModel
  }

  async send(content: string, opts?: Partial<ChatModelOptions>): Promise<ChatServiceResponse> {
    const trimmed = (content || '').trim()
    if (!trimmed) {
      throw new Error('Nội dung tin nhắn không được để trống.')
    }

    const message: Message = {
      role: 'user',
      content: trimmed
    }

    return await this.chatModel.complete([message], opts)
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

    const message: Message = {
      role: 'user',
      content: trimmed
    }

    let fullText = ''
    for await (const chunk of this.chatModel.stream([message], opts)) {
      fullText += chunk
      onChunk(chunk)
    }

    return { text: fullText }
  }

  async checkHealth(): Promise<ChatModelHealth> {
    return await this.chatModel.health()
  }
}
