import React, { useEffect, useState } from 'react'
import type { ConversationRecord } from '@core/ports/ConversationRepository'
import { ConfirmModal } from './ConfirmModal'
import { formatFigmaTimestamp } from '../utils/dateFormat'

export type ConversationItem = ConversationRecord

export interface HistoryDrawerProps {
  isOpen: boolean
  activeConversationId?: number
  onClose: () => void
  onSelectConversation: (id: number) => void
  onNewConversation: () => void
  onDeleteConversation: (id: number) => Promise<void>
}

export function HistoryDrawer({
  isOpen,
  activeConversationId,
  onClose,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation
}: HistoryDrawerProps): React.JSX.Element | null {
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ConversationItem | null>(null)
  const [openMenuId, setOpenMenuId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen)
  const [rendered, setRendered] = useState(isOpen)
  const [isClosing, setIsClosing] = useState(false)

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen)
    if (isOpen) {
      setRendered(true)
      setIsClosing(false)
    } else if (rendered) {
      setIsClosing(true)
    }
  }

  const handleAnimationEnd = (e: React.AnimationEvent): void => {
    if (e.target === e.currentTarget && isClosing) {
      setRendered(false)
      setIsClosing(false)
    }
  }

  const fetchConversations = async (): Promise<void> => {
    try {
      if (window.api?.chat?.listConversations) {
        const res = await window.api.chat.listConversations()
        if (res.success && Array.isArray(res.conversations)) {
          setConversations(res.conversations)
        }
      }
    } catch (err) {
      console.error('Lỗi khi tải danh sách hội thoại:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let isMounted = true
    if (isOpen) {
      const load = async (): Promise<void> => {
        await Promise.resolve()
        if (!isMounted) return
        setOpenMenuId(null)
        setIsLoading(true)
        try {
          if (window.api?.chat?.listConversations) {
            const res = await window.api.chat.listConversations()
            if (isMounted && res.success && Array.isArray(res.conversations)) {
              setConversations(res.conversations)
            }
          }
        } catch (err) {
          console.error('Lỗi khi tải danh sách hội thoại:', err)
        } finally {
          if (isMounted) {
            setIsLoading(false)
          }
        }
      }
      void load()
    }
    return (): void => {
      isMounted = false
    }
  }, [isOpen])

  const handleDeleteConfirm = async (): Promise<void> => {
    if (!deleteTarget) return
    const targetId = deleteTarget.id
    setDeleteTarget(null)
    await onDeleteConversation(targetId)
    await fetchConversations()
  }

  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    const matchesTitle = c.title.toLowerCase().includes(q)
    const matchesSnippet = Boolean(c.lastMessage && c.lastMessage.toLowerCase().includes(q))
    return matchesTitle || matchesSnippet
  })

  if (!rendered) {
    return null
  }

  return (
    <>
      <div
        className={`drawer-overlay ${isClosing ? 'closing' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`history-drawer ${isClosing ? 'closing' : ''}`}
        aria-label="Lịch sử hội thoại"
        onClick={() => setOpenMenuId(null)}
        onAnimationEnd={handleAnimationEnd}
      >
        <div className="drawer-header">
          <div className="drawer-title-group">
            <h2 className="drawer-title">Lịch sử trò chuyện</h2>
          </div>
          <button
            type="button"
            className="drawer-close-btn"
            onClick={onClose}
            title="Đóng lịch sử trò chuyện"
            aria-label="Đóng"
          >
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Thanh tìm kiếm bám sát Figma */}
        <div className="drawer-search-wrapper">
          <div className="drawer-search-box">
            <svg
              className="drawer-search-icon"
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="drawer-search-input"
              placeholder="Tìm kiếm hội thoại"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="drawer-actions">
          <button
            type="button"
            className="new-chat-btn"
            onClick={() => {
              onNewConversation()
              onClose()
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Cuộc trò chuyện mới</span>
          </button>
        </div>

        <div className="drawer-content">
          {isLoading ? (
            <div className="drawer-loading">
              <span className="loading-spinner" />
              <span>Đang tải lịch sử...</span>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="drawer-empty-state">
              <span className="empty-drawer-icon" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </span>
              <p className="empty-drawer-text">
                {searchQuery
                  ? 'Không tìm thấy cuộc hội thoại nào.'
                  : 'Chưa có cuộc trò chuyện nào được lưu.'}
              </p>
            </div>
          ) : (
            <div className="conversation-list">
              {filteredConversations.map((conv) => {
                const isActive = conv.id === activeConversationId
                const isMenuOpen = openMenuId === conv.id
                const formattedDate = formatFigmaTimestamp(conv.createdAt)

                return (
                  <div
                    key={conv.id}
                    className={`conversation-card ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      onSelectConversation(conv.id)
                      onClose()
                    }}
                  >
                    <div className="card-main">
                      <h4 className="card-title" title={conv.title}>
                        {conv.title}
                      </h4>
                      <div className="card-meta">
                        <span className="card-time">{formattedDate}</span>
                      </div>
                    </div>

                    {/* Nút ... hình vuông bo góc, bấm vào hiển thị lựa chọn xóa */}
                    <div className="card-more-container">
                      <button
                        type="button"
                        className={`card-more-btn ${isMenuOpen ? 'menu-open' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpenMenuId((prev) => (prev === conv.id ? null : conv.id))
                        }}
                        title="Tùy chọn cuộc trò chuyện"
                        aria-label="Tùy chọn"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="15"
                          height="15"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <circle cx="5" cy="12" r="1.8" />
                          <circle cx="12" cy="12" r="1.8" />
                          <circle cx="19" cy="12" r="1.8" />
                        </svg>
                      </button>

                      {isMenuOpen && (
                        <div className="card-options-dropdown" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="card-option-item danger"
                            onClick={() => {
                              setOpenMenuId(null)
                              setDeleteTarget(conv)
                            }}
                          >
                            <span>Xóa</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </aside>

      {/* Confirmation Modal chuẩn iOS Alert trong Figma */}
      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="Xóa cuộc trò chuyện?"
        message="Hành động này không thể hoàn tác."
        subMessage="Cuộc trò chuyện sẽ bị xóa vĩnh viễn."
        confirmText="Xóa"
        cancelText="Hủy"
        isDanger={true}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  )
}
