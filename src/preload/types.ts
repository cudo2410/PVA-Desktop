import type { CreateTaskInput, Task, TaskListOptions, UpdateTaskInput } from '../core/models/Task'
import type { CreateReminderInput, Reminder, ReminderStateFilter } from '../core/models/Reminder'
import type { NotificationPayload } from '../core/ports/Notifier'

export type StandardErrorCode =
  'MODEL_UNAVAILABLE' | 'MODEL_TIMEOUT' | 'MODEL_BAD_RESPONSE' | 'DB_UNAVAILABLE'

export interface ChatSendResponse {
  success: boolean
  text?: string
  code?: StandardErrorCode | string
  error?: string
}

export type ChatHealthStatus = 'healthy' | 'starting' | 'unhealthy' | 'model_missing'

export interface ChatHealthResponse {
  ok: boolean
  status?: ChatHealthStatus
  code?: StandardErrorCode
  reason?: string
}

export interface ChatStreamCallbacks {
  onChunk: (chunk: string) => void
  onComplete: (fullText: string) => void
  onError: (error: { code?: StandardErrorCode | string; message: string }) => void
}

export interface HistoryMessageItem {
  id: number
  conversationId: number
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
}

export interface ChatHistoryResponse {
  success: boolean
  messages?: HistoryMessageItem[]
  error?: string
}

export interface ChatPersistenceResponse {
  success: boolean
  enabled?: boolean
  error?: string
}

export interface ConversationItem {
  id: number
  title: string
  createdAt: string
  messageCount?: number
  lastMessage?: string
}

export interface ConversationListResponse {
  success: boolean
  conversations?: ConversationItem[]
  error?: string
}

export interface ConversationDetailResponse {
  success: boolean
  messages?: HistoryMessageItem[]
  error?: string
}

export interface ConversationActionResponse {
  success: boolean
  conversation?: ConversationItem
  error?: string
}

export interface TaskListResponse {
  success: boolean
  tasks?: Task[]
  code?: string
  error?: string
}

export interface TaskActionResponse {
  success: boolean
  task?: Task
  code?: string
  error?: string
}

export interface ReminderListResponse {
  success: boolean
  reminders?: Reminder[]
  code?: string
  error?: string
}

export interface ReminderActionResponse {
  success: boolean
  reminder?: Reminder
  code?: string
  error?: string
}

export interface MiniWidgetBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface PvaApi {
  chat: {
    send(content: string): Promise<ChatSendResponse>
    health(): Promise<ChatHealthResponse>
    startModel?(): Promise<{ success: boolean; error?: string }>
    onModelStatus?(callback: (status: ChatHealthResponse) => void): () => void
    stream(content: string, callbacks: ChatStreamCallbacks): () => void
    loadHistory(): Promise<ChatHistoryResponse>
    getPersistence(): Promise<ChatPersistenceResponse>
    setPersistence(enabled: boolean): Promise<ChatPersistenceResponse>
    clearHistory(): Promise<{ success: boolean; error?: string }>
    listConversations(): Promise<ConversationListResponse>
    getConversation(conversationId: number): Promise<ConversationDetailResponse>
    switchConversation(conversationId: number): Promise<ConversationDetailResponse>
    createConversation(title?: string): Promise<ConversationActionResponse>
    deleteConversation(conversationId: number): Promise<{ success: boolean; error?: string }>
  }
  tasks: {
    list(options?: TaskListOptions): Promise<TaskListResponse>
    create(input: CreateTaskInput): Promise<TaskActionResponse>
    update(id: number, input: UpdateTaskInput): Promise<TaskActionResponse>
    toggle(id: number): Promise<TaskActionResponse>
    delete(id: number): Promise<{ success: boolean; code?: string; error?: string }>
    onUpdated(callback: () => void): () => void
  }
  reminders: {
    list(state?: ReminderStateFilter): Promise<ReminderListResponse>
    create(input: CreateReminderInput): Promise<ReminderActionResponse>
    cancel(id: number): Promise<ReminderActionResponse>
    delete(id: number): Promise<{ success: boolean; code?: string; error?: string }>
    onFired(callback: (payload: NotificationPayload) => void): () => void
    onUpdated(callback: () => void): () => void
    onPlaySound(callback: () => void): () => void
    onOpenDrawer(callback: () => void): () => void
    onOverlayToast(callback: (payload: NotificationPayload) => void): () => void
    openFromToast(openTasksDrawer?: boolean): void
    notifyOverlayEmpty(): void
    setOverlayMouseIgnore(ignore: boolean): void
  }
  window: {
    restoreFromMini(): void
    hideMiniToTray(): void
    getMiniBounds(): Promise<MiniWidgetBounds | null>
    resizeMini(bounds: MiniWidgetBounds): void
    onMiniVisibility(callback: (visible: boolean) => void): () => void
  }
}
