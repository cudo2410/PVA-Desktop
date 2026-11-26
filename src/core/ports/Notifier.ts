export interface NotificationPayload {
  reminderId?: number
  taskId?: number | null
  title: string
  body: string
  firedAt: string
}

/**
 * Port gửi thông báo tới hệ điều hành & giao diện người dùng.
 * Cho phép Core Service không phụ thuộc trực tiếp vào Electron Notification / IPC.
 */
export interface Notifier {
  notify(payload: NotificationPayload): void
}
