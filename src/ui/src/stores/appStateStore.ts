import { useSyncExternalStore } from 'react'
import type { AppState, AppStatusInfo } from '../../../core/models/AppStatus'
import { STATE_LABELS, STATE_SUBTITLES } from '../../../core/models/AppStatus'

export type { AppState, AppStatusInfo }

export class AppStateStore {
  private currentStatus: AppStatusInfo
  private readonly listeners = new Set<() => void>()

  constructor(initialState: AppState = 'Idle') {
    this.currentStatus = {
      state: initialState,
      label: STATE_LABELS[initialState],
      detail: STATE_SUBTITLES[initialState],
      updatedAt: Date.now()
    }
  }

  getSnapshot = (): AppStatusInfo => {
    return this.currentStatus
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  setState(state: AppState, detail?: string, errorCode?: string): void {
    const defaultSubtitle = STATE_SUBTITLES[state]
    this.currentStatus = {
      state,
      label: STATE_LABELS[state],
      detail: detail || defaultSubtitle,
      errorCode,
      updatedAt: Date.now()
    }
    this.notify()
  }

  setIdle(detail?: string): void {
    this.setState('Idle', detail)
  }

  setListening(detail?: string): void {
    this.setState('Listening', detail || 'Đang lắng nghe bạn nói...')
  }

  setProcessing(detail?: string): void {
    this.setState('Processing', detail || 'Đang xử lý câu hỏi...')
  }

  setSpeaking(detail?: string): void {
    this.setState('Speaking', detail || 'Đang phản hồi...')
  }

  setError(errorCode?: string, detail?: string): void {
    this.setState('Error', detail || 'Đã xảy ra sự cố', errorCode)
  }
}

export const appStateStore = new AppStateStore('Idle')

export function useAppState(): [AppStatusInfo, AppStateStore] {
  const status = useSyncExternalStore(
    appStateStore.subscribe,
    appStateStore.getSnapshot,
    appStateStore.getSnapshot
  )
  return [status, appStateStore]
}
