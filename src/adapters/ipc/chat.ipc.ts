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
  ipcMain.handle('chat:send', async (_, content: string): Promise<ChatIpcResponse> => {
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
}
