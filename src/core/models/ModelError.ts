export type ModelErrorCode = 'MODEL_UNAVAILABLE' | 'MODEL_TIMEOUT' | 'MODEL_BAD_RESPONSE'

export class ModelError extends Error {
  public readonly code: ModelErrorCode

  constructor(code: ModelErrorCode, message: string) {
    super(message)
    this.name = 'ModelError'
    this.code = code
    Object.setPrototypeOf(this, ModelError.prototype)
  }
}
