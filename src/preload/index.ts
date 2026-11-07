import { contextBridge, ipcRenderer } from 'electron'

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

const api: PvaApi = {
  chat: {
    send: (content: string) => ipcRenderer.invoke('chat:send', content),
    health: () => ipcRenderer.invoke('chat:health')
  }
}

// Chỉ expose API nghiệp vụ được kiểm soát qua contextBridge, không expose raw ipcRenderer
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error('Failed to expose contextBridge API:', error)
  }
} else {
  // @ts-expect-error fallback when context isolation is disabled in dev/testing
  window.api = api
}
