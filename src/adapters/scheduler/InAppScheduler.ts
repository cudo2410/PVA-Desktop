import type { Scheduler } from '../../core/ports/Scheduler'

/**
 * Ngưỡng delay tối đa của Node.js/Electron setTimeout (32-bit signed integer: ~24,8 ngày).
 * Nếu thời điểm chạy xa hơn ngưỡng này, InAppScheduler sẽ tự chia chặng để không bị tràn số.
 */
export const MAX_TIMEOUT_MS = 2_147_483_647

export interface InAppSchedulerOptions {
  nowProvider?: () => number
  onError?: (jobId: string, error: unknown) => void
}

export class InAppScheduler implements Scheduler {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly nowProvider: () => number
  private readonly onError?: (jobId: string, error: unknown) => void

  constructor(options?: InAppSchedulerOptions) {
    this.nowProvider = options?.nowProvider ?? (() => Date.now())
    this.onError = options?.onError
  }

  schedule(jobId: string, runAt: Date, onFire: () => void | Promise<void>): void {
    this.cancel(jobId)

    const targetMs = runAt.getTime()
    if (Number.isNaN(targetMs)) {
      return
    }

    const scheduleStep = (): void => {
      const remaining = targetMs - this.nowProvider()

      if (remaining > MAX_TIMEOUT_MS) {
        const timer = setTimeout(() => {
          this.timers.delete(jobId)
          scheduleStep()
        }, MAX_TIMEOUT_MS)
        this.timers.set(jobId, timer)
        return
      }

      const delay = Math.max(0, remaining)
      const timer = setTimeout(() => {
        this.timers.delete(jobId)
        try {
          const result = onFire()
          if (result && typeof (result as Promise<void>).catch === 'function') {
            ;(result as Promise<void>).catch((err: unknown) => {
              this.onError?.(jobId, err)
            })
          }
        } catch (err: unknown) {
          this.onError?.(jobId, err)
        }
      }, delay)

      this.timers.set(jobId, timer)
    }

    scheduleStep()
  }

  cancel(jobId: string): void {
    const existing = this.timers.get(jobId)
    if (existing !== undefined) {
      clearTimeout(existing)
      this.timers.delete(jobId)
    }
  }

  cancelAll(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    this.timers.clear()
  }

  has(jobId: string): boolean {
    return this.timers.has(jobId)
  }
}
