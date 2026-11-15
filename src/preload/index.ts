import { contextBridge, ipcRenderer } from 'electron'
import type { PvaApi, ChatStreamCallbacks } from './types'

export type * from './types'

const api: PvaApi = {
  chat: {
    send: (content: string) => ipcRenderer.invoke('chat:send', content),
    health: () => ipcRenderer.invoke('chat:health'),
    loadHistory: () => ipcRenderer.invoke('chat:history:load'),
    getPersistence: () => ipcRenderer.invoke('chat:history:get-persistence'),
    setPersistence: (enabled: boolean) =>
      ipcRenderer.invoke('chat:history:set-persistence', enabled),
    clearHistory: () => ipcRenderer.invoke('chat:history:clear'),
    listConversations: () => ipcRenderer.invoke('chat:conversations:list'),
    getConversation: (conversationId: number) =>
      ipcRenderer.invoke('chat:conversations:get', conversationId),
    switchConversation: (conversationId: number) =>
      ipcRenderer.invoke('chat:conversations:switch', conversationId),
    createConversation: (title?: string) => ipcRenderer.invoke('chat:conversations:create', title),
    deleteConversation: (conversationId: number) =>
      ipcRenderer.invoke('chat:conversations:delete', conversationId),
    stream: (content: string, callbacks: ChatStreamCallbacks) => {
      const requestId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`

      const handleChunk = (_: unknown, data: { requestId: string; chunk: string }): void => {
        if (data.requestId === requestId) {
          callbacks.onChunk(data.chunk)
        }
      }

      const handleEnd = (_: unknown, data: { requestId: string; fullText: string }): void => {
        if (data.requestId === requestId) {
          cleanup()
          callbacks.onComplete(data.fullText)
        }
      }

      const handleError = (
        _: unknown,
        data: { requestId: string; code?: string; error: string }
      ): void => {
        if (data.requestId === requestId) {
          cleanup()
          callbacks.onError({ code: data.code, message: data.error })
        }
      }

      const cleanup = (): void => {
        ipcRenderer.removeListener('chat:stream:chunk', handleChunk)
        ipcRenderer.removeListener('chat:stream:end', handleEnd)
        ipcRenderer.removeListener('chat:stream:error', handleError)
      }

      ipcRenderer.on('chat:stream:chunk', handleChunk)
      ipcRenderer.on('chat:stream:end', handleEnd)
      ipcRenderer.on('chat:stream:error', handleError)

      ipcRenderer.send('chat:stream:start', { requestId, content })

      return () => {
        cleanup()
        ipcRenderer.send('chat:stream:abort', { requestId })
      }
    }
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
