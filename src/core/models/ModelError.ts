export type StandardErrorCode =
  'MODEL_UNAVAILABLE' | 'MODEL_TIMEOUT' | 'MODEL_BAD_RESPONSE' | 'DB_UNAVAILABLE'

export type ModelErrorCode = StandardErrorCode

export class AppError extends Error {
  public readonly code: StandardErrorCode

  constructor(code: StandardErrorCode, message: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
    Object.setPrototypeOf(this, AppError.prototype)
  }
}

export class ModelError extends AppError {
  constructor(code: StandardErrorCode, message: string) {
    super(code, message)
    this.name = 'ModelError'
    Object.setPrototypeOf(this, ModelError.prototype)
  }
}

export class DatabaseError extends AppError {
  constructor(message: string) {
    super('DB_UNAVAILABLE', message)
    this.name = 'DatabaseError'
    Object.setPrototypeOf(this, DatabaseError.prototype)
  }
}

export type DomainErrorCode = 'INVALID_INPUT' | 'NOT_FOUND'

export class ValidationError extends Error {
  public readonly code: DomainErrorCode = 'INVALID_INPUT'

  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
    Object.setPrototypeOf(this, ValidationError.prototype)
  }
}

export class NotFoundError extends Error {
  public readonly code: DomainErrorCode = 'NOT_FOUND'

  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
    Object.setPrototypeOf(this, NotFoundError.prototype)
  }
}

export const ERROR_MESSAGES: Record<StandardErrorCode, string> = {
  MODEL_UNAVAILABLE:
    'Không thể kết nối đến máy chủ Ollama. Vui lòng đảm bảo Ollama đang chạy trên máy tính của bạn.',
  MODEL_TIMEOUT: 'Quá thời gian chờ phản hồi từ mô hình AI (timeout). Vui lòng thử lại.',
  MODEL_BAD_RESPONSE:
    'Mô hình phản hồi không đúng cấu trúc hoặc máy chủ Ollama trả về dữ liệu không hợp lệ.',
  DB_UNAVAILABLE: 'Cơ sở dữ liệu SQLite hiện không khả dụng. Không thể lưu hoặc đọc lịch sử.'
}
