import React, { useCallback, useEffect, useState } from 'react'
import { ReminderToast } from './ReminderToast'
import type { ReminderToastItem } from '../hooks/useReminders'
import { playNotificationChime } from '../utils/notificationSound'
import './TasksDrawer.css'

const MAX_OVERLAY_TOASTS = 5

/**
 * Giao diện độc lập cho cửa sổ thông báo nổi Desktop (hash #toast-overlay).
 * Nền hoàn toàn trong suốt, xuyên chuột vùng trống và tự ẩn khi hết thông báo.
 */
export function ToastOverlayApp(): React.JSX.Element {
  const [toasts, setToasts] = useState<ReminderToastItem[]>([])

  useEffect(() => {
    document.documentElement.classList.add('is-toast-overlay')
    window.api?.reminders?.setOverlayMouseIgnore?.(true)
    return (): void => {
      document.documentElement.classList.remove('is-toast-overlay')
    }
  }, [])

  useEffect(() => {
    if (!window.api?.reminders?.onOverlayToast) return
    const unsubscribe = window.api.reminders.onOverlayToast((payload) => {
      const toastId = `${payload.reminderId}-${payload.firedAt}-${Math.random().toString(36).slice(2, 6)}`
      setToasts((prev) => [...prev, { ...payload, toastId }].slice(-MAX_OVERLAY_TOASTS))
      playNotificationChime()
    })
    return (): void => unsubscribe()
  }, [])

  const handleDismiss = useCallback((toastId: string): void => {
    setToasts((prev) => {
      const next = prev.filter((item) => item.toastId !== toastId)
      if (next.length === 0) {
        window.api?.reminders?.setOverlayMouseIgnore?.(true)
        window.api?.reminders?.notifyOverlayEmpty?.()
      }
      return next
    })
  }, [])

  const handleOpenReminders = useCallback((): void => {
    window.api?.reminders?.openFromToast?.(true)
  }, [])

  const handleCardHoverChange = useCallback((isHovered: boolean): void => {
    window.api?.reminders?.setOverlayMouseIgnore?.(!isHovered)
  }, [])

  return (
    <ReminderToast
      toasts={toasts}
      isDesktopOverlay={true}
      onDismiss={handleDismiss}
      onOpenReminders={handleOpenReminders}
      onCardHoverChange={handleCardHoverChange}
    />
  )
}
