import { ChatModel, ChatModelOptions, ChatModelHealth } from '../../core/ports/ChatModel'
import { Message } from '../../core/models/ChatMessage'
import { ModelError } from '../../core/models/ModelError'

export interface OllamaConfig {
  baseUrl?: string
  model?: string
  timeoutMs?: number
  defaultTemperature?: number
}

interface OllamaChatResponse {
  model?: string
  message?: {
    role?: string
    content?: string
  }
  done?: boolean
  error?: string
}

export class OllamaChatModel implements ChatModel {
  private readonly baseUrl: string
  private readonly model: string
  private readonly timeoutMs: number
  private readonly defaultTemperature: number

  constructor(config?: OllamaConfig) {
    this.baseUrl = (config?.baseUrl || 'http://localhost:11434').replace(/\/+$/, '')
    this.model = config?.model || 'qwen3:1.7b'
    this.timeoutMs = config?.timeoutMs ?? 60000
    this.defaultTemperature = config?.defaultTemperature ?? 0.3
  }

  async health(): Promise<ChatModelHealth> {
    try {
      const versionRes = await fetch(`${this.baseUrl}/api/version`, {
        method: 'GET',
        signal: AbortSignal.timeout(4000)
      })

      if (!versionRes.ok) {
        return {
          ok: false,
          reason: `MODEL_UNAVAILABLE: Máy chủ Ollama trả về mã trạng thái HTTP ${versionRes.status}`
        }
      }

      const tagsRes = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(4000)
      })

      if (!tagsRes.ok) {
        return {
          ok: false,
          reason: 'MODEL_UNAVAILABLE: Không thể lấy danh sách mô hình từ Ollama'
        }
      }

      const tagsData = (await tagsRes.json()) as { models?: Array<{ name: string }> }
      const installedModels = (tagsData.models || []).map((m) => m.name)

      // Kiểm tra xem model cấu hình có sẵn hay không (so sánh cả tag mặc định :latest)
      const isModelPresent = installedModels.some(
        (name) =>
          name === this.model ||
          name.startsWith(`${this.model}:`) ||
          `${name}:latest` === this.model
      )

      if (!isModelPresent) {
        return {
          ok: false,
          reason: `MODEL_UNAVAILABLE: Mô hình "${this.model}" chưa được tải về máy. Hãy chạy lệnh: ollama pull ${this.model}`
        }
      }

      return { ok: true }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      return {
        ok: false,
        reason: `MODEL_UNAVAILABLE: Không thể kết nối tới Ollama tại ${this.baseUrl} (${errorMsg})`
      }
    }
  }

  async complete(messages: Message[], opts?: Partial<ChatModelOptions>): Promise<{ text: string }> {
    const payload = {
      model: this.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content
      })),
      stream: false,
      options: {
        temperature: opts?.temperature ?? this.defaultTemperature,
        num_predict: opts?.maxTokens
      }
    }

    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs)
      })
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.name === 'TimeoutError' || err.name === 'AbortError') {
          throw new ModelError(
            'MODEL_TIMEOUT',
            `Quá thời gian chờ phản hồi (${this.timeoutMs / 1000}s) từ mô hình Ollama.`
          )
        }
      }
      throw new ModelError(
        'MODEL_UNAVAILABLE',
        `Không thể kết nối đến máy chủ Ollama tại ${this.baseUrl}. Vui lòng kiểm tra dịch vụ Ollama.`
      )
    }

    if (!response.ok) {
      let errorDetail = response.statusText
      try {
        const errJson = (await response.json()) as { error?: string }
        if (errJson?.error) errorDetail = errJson.error
      } catch {
        // bỏ qua nếu body không phải JSON
      }

      if (response.status === 404) {
        throw new ModelError(
          'MODEL_UNAVAILABLE',
          `Mô hình "${this.model}" chưa tồn tại trong Ollama: ${errorDetail}`
        )
      }

      throw new ModelError(
        'MODEL_BAD_RESPONSE',
        `Ollama API trả về lỗi HTTP ${response.status}: ${errorDetail}`
      )
    }

    let data: OllamaChatResponse
    try {
      data = (await response.json()) as OllamaChatResponse
    } catch {
      throw new ModelError('MODEL_BAD_RESPONSE', 'Phản hồi từ Ollama không phải là JSON hợp lệ.')
    }

    if (data.error) {
      throw new ModelError('MODEL_BAD_RESPONSE', data.error)
    }

    const rawContent = data.message?.content
    if (typeof rawContent !== 'string') {
      throw new ModelError(
        'MODEL_BAD_RESPONSE',
        'Cấu trúc phản hồi từ Ollama thiếu trường content hợp lệ.'
      )
    }

    // Lọc bỏ thẻ <think>...</think> nếu mô hình reasoning (Qwen3) sinh kèm trong content
    const cleanText = rawContent
      .replace(/^[\s\S]*?<\/think>\s*/i, '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .trim()

    return { text: cleanText }
  }

  async *stream(messages: Message[], opts?: Partial<ChatModelOptions>): AsyncIterable<string> {
    const payload = {
      model: this.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content
      })),
      stream: true,
      options: {
        temperature: opts?.temperature ?? this.defaultTemperature,
        num_predict: opts?.maxTokens
      }
    }

    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs)
      })
    } catch (err: unknown) {
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        throw new ModelError('MODEL_TIMEOUT', 'Quá thời gian chờ phản hồi stream từ Ollama.')
      }
      throw new ModelError('MODEL_UNAVAILABLE', 'Không thể kết nối đến dịch vụ Ollama.')
    }

    if (!response.ok || !response.body) {
      throw new ModelError('MODEL_BAD_RESPONSE', `Ollama stream trả về lỗi HTTP ${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmedLine = line.trim()
          if (!trimmedLine) continue
          try {
            const parsed = JSON.parse(trimmedLine) as OllamaChatResponse
            if (parsed.message?.content) {
              yield parsed.message.content
            }
          } catch {
            // bỏ qua dòng không parse được
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }
}
