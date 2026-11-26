import React, { useEffect, useState } from 'react'
import avaImg from '../assets/ava.jpg'
import type { ReminderToastItem } from '../hooks/useReminders'

const TOAST_DURATION_MS = 8000
const TOAST_EXIT_MS = 190

export interface ReminderToastProps {
  toasts: ReminderToastItem[]
  isDesktopOverlay?: boolean
  onDismiss: (toastId: string) => void
  onOpenReminders: () => void
  onCardHoverChange?: (isHovered: boolean) => void
}

interface ReminderToastCardProps {
  toast: ReminderToastItem
  onDismiss: (toastId: string) => void
  onOpenReminders: () => void
  onCardHoverChange?: (isHovered: boolean) => void
}

function ReminderToastCard({
  toast,
  onDismiss,
  onOpenReminders,
  onCardHoverChange
}: ReminderToastCardProps): React.JSX.Element {
  const [isPaused, setIsPaused] = useState(false)
  const [isClosing, setIsClosing] = useState(false)

  useEffect(() => {
    if (isPaused || isClosing) return
    const timer = setTimeout(() => {
      setIsClosing(true)
    }, TOAST_DURATION_MS)
    return (): void => clearTimeout(timer)
  }, [isPaused, isClosing, toast.toastId])

  useEffect(() => {
    if (!isClosing) return
    const exitTimer = setTimeout(() => {
      onCardHoverChange?.(false)
      onDismiss(toast.toastId)
    }, TOAST_EXIT_MS)
    return (): void => clearTimeout(exitTimer)
  }, [isClosing, onDismiss, onCardHoverChange, toast.toastId])

  useEffect(() => {
    return (): void => {
      onCardHoverChange?.(false)
    }
  }, [onCardHoverChange])

  const timeLabel = new Date(toast.firedAt).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit'
  })

  const requestClose = (): void => {
    onCardHoverChange?.(false)
    setIsClosing(true)
  }

  return (
    <div
      className={`reminder-toast ${isClosing ? 'is-closing' : ''}`}
      role="alert"
      aria-live="assertive"
      onMouseEnter={() => {
        setIsPaused(true)
        onCardHoverChange?.(true)
      }}
      onMouseLeave={() => {
        setIsPaused(false)
        onCardHoverChange?.(false)
      }}
    >
      <div className="reminder-toast-avatar-wrap" aria-hidden="true">
        <img src={avaImg} alt="" className="reminder-toast-avatar" />
        <span className="reminder-toast-bell-dot">
          <svg
            viewBox="0 0 24 24"
            width="11"
            height="11"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </span>
      </div>

      <div className="reminder-toast-content">
        <div className="reminder-toast-header">
          <span className="reminder-toast-title">{toast.title}</span>
          <span className="reminder-toast-time">{timeLabel}</span>
        </div>
        <p className="reminder-toast-body">{toast.body}</p>
        <div className="reminder-toast-actions">
          <button
            type="button"
            className="reminder-toast-btn primary"
            onClick={() => {
              onOpenReminders()
              requestClose()
            }}
          >
            Xem nhắc nhở
          </button>
          <button type="button" className="reminder-toast-btn" onClick={requestClose}>
            Đã hiểu
          </button>
        </div>
      </div>
    </div>
  )
}

export function ReminderToast({
  toasts,
  isDesktopOverlay = false,
  onDismiss,
  onOpenReminders,
  onCardHoverChange
}: ReminderToastProps): React.JSX.Element | null {
  if (toasts.length === 0) {
    return null
  }

  return (
    <div
      className={`reminder-toast-stack ${isDesktopOverlay ? 'is-desktop-overlay' : ''}`}
      aria-label="Thông báo nhắc nhở"
    >
      {toasts.map((toast) => (
        <ReminderToastCard
          key={toast.toastId}
          toast={toast}
          onDismiss={onDismiss}
          onOpenReminders={onOpenReminders}
          onCardHoverChange={onCardHoverChange}
        />
      ))}
    </div>
  )
}
