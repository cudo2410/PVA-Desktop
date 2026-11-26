import { useCallback, useEffect, useState } from 'react'
import type { CreateReminderInput, Reminder, ReminderStateFilter } from '@core/models/Reminder'
import type { NotificationPayload } from '@core/ports/Notifier'
import { playNotificationChime } from '../utils/notificationSound'

export interface ReminderToastItem extends NotificationPayload {
  toastId: string
}

const MAX_VISIBLE_TOASTS = 5

export interface UseRemindersReturn {
  reminders: Reminder[]
  isLoading: boolean
  error: string | null
  stateFilter: ReminderStateFilter
  missedCount: number
  scheduledCount: number
  toasts: ReminderToastItem[]
  setStateFilter: (filter: ReminderStateFilter) => void
  dismissToast: (toastId: string) => void
  clearError: () => void
  refresh: () => Promise<void>
  createReminder: (input: CreateReminderInput) => Promise<boolean>
  cancelReminder: (id: number) => Promise<boolean>
  deleteReminder: (id: number) => Promise<boolean>
}

export function useReminders(): UseRemindersReturn {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [missedCount, setMissedCount] = useState(0)
  const [scheduledCount, setScheduledCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stateFilter, setStateFilter] = useState<ReminderStateFilter>('all')
  const [toasts, setToasts] = useState<ReminderToastItem[]>([])

  const refresh = useCallback(async (): Promise<void> => {
    if (!window.api?.reminders?.list) return
    setIsLoading(true)
    try {
      const [filteredRes, allRes] = await Promise.all([
        window.api.reminders.list(stateFilter),
        window.api.reminders.list('all')
      ])

      if (filteredRes.success && Array.isArray(filteredRes.reminders)) {
        setReminders(filteredRes.reminders)
        setError(null)
      } else {
        setError(filteredRes.error || 'Không thể tải danh sách nhắc nhở.')
      }

      if (allRes.success && Array.isArray(allRes.reminders)) {
        setMissedCount(allRes.reminders.filter((r) => r.state === 'missed').length)
        setScheduledCount(allRes.reminders.filter((r) => r.state === 'scheduled').length)
      }
    } catch (err: unknown) {
      console.error('Lỗi khi tải danh sách nhắc nhở:', err)
      setError('Không thể tải danh sách nhắc nhở lúc này.')
    } finally {
      setIsLoading(false)
    }
  }, [stateFilter])

  useEffect(() => {
    let isMounted = true
    const load = async (): Promise<void> => {
      await Promise.resolve()
      if (!isMounted || !window.api?.reminders?.list) return
      setIsLoading(true)
      try {
        const [filteredRes, allRes] = await Promise.all([
          window.api.reminders.list(stateFilter),
          window.api.reminders.list('all')
        ])
        if (!isMounted) return
        if (filteredRes.success && Array.isArray(filteredRes.reminders)) {
          setReminders(filteredRes.reminders)
          setError(null)
        } else {
          setError(filteredRes.error || 'Không thể tải danh sách nhắc nhở.')
        }
        if (allRes.success && Array.isArray(allRes.reminders)) {
          setMissedCount(allRes.reminders.filter((r) => r.state === 'missed').length)
          setScheduledCount(allRes.reminders.filter((r) => r.state === 'scheduled').length)
        }
      } catch (err: unknown) {
        console.error('Lỗi khi tải danh sách nhắc nhở:', err)
        if (isMounted) {
          setError('Không thể tải danh sách nhắc nhở lúc này.')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }
    void load()
    return (): void => {
      isMounted = false
    }
  }, [stateFilter])

  useEffect(() => {
    if (!window.api?.reminders?.onUpdated) return
    const unsubscribe = window.api.reminders.onUpdated(() => {
      void refresh()
    })
    return (): void => unsubscribe()
  }, [refresh])

  useEffect(() => {
    if (!window.api?.reminders?.onFired) return
    const unsubscribe = window.api.reminders.onFired((payload) => {
      const toastId = `${payload.reminderId}-${payload.firedAt}-${Math.random().toString(36).slice(2, 6)}`
      setToasts((prev) => [...prev, { ...payload, toastId }].slice(-MAX_VISIBLE_TOASTS))
      playNotificationChime()
      void refresh()
    })
    return (): void => unsubscribe()
  }, [refresh])

  useEffect(() => {
    if (!window.api?.reminders?.onPlaySound) return
    const unsubscribe = window.api.reminders.onPlaySound(() => {
      playNotificationChime()
    })
    return (): void => unsubscribe()
  }, [])

  const createReminder = useCallback(
    async (input: CreateReminderInput): Promise<boolean> => {
      if (!window.api?.reminders?.create) return false
      const res = await window.api.reminders.create(input)
      if (!res.success) {
        setError(res.error || 'Không thể đặt nhắc nhở.')
        return false
      }
      setError(null)
      await refresh()
      return true
    },
    [refresh]
  )

  const cancelReminder = useCallback(
    async (id: number): Promise<boolean> => {
      if (!window.api?.reminders?.cancel) return false
      const res = await window.api.reminders.cancel(id)
      if (!res.success) {
        setError(res.error || 'Không thể hủy nhắc nhở.')
        return false
      }
      setError(null)
      await refresh()
      return true
    },
    [refresh]
  )

  const deleteReminder = useCallback(
    async (id: number): Promise<boolean> => {
      if (!window.api?.reminders?.delete) return false
      const res = await window.api.reminders.delete(id)
      if (!res.success) {
        setError(res.error || 'Không thể xóa nhắc nhở.')
        return false
      }
      setError(null)
      await refresh()
      return true
    },
    [refresh]
  )

  const dismissToast = useCallback((toastId: string): void => {
    setToasts((prev) => prev.filter((item) => item.toastId !== toastId))
  }, [])

  const clearError = useCallback((): void => {
    setError(null)
  }, [])

  return {
    reminders,
    isLoading,
    error,
    stateFilter,
    missedCount,
    scheduledCount,
    toasts,
    setStateFilter,
    dismissToast,
    clearError,
    refresh,
    createReminder,
    cancelReminder,
    deleteReminder
  }
}
