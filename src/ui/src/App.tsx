import React, { useEffect, useRef, useState } from 'react'
import avaImg from './assets/ava.jpg'
import { CharacterStage } from './components/CharacterStage'
import { HistoryDrawer } from './components/HistoryDrawer'
import './components/HistoryDrawer.css'
import { useAppState } from './stores/appStateStore'
import { formatFigmaTimestamp, formatTimeHHmm } from './utils/dateFormat'

export interface ChatMessageItem {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  rawCreatedAt?: string | Date
  status?: 'processing' | 'streaming' | 'completed' | 'error'
  error?: string
  errorCode?: string
}

const STANDARD_ERROR_MESSAGES: Record<string, string> = {
  MODEL_UNAVAILABLE:
    'Không thể kết nối đến máy chủ Ollama. Vui lòng đảm bảo Ollama đang chạy trên máy tính của bạn.',
  MODEL_TIMEOUT: 'Quá thời gian chờ phản hồi từ mô hình AI (timeout). Vui lòng thử lại.',
  MODEL_BAD_RESPONSE:
    'Mô hình phản hồi không đúng cấu trúc hoặc máy chủ Ollama trả về dữ liệu không hợp lệ.',
  DB_UNAVAILABLE: 'Cơ sở dữ liệu SQLite hiện không khả dụng. Không thể lưu hoặc đọc lịch sử.'
}

interface SpeechRecognitionEvent {
  resultIndex: number
  results: {
    length: number
    [index: number]: {
      [index: number]: {
        transcript: string
      }
    }
  }
}

interface SpeechRecognitionInstance {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

function App(): React.JSX.Element {
  const [messages, setMessages] = useState<ChatMessageItem[]>([])
  const [input, setInput] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<{ code?: string; message: string } | null>(null)
  const [healthStatus, setHealthStatus] = useState<
    'checking' | 'starting' | 'healthy' | 'unhealthy' | 'model_missing'
  >('checking')
  const [persistenceEnabled, setPersistenceEnabled] = useState(true)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [activeConversationId, setActiveConversationId] = useState<number | undefined>(undefined)
  // Trạng thái thu phóng kích thước khung chat (Resizable Split View)
  // Mặc định khi mở lên: Phần video chuyển động chiếm 3/5 (60%) chiều ngang -> Khung chat chiếm 2/5 (40%)
  const getDefaultChatWidth = (): number => {
    if (typeof window !== 'undefined' && window.innerWidth > 0) {
      return Math.round(window.innerWidth * 0.4)
    }
    return 512
  }

  const [chatWidth, setChatWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('pva_chat_panel_width_custom')
      if (saved) {
        const parsed = parseInt(saved, 10)
        if (!isNaN(parsed) && parsed >= 280 && parsed <= 1400) {
          return parsed
        }
      }
    } catch {
      // ignore
    }
    return getDefaultChatWidth()
  })
  const [isResizing, setIsResizing] = useState<boolean>(false)
  const isResizingRef = useRef<boolean>(false)

  // Trạng thái Drop-up menu Chế độ hội thoại (phong cách Antigravity)
  const [isModeMenuOpen, setIsModeMenuOpen] = useState<boolean>(false)
  const modeMenuRef = useRef<HTMLDivElement>(null)

  // Đóng drop-up menu khi click ra ngoài
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (modeMenuRef.current && !modeMenuRef.current.contains(e.target as Node)) {
        setIsModeMenuOpen(false)
      }
    }
    if (isModeMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isModeMenuOpen])

  // Xử lý kéo thay đổi kích thước khung chat
  const handleResizeStart = (e: React.MouseEvent): void => {
    e.preventDefault()
    setIsResizing(true)
    isResizingRef.current = true

    const startX = e.clientX
    // Đọc kích thước pixel thực tế của khung chat tại thời điểm bắt đầu kéo
    const chatPanelEl = document.querySelector('.chat-panel') as HTMLElement | null
    const startWidth = chatPanelEl ? chatPanelEl.getBoundingClientRect().width : chatWidth

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (moveEvent: MouseEvent): void => {
      if (!isResizingRef.current) return
      const delta = startX - moveEvent.clientX
      const maxAllowed = window.innerWidth * 0.75
      const newWidth = Math.round(Math.max(280, Math.min(maxAllowed, startWidth + delta)))
      setChatWidth(newWidth)
    }

    const onMouseUp = (): void => {
      setIsResizing(false)
      isResizingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      try {
        setChatWidth((finalWidth) => {
          localStorage.setItem('pva_chat_panel_width_custom', finalWidth.toString())
          return finalWidth
        })
      } catch {
        // ignore
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  const [appStatus, appStore] = useAppState()
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
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
          retryCountRef.current = 0
          if (appStatus.state === 'Error') {
            appStore.setIdle()
          }
        } else if (res.status === 'starting') {
          setHealthStatus('starting')
          appStore.setProcessing('Đang khởi chạy Ollama...')
        } else if (res.status === 'model_missing') {
          setHealthStatus('model_missing')
          appStore.setError('MODEL_UNAVAILABLE', res.reason)
        } else {
          setHealthStatus('unhealthy')
          appStore.setError('MODEL_UNAVAILABLE', res.reason || 'Ollama ngoại tuyến')
        }
      }
    } catch (err) {
      setHealthStatus('unhealthy')
      const msg = err instanceof Error ? err.message : 'Lỗi kết nối'
      appStore.setError('MODEL_UNAVAILABLE', msg)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [healthStatus])

  const lastUserMessageTextRef = useRef<string>('')

  const handleReconnectOllama = async (): Promise<void> => {
    appStore.setProcessing('Đang kết nối lại tới Ollama...')
    setHealthStatus('starting')
    try {
      if (window.api?.chat?.startModel) {
        await window.api.chat.startModel()
      }
    } catch (err) {
      console.warn('Lỗi khi kích hoạt khởi động Ollama:', err)
    }
    await checkHealth(true)
  }

  const handleRetryLastMessage = async (): Promise<void> => {
    const textToRetry = lastUserMessageTextRef.current
    if (!textToRetry) {
      const userMsgs = messages.filter((m) => m.role === 'user')
      if (userMsgs.length > 0) {
        const lastContent = userMsgs[userMsgs.length - 1].content
        if (healthStatus === 'unhealthy' && window.api?.chat?.startModel) {
          appStore.setProcessing('Đang kết nối lại...')
          setHealthStatus('starting')
          await window.api.chat.startModel()
          await checkHealth(true)
        }
        handleSend(lastContent)
      }
      return
    }

    if (healthStatus === 'unhealthy' && window.api?.chat?.startModel) {
      appStore.setProcessing('Đang kết nối lại...')
      setHealthStatus('starting')
      await window.api.chat.startModel()
      await checkHealth(true)
    }
    handleSend(textToRetry)
  }

  const handleToggleMic = (): void => {
    if (appStatus.state === 'Listening') {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch {
          // ignore
        }
        recognitionRef.current = null
      }
      appStore.setIdle()
      return
    }

    appStore.setListening('Đang lắng nghe bạn nói...')

    const SpeechRec =
      (
        window as unknown as {
          SpeechRecognition?: SpeechRecognitionConstructor
          webkitSpeechRecognition?: SpeechRecognitionConstructor
        }
      ).SpeechRecognition ||
      (
        window as unknown as {
          SpeechRecognition?: SpeechRecognitionConstructor
          webkitSpeechRecognition?: SpeechRecognitionConstructor
        }
      ).webkitSpeechRecognition

    if (SpeechRec) {
      try {
        const recognition = new SpeechRec()
        recognition.lang = 'vi-VN'
        recognition.continuous = false
        recognition.interimResults = true

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          let transcript = ''
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            transcript += event.results[i][0].transcript
          }
          if (transcript.trim()) {
            setInput(transcript)
          }
        }

        recognition.onerror = () => {
          appStore.setIdle()
          recognitionRef.current = null
        }

        recognition.onend = () => {
          recognitionRef.current = null
          if (appStatus.state === 'Listening') {
            appStore.setIdle()
          }
        }

        recognition.start()
        recognitionRef.current = recognition
      } catch (err) {
        console.warn('Lỗi SpeechRecognition:', err)
      }
    }
  }

  const handleSend = (contentOverride?: string): void => {
    const contentToSend = (contentOverride ?? input).trim()
    if (!contentToSend || isGenerating) {
      return
    }

    if (appStatus.state === 'Listening') {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch {
          // ignore
        }
        recognitionRef.current = null
      }
    }

    lastUserMessageTextRef.current = contentToSend
    setError(null)
    appStore.setProcessing('Đang suy nghĩ & xử lý...')
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
      if (textareaRef.current) {
        textareaRef.current.style.height = '26px'
      }
    }
    setIsGenerating(true)

    if (abortRef.current) {
      abortRef.current()
      abortRef.current = null
    }

    if (window.api?.chat?.stream) {
      let hasReceivedFirstChunk = false

      const cancel = window.api.chat.stream(contentToSend, {
        onChunk: (chunk: string) => {
          if (!hasReceivedFirstChunk) {
            hasReceivedFirstChunk = true
            appStore.setSpeaking('Đang phản hồi...')
          }
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
          appStore.setIdle()
          abortRef.current = null
          setTimeout(() => textareaRef.current?.focus(), 50)
        },
        onError: (streamErr) => {
          const rawCode = streamErr.code || 'MODEL_UNAVAILABLE'
          const friendlyMessage =
            streamErr.message ||
            STANDARD_ERROR_MESSAGES[rawCode] ||
            'Mô hình không phản hồi hoặc đã xảy ra lỗi.'

          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id === assistantMsgId) {
                return {
                  ...msg,
                  status: 'error',
                  error: friendlyMessage,
                  errorCode: rawCode
                }
              }
              return msg
            })
          )
          setError({
            code: rawCode,
            message: friendlyMessage
          })
          setIsGenerating(false)
          appStore.setError(rawCode, friendlyMessage)
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
            appStore.setIdle()
          } else {
            const rawCode = res.code || 'MODEL_UNAVAILABLE'
            const msg = res.error || STANDARD_ERROR_MESSAGES[rawCode] || 'Lỗi gửi tin nhắn.'
            const err = new Error(msg)
            ;(err as unknown as { code?: string }).code = rawCode
            throw err
          }
        } catch (fallbackErr) {
          const errMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
          const rawCode = (fallbackErr as unknown as { code?: string })?.code || 'MODEL_UNAVAILABLE'
          const friendlyMessage = errMsg || STANDARD_ERROR_MESSAGES[rawCode] || 'Lỗi gửi tin nhắn.'
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? { ...msg, status: 'error', error: friendlyMessage, errorCode: rawCode }
                : msg
            )
          )
          setError({ code: rawCode, message: friendlyMessage })
          appStore.setError(rawCode, friendlyMessage)
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
    <div className={`chat-app split-layout ${isResizing ? 'is-resizing' : ''}`}>
      {/* Cột trái (Chiếm phần còn lại của màn hình): Sân khấu Nhân vật Asada Sinon */}
      <section className="character-stage-panel" aria-label="Sân khấu nhân vật Asada Sinon">
        <CharacterStage status={appStatus} />
      </section>

      {/* Ranh giới thay đổi kích thước (Split Resizer Divider) */}
      <div
        className={`split-resizer ${isResizing ? 'is-dragging' : ''}`}
        onMouseDown={handleResizeStart}
        role="separator"
        aria-orientation="vertical"
        aria-label="Kéo để thay đổi kích thước ô chat"
        title="Kéo sang trái/phải để thu phóng kích thước khung chat"
      >
        <div className="resizer-handle-line" />
      </div>

      {/* Cột phải: Khung trò chuyện đầy đủ (Chiều rộng thu phóng theo chatWidth) */}
      <section
        className="chat-panel"
        style={{ width: `${chatWidth}px`, flex: '0 0 auto' }}
        aria-label="Khu vực trò chuyện"
      >
        {/* Header (Đã tinh giản: Bỏ StatusBar trùng lặp, bỏ persistence pill trên header) */}
        <header className="chat-header">
          <div className="brand">
            <div className="brand-avatar-wrapper">
              <img src={avaImg} alt="Asada Sinon Avatar" className="brand-avatar-img" />
              <span
                className={`brand-avatar-status-dot ${
                  appStatus.state === 'Idle'
                    ? 'status-idle'
                    : appStatus.state === 'Listening'
                      ? 'status-listening'
                      : appStatus.state === 'Processing'
                        ? 'status-processing'
                        : appStatus.state === 'Speaking'
                          ? 'status-speaking'
                          : 'status-offline'
                }`}
                aria-label={`Trạng thái: ${appStatus.label}`}
              />
            </div>
            <div className="brand-title">
              <span className="brand-name">Asada Sinon</span>
              <span
                className={`brand-subtitle ${appStatus.state === 'Error' ? 'is-error-clickable' : ''}`}
                onClick={() => {
                  if (appStatus.state === 'Error') {
                    void handleReconnectOllama()
                  }
                }}
                title={
                  appStatus.state === 'Error'
                    ? 'Nhấp để kết nối lại với Ollama'
                    : appStatus.detail || appStatus.label
                }
              >
                {appStatus.detail || appStatus.label}
              </span>
            </div>
          </div>

          <div className="header-meta">
            {/* Nút Cài đặt (Settings) phong cách Apple */}
            <button
              type="button"
              className="settings-toggle-btn"
              onClick={() => {
                alert('Cài đặt hệ thống (Cấu hình Model Ollama, Giọng nói, Bộ nhớ SQLite...)')
              }}
              title="Cài đặt hệ thống"
              aria-label="Cài đặt"
            >
              <svg
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>

            {/* Nút mở/đóng Lịch sử trò chuyện */}
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
                  Xin chào, bạn là ai?
                </button>
                <button
                  type="button"
                  className="prompt-btn"
                  onClick={() => handleSend('Hãy tóm tắt ngắn gọn vai trò của Asada Sinon.')}
                >
                  Tóm tắt vai trò của Asada Sinon
                </button>
                <button
                  type="button"
                  className="prompt-btn"
                  onClick={() => handleSend('Hôm nay tôi cần quản lý công việc thế nào?')}
                >
                  Quản lý công việc hôm nay
                </button>
              </div>
            </div>
          ) : (
            <div className="chat-messages">
              {/* Mốc thời gian chuẩn Figma */}
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
                              <span className="processing-label">Đang soạn tin...</span>
                            </div>
                          ) : msg.status === 'error' ? (
                            <div className="bubble-error-content">
                              <div className="bubble-error-header">
                                <span className="bubble-error-icon">⚠️</span>
                                {msg.errorCode && (
                                  <span className="bubble-error-code">[{msg.errorCode}]</span>
                                )}
                              </div>
                              <div className="bubble-error-message">
                                {msg.error || 'Đã xảy ra lỗi khi tạo phản hồi.'}
                              </div>
                              <div className="bubble-error-actions">
                                <button
                                  type="button"
                                  className="bubble-retry-btn"
                                  onClick={() => void handleRetryLastMessage()}
                                  title="Thử lại"
                                >
                                  <svg
                                    viewBox="0 0 24 24"
                                    width="12"
                                    height="12"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <polyline points="23 4 23 10 17 10" />
                                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                                  </svg>
                                  <span>Thử lại</span>
                                </button>
                              </div>
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
              {error.code && <span className="error-banner-code">[{error.code}]</span>}
              <span className="error-banner-text">{error.message}</span>
            </div>
            <div className="error-banner-actions">
              <button
                type="button"
                className="error-banner-retry"
                onClick={() => void handleRetryLastMessage()}
                title="Thử lại"
              >
                Thử lại
              </button>
              <button
                type="button"
                className="error-banner-close"
                onClick={() => setError(null)}
                title="Đóng"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Footer / Floating Glass Composer */}
        <footer className="chat-footer">
          <div className="composer-wrapper">
            <div className="composer-glass-panel">
              {/* Hàng 1: Textarea nhập tin nhắn */}
              <textarea
                ref={textareaRef}
                rows={1}
                className="chat-input"
                placeholder={
                  appStatus.state === 'Listening'
                    ? 'Đang lắng nghe giọng nói của bạn...'
                    : 'iMessage (Nhập tin nhắn cho Asada Sinon...)'
                }
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  const target = e.target
                  target.style.height = 'auto'
                  target.style.height = `${Math.min(target.scrollHeight, 120)}px`
                }}
                onKeyDown={handleKeyDown}
                disabled={isGenerating}
              />

              {/* Hàng 2: Toolbar tác vụ (Dấu + và dropup căn trái, Mic và Gửi căn phải) */}
              <div className="composer-toolbar">
                <div className="toolbar-left">
                  {/* Nút + thao tác nhanh (Căn trái) */}
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

                  {/* Nút Drop-up Chế độ hội thoại (Căn trái, chuẩn vector SVG không icon 3D) */}
                  <div className="composer-mode-selector" ref={modeMenuRef}>
                    <button
                      type="button"
                      className="mode-selector-pill"
                      onClick={() => setIsModeMenuOpen((prev) => !prev)}
                      title="Chế độ lưu trữ cuộc trò chuyện"
                      aria-expanded={isModeMenuOpen}
                      aria-haspopup="true"
                    >
                      {persistenceEnabled ? (
                        <svg
                          className="mode-pill-svg"
                          viewBox="0 0 24 24"
                          width="12"
                          height="12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                      ) : (
                        <svg
                          className="mode-pill-svg"
                          viewBox="0 0 24 24"
                          width="12"
                          height="12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                      )}
                      <span className="mode-pill-label">
                        {persistenceEnabled ? 'Lưu lịch sử' : 'Chat tạm thời'}
                      </span>
                      <svg
                        className="mode-pill-chevron"
                        viewBox="0 0 16 16"
                        width="10"
                        height="10"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <polyline points="4 6 8 10 12 6" />
                      </svg>
                    </button>

                    {/* Thẻ Drop-up Menu nhỏ gọn, tối giản 2 options */}
                    {isModeMenuOpen && (
                      <div className="mode-dropup-menu" role="menu">
                        {/* Option 1: Lưu lịch sử */}
                        <button
                          type="button"
                          role="menuitem"
                          className={`dropup-item ${persistenceEnabled ? 'is-selected' : ''}`}
                          onClick={() => {
                            if (!persistenceEnabled) void handleTogglePersistence()
                            setIsModeMenuOpen(false)
                          }}
                        >
                          <div className="dropup-item-left">
                            <svg
                              viewBox="0 0 24 24"
                              width="13"
                              height="13"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                            <span className="dropup-item-label">Lưu lịch sử</span>
                          </div>
                          {persistenceEnabled && (
                            <svg
                              className="dropup-check-svg"
                              viewBox="0 0 24 24"
                              width="13"
                              height="13"
                              fill="none"
                              stroke="#10b981"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>

                        {/* Option 2: Chat tạm thời */}
                        <button
                          type="button"
                          role="menuitem"
                          className={`dropup-item ${!persistenceEnabled ? 'is-selected' : ''}`}
                          onClick={() => {
                            if (persistenceEnabled) void handleTogglePersistence()
                            setIsModeMenuOpen(false)
                          }}
                        >
                          <div className="dropup-item-left">
                            <svg
                              viewBox="0 0 24 24"
                              width="13"
                              height="13"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <circle cx="12" cy="12" r="10" />
                              <polyline points="12 6 12 12 16 14" />
                            </svg>
                            <span className="dropup-item-label">Chat tạm thời</span>
                          </div>
                          {!persistenceEnabled && (
                            <svg
                              className="dropup-check-svg"
                              viewBox="0 0 24 24"
                              width="13"
                              height="13"
                              fill="none"
                              stroke="#10b981"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="toolbar-right">
                  {/* Nút micro dictation (Căn phải) */}
                  <button
                    type="button"
                    className={`composer-action-btn mic-btn ${appStatus.state === 'Listening' ? 'is-listening' : ''}`}
                    onClick={handleToggleMic}
                    title={
                      appStatus.state === 'Listening'
                        ? 'Dừng lắng nghe'
                        : 'Nhập bằng giọng nói (Voice input)'
                    }
                    aria-label={appStatus.state === 'Listening' ? 'Dừng lắng nghe' : 'Micro'}
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

                  {/* Nút gửi phong cách Hologram Emerald Apple (Căn phải) */}
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
            </div>
          </div>
        </footer>
      </section>

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
