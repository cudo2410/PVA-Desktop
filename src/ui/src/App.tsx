import React, { useEffect, useRef, useState } from 'react'
import avaImg from './assets/ava.jpg'
import { HistoryDrawer } from './components/HistoryDrawer'
import './components/HistoryDrawer.css'
import { formatFigmaTimestamp, formatTimeHHmm } from './utils/dateFormat'

export interface ChatMessageItem {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  rawCreatedAt?: string | Date
  status?: 'processing' | 'streaming' | 'completed' | 'error'
  error?: string
}

function App(): React.JSX.Element {
  const [messages, setMessages] = useState<ChatMessageItem[]>([])
  const [input, setInput] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<{ code?: string; message: string } | null>(null)
  const [healthStatus, setHealthStatus] = useState<
    'checking' | 'starting' | 'healthy' | 'unhealthy' | 'model_missing'
  >('checking')
  const [healthReason, setHealthReason] = useState<string | undefined>(undefined)
  const [persistenceEnabled, setPersistenceEnabled] = useState(true)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [activeConversationId, setActiveConversationId] = useState<number | undefined>(undefined)

  const isCheckingRef = useRef(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<(() => void) | null>(null)
  const retryCountRef = useRef(0)

  const scrollToBottom = (): void => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Dọn dẹp stream khi unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current()
        abortRef.current = null
      }
    }
  }, [])

  // Khôi phục cấu hình persistence và lịch sử trò chuyện khi khởi động
  useEffect(() => {
    const loadInitialData = async (): Promise<void> => {
      try {
        if (window.api?.chat?.getPersistence) {
          const pRes = await window.api.chat.getPersistence()
          if (pRes?.success && typeof pRes.enabled === 'boolean') {
            setPersistenceEnabled(pRes.enabled)
          }
        }
        if (window.api?.chat?.listConversations) {
          const listRes = await window.api.chat.listConversations()
          if (
            listRes?.success &&
            Array.isArray(listRes.conversations) &&
            listRes.conversations.length > 0
          ) {
            setActiveConversationId(listRes.conversations[0].id)
          }
        }
        if (window.api?.chat?.loadHistory) {
          const hRes = await window.api.chat.loadHistory()
          if (hRes?.success && Array.isArray(hRes.messages) && hRes.messages.length > 0) {
            const loaded: ChatMessageItem[] = hRes.messages
              .filter((m) => m.role === 'user' || m.role === 'assistant')
              .map((m) => ({
                id: `history-${m.id}`,
                role: m.role as 'user' | 'assistant',
                content: m.content,
                rawCreatedAt: m.createdAt,
                timestamp: m.createdAt ? formatTimeHHmm(m.createdAt) : '',
                status: 'completed'
              }))
            setMessages(loaded)
          }
        }
      } catch (err) {
        console.error('Lỗi khi tải lịch sử khởi động:', err)
      }
    }

    void loadInitialData()
  }, [])

  const handleTogglePersistence = async (): Promise<void> => {
    const nextVal = !persistenceEnabled
    setPersistenceEnabled(nextVal)
    try {
      if (window.api?.chat?.setPersistence) {
        await window.api.chat.setPersistence(nextVal)
      }
    } catch (err) {
      console.error('Lỗi khi cập nhật cấu hình lưu trữ:', err)
    }
  }

  const handleSelectConversation = async (id: number): Promise<void> => {
    setActiveConversationId(id)
    setError(null)
    try {
      if (window.api?.chat?.switchConversation) {
        const res = await window.api.chat.switchConversation(id)
        if (res.success && Array.isArray(res.messages)) {
          const loaded: ChatMessageItem[] = res.messages
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m) => ({
              id: `history-${m.id}`,
              role: m.role as 'user' | 'assistant',
              content: m.content,
              rawCreatedAt: m.createdAt,
              timestamp: m.createdAt ? formatTimeHHmm(m.createdAt) : '',
              status: 'completed'
            }))
          setMessages(loaded)
        }
      }
    } catch (err) {
      console.error('Lỗi khi chuyển cuộc hội thoại:', err)
    }
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  const handleNewConversation = async (): Promise<void> => {
    setError(null)
    setMessages([])
    try {
      if (window.api?.chat?.createConversation) {
        const res = await window.api.chat.createConversation()
        if (res.success && res.conversation) {
          setActiveConversationId(res.conversation.id)
        }
      }
    } catch (err) {
      console.error('Lỗi khi tạo cuộc hội thoại mới:', err)
    }
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  const handleDeleteConversation = async (id: number): Promise<void> => {
    try {
      if (window.api?.chat?.deleteConversation) {
        await window.api.chat.deleteConversation(id)
        if (activeConversationId === id) {
          const hRes = await window.api?.chat?.loadHistory()
          if (hRes?.success && Array.isArray(hRes.messages) && hRes.messages.length > 0) {
            const loaded: ChatMessageItem[] = hRes.messages
              .filter((m) => m.role === 'user' || m.role === 'assistant')
              .map((m) => ({
                id: `history-${m.id}`,
                role: m.role as 'user' | 'assistant',
                content: m.content,
                rawCreatedAt: m.createdAt,
                timestamp: m.createdAt ? formatTimeHHmm(m.createdAt) : '',
                status: 'completed'
              }))
            setMessages(loaded)
          } else {
            setMessages([])
          }
        }
      }
    } catch (err) {
      console.error('Lỗi khi xóa cuộc hội thoại:', err)
    }
  }

  const checkHealth = async (isManual = false): Promise<void> => {
    if (isManual) {
      retryCountRef.current = 0
    }

    if (isCheckingRef.current) return
    isCheckingRef.current = true

    try {
      if (window.api?.chat?.health) {
        const res = await window.api.chat.health()
        if (res.ok) {
          setHealthStatus('healthy')
          setHealthReason(undefined)
          retryCountRef.current = 0
        } else if (res.status === 'starting') {
          setHealthStatus('starting')
          setHealthReason(res.reason || 'Đang tự động khởi chạy Ollama...')
        } else if (res.status === 'model_missing') {
          setHealthStatus('model_missing')
          setHealthReason(res.reason)
        } else {
          setHealthStatus('unhealthy')
          setHealthReason(res.reason)
        }
      }
    } catch (err) {
      setHealthStatus('unhealthy')
      setHealthReason(err instanceof Error ? err.message : 'Lỗi kết nối')
    } finally {
      isCheckingRef.current = false
    }
  }

  // Adaptive Polling: Lần đầu chạy sau 100ms; khi offline/starting thử lại nhanh (2.5s) tối đa 5 lần (~12.5s); sau đó giãn ra 30s
  useEffect(() => {
    let delay: number

    if (healthStatus === 'checking') {
      delay = 100
    } else if (healthStatus === 'starting' || healthStatus === 'unhealthy') {
      if (retryCountRef.current < 5) {
        delay = 2500
        retryCountRef.current += 1
      } else {
        delay = 30000
      }
    } else {
      retryCountRef.current = 0
      delay = 30000
    }

    const timer = setTimeout(() => {
      void checkHealth(false)
    }, delay)

    return (): void => clearTimeout(timer)
  }, [healthStatus])

  const handleSend = (contentOverride?: string): void => {
    const contentToSend = (contentOverride ?? input).trim()
    if (!contentToSend || isGenerating) {
      return
    }

    setError(null)
    const nowDate = new Date()
    const nowTimeStr = formatTimeHHmm(nowDate)
    const userMsgId = `${Date.now()}-user`
    const assistantMsgId = `${Date.now()}-assistant`

    const userMsg: ChatMessageItem = {
      id: userMsgId,
      role: 'user',
      content: contentToSend,
      rawCreatedAt: nowDate,
      timestamp: nowTimeStr,
      status: 'completed'
    }

    // AC-01 & AC-02: Lập tức tạo bong bóng phản hồi của AI ở trạng thái "Đang xử lý..." (< 200ms)
    const pendingAssistantMsg: ChatMessageItem = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      rawCreatedAt: nowDate,
      timestamp: nowTimeStr,
      status: 'processing'
    }

    setMessages((prev) => [...prev, userMsg, pendingAssistantMsg])
    if (!contentOverride) {
      setInput('')
    }
    setIsGenerating(true)

    if (abortRef.current) {
      abortRef.current()
      abortRef.current = null
    }

    if (window.api?.chat?.stream) {
      const cancel = window.api.chat.stream(contentToSend, {
        onChunk: (chunk: string) => {
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id === assistantMsgId) {
                return {
                  ...msg,
                  status: 'streaming',
                  content: msg.content + chunk
                }
              }
              return msg
            })
          )
        },
        onComplete: (fullText: string) => {
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id === assistantMsgId) {
                return {
                  ...msg,
                  status: 'completed',
                  content: fullText || msg.content
                }
              }
              return msg
            })
          )
          setIsGenerating(false)
          abortRef.current = null
          setTimeout(() => textareaRef.current?.focus(), 50)
        },
        onError: (streamErr) => {
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id === assistantMsgId) {
                return {
                  ...msg,
                  status: 'error',
                  error: streamErr.message
                }
              }
              return msg
            })
          )
          setError({
            code: streamErr.code,
            message: streamErr.message || 'Mô hình không phản hồi hoặc đã xảy ra lỗi.'
          })
          setIsGenerating(false)
          abortRef.current = null
          setTimeout(() => textareaRef.current?.focus(), 50)
        }
      })

      abortRef.current = cancel
    } else {
      void (async () => {
        try {
          const res = await window.api.chat.send(contentToSend)
          if (res.success && res.text) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId
                  ? { ...msg, status: 'completed', content: res.text as string }
                  : msg
              )
            )
          } else {
            throw new Error(res.error || 'Lỗi gửi tin nhắn.')
          }
        } catch (fallbackErr) {
          const errMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId ? { ...msg, status: 'error', error: errMsg } : msg
            )
          )
          setError({ message: errMsg })
        } finally {
          setIsGenerating(false)
          setTimeout(() => textareaRef.current?.focus(), 50)
        }
      })()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Tìm index của tin nhắn user cuối cùng để hiển thị trạng thái "Đã gửi" / "Đã đọc" chuẩn Figma
  const lastUserMsgIndex = messages.reduce(
    (lastIdx, msg, idx) => (msg.role === 'user' ? idx : lastIdx),
    -1
  )

  return (
    <div className="chat-app">
      {/* Background ambient lighting for Apple Liquid Glass */}
      <div className="liquid-ambient-glow" aria-hidden="true" />

      {/* Header */}
      <header className="chat-header">
        <div className="brand">
          <div className="brand-avatar-wrapper">
            <img src={avaImg} alt="Asada Sinon Avatar" className="brand-avatar-img" />
            <span className="brand-avatar-status-dot" aria-label="Trạng thái trực tuyến" />
          </div>
          <div className="brand-title">
            <span className="brand-name">Asada Sinon</span>
            <span className="brand-subtitle">
              {isGenerating
                ? 'Đang phản hồi...'
                : healthStatus === 'healthy'
                  ? 'Trợ lý ảo thông minh · Sẵn sàng'
                  : healthStatus === 'starting'
                    ? 'Đang khởi động Ollama...'
                    : 'Ngoại tuyến'}
            </span>
          </div>
        </div>

        <div className="header-meta">
          {/* Toggle bật/tắt lưu lịch sử: Đổi "Không lưu" thành "Đoạn chat tạm thời" */}
          <button
            type="button"
            className={`persistence-pill ${persistenceEnabled ? 'active' : 'inactive'}`}
            onClick={() => void handleTogglePersistence()}
            title={
              persistenceEnabled
                ? 'Đang bật lưu lịch sử (Bấm để chuyển sang Đoạn chat tạm thời)'
                : 'Đang ở chế độ Đoạn chat tạm thời (Bấm để bật lưu lịch sử)'
            }
          >
            <span className="persistence-icon">{persistenceEnabled ? '💾' : '🕒'}</span>
            <span className="persistence-label">
              {persistenceEnabled ? 'Lưu lịch sử' : 'Đoạn chat tạm thời'}
            </span>
          </button>

          {/* Ẩn trạng thái "Ollama sẵn sàng" khi healthy; chỉ hiển thị khi khởi động hoặc có sự cố */}
          {healthStatus !== 'healthy' && (
            <div
              className="status-pill"
              title={
                healthReason
                  ? `Chi tiết: ${healthReason} (Nhấp để thử kết nối lại)`
                  : 'Trạng thái kết nối mô hình (Nhấp để làm mới)'
              }
              onClick={() => void checkHealth(true)}
            >
              <span
                className={`status-dot ${
                  healthStatus === 'starting'
                    ? 'status-starting'
                    : healthStatus === 'model_missing'
                      ? 'status-missing'
                      : healthStatus === 'unhealthy'
                        ? 'status-offline'
                        : 'status-checking'
                }`}
              />
              <span className="status-label">
                {healthStatus === 'starting'
                  ? 'Đang khởi động Ollama...'
                  : healthStatus === 'model_missing'
                    ? 'Chưa tải model qwen3:1.7b'
                    : healthStatus === 'unhealthy'
                      ? 'Ollama ngoại tuyến (Bấm thử lại)'
                      : 'Kiểm tra Ollama...'}
              </span>
            </div>
          )}

          {/* Nút mở/đóng Lịch sử trò chuyện ở góc phải của header */}
          <button
            type="button"
            className={`history-drawer-toggle-btn ${isHistoryOpen ? 'is-open' : ''}`}
            onClick={() => setIsHistoryOpen((prev) => !prev)}
            title={isHistoryOpen ? 'Đóng lịch sử trò chuyện' : 'Mở lịch sử trò chuyện'}
            aria-label={isHistoryOpen ? 'Đóng lịch sử' : 'Mở lịch sử'}
          >
            <span className="drawer-icon-symbol">{isHistoryOpen ? '|>' : '<|'}</span>
          </button>
        </div>
      </header>

      {/* Chat Body */}
      <main className="chat-body">
        {messages.length === 0 ? (
          <div className="chat-empty-state">
            <div className="empty-avatar-card">
              <img src={avaImg} alt="Sinon Avatar" className="empty-avatar-img" />
            </div>
            <h1 className="empty-title">Xin chào! Tôi là Asada Sinon</h1>
            <p className="empty-subtitle">
              Trợ lý ảo cá nhân thông minh hoạt động hoàn toàn cục bộ trên máy tính của bạn với mô
              hình ngôn ngữ AI bảo mật tuyệt đối.
            </p>
            <div className="suggested-prompts">
              <button
                type="button"
                className="prompt-btn"
                onClick={() => handleSend('Xin chào, bạn là ai?')}
              >
                💬 Xin chào, bạn là ai?
              </button>
              <button
                type="button"
                className="prompt-btn"
                onClick={() => handleSend('Hãy tóm tắt ngắn gọn vai trò của Asada Sinon.')}
              >
                💡 Tóm tắt vai trò của Asada Sinon
              </button>
              <button
                type="button"
                className="prompt-btn"
                onClick={() => handleSend('Hôm nay tôi cần quản lý công việc thế nào?')}
              >
                📋 Quản lý công việc hôm nay
              </button>
            </div>
          </div>
        ) : (
          <div className="chat-messages">
            {/* Mốc thời gian chuẩn Figma: Hôm nay, 21:30 / Hôm qua, 10:11 / dd/mm/yyyy, giờ */}
            <div className="chat-date-divider">
              {formatFigmaTimestamp(messages[0]?.rawCreatedAt || new Date())}
            </div>
            {messages.map((msg, index) => {
              const isLastUserMsg = msg.role === 'user' && index === lastUserMsgIndex
              const userStatusLabel = isLastUserMsg ? 'Đã gửi' : 'Đã đọc'

              return (
                <div key={msg.id} className={`message-row ${msg.role}`}>
                  <div className="message-content-wrapper">
                    <div className="bubble-with-avatar">
                      {msg.role === 'assistant' && (
                        <div className="msg-avatar-wrapper">
                          <img src={avaImg} alt="Sinon" className="msg-avatar-img" />
                        </div>
                      )}
                      <div
                        className={`message-bubble ${
                          msg.status === 'processing' ? 'message-processing' : ''
                        } ${msg.status === 'error' ? 'message-error' : ''}`}
                      >
                        {msg.status === 'processing' ? (
                          <div className="processing-state-box">
                            <div className="liquid-pulse-dots">
                              <span className="liquid-dot" />
                              <span className="liquid-dot" />
                              <span className="liquid-dot" />
                            </div>
                            <span className="processing-label">Đang xử lý...</span>
                          </div>
                        ) : msg.status === 'error' ? (
                          <div className="bubble-error-content">
                            <span className="bubble-error-icon">⚠️</span>
                            <span>{msg.error || 'Đã xảy ra lỗi khi tạo phản hồi.'}</span>
                          </div>
                        ) : (
                          <div className="message-text">
                            {msg.content}
                            {msg.status === 'streaming' && <span className="streaming-cursor" />}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Mốc thời gian hiển thị dưới bong bóng chat như trong Figma */}
                    {msg.timestamp && (
                      <div className="bubble-timestamp-popup">
                        {msg.role === 'user'
                          ? `${msg.timestamp} · ${userStatusLabel}`
                          : msg.timestamp}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* Error banner */}
      {error && (
        <div className="error-banner">
          <span className="error-banner-icon">⚠️</span>
          <div className="error-banner-body">
            <strong>Lỗi phản hồi:</strong> {error.message}
            {error.code && <span className="error-banner-code">{error.code}</span>}
          </div>
          <button
            type="button"
            className="error-banner-close"
            onClick={() => setError(null)}
            title="Đóng"
          >
            ✕
          </button>
        </div>
      )}

      {/* Footer / Floating Glass Composer bám sát Figma */}
      <footer className="chat-footer">
        <div className="composer-wrapper">
          <div className="composer-glass-panel">
            {/* Nút + thao tác nhanh phong cách iPadOS: Không tự nhảy câu hỏi, không highlight khung chat */}
            <button
              type="button"
              className="composer-action-btn plus-btn"
              onClick={(e) => {
                e.preventDefault()
              }}
              onMouseDown={(e) => {
                e.preventDefault()
              }}
              title="Thao tác nhanh"
              aria-label="Thao tác nhanh"
            >
              <span className="action-symbol">＋</span>
            </button>

            <textarea
              ref={textareaRef}
              rows={1}
              className="chat-input"
              placeholder="iMessage (Nhập tin nhắn cho Asada Sinon...)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isGenerating}
            />

            {/* Nút micro dictation phong cách iOS */}
            <button
              type="button"
              className="composer-action-btn mic-btn"
              onClick={() => {
                textareaRef.current?.focus()
              }}
              title="Nhập bằng giọng nói (Voice input)"
              aria-label="Micro"
            >
              <svg
                className="mic-svg"
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="currentColor"
              >
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
            </button>

            {/* Nút gửi phong cách Hologram Emerald Apple */}
            <button
              type="button"
              className="send-button"
              disabled={!input.trim() || isGenerating}
              onClick={() => handleSend()}
              title="Gửi tin nhắn (Enter)"
              aria-label="Gửi tin nhắn"
            >
              {isGenerating ? (
                <span className="send-spinner" />
              ) : (
                <svg
                  className="send-arrow-svg"
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </footer>

      {/* History Drawer (UC-06) */}
      <HistoryDrawer
        isOpen={isHistoryOpen}
        activeConversationId={activeConversationId}
        onClose={() => setIsHistoryOpen(false)}
        onSelectConversation={(id) => void handleSelectConversation(id)}
        onNewConversation={() => void handleNewConversation()}
        onDeleteConversation={(id) => handleDeleteConversation(id)}
      />
    </div>
  )
}

export default App
