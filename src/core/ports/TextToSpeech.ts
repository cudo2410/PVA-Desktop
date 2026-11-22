import type { StandardErrorCode } from '../models/ModelError'

export type TtsErrorCode =
  'TTS_UNAVAILABLE' | 'TTS_VOICE_NOT_FOUND' | 'TTS_TIMEOUT' | 'TTS_SYNTHESIS_ERROR'

export interface TtsVoice {
  readonly id: string
  readonly name: string
  readonly language: string
  readonly engine: 'piper' | 'windows' | 'custom'
  readonly gender?: 'female' | 'male' | 'neutral'
}

export interface TtsOptions {
  readonly voiceId?: string
  readonly rate?: number
  readonly volume?: number
  readonly outputPath?: string
  readonly timeoutMs?: number
}

export interface TtsResult {
  readonly audioPath?: string
  readonly audioBuffer?: Uint8Array
  readonly sampleRate?: number
  readonly durationMs: number
  readonly voiceId: string
}

export interface TtsHealth {
  readonly ok: boolean
  readonly engine: string
  readonly availableVoices?: number
  readonly code?: TtsErrorCode | StandardErrorCode
  readonly reason?: string
}

export interface TextToSpeech {
  health(): Promise<TtsHealth>
  listVoices(): Promise<readonly TtsVoice[]>
  synthesize(text: string, opts?: Partial<TtsOptions>): Promise<TtsResult>
  stop(): Promise<void>
}
