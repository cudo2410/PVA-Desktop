import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './GlassControls.css'

export interface GlassDateTimePickerProps {
  value: string | null
  onChange: (isoValue: string | null) => void
  placeholder?: string
  ariaLabel: string
  compact?: boolean
}

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] as const

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function clampNumber(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function formatVietnameseDateTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

interface CalendarDayCell {
  date: Date
  isCurrentMonth: boolean
}

function buildMonthGrid(year: number, monthIndex: number): CalendarDayCell[] {
  const firstOfMonth = new Date(year, monthIndex, 1)
  // Chuyển Chủ Nhật (0) thành 6 để tuần bắt đầu từ Thứ 2 (0)
  const startOffset = (firstOfMonth.getDay() + 6) % 7
  const gridStart = new Date(year, monthIndex, 1 - startOffset)

  const cells: CalendarDayCell[] = []
  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + i
    )
    cells.push({
      date: cellDate,
      isCurrentMonth: cellDate.getMonth() === monthIndex
    })
  }
  return cells
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function GlassDateTimePicker({
  value,
  onChange,
  placeholder = 'Chọn ngày giờ...',
  ariaLabel,
  compact = false
}: GlassDateTimePickerProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const [rendered, setRendered] = useState(false)
  const [isClosing, setIsClosing] = useState(false)

  const [todayDate, setTodayDate] = useState<Date>(() => new Date())
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const base = value ? new Date(value) : new Date()
    return Number.isNaN(base.getTime()) ? new Date() : base
  })
  const [viewYear, setViewYear] = useState<number>(() => selectedDate.getFullYear())
  const [viewMonth, setViewMonth] = useState<number>(() => selectedDate.getMonth())
  const [hourText, setHourText] = useState<string>(() => pad2(selectedDate.getHours()))
  const [minuteText, setMinuteText] = useState<string>(() => pad2(selectedDate.getMinutes()))
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const closePicker = (): void => {
    if (!isOpen) return
    setIsOpen(false)
    if (rendered) {
      setIsClosing(true)
    }
  }

  const syncDisplayState = (target: Date): void => {
    setSelectedDate(target)
    setViewYear(target.getFullYear())
    setViewMonth(target.getMonth())
    setHourText(pad2(target.getHours()))
    setMinuteText(pad2(target.getMinutes()))
  }

  const togglePicker = (): void => {
    if (isOpen) {
      closePicker()
      return
    }
    const now = new Date()
    setTodayDate(now)
    const initial = value ? new Date(value) : now
    const validInitial = Number.isNaN(initial.getTime()) ? now : initial
    syncDisplayState(validInitial)
    setRendered(true)
    setIsClosing(false)
    setIsOpen(true)
  }

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return
    const triggerRect = triggerRef.current.getBoundingClientRect()
    const drawerEl = triggerRef.current.closest('.tasks-drawer')
    const drawerRect = drawerEl ? drawerEl.getBoundingClientRect() : null

    const measuredWidth =
      popoverRef.current?.offsetWidth || Math.round(clampNumber(window.innerWidth * 0.26, 276, 340))
    const measuredHeight = popoverRef.current?.offsetHeight || 408
    const gap = Math.round(clampNumber(window.innerWidth * 0.012, 10, 18))

    // Mở hẳn sang bên trái, nằm ngoài vùng Drawer Công việc & Nhắc nhở
    const preferredLeft = drawerRect
      ? drawerRect.left - measuredWidth - gap
      : triggerRect.left - measuredWidth - gap
    const left = clampNumber(
      preferredLeft,
      12,
      Math.max(12, window.innerWidth - measuredWidth - 12)
    )

    const preferredTop = triggerRect.top - 16
    const maxTop = Math.max(12, window.innerHeight - measuredHeight - 12)
    const top = clampNumber(preferredTop, 12, maxTop)

    setCoords({ top, left })
  }, [isOpen, rendered])

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (e: MouseEvent): void => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return
      }
      setIsOpen(false)
      setIsClosing(true)
    }

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setIsOpen(false)
        setIsClosing(true)
        triggerRef.current?.focus()
      }
    }

    const handleResize = (): void => {
      if (!triggerRef.current) return
      const triggerRect = triggerRef.current.getBoundingClientRect()
      const drawerEl = triggerRef.current.closest('.tasks-drawer')
      const drawerRect = drawerEl ? drawerEl.getBoundingClientRect() : null
      const measuredWidth =
        popoverRef.current?.offsetWidth ||
        Math.round(clampNumber(window.innerWidth * 0.26, 276, 340))
      const measuredHeight = popoverRef.current?.offsetHeight || 408
      const gap = Math.round(clampNumber(window.innerWidth * 0.012, 10, 18))
      const preferredLeft = drawerRect
        ? drawerRect.left - measuredWidth - gap
        : triggerRect.left - measuredWidth - gap
      const left = clampNumber(
        preferredLeft,
        12,
        Math.max(12, window.innerWidth - measuredWidth - 12)
      )
      const top = clampNumber(
        triggerRect.top - 16,
        12,
        Math.max(12, window.innerHeight - measuredHeight - 12)
      )
      setCoords({ top, left })
    }

    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleResize)
    return (): void => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleResize)
    }
  }, [isOpen])

  const handlePopoverAnimationEnd = (e: React.AnimationEvent): void => {
    if (e.target === e.currentTarget && isClosing) {
      setRendered(false)
      setIsClosing(false)
    }
  }

  const commitDate = (next: Date): void => {
    next.setSeconds(0, 0)
    syncDisplayState(next)
    onChange(next.toISOString())
  }

  const handleSelectDay = (dayDate: Date): void => {
    const next = new Date(
      dayDate.getFullYear(),
      dayDate.getMonth(),
      dayDate.getDate(),
      selectedDate.getHours(),
      selectedDate.getMinutes(),
      0,
      0
    )
    commitDate(next)
  }

  const handleStepHour = (delta: number): void => {
    const next = new Date(selectedDate.getTime())
    next.setHours((next.getHours() + delta + 24) % 24)
    commitDate(next)
  }

  const handleStepMinute = (delta: number): void => {
    const next = new Date(selectedDate.getTime())
    next.setMinutes((next.getMinutes() + delta + 60) % 60)
    commitDate(next)
  }

  const handleHourInputChange = (raw: string): void => {
    const digits = raw.replace(/\D/g, '').slice(0, 2)
    setHourText(digits)
    if (digits.length > 0) {
      const parsed = parseInt(digits, 10)
      if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 23) {
        const next = new Date(selectedDate.getTime())
        next.setHours(parsed)
        next.setSeconds(0, 0)
        setSelectedDate(next)
        onChange(next.toISOString())
      }
    }
  }

  const handleHourInputBlur = (): void => {
    const parsed = parseInt(hourText, 10)
    const safeHour = Number.isNaN(parsed) ? selectedDate.getHours() : clampNumber(parsed, 0, 23)
    const next = new Date(selectedDate.getTime())
    next.setHours(safeHour)
    commitDate(next)
  }

  const handleMinuteInputChange = (raw: string): void => {
    const digits = raw.replace(/\D/g, '').slice(0, 2)
    setMinuteText(digits)
    if (digits.length > 0) {
      const parsed = parseInt(digits, 10)
      if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 59) {
        const next = new Date(selectedDate.getTime())
        next.setMinutes(parsed)
        next.setSeconds(0, 0)
        setSelectedDate(next)
        onChange(next.toISOString())
      }
    }
  }

  const handleMinuteInputBlur = (): void => {
    const parsed = parseInt(minuteText, 10)
    const safeMin = Number.isNaN(parsed) ? selectedDate.getMinutes() : clampNumber(parsed, 0, 59)
    const next = new Date(selectedDate.getTime())
    next.setMinutes(safeMin)
    commitDate(next)
  }

  const handleQuickPreset = (minutesFromNow: number | 'tomorrow_9'): void => {
    let target: Date
    if (minutesFromNow === 'tomorrow_9') {
      const now = new Date()
      target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0, 0)
    } else {
      target = new Date(Date.now() + minutesFromNow * 60 * 1000)
    }
    commitDate(target)
  }

  const handleResetToNowWithoutClosing = (): void => {
    const now = new Date()
    setTodayDate(now)
    syncDisplayState(now)
    onChange(null)
  }

  const handlePrevMonth = (): void => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1)
      setViewMonth(11)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  const handleNextMonth = (): void => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1)
      setViewMonth(0)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  const cells = buildMonthGrid(viewYear, viewMonth)
  const displayText = formatVietnameseDateTime(value)

  return (
    <div className={`glass-dt-wrapper ${compact ? 'is-compact' : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`glass-dt-trigger ${isOpen ? 'is-open' : ''} ${displayText ? 'has-value' : ''}`}
        onClick={togglePicker}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
      >
        <span className="glass-dt-center-content">
          <svg
            className="glass-dt-icon"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span className="glass-dt-text">{displayText || placeholder}</span>
        </span>
      </button>

      {value && (
        <button
          type="button"
          className="glass-dt-clear"
          onClick={handleResetToNowWithoutClosing}
          title="Xóa ngày giờ"
          aria-label="Xóa ngày giờ"
        >
          ✕
        </button>
      )}

      {rendered &&
        createPortal(
          <div
            ref={popoverRef}
            className={`glass-dt-popover ${isClosing ? 'is-closing' : ''}`}
            role="dialog"
            aria-label={ariaLabel}
            style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
            onAnimationEnd={handlePopoverAnimationEnd}
          >
            {/* Dãy nút chọn nhanh */}
            <div className="glass-dt-presets">
              <button
                type="button"
                className="glass-dt-preset-btn is-accent"
                onClick={() => handleQuickPreset(2)}
              >
                +2 phút
              </button>
              <button
                type="button"
                className="glass-dt-preset-btn"
                onClick={() => handleQuickPreset(15)}
              >
                +15 phút
              </button>
              <button
                type="button"
                className="glass-dt-preset-btn"
                onClick={() => handleQuickPreset(60)}
              >
                +1 giờ
              </button>
              <button
                type="button"
                className="glass-dt-preset-btn"
                onClick={() => handleQuickPreset('tomorrow_9')}
              >
                Mai 09:00
              </button>
            </div>

            {/* Điều hướng Tháng / Năm */}
            <div className="glass-dt-month-nav">
              <button
                type="button"
                className="glass-dt-nav-btn"
                onClick={handlePrevMonth}
                aria-label="Tháng trước"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <span className="glass-dt-month-label">
                Tháng {viewMonth + 1}, {viewYear}
              </span>
              <button
                type="button"
                className="glass-dt-nav-btn"
                onClick={handleNextMonth}
                aria-label="Tháng sau"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>

            {/* Thứ trong tuần */}
            <div className="glass-dt-weekdays">
              {WEEKDAYS.map((wd) => (
                <span key={wd} className="glass-dt-weekday">
                  {wd}
                </span>
              ))}
            </div>

            {/* Lưới ngày */}
            <div className="glass-dt-days">
              {cells.map((cell) => {
                const isSelected = Boolean(value) && isSameDay(cell.date, selectedDate)
                const isToday = isSameDay(cell.date, todayDate)
                return (
                  <button
                    key={cell.date.toISOString()}
                    type="button"
                    className={`glass-dt-day ${cell.isCurrentMonth ? '' : 'is-outside'} ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => handleSelectDay(cell.date)}
                  >
                    {cell.date.getDate()}
                  </button>
                )
              })}
            </div>

            {/* Bộ chọn Giờ : Phút riêng (nhập tay trực tiếp + nút − / +) */}
            <div className="glass-dt-time-row">
              <span className="glass-dt-time-label">Giờ nhắc hẹn</span>
              <div className="glass-dt-steppers">
                <div className="glass-dt-stepper">
                  <button
                    type="button"
                    className="glass-dt-step-btn"
                    onClick={() => handleStepHour(-1)}
                    aria-label="Giảm giờ"
                  >
                    −
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={2}
                    className="glass-dt-step-input"
                    value={hourText}
                    onChange={(e) => handleHourInputChange(e.target.value)}
                    onBlur={handleHourInputBlur}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        handleStepHour(1)
                      } else if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        handleStepHour(-1)
                      } else if (e.key === 'Enter') {
                        e.preventDefault()
                        handleHourInputBlur()
                      }
                    }}
                    aria-label="Nhập giờ (00 đến 23)"
                    title="Nhập tay giờ (00–23)"
                  />
                  <button
                    type="button"
                    className="glass-dt-step-btn is-plus"
                    onClick={() => handleStepHour(1)}
                    aria-label="Tăng giờ"
                  >
                    +
                  </button>
                </div>
                <span className="glass-dt-colon">:</span>
                <div className="glass-dt-stepper">
                  <button
                    type="button"
                    className="glass-dt-step-btn"
                    onClick={() => handleStepMinute(-1)}
                    aria-label="Giảm phút"
                  >
                    −
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={2}
                    className="glass-dt-step-input"
                    value={minuteText}
                    onChange={(e) => handleMinuteInputChange(e.target.value)}
                    onBlur={handleMinuteInputBlur}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        handleStepMinute(1)
                      } else if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        handleStepMinute(-1)
                      } else if (e.key === 'Enter') {
                        e.preventDefault()
                        handleMinuteInputBlur()
                      }
                    }}
                    aria-label="Nhập phút (00 đến 59)"
                    title="Nhập tay phút (00–59)"
                  />
                  <button
                    type="button"
                    className="glass-dt-step-btn is-plus"
                    onClick={() => handleStepMinute(1)}
                    aria-label="Tăng phút"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="glass-dt-footer">
              <button
                type="button"
                className="glass-dt-clear-link"
                onClick={handleResetToNowWithoutClosing}
              >
                Xóa ngày giờ
              </button>
              <button
                type="button"
                className="glass-dt-done-btn"
                onClick={() => {
                  if (!value) {
                    commitDate(selectedDate)
                  }
                  closePicker()
                }}
              >
                Xong
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
