import React, { useEffect, useRef, useState } from 'react'

interface ChatMessageItem {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

function App(): React.JSX.Element {
  const [messages, setMessages] = useState<ChatMessageItem[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<{ code?: string; message: string } | null>(null)
  const [healthStatus, setHealthStatus] = useState<'checking' | 'healthy' | 'unhealthy'>('checking')
  const [healthReason, setHealthReason] = useState<string | undefined>(undefined)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = (): void => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading])

  useEffect(() => {
    let isMounted = true

    const checkHealth = async (): Promise<void> => {
      try {
        if (window.api?.chat?.health) {
          const res = await window.api.chat.health()
          if (isMounted) {
            if (res.ok) {
              setHealthStatus('healthy')
              setHealthReason(undefined)
            } else {
              setHealthStatus('unhealthy')
              setHealthReason(res.reason)
            }
          }
        }
      } catch (err) {
        if (isMounted) {
          setHealthStatus('unhealthy')
          setHealthReason(err instanceof Error ? err.message : 'Lỗi kết nối')
        }
      }
    }

    void checkHealth()
    const interval = setInterval(() => void checkHealth(), 30000)

    return (): void => {
      isMounted = false
      clearInterval(interval)
    }
  }, [])

  const handleSend = async (contentOverride?: string): Promise<void> => {
    const contentToSend = (contentOverride ?? input).trim()
    if (!contentToSend || isLoading) {
      return
    }

    setError(null)
    const userMsg: ChatMessageItem = {
      id: `${Date.now()}-user`,
      role: 'user',
      content: contentToSend,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    }

    setMessages((prev) => [...prev, userMsg])
    if (!contentOverride) {
      setInput('')
    }
    setIsLoading(true)

    try {
      const res = await window.api.chat.send(contentToSend)
      if (res.success && res.text) {
        const assistantMsg: ChatMessageItem = {
          id: `${Date.now()}-assistant`,
          role: 'assistant',
          content: res.text,
          timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        }
        setMessages((prev) => [...prev, assistantMsg])
      } else {
        setError({
          code: res.code,
          message: res.error || 'Mô hình không phản hồi hoặc đã xảy ra lỗi.'
        })
      }
    } catch (err) {
      setError({
        code: 'CLIENT_INVOKE_ERROR',
        message: err instanceof Error ? err.message : 'Lỗi không xác định khi gửi tin nhắn.'
      })
    } finally {
      setIsLoading(false)
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  return (
    <div className="chat-app">
      {/* Header */}
      <header className="chat-header">
        <div className="brand">
          <div className="brand-icon">🤖</div>
          <div className="brand-title">
            <span>PVA Assistant</span>
            <span className="brand-tag">qwen3:1.7b</span>
          </div>
        </div>
        <div className="header-meta">
          <div
            className="status-pill"
            title={healthReason ? `Chi tiết: ${healthReason}` : 'Trạng thái kết nối mô hình'}
          >
            <span
              className={`status-dot ${
                healthStatus === 'healthy'
                  ? 'status-online'
                  : healthStatus === 'unhealthy'
                    ? 'status-offline'
                    : 'status-checking'
              }`}
            />
            <span>
              {healthStatus === 'healthy'
                ? 'Ollama sẵn sàng'
                : healthStatus === 'unhealthy'
                  ? 'Ollama ngoại tuyến'
                  : 'Kiểm tra Ollama...'}
            </span>
          </div>
        </div>
      </header>

      {/* Chat Body */}
      <main className="chat-body">
        {messages.length === 0 ? (
          <div className="chat-empty-state">
            <div className="empty-icon">👋</div>
            <h1 className="empty-title">Xin chào! Tôi là PVA</h1>
            <p className="empty-subtitle">
              Trợ lý ảo cá nhân PVA đang hoạt động với mô hình ngôn ngữ <strong>Qwen3 1.7B</strong>{' '}
              chạy hoàn toàn cục bộ trên máy tính của bạn thông qua Ollama.
            </p>
            <div className="suggested-prompts">
              <button
                type="button"
                className="prompt-btn"
                onClick={() => void handleSend('Xin chào, bạn là ai?')}
              >
                💬 Xin chào, bạn là ai?
              </button>
              <button
                type="button"
                className="prompt-btn"
                onClick={() => void handleSend('Hãy tóm tắt ngắn gọn vai trò của PVA.')}
              >
                💡 Tóm tắt vai trò của PVA
              </button>
              <button
                type="button"
                className="prompt-btn"
                onClick={() => void handleSend('Hôm nay tôi cần quản lý công việc thế nào?')}
              >
                📋 Quản lý công việc hôm nay
              </button>
            </div>
          </div>
        ) : (
          <div className="chat-messages">
            {messages.map((msg) => (
              <div key={msg.id} className={`message-row ${msg.role}`}>
                <div className="message-bubble">
                  <div className="message-meta">
                    {msg.role === 'assistant' ? (
                      <>
                        <span className="assistant-avatar">🤖</span>
                        <span>PVA</span>
                      </>
                    ) : (
                      <span>Bạn</span>
                    )}
                    <span>•</span>
                    <span>{msg.timestamp}</span>
                  </div>
                  <div className="message-text">{msg.content}</div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="message-row assistant">
                <div className="message-bubble loading">
                  <div className="spinner" />
                  <span>PVA đang suy nghĩ...</span>
                </div>
              </div>
            )}
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

      {/* Footer / Input Area */}
      <footer className="chat-footer">
        <div className="input-container">
          <div className="input-box">
            <textarea
              ref={textareaRef}
              rows={1}
              className="chat-input"
              placeholder="Nhập tin nhắn cho PVA..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
            />
            <button
              type="button"
              className="send-button"
              disabled={!input.trim() || isLoading}
              onClick={() => void handleSend()}
            >
              <span>{isLoading ? 'Đang gửi...' : 'Gửi'}</span>
            </button>
          </div>
          <div className="input-hints">
            <span>Nhấn Enter để gửi, Shift + Enter để xuống dòng</span>
            <span>Local AI • Bảo mật dữ liệu</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
