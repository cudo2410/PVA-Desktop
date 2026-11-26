/**
 * Phát âm thanh thông báo tùy chỉnh của PVA (chuông pha lê 2 nốt dịu tai bằng Web Audio API).
 * Hoạt động 100% cục bộ, không cần file ngoài hay thư viện bên thứ ba.
 */

let sharedAudioContext: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null

  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new Ctor()
  }
  return sharedAudioContext
}

export function playNotificationChime(): void {
  try {
    const ctx = getAudioContext()
    if (!ctx) return

    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {})
    }

    const now = ctx.currentTime

    // Hợp âm 2 nốt thanh thoát (E6 -> B6) + hòa âm nhẹ
    const notes: Array<{ freq: number; start: number; duration: number; gain: number }> = [
      { freq: 1318.51, start: 0, duration: 0.34, gain: 0.14 },
      { freq: 2637.02, start: 0, duration: 0.22, gain: 0.045 },
      { freq: 1975.53, start: 0.11, duration: 0.44, gain: 0.13 },
      { freq: 3951.07, start: 0.11, duration: 0.26, gain: 0.035 }
    ]

    for (const note of notes) {
      const osc = ctx.createOscillator()
      const gainNode = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(note.freq, now + note.start)

      gainNode.gain.setValueAtTime(0.0001, now + note.start)
      gainNode.gain.exponentialRampToValueAtTime(note.gain, now + note.start + 0.018)
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.duration)

      osc.connect(gainNode)
      gainNode.connect(ctx.destination)

      osc.start(now + note.start)
      osc.stop(now + note.start + note.duration + 0.02)
    }
  } catch {
    // Bỏ qua lặng lẽ nếu môi trường không hỗ trợ Web Audio
  }
}
