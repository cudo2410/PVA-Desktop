import React, { useEffect } from 'react'

export interface ConfirmModalProps {
  isOpen: boolean
  title: string
  message: string
  subMessage?: string
  confirmText?: string
  cancelText?: string
  isDanger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  subMessage = 'Cuộc trò chuyện sẽ bị xóa vĩnh viễn.',
  confirmText = 'Xóa',
  cancelText = 'Hủy',
  isDanger = true,
  onConfirm,
  onCancel
}: ConfirmModalProps): React.JSX.Element | null {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (!isOpen) return
      if (e.key === 'Escape') {
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return (): void => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onCancel])

  if (!isOpen) {
    return null
  }

  return (
    <div className="confirm-modal-overlay" onClick={onCancel} role="dialog" aria-modal="true">
      <div className="confirm-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-modal-body">
          <div className="confirm-modal-header">
            <h3 className="confirm-modal-title">{title}</h3>
          </div>
          <p className="confirm-modal-message">{message}</p>
          {subMessage && <p className="confirm-modal-submessage">{subMessage}</p>}
        </div>
        <div className="confirm-modal-actions">
          <button type="button" className="confirm-modal-btn cancel" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            type="button"
            className={`confirm-modal-btn ${isDanger ? 'danger' : 'primary'}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
