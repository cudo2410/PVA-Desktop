import type { StandardErrorCode } from '../models/ModelError'

export type SttErrorCode =
  | 'STT_UNAVAILABLE'
  | 'STT_TIMEOUT'
  | 'STT_MODEL_MISSING'
  | 'STT_INVALID_AUDIO'
  | 'STT_PROCESS_ERROR'

export interface SttSegment {
  readonly startMs: number
  readonly endMs: number
  readonly text: string
}

export interface SttOptions {
  readonly language?: string
  readonly threads?: number
  readonly timeoutMs?: number
  readonly prompt?: string
  readonly beamSize?: number
}

export interface SttResult {
  readonly text: string
  readonly durationMs: number
  readonly audioDurationMs?: number
  readonly language: string
  readonly segments?: readonly SttSegment[]
}

export interface SttHealth {
  readonly ok: boolean
  readonly engine: string
  readonly modelName?: string
  readonly code?: SttErrorCode | StandardErrorCode
  readonly reason?: string
}

export interface SpeechToText {
  health(): Promise<SttHealth>
  transcribeFile(wavFilePath: string, opts?: Partial<SttOptions>): Promise<SttResult>
  transcribeBuffer(pcm16kMono: Uint8Array, opts?: Partial<SttOptions>): Promise<SttResult>
}
