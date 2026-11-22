import React from 'react'
import { AppState, useAppState } from '../stores/appStateStore'

export interface StatusBarProps {
  onRetry?: () => void
  onStopListening?: () => void
}

export const StatusBar: React.FC<StatusBarProps> = ({ onRetry, onStopListening }) => {
  const [status] = useAppState()

  const getStateClass = (state: AppState): string => {
    switch (state) {
      case 'Idle':
        return 'state-idle'
      case 'Listening':
        return 'state-listening'
      case 'Processing':
        return 'state-processing'
      case 'Speaking':
        return 'state-speaking'
      case 'Error':
        return 'state-error'
    }
  }

  const renderStateIcon = (state: AppState): React.JSX.Element => {
    switch (state) {
      case 'Idle':
        return <span className="status-indicator-dot idle-dot" />
      case 'Listening':
        return (
          <span className="status-indicator-icon listening-wave" aria-label="Đang nghe">
            <span className="sound-wave-bar bar-1" />
            <span className="sound-wave-bar bar-2" />
            <span className="sound-wave-bar bar-3" />
          </span>
        )
      case 'Processing':
        return (
          <span className="status-indicator-spinner" aria-label="Đang xử lý">
            <span className="processing-dot dot-1" />
            <span className="processing-dot dot-2" />
            <span className="processing-dot dot-3" />
          </span>
        )
      case 'Speaking':
        return (
          <span className="status-indicator-icon speaking-pulse" aria-label="Đang trả lời">
            <span className="sound-wave-bar bar-1 active" />
            <span className="sound-wave-bar bar-2 active" />
            <span className="sound-wave-bar bar-3 active" />
          </span>
        )
      case 'Error':
        return <span className="status-indicator-dot error-dot" />
    }
  }

  const handleClick = (): void => {
    if (status.state === 'Error' && onRetry) {
      onRetry()
    } else if (status.state === 'Listening' && onStopListening) {
      onStopListening()
    }
  }

  return (
    <div
      className={`app-status-bar ${getStateClass(status.state)} ${
        status.state === 'Error' || status.state === 'Listening' ? 'is-clickable' : ''
      }`}
      onClick={handleClick}
      title={
        status.state === 'Error'
          ? status.detail || 'Nhấp để thử kết nối lại với Ollama'
          : status.state === 'Listening'
            ? 'Đang nghe giọng nói (Bấm để dừng)'
            : status.detail || status.label
      }
      role="status"
      aria-live="polite"
    >
      <div className="status-bar-indicator">{renderStateIcon(status.state)}</div>
      <div className="status-bar-text">
        <span className="status-bar-label">{status.detail || status.label}</span>
      </div>
      {status.state === 'Error' && <span className="status-bar-action-hint">· Thử lại</span>}
      {status.state === 'Listening' && <span className="status-bar-action-hint">· Dừng</span>}
    </div>
  )
}
