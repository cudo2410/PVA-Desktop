import { ipcMain } from 'electron'
import { ChatService } from '../../core/services/ChatService'
import {
  AppError,
  DatabaseError,
  ModelError,
  StandardErrorCode
} from '../../core/models/ModelError'

export interface ChatIpcResponse {
  success: boolean
  text?: string
  code?: StandardErrorCode | 'INVALID_INPUT' | 'UNKNOWN_ERROR'
  error?: string
}

function resolveStandardErrorCode(err: unknown): { code: StandardErrorCode; message: string } {
  if (err instanceof AppError || err instanceof ModelError || err instanceof DatabaseError) {
    return {
      code: err.code,
      message: err.message
    }
  }

  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    if (msg.includes('sqlite') || msg.includes('database') || msg.includes('cơ sở dữ liệu')) {
      return {
        code: 'DB_UNAVAILABLE',
        message: err.message
      }
    }
    if (
      msg.includes('timeout') ||
      msg.includes('aborterror') ||
      msg.includes('quá thời gian chờ')
    ) {
      return {
        code: 'MODEL_TIMEOUT',
        message: err.message
      }
    }
    if (
      msg.includes('json') ||
      msg.includes('cấu trúc') ||
      msg.includes('bad response') ||
      msg.includes('500')
    ) {
      return {
        code: 'MODEL_BAD_RESPONSE',
        message: err.message
      }
    }
    if (
      msg.includes('fetch') ||
      msg.includes('econnrefused') ||
      msg.includes('ollama') ||
      msg.includes('kết nối')
    ) {
      return {
        code: 'MODEL_UNAVAILABLE',
        message: err.message
      }
    }

    return {
      code: 'MODEL_UNAVAILABLE',
      message: err.message
    }
  }

  return {
    code: 'MODEL_UNAVAILABLE',
    message: String(err)
  }
}

export function registerChatIpc(chatService: ChatService): void {
  const activeStreams = new Map<string, AbortController>()

  ipcMain.on(
    'chat:stream:start',
    async (event, payload: { requestId: string; content: string }) => {
      const { requestId, content } = payload || {}

      if (!requestId || typeof requestId !== 'string') {
        return
      }

      if (typeof content !== 'string' || !content.trim()) {
        if (!event.sender.isDestroyed()) {
          event.sender.send('chat:stream:error', {
            requestId,
            code: 'INVALID_INPUT',
            error: 'Nội dung tin nhắn không hợp lệ hoặc để trống.'
          })
        }
        return
      }

      const abortController = new AbortController()
      activeStreams.set(requestId, abortController)

      try {
        const result = await chatService.sendStream(
          content,
          (chunk) => {
            if (!event.sender.isDestroyed()) {
              event.sender.send('chat:stream:chunk', { requestId, chunk })
            }
          },
          { signal: abortController.signal }
        )

        if (!event.sender.isDestroyed()) {
          event.sender.send('chat:stream:end', {
            requestId,
            fullText: result.text
          })
        }
      } catch (err: unknown) {
        if (abortController.signal.aborted) {
          // Stream bị hủy bởi người dùng
          return
        }

        const { code, message } = resolveStandardErrorCode(err)

        if (!event.sender.isDestroyed()) {
          event.sender.send('chat:stream:error', {
            requestId,
            code,
            error: message
          })
        }
      } finally {
        activeStreams.delete(requestId)
      }
    }
  )

  ipcMain.on('chat:stream:abort', (_, payload: { requestId: string }) => {
    if (payload?.requestId && activeStreams.has(payload.requestId)) {
      const controller = activeStreams.get(payload.requestId)
      controller?.abort()
      activeStreams.delete(payload.requestId)
    }
  })

  ipcMain.handle('chat:send', async (_, content: unknown): Promise<ChatIpcResponse> => {
    if (typeof content !== 'string' || !content.trim()) {
      return {
        success: false,
        code: 'INVALID_INPUT',
        error: 'Nội dung tin nhắn không hợp lệ hoặc để trống.'
      }
    }

    try {
      const result = await chatService.send(content)
      return {
        success: true,
        text: result.text
      }
    } catch (err: unknown) {
      const { code, message } = resolveStandardErrorCode(err)
      return {
        success: false,
        code,
        error: message
      }
    }
  })

  ipcMain.handle('chat:health', async () => {
    try {
      const health = await chatService.checkHealth()
      if (!health.ok && !health.code) {
        health.code = 'MODEL_UNAVAILABLE'
      }
      return health
    } catch {
      return {
        ok: false,
        status: 'unhealthy',
        code: 'MODEL_UNAVAILABLE',
        reason: 'MODEL_UNAVAILABLE: Không thể thực hiện kiểm tra trạng thái Ollama.'
      }
    }
  })

  ipcMain.handle('chat:model:start', async () => {
    try {
      const started = await chatService.restartModelServer()
      return { success: started }
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Không thể khởi động Ollama'
      }
    }
  })

  ipcMain.handle('chat:history:load', async () => {
    try {
      const messages = await chatService.loadHistory()
      return { success: true, messages }
    } catch (err: unknown) {
      const { code, message } = resolveStandardErrorCode(err)
      return {
        success: false,
        code: code === 'DB_UNAVAILABLE' ? 'DB_UNAVAILABLE' : undefined,
        error: message || 'Không thể tải lịch sử trò chuyện.'
      }
    }
  })

  ipcMain.handle('chat:history:get-persistence', async () => {
    try {
      const enabled = await chatService.getPersistenceEnabled()
      return { success: true, enabled }
    } catch {
      return { success: true, enabled: true }
    }
  })

  ipcMain.handle('chat:history:set-persistence', async (_, enabled: unknown) => {
    try {
      await chatService.setPersistenceEnabled(Boolean(enabled))
      return { success: true }
    } catch (err: unknown) {
      const { code, message } = resolveStandardErrorCode(err)
      return {
        success: false,
        code: code === 'DB_UNAVAILABLE' ? 'DB_UNAVAILABLE' : undefined,
        error: message || 'Không thể cập nhật cấu hình lưu trữ.'
      }
    }
  })

  ipcMain.handle('chat:history:clear', async () => {
    try {
      await chatService.clearHistory()
      return { success: true }
    } catch (err: unknown) {
      const { code, message } = resolveStandardErrorCode(err)
      return {
        success: false,
        code: code === 'DB_UNAVAILABLE' ? 'DB_UNAVAILABLE' : undefined,
        error: message || 'Không thể xóa lịch sử trò chuyện.'
      }
    }
  })

  ipcMain.handle('chat:conversations:list', async () => {
    try {
      const conversations = await chatService.listConversations()
      return { success: true, conversations }
    } catch (err: unknown) {
      const { code, message } = resolveStandardErrorCode(err)
      return {
        success: false,
        code: code === 'DB_UNAVAILABLE' ? 'DB_UNAVAILABLE' : undefined,
        error: message || 'Không thể lấy danh sách cuộc hội thoại.'
      }
    }
  })

  ipcMain.handle('chat:conversations:get', async (_, conversationId: unknown) => {
    const id = Number(conversationId)
    if (!id || isNaN(id)) {
      return { success: false, error: 'Mã cuộc hội thoại không hợp lệ.' }
    }
    try {
      const messages = await chatService.getConversationMessages(id)
      return { success: true, messages }
    } catch (err: unknown) {
      const { code, message } = resolveStandardErrorCode(err)
      return {
        success: false,
        code: code === 'DB_UNAVAILABLE' ? 'DB_UNAVAILABLE' : undefined,
        error: message || 'Không thể lấy chi tiết cuộc hội thoại.'
      }
    }
  })

  ipcMain.handle('chat:conversations:switch', async (_, conversationId: unknown) => {
    const id = Number(conversationId)
    if (!id || isNaN(id)) {
      return { success: false, error: 'Mã cuộc hội thoại không hợp lệ.' }
    }
    try {
      const messages = await chatService.switchConversation(id)
      return { success: true, messages }
    } catch (err: unknown) {
      const { code, message } = resolveStandardErrorCode(err)
      return {
        success: false,
        code: code === 'DB_UNAVAILABLE' ? 'DB_UNAVAILABLE' : undefined,
        error: message || 'Không thể chuyển đổi cuộc hội thoại.'
      }
    }
  })

  ipcMain.handle('chat:conversations:create', async (_, title?: unknown) => {
    try {
      const conversation = await chatService.startNewConversation(
        typeof title === 'string' ? title : undefined
      )
      return { success: true, conversation }
    } catch (err: unknown) {
      const { code, message } = resolveStandardErrorCode(err)
      return {
        success: false,
        code: code === 'DB_UNAVAILABLE' ? 'DB_UNAVAILABLE' : undefined,
        error: message || 'Không thể tạo cuộc hội thoại mới.'
      }
    }
  })

  ipcMain.handle('chat:conversations:delete', async (_, conversationId: unknown) => {
    const id = Number(conversationId)
    if (!id || isNaN(id)) {
      return { success: false, error: 'Mã cuộc hội thoại không hợp lệ.' }
    }
    try {
      const deleted = await chatService.deleteConversation(id)
      return { success: deleted }
    } catch (err: unknown) {
      const { code, message } = resolveStandardErrorCode(err)
      return {
        success: false,
        code: code === 'DB_UNAVAILABLE' ? 'DB_UNAVAILABLE' : undefined,
        error: message || 'Không thể xóa cuộc hội thoại.'
      }
    }
  })
}
