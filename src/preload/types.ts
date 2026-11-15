export interface ChatSendResponse {
  success: boolean
  text?: string
  code?: string
  error?: string
}

export type ChatHealthStatus = 'healthy' | 'starting' | 'unhealthy' | 'model_missing'

export interface ChatHealthResponse {
  ok: boolean
  status?: ChatHealthStatus
  reason?: string
}

export interface ChatStreamCallbacks {
  onChunk: (chunk: string) => void
  onComplete: (fullText: string) => void
  onError: (error: { code?: string; message: string }) => void
}

export interface PvaApi {
  chat: {
    send(content: string): Promise<ChatSendResponse>
    health(): Promise<ChatHealthResponse>
    stream(content: string, callbacks: ChatStreamCallbacks): () => void
  }
}
