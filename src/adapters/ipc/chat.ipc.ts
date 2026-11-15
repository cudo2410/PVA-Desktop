import { ipcMain } from 'electron'
import { ChatService } from '../../core/services/ChatService'
import { ModelError, ModelErrorCode } from '../../core/models/ModelError'

export interface ChatIpcResponse {
  success: boolean
  text?: string
  code?: ModelErrorCode | 'INVALID_INPUT' | 'UNKNOWN_ERROR'
  error?: string
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

        let code = 'UNKNOWN_ERROR'
        let error = 'Đã xảy ra lỗi không xác định khi stream tin nhắn.'

        if (err instanceof ModelError) {
          code = err.code
          error = err.message
        } else if (err instanceof Error) {
          code = 'CHAT_STREAM_ERROR'
          error = err.message
        }

        if (!event.sender.isDestroyed()) {
          event.sender.send('chat:stream:error', {
            requestId,
            code,
            error
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
      if (err instanceof ModelError) {
        return {
          success: false,
          code: err.code,
          error: err.message
        }
      }

      if (err instanceof Error) {
        return {
          success: false,
          code: 'INVALID_INPUT',
          error: err.message
        }
      }

      return {
        success: false,
        code: 'UNKNOWN_ERROR',
        error: 'Đã xảy ra lỗi không xác định khi xử lý tin nhắn.'
      }
    }
  })

  ipcMain.handle('chat:health', async () => {
    try {
      return await chatService.checkHealth()
    } catch {
      return {
        ok: false,
        reason: 'MODEL_UNAVAILABLE: Không thể thực hiện kiểm tra trạng thái Ollama.'
      }
    }
  })

  ipcMain.handle('chat:history:load', async () => {
    try {
      const messages = await chatService.loadHistory()
      return { success: true, messages }
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Không thể tải lịch sử trò chuyện.'
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
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Không thể cập nhật cấu hình lưu trữ.'
      }
    }
  })

  ipcMain.handle('chat:history:clear', async () => {
    try {
      await chatService.clearHistory()
      return { success: true }
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Không thể xóa lịch sử trò chuyện.'
      }
    }
  })
}
