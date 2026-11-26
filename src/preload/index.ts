import { contextBridge, ipcRenderer } from 'electron'
import type { PvaApi, ChatStreamCallbacks, ChatHealthResponse } from './types'
import type { CreateTaskInput, TaskListOptions, UpdateTaskInput } from '../core/models/Task'
import type { CreateReminderInput, ReminderStateFilter } from '../core/models/Reminder'
import type { NotificationPayload } from '../core/ports/Notifier'

export type * from './types'

const api: PvaApi = {
  chat: {
    send: (content: string) => ipcRenderer.invoke('chat:send', content),
    health: () => ipcRenderer.invoke('chat:health'),
    startModel: () => ipcRenderer.invoke('chat:model:start'),
    onModelStatus: (callback: (status: ChatHealthResponse) => void) => {
      const handler = (_: unknown, status: ChatHealthResponse): void => {
        if (status && typeof status === 'object' && typeof status.ok === 'boolean') {
          callback(status)
        }
      }
      ipcRenderer.on('chat:model:status', handler)
      return () => {
        ipcRenderer.removeListener('chat:model:status', handler)
      }
    },
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
  },
  tasks: {
    list: (options?: TaskListOptions) => ipcRenderer.invoke('tasks:list', options),
    create: (input: CreateTaskInput) => ipcRenderer.invoke('tasks:create', input),
    update: (id: number, input: UpdateTaskInput) => ipcRenderer.invoke('tasks:update', id, input),
    toggle: (id: number) => ipcRenderer.invoke('tasks:toggle', id),
    delete: (id: number) => ipcRenderer.invoke('tasks:delete', id),
    onUpdated: (callback: () => void) => {
      const handler = (): void => callback()
      ipcRenderer.on('tasks:updated', handler)
      return () => {
        ipcRenderer.removeListener('tasks:updated', handler)
      }
    }
  },
  reminders: {
    list: (state?: ReminderStateFilter) => ipcRenderer.invoke('reminders:list', state),
    create: (input: CreateReminderInput) => ipcRenderer.invoke('reminders:create', input),
    cancel: (id: number) => ipcRenderer.invoke('reminders:cancel', id),
    delete: (id: number) => ipcRenderer.invoke('reminders:delete', id),
    onFired: (callback: (payload: NotificationPayload) => void) => {
      const handler = (_: unknown, payload: NotificationPayload): void => {
        callback(payload)
      }
      ipcRenderer.on('reminders:fired', handler)
      return () => {
        ipcRenderer.removeListener('reminders:fired', handler)
      }
    },
    onUpdated: (callback: () => void) => {
      const handler = (): void => callback()
      ipcRenderer.on('reminders:updated', handler)
      return () => {
        ipcRenderer.removeListener('reminders:updated', handler)
      }
    },
    onPlaySound: (callback: () => void) => {
      const handler = (): void => callback()
      ipcRenderer.on('reminders:play-sound', handler)
      return () => {
        ipcRenderer.removeListener('reminders:play-sound', handler)
      }
    },
    onOpenDrawer: (callback: () => void) => {
      const handler = (): void => callback()
      ipcRenderer.on('reminders:open-drawer', handler)
      return () => {
        ipcRenderer.removeListener('reminders:open-drawer', handler)
      }
    },
    onOverlayToast: (callback: (payload: NotificationPayload) => void) => {
      const handler = (_: unknown, payload: NotificationPayload): void => {
        callback(payload)
      }
      ipcRenderer.on('reminders:overlay-toast', handler)
      return () => {
        ipcRenderer.removeListener('reminders:overlay-toast', handler)
      }
    },
    openFromToast: (openTasksDrawer = true) => {
      ipcRenderer.send('reminders:open-from-toast', openTasksDrawer)
    },
    notifyOverlayEmpty: () => {
      ipcRenderer.send('reminders:overlay-empty')
    },
    setOverlayMouseIgnore: (ignore: boolean) => {
      ipcRenderer.send('reminders:overlay-mouse', ignore)
    }
  },
  window: {
    restoreFromMini: () => {
      ipcRenderer.send('mini-widget:restore')
    },
    hideMiniToTray: () => {
      ipcRenderer.send('mini-widget:hide-to-tray')
    },
    getMiniBounds: () => ipcRenderer.invoke('mini-widget:get-bounds'),
    resizeMini: (bounds) => {
      ipcRenderer.send('mini-widget:resize', bounds)
    },
    onMiniVisibility: (callback: (visible: boolean) => void) => {
      const handler = (_: unknown, visible: boolean): void => {
        callback(Boolean(visible))
      }
      ipcRenderer.on('mini-widget:visibility', handler)
      return () => {
        ipcRenderer.removeListener('mini-widget:visibility', handler)
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
