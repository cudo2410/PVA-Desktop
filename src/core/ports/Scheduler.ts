/**
 * Port lập lịch (Scheduler) — Điểm mở rộng cho FR-05B (chạy nền bằng Windows Task Scheduler / background worker ở Giai đoạn 2).
 * Hiện tại MVP hiện thực bằng InAppScheduler (setTimeout trong Main Process).
 */
export interface Scheduler {
  schedule(jobId: string, runAt: Date, onFire: () => void | Promise<void>): void
  cancel(jobId: string): void
  cancelAll(): void
  has(jobId: string): boolean
}
