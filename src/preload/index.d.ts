export interface ChatSendResponse {
  success: boolean
  text?: string
  code?: string
  error?: string
}

export interface ChatHealthResponse {
  ok: boolean
  reason?: string
}

export interface PvaApi {
  chat: {
    send(content: string): Promise<ChatSendResponse>
    health(): Promise<ChatHealthResponse>
  }
}

declare global {
  interface Window {
    api: PvaApi
  }
}
