import { spawn, ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

export interface OllamaProcessStatus {
  success: boolean
  reason?: string
}

export class OllamaProcessManager {
  private readonly baseUrl: string
  private startPromise: Promise<OllamaProcessStatus> | null = null
  private spawnedProcess: ChildProcess | null = null
  private cachedBinaryPath: string | null | undefined = undefined
  private lastStartAttemptTime = 0
  private readonly startCooldownMs = 15000 // Cooldown 15 giây giữa các lần thử khởi động

  constructor(baseUrl = 'http://localhost:11434') {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
  }

  /**
   * Kiểm tra nhanh xem Ollama HTTP server có đang phản hồi không
   */
  async isServerRunning(timeoutMs = 1200): Promise<boolean> {
    try {
      // Ưu tiên 127.0.0.1 để tránh việc phân giải DNS IPv6 ::1 chậm trên Windows 11
      const targetUrl = this.baseUrl.replace('localhost', '127.0.0.1')
      const res = await fetch(`${targetUrl}/api/version`, {
        method: 'GET',
        signal: AbortSignal.timeout(timeoutMs)
      })
      return res.ok
    } catch {
      return false
    }
  }

  /**
   * Tự động tìm vị trí file thực thi ollama trên máy tính (thuần fs.existsSync, KHÔNG dùng execSync để tránh nháy console)
   */
  findOllamaBinary(): string | null {
    if (this.cachedBinaryPath !== undefined) {
      return this.cachedBinaryPath
    }

    const binaryName = process.platform === 'win32' ? 'ollama.exe' : 'ollama'

    // 1. Kiểm tra thư mục cài đặt mặc định trên Windows (%LOCALAPPDATA%\Programs\Ollama\ollama.exe)
    const localAppData = process.env.LOCALAPPDATA
    if (localAppData) {
      const winDefaultPath = join(localAppData, 'Programs', 'Ollama', binaryName)
      if (existsSync(winDefaultPath)) {
        this.cachedBinaryPath = winDefaultPath
        return winDefaultPath
      }
    }

    // 2. Kiểm tra Program Files (%ProgramFiles%\Ollama\ollama.exe)
    const programFiles = process.env.ProgramFiles
    if (programFiles) {
      const pfPath = join(programFiles, 'Ollama', binaryName)
      if (existsSync(pfPath)) {
        this.cachedBinaryPath = pfPath
        return pfPath
      }
    }

    // 3. Quét biến môi trường PATH thuần fs.existsSync (TUYỆT ĐỐI không gọi execSync để tránh mở cửa sổ cmd đen)
    const envPath = process.env.PATH || ''
    const pathDelimiter = process.platform === 'win32' ? ';' : ':'
    const paths = envPath.split(pathDelimiter)

    for (const p of paths) {
      const trimmed = p.trim()
      if (!trimmed) continue
      try {
        const candidate = join(trimmed, binaryName)
        if (existsSync(candidate)) {
          this.cachedBinaryPath = candidate
          return candidate
        }
      } catch {
        // Bỏ qua lỗi truy cập thư mục không hợp lệ
      }
    }

    // 4. Các đường dẫn phổ biến trên macOS / Linux
    if (process.platform !== 'win32') {
      const unixCommon = ['/usr/local/bin/ollama', '/usr/bin/ollama', '/opt/homebrew/bin/ollama']
      for (const u of unixCommon) {
        if (existsSync(u)) {
          this.cachedBinaryPath = u
          return u
        }
      }
    }

    this.cachedBinaryPath = null
    return null
  }

  /**
   * Tự động khởi chạy tiến trình `ollama serve` ở chế độ chạy ngầm hoàn toàn ẩn
   */
  async startServer(): Promise<OllamaProcessStatus> {
    // 1. Nếu server đã đang hoạt động, không cần khởi chạy lại
    if (await this.isServerRunning()) {
      return { success: true }
    }

    // 2. Nếu đã có tiến trình khởi chạy đang chờ kết quả, tái sử dụng Promise để tránh spawn trùng lặp
    if (this.startPromise) {
      return this.startPromise
    }

    // 3. Chống spam tiến trình: Nếu lần thử trước thất bại trong vòng cooldown, không spawn lại liên tục
    const now = Date.now()
    if (now - this.lastStartAttemptTime < this.startCooldownMs) {
      return {
        success: false,
        reason: 'OLLAMA_START_COOLDOWN: Đang trong thời gian chờ giữa các lần thử khởi động Ollama.'
      }
    }
    this.lastStartAttemptTime = now

    this.startPromise = (async (): Promise<OllamaProcessStatus> => {
      const binaryPath = this.findOllamaBinary()
      if (!binaryPath) {
        return {
          success: false,
          reason:
            'OLLAMA_NOT_INSTALLED: Không tìm thấy file thực thi ollama trên máy tính. Vui lòng cài đặt Ollama từ https://ollama.com'
        }
      }

      try {
        // Khởi chạy ngầm ollama serve:
        // LƯU Ý KỸ THUẬT QUAN TRỌNG:
        // KHÔNG sử dụng `detached: true` trên Windows!
        // Trên Windows, detached: true sẽ kích hoạt cờ CREATE_NEW_CONSOLE làm nháy cửa sổ cmd đen.
        // Chỉ sử dụng { stdio: 'ignore', windowsHide: true } để kích hoạt cờ CREATE_NO_WINDOW hoàn toàn ẩn, không tạo console window.
        const child = spawn(binaryPath, ['serve'], {
          stdio: 'ignore',
          windowsHide: true,
          env: {
            ...process.env,
            OLLAMA_NUM_GPU: process.env.OLLAMA_NUM_GPU || '0'
          }
        })

        child.on('error', (err) => {
          console.error('[OllamaProcessManager] Lỗi tiến trình ollama serve:', err)
        })

        child.unref()
        this.spawnedProcess = child

        // Thăm dò định kỳ mỗi 500ms cho đến khi Ollama server mở cổng lắng nghe HTTP (tối đa 10 giây)
        const startTime = Date.now()
        const maxWaitMs = 10000

        while (Date.now() - startTime < maxWaitMs) {
          await new Promise((resolve) => setTimeout(resolve, 500))
          if (await this.isServerRunning(1000)) {
            console.log(
              '[OllamaProcessManager] Ollama server đã được khởi động tự động thành công (chế độ ẩn)!'
            )
            return { success: true }
          }
        }

        return {
          success: false,
          reason: 'OLLAMA_START_TIMEOUT: Quá thời gian chờ Ollama server khởi động (10 giây).'
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return {
          success: false,
          reason: `OLLAMA_SPAWN_ERROR: Không thể tự động khởi chạy ollama serve (${msg})`
        }
      } finally {
        this.startPromise = null
      }
    })()

    return this.startPromise
  }

  /**
   * Đảm bảo server đang chạy, nếu chưa thì tự động khởi động
   */
  async ensureRunning(): Promise<OllamaProcessStatus> {
    if (await this.isServerRunning()) {
      return { success: true }
    }
    return await this.startServer()
  }

  /**
   * Thu dọn tiến trình khi ứng dụng thoát nếu cần
   */
  cleanup(): void {
    if (this.spawnedProcess && !this.spawnedProcess.killed) {
      try {
        this.spawnedProcess.kill()
      } catch {
        // Bỏ qua lỗi dọn dẹp tiến trình
      }
    }
  }
}
