import { describe, it, expect } from 'vitest'
import {
  AppError,
  ModelError,
  DatabaseError,
  ERROR_MESSAGES,
  StandardErrorCode
} from './ModelError'

describe('Standard Error Codes & Hierarchy', () => {
  it('hỗ trợ 4 mã lỗi tiêu chuẩn quy định trong Nhiệm vụ 5', () => {
    const codes: StandardErrorCode[] = [
      'MODEL_UNAVAILABLE',
      'MODEL_TIMEOUT',
      'MODEL_BAD_RESPONSE',
      'DB_UNAVAILABLE'
    ]

    for (const code of codes) {
      expect(ERROR_MESSAGES[code]).toBeDefined()
      expect(typeof ERROR_MESSAGES[code]).toBe('string')
    }
  })

  it('ModelError kế thừa từ AppError và Error với đúng mã code', () => {
    const err = new ModelError('MODEL_UNAVAILABLE', 'Ollama offline')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(AppError)
    expect(err).toBeInstanceOf(ModelError)
    expect(err.code).toBe('MODEL_UNAVAILABLE')
    expect(err.message).toBe('Ollama offline')
    expect(err.name).toBe('ModelError')
  })

  it('DatabaseError kế thừa từ AppError với mã DB_UNAVAILABLE', () => {
    const err = new DatabaseError('SQLite locked')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(AppError)
    expect(err).toBeInstanceOf(DatabaseError)
    expect(err.code).toBe('DB_UNAVAILABLE')
    expect(err.message).toBe('SQLite locked')
    expect(err.name).toBe('DatabaseError')
  })
})
