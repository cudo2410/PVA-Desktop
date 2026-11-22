import { describe, it, expect } from 'vitest'
import type { SpeechToText, SttHealth, SttResult } from './SpeechToText'
import type { TextToSpeech, TtsHealth, TtsResult, TtsVoice } from './TextToSpeech'

class FakeSpeechToText implements SpeechToText {
  private available = true

  setAvailable(value: boolean): void {
    this.available = value
  }

  async health(): Promise<SttHealth> {
    if (!this.available) {
      return {
        ok: false,
        engine: 'fake-stt',
        code: 'STT_UNAVAILABLE',
        reason: 'STT engine offline'
      }
    }
    return { ok: true, engine: 'fake-stt', modelName: 'phowhisper-small-ggml' }
  }

  async transcribeFile(wavFilePath: string): Promise<SttResult> {
    if (!wavFilePath.endsWith('.wav')) {
      throw new Error('Invalid wav path')
    }
    return {
      text: 'Mở trình duyệt Google Chrome',
      durationMs: 850,
      audioDurationMs: 2760,
      language: 'vi'
    }
  }

  async transcribeBuffer(pcm16kMono: Uint8Array): Promise<SttResult> {
    return {
      text: pcm16kMono.byteLength > 0 ? 'Xin chào' : '',
      durationMs: 420,
      language: 'vi'
    }
  }
}

class FakeTextToSpeech implements TextToSpeech {
  private stopped = false

  async health(): Promise<TtsHealth> {
    return { ok: true, engine: 'fake-tts', availableVoices: 1 }
  }

  async listVoices(): Promise<readonly TtsVoice[]> {
    return [
      {
        id: 'vi_VN-vais1000-medium',
        name: 'Piper VAIS-1000 Medium',
        language: 'vi-VN',
        engine: 'piper',
        gender: 'female'
      }
    ]
  }

  async synthesize(text: string): Promise<TtsResult> {
    this.stopped = false
    return {
      audioBuffer: new Uint8Array(text.length * 4),
      sampleRate: 22050,
      durationMs: 180,
      voiceId: 'vi_VN-vais1000-medium'
    }
  }

  async stop(): Promise<void> {
    this.stopped = true
  }

  isStopped(): boolean {
    return this.stopped
  }
}

describe('Voice Ports Contracts (SpeechToText & TextToSpeech)', () => {
  it('supports SpeechToText health check and transcription contracts', async () => {
    const stt = new FakeSpeechToText()
    expect((await stt.health()).ok).toBe(true)

    const fileResult = await stt.transcribeFile('cmd_01.wav')
    expect(fileResult.text).toBe('Mở trình duyệt Google Chrome')
    expect(fileResult.language).toBe('vi')
    expect(fileResult.durationMs).toBeGreaterThan(0)

    const bufResult = await stt.transcribeBuffer(new Uint8Array([1, 2, 3, 4]))
    expect(bufResult.text).toBe('Xin chào')

    stt.setAvailable(false)
    const unhealthy = await stt.health()
    expect(unhealthy.ok).toBe(false)
    expect(unhealthy.code).toBe('STT_UNAVAILABLE')
  })

  it('supports TextToSpeech voice listing, synthesis, and stop contracts', async () => {
    const tts = new FakeTextToSpeech()
    expect((await tts.health()).ok).toBe(true)

    const voices = await tts.listVoices()
    expect(voices).toHaveLength(1)
    expect(voices[0].language).toBe('vi-VN')

    const result = await tts.synthesize('Chào bạn, hôm nay tôi có thể giúp gì?')
    expect(result.voiceId).toBe('vi_VN-vais1000-medium')
    expect(result.audioBuffer?.byteLength).toBeGreaterThan(0)

    await tts.stop()
    expect(tts.isStopped()).toBe(true)
  })
})
