import { ChatModel, ChatModelOptions, ChatModelHealth } from '../../core/ports/ChatModel'
import { Message } from '../../core/models/ChatMessage'
import { ModelError } from '../../core/models/ModelError'
import { OllamaProcessManager } from './OllamaProcessManager'

export interface OllamaConfig {
  baseUrl?: string
  model?: string
  timeoutMs?: number
  defaultTemperature?: number
  autoStart?: boolean
  processManager?: OllamaProcessManager
  numGpu?: number
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

async function* filterThinkStream(source: AsyncIterable<string>): AsyncIterable<string> {
  let inThink = false
  let pending = ''

  for await (const chunk of source) {
    pending += chunk
    while (pending.length > 0) {
      if (!inThink) {
        const thinkStartIdx = pending.indexOf('<think>')
        if (thinkStartIdx !== -1) {
          const textBefore = pending.slice(0, thinkStartIdx)
          if (textBefore) yield textBefore
          pending = pending.slice(thinkStartIdx + 7)
          inThink = true
          continue
        }

        let partialMatch = false
        for (let len = Math.min(pending.length, 6); len >= 1; len--) {
          const tail = pending.slice(-len)
          if ('<think>'.startsWith(tail)) {
            const textBefore = pending.slice(0, -len)
            if (textBefore) yield textBefore
            pending = tail
            partialMatch = true
            break
          }
        }

        if (!partialMatch) {
          yield pending
          pending = ''
        } else {
          break
        }
      } else {
        const thinkEndIdx = pending.indexOf('</think>')
        if (thinkEndIdx !== -1) {
          pending = pending.slice(thinkEndIdx + 8)
          pending = pending.replace(/^[\r\n\s]+/, '')
          inThink = false
          continue
        }

        let partialEndMatch = false
        for (let len = Math.min(pending.length, 7); len >= 1; len--) {
          const tail = pending.slice(-len)
          if ('</think>'.startsWith(tail)) {
            pending = tail
            partialEndMatch = true
            break
          }
        }

        if (!partialEndMatch) {
          pending = ''
        } else {
          break
        }
      }
    }
  }

  if (!inThink && pending.length > 0) {
    yield pending
  }
}

export class OllamaChatModel implements ChatModel {
  private readonly baseUrl: string
  private readonly model: string
  private readonly timeoutMs: number
  private readonly defaultTemperature: number
  private readonly autoStart: boolean
  private readonly numGpu: number
  private readonly processManager: OllamaProcessManager

  constructor(config?: OllamaConfig) {
    this.baseUrl = (config?.baseUrl || 'http://localhost:11434').replace(/\/+$/, '')
    this.model = config?.model || 'qwen3:1.7b'
    this.timeoutMs = config?.timeoutMs ?? 60000
    this.defaultTemperature = config?.defaultTemperature ?? 0.3
    this.autoStart = config?.autoStart ?? true
    this.numGpu =
      config?.numGpu ?? (process.env.OLLAMA_NUM_GPU ? parseInt(process.env.OLLAMA_NUM_GPU, 10) : 0)
    this.processManager = config?.processManager ?? new OllamaProcessManager(this.baseUrl)
  }

  /**
   * Đảm bảo tiến trình Ollama đang chạy, tự động kích hoạt nếu chưa bật
   */
  async ensureServerRunning(): Promise<boolean> {
    const res = await this.processManager.ensureRunning()
    return res.success
  }

  async health(): Promise<ChatModelHealth> {
    try {
      // 1. Kiểm tra nhanh xem server có đang phản hồi không
      let isRunning = await this.processManager.isServerRunning(1500)

      // 2. Nếu server chưa chạy và autoStart bật, tự động kích hoạt ollama serve ngầm
      if (!isRunning && this.autoStart) {
        const startResult = await this.processManager.startServer()
        if (!startResult.success) {
          const isStarting =
            startResult.reason?.includes('OLLAMA_START') &&
            !startResult.reason?.includes('OLLAMA_START_TIMEOUT')
          return {
            ok: false,
            status: isStarting ? 'starting' : 'unhealthy',
            reason: startResult.reason
          }
        }
        isRunning = true
      }

      if (!isRunning) {
        return {
          ok: false,
          status: 'unhealthy',
          reason: `MODEL_UNAVAILABLE: Không thể kết nối tới Ollama tại ${this.baseUrl}`
        }
      }

      // 3. Kiểm tra danh sách mô hình từ Ollama (/api/tags)
      const tagsRes = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(4000)
      })

      if (!tagsRes.ok) {
        return {
          ok: false,
          status: 'unhealthy',
          reason: `MODEL_UNAVAILABLE: Máy chủ Ollama trả về mã trạng thái HTTP ${tagsRes.status} khi lấy danh sách mô hình.`
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
          status: 'model_missing',
          reason: `MODEL_UNAVAILABLE: Mô hình "${this.model}" chưa được tải về máy. Hãy chạy lệnh: ollama pull ${this.model}`
        }
      }

      return { ok: true, status: 'healthy' }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      return {
        ok: false,
        status: 'unhealthy',
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
      think: false,
      options: {
        temperature: opts?.temperature ?? this.defaultTemperature,
        num_predict: opts?.maxTokens,
        num_gpu: opts?.numGpu ?? this.numGpu
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

  async sendMessageStream(
    prompt: string,
    onChunk: (chunk: string) => void,
    opts?: Partial<ChatModelOptions>
  ): Promise<void> {
    const trimmed = (prompt || '').trim()
    if (!trimmed) {
      throw new Error('Nội dung tin nhắn không được để trống.')
    }
    const message: Message = {
      role: 'user',
      content: trimmed
    }
    for await (const chunk of this.stream([message], opts)) {
      onChunk(chunk)
    }
  }

  async *stream(
    messages: Message[],
    opts?: Partial<ChatModelOptions> & { signal?: AbortSignal }
  ): AsyncIterable<string> {
    yield* filterThinkStream(this.rawStream(messages, opts))
  }

  private async *rawStream(
    messages: Message[],
    opts?: Partial<ChatModelOptions> & { signal?: AbortSignal }
  ): AsyncIterable<string> {
    const payload = {
      model: this.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content
      })),
      stream: true,
      think: false,
      options: {
        temperature: opts?.temperature ?? this.defaultTemperature,
        num_predict: opts?.maxTokens,
        num_gpu: opts?.numGpu ?? this.numGpu
      }
    }

    const timeoutSignal = AbortSignal.timeout(this.timeoutMs)
    const effectiveSignal = opts?.signal
      ? 'any' in AbortSignal && typeof AbortSignal.any === 'function'
        ? AbortSignal.any([opts.signal, timeoutSignal])
        : opts.signal
      : timeoutSignal

    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: effectiveSignal
      })
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.name === 'AbortError' && opts?.signal?.aborted) {
          // Người dùng chủ động hủy stream
          return
        }
        if (err.name === 'TimeoutError' || err.name === 'AbortError') {
          throw new ModelError('MODEL_TIMEOUT', 'Quá thời gian chờ phản hồi stream từ Ollama.')
        }
      }
      throw new ModelError('MODEL_UNAVAILABLE', 'Không thể kết nối đến dịch vụ Ollama.')
    }

    if (!response.ok || !response.body) {
      let errorDetail = response.statusText
      try {
        const errJson = (await response.json()) as { error?: string }
        if (errJson?.error) errorDetail = errJson.error
      } catch {
        // bỏ qua
      }
      if (response.status === 404) {
        throw new ModelError(
          'MODEL_UNAVAILABLE',
          `Mô hình "${this.model}" chưa tồn tại trong Ollama: ${errorDetail}`
        )
      }
      throw new ModelError(
        'MODEL_BAD_RESPONSE',
        `Ollama stream trả về lỗi HTTP ${response.status}: ${errorDetail}`
      )
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
            if (parsed.error) {
              throw new ModelError('MODEL_BAD_RESPONSE', parsed.error)
            }
            if (parsed.message?.content) {
              yield parsed.message.content
            }
          } catch (e) {
            if (e instanceof ModelError) throw e
            // bỏ qua dòng NDJSON bị lỗi định dạng
          }
        }
      }

      // Flush phần còn lại trong buffer nếu có
      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer.trim()) as OllamaChatResponse
          if (parsed.error) {
            throw new ModelError('MODEL_BAD_RESPONSE', parsed.error)
          }
          if (parsed.message?.content) {
            yield parsed.message.content
          }
        } catch (e) {
          if (e instanceof ModelError) throw e
        }
      }
    } finally {
      reader.releaseLock()
    }
  }
}
