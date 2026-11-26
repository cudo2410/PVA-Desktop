import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { InAppScheduler, MAX_TIMEOUT_MS } from './InAppScheduler'

describe('InAppScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-22T10:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('bắn callback đúng sau 2 phút', () => {
    const scheduler = new InAppScheduler()
    const onFire = vi.fn()
    const target = new Date('2026-11-22T10:02:00.000Z')

    scheduler.schedule('job-1', target, onFire)
    expect(scheduler.has('job-1')).toBe(true)

    vi.advanceTimersByTime(119_999)
    expect(onFire).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onFire).toHaveBeenCalledTimes(1)
    expect(scheduler.has('job-1')).toBe(false)
  })

  it('hủy lịch thành công trước khi đến giờ', () => {
    const scheduler = new InAppScheduler()
    const onFire = vi.fn()

    scheduler.schedule('job-2', new Date('2026-11-22T10:02:00.000Z'), onFire)
    scheduler.cancel('job-2')

    expect(scheduler.has('job-2')).toBe(false)
    vi.advanceTimersByTime(180_000)
    expect(onFire).not.toHaveBeenCalled()
  })

  it('hủy toàn bộ lịch khi gọi cancelAll()', () => {
    const scheduler = new InAppScheduler()
    const cb1 = vi.fn()
    const cb2 = vi.fn()

    scheduler.schedule('a', new Date('2026-11-22T10:01:00.000Z'), cb1)
    scheduler.schedule('b', new Date('2026-11-22T10:02:00.000Z'), cb2)
    scheduler.cancelAll()

    vi.advanceTimersByTime(180_000)
    expect(cb1).not.toHaveBeenCalled()
    expect(cb2).not.toHaveBeenCalled()
  })

  it('hỗ trợ lập lịch xa hơn ngưỡng 32-bit MAX_TIMEOUT_MS mà không bị tràn số bắn sớm', () => {
    const scheduler = new InAppScheduler()
    const onFire = vi.fn()
    const farTarget = new Date(Date.now() + MAX_TIMEOUT_MS + 60_000)

    scheduler.schedule('far-job', farTarget, onFire)

    vi.advanceTimersByTime(MAX_TIMEOUT_MS)
    expect(onFire).not.toHaveBeenCalled()
    expect(scheduler.has('far-job')).toBe(true)

    vi.advanceTimersByTime(60_000)
    expect(onFire).toHaveBeenCalledTimes(1)
  })
})
