/**
 * Định nghĩa 5 trạng thái vận hành chuẩn của ứng dụng PVA (Nhiệm vụ 6):
 * - Idle: Trợ lý ở trạng thái nghỉ, sẵn sàng nhận lệnh mới.
 * - Listening: Đang lắng nghe âm thanh/giọng nói từ micro (STT/Voice input).
 * - Processing: Đang suy nghĩ, điều phối intent, gọi mô hình AI hoặc truy vấn CSDL.
 * - Speaking: Đang phát âm thanh, tổng hợp giọng nói (TTS) hoặc stream câu trả lời.
 * - Error: Gặp sự cố (mất kết nối Ollama, timeout, CSDL không khả dụng, v.v.).
 */
export type AppState = 'Idle' | 'Listening' | 'Processing' | 'Speaking' | 'Error'

export interface AppStatusInfo {
  state: AppState
  label: string
  detail?: string
  errorCode?: string
  updatedAt: number
}

export const STATE_LABELS: Record<AppState, string> = {
  Idle: 'Sẵn sàng',
  Listening: 'Đang lắng nghe...',
  Processing: 'Đang xử lý...',
  Speaking: 'Đang trả lời...',
  Error: 'Báo lỗi'
}

export const STATE_SUBTITLES: Record<AppState, string> = {
  Idle: 'Trợ lý ảo thông minh · Sẵn sàng',
  Listening: 'Đang lắng nghe bạn nói...',
  Processing: 'Đang suy nghĩ & phân tích...',
  Speaking: 'Đang phản hồi...',
  Error: 'Ngoại tuyến / Lỗi hệ thống'
}
