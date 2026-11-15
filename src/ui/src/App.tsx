import React, { useEffect, useRef, useState } from 'react'
import avaImg from './assets/ava.jpg'

export interface ChatMessageItem {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
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
  const [activeTimestampId, setActiveTimestampId] = useState<string | null>(null)
  const [persistenceEnabled, setPersistenceEnabled] = useState(true)

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
        if (window.api?.chat?.loadHistory) {
          const hRes = await window.api.chat.loadHistory()
          if (hRes?.success && Array.isArray(hRes.messages) && hRes.messages.length > 0) {
            const loaded: ChatMessageItem[] = hRes.messages
              .filter((m) => m.role === 'user' || m.role === 'assistant')
              .map((m) => ({
                id: `history-${m.id}`,
                role: m.role as 'user' | 'assistant',
                content: m.content,
                timestamp: m.createdAt
                  ? new Date(m.createdAt).toLocaleTimeString('vi-VN', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  : '',
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

  const handleBubbleClick = (id: string): void => {
    setActiveTimestampId((prev) => (prev === id ? null : id))
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
    let delay = 30000

    if (healthStatus === 'checking') {
      delay = 100
    } else if (healthStatus === 'starting' || healthStatus === 'unhealthy') {
      if (retryCountRef.current < 5) {
        delay = 2500
        retryCountRef.current += 1
      } else {
        delay = 30000
      }
    } else if (healthStatus === 'healthy') {
      retryCountRef.current = 0
      delay = 30000
    }

    const timer = setTimeout(() => {
      void checkHealth()
    }, delay)

    return (): void => clearTimeout(timer)
  }, [healthStatus])

  const handleSend = (contentOverride?: string): void => {
    const contentToSend = (contentOverride ?? input).trim()
    if (!contentToSend || isGenerating) {
      return
    }

    setError(null)
    const now = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    const userMsgId = `${Date.now()}-user`
    const assistantMsgId = `${Date.now()}-assistant`

    const userMsg: ChatMessageItem = {
      id: userMsgId,
      role: 'user',
      content: contentToSend,
      timestamp: now,
      status: 'completed'
    }

    // AC-01 & AC-02: Lập tức tạo bong bóng phản hồi của AI ở trạng thái "Đang xử lý..." (< 200ms)
    const pendingAssistantMsg: ChatMessageItem = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: now,
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

  return (
    <div className="chat-app">
      {/* Background ambient lighting for Apple Liquid Glass */}
      <div className="liquid-ambient-glow" aria-hidden="true" />

      {/* Header */}
      <header className="chat-header">
        <div className="brand">
          <div className="brand-avatar-wrapper">
            <img src={avaImg} alt="Sinon Avatar" className="brand-avatar-img" />
          </div>
          <div className="brand-title">
            <span className="brand-name">Asada Sinon</span>
          </div>
        </div>

        <div className="header-meta">
          {/* Toggle bật/tắt lưu lịch sử */}
          <button
            type="button"
            className={`persistence-pill ${persistenceEnabled ? 'active' : 'inactive'}`}
            onClick={() => void handleTogglePersistence()}
            title={
              persistenceEnabled
                ? 'Đang bật lưu lịch sử (Bấm để tắt)'
                : 'Đang tắt lưu lịch sử (Bấm để bật)'
            }
          >
            <span className="persistence-icon">{persistenceEnabled ? '💾' : '🚫'}</span>
            <span className="persistence-label">
              {persistenceEnabled ? 'Lưu lịch sử' : 'Không lưu'}
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
        </div>
      </header>

      {/* Chat Body */}
      <main className="chat-body">
        {messages.length === 0 ? (
          <div className="chat-empty-state">
            <div className="empty-avatar-card">
              <img src={avaImg} alt="Sinon Avatar" className="empty-avatar-img" />
            </div>
            <h1 className="empty-title">Xin chào! Tôi là Sinon</h1>
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
                onClick={() => handleSend('Hãy tóm tắt ngắn gọn vai trò của Sinon.')}
              >
                💡 Tóm tắt vai trò của Sinon
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
            {messages.map((msg) => {
              const isTimestampVisible = activeTimestampId === msg.id

              return (
                <div key={msg.id} className={`message-row ${msg.role}`}>
                  {msg.role === 'assistant' && (
                    <div className="msg-avatar-wrapper">
                      <img src={avaImg} alt="Sinon" className="msg-avatar-img" />
                    </div>
                  )}

                  <div className="message-content-wrapper">
                    <div
                      className={`message-bubble ${
                        msg.status === 'processing' ? 'message-processing' : ''
                      } ${msg.status === 'error' ? 'message-error' : ''}`}
                      onClick={() => handleBubbleClick(msg.id)}
                      title="Bấm để xem thời gian"
                    >
                      {/* Nội dung tin nhắn theo phong cách Facebook Messenger - Không hiển thị nhãn Bạn/Sinon */}
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

                    {/* Thời gian gửi chỉ hiển thị khi người dùng bấm vào tin nhắn */}
                    {isTimestampVisible && msg.timestamp && (
                      <div className="bubble-timestamp-popup">{msg.timestamp}</div>
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

      {/* Footer / Floating Glass Composer */}
      <footer className="chat-footer">
        <div className="composer-wrapper">
          <div className="composer-glass-panel">
            <textarea
              ref={textareaRef}
              rows={1}
              className="chat-input"
              placeholder="Nhập tin nhắn cho Sinon..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isGenerating}
            />
            <button
              type="button"
              className="send-button"
              disabled={!input.trim() || isGenerating}
              onClick={() => handleSend()}
            >
              <span>{isGenerating ? 'Đang phản hồi...' : 'Gửi'}</span>
            </button>
          </div>
          <div className="composer-hints">
            <span>Nhấn Enter để gửi, Shift + Enter để xuống dòng</span>
            <span>Local AI • Bảo mật riêng tư dữ liệu</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
