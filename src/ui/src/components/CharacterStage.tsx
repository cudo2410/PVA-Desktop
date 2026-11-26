import React, { useEffect, useRef, useState } from 'react'
import sinonVideo from '../assets/video.mp4'
import type { AppStatusInfo } from '../../../core/models/AppStatus'

interface CharacterStageProps {
  status: AppStatusInfo
}

const CharacterStageInner: React.FC<CharacterStageProps> = ({ status }) => {
  const videoRefA = useRef<HTMLVideoElement | null>(null)
  const videoRefB = useRef<HTMLVideoElement | null>(null)
  const [activeVideo, setActiveVideo] = useState<'A' | 'B'>('A')
  const [isReady, setIsReady] = useState<boolean>(false)
  const activeVideoRef = useRef<'A' | 'B'>('A')
  const [isCrossfading, setIsCrossfading] = useState<boolean>(false)
  const crossfadeTriggeredRef = useRef<boolean>(false)
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Chạy 1 lần khi mount: chỉ giữ 1 bộ giải mã chạy ở trạng thái ổn định, tự phục hồi khi mở lại từ khay hệ thống
  useEffect(() => {
    const vidA = videoRefA.current
    const vidB = videoRefB.current
    if (!vidA || !vidB) return

    const ensurePlaying = (video: HTMLVideoElement): void => {
      if (document.visibilityState === 'hidden') return
      if (video.error || video.readyState === 0) {
        video.load()
      }
      if (video.paused || video.ended) {
        void video.play().catch(() => {})
      }
    }

    const ensureActivePlaying = (): void => {
      const current = activeVideoRef.current === 'A' ? vidA : vidB
      ensurePlaying(current)
    }

    // Tránh reset currentTime = 0 nếu vidA đã đang chạy (chống AbortError trong React StrictMode)
    if (vidA.paused) {
      void vidA.play().catch(() => {})
    }

    const checkTime = (): void => {
      if (document.visibilityState === 'hidden') return

      const currentKey = activeVideoRef.current
      const current = currentKey === 'A' ? vidA : vidB
      const next = currentKey === 'A' ? vidB : vidA

      if (current.paused || current.ended) {
        ensurePlaying(current)
      }

      if (!current.duration || Number.isNaN(current.duration)) return

      const timeLeft = current.duration - current.currentTime
      // Khi thời gian còn lại <= 0.55s, chuyển mượt sang video dự phòng rồi dừng video cũ sau crossfade
      if (timeLeft <= 0.55 && !crossfadeTriggeredRef.current) {
        crossfadeTriggeredRef.current = true
        setIsCrossfading(true)
        next.currentTime = 0
        void next.play().catch(() => {})

        const prevVideo = current
        const nextKey: 'A' | 'B' = currentKey === 'A' ? 'B' : 'A'
        activeVideoRef.current = nextKey
        setActiveVideo(nextKey)

        if (flashTimeoutRef.current) {
          clearTimeout(flashTimeoutRef.current)
        }
        flashTimeoutRef.current = setTimeout(() => {
          setIsCrossfading(false)
          // Dừng video đã ẩn để luôn chỉ chạy 1 bộ giải mã phần cứng ở trạng thái ổn định
          if (activeVideoRef.current !== currentKey && !prevVideo.paused) {
            prevVideo.pause()
          }
        }, 580)
      } else if (timeLeft > 1.0) {
        crossfadeTriggeredRef.current = false
      }
    }

    const handleVisibilityOrFocus = (): void => {
      if (document.visibilityState === 'hidden') {
        if (!vidA.paused) {
          vidA.pause()
        }
        if (!vidB.paused) {
          vidB.pause()
        }
        return
      }
      if (document.visibilityState === 'visible') {
        ensureActivePlaying()
      }
    }

    const handleVideoRecover = (video: HTMLVideoElement, key: 'A' | 'B'): (() => void) => {
      return () => {
        if (activeVideoRef.current === key) {
          ensurePlaying(video)
        }
      }
    }

    const recoverA = handleVideoRecover(vidA, 'A')
    const recoverB = handleVideoRecover(vidB, 'B')

    document.addEventListener('visibilitychange', handleVisibilityOrFocus)
    window.addEventListener('focus', handleVisibilityOrFocus)
    vidA.addEventListener('canplay', recoverA)
    vidA.addEventListener('stalled', recoverA)
    vidA.addEventListener('error', recoverA)
    vidA.addEventListener('ended', recoverA)
    vidB.addEventListener('canplay', recoverB)
    vidB.addEventListener('stalled', recoverB)
    vidB.addEventListener('error', recoverB)
    vidB.addEventListener('ended', recoverB)

    const timer = setInterval(checkTime, 120)
    return (): void => {
      clearInterval(timer)
      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current)
        flashTimeoutRef.current = null
      }
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus)
      window.removeEventListener('focus', handleVisibilityOrFocus)
      vidA.removeEventListener('canplay', recoverA)
      vidA.removeEventListener('stalled', recoverA)
      vidA.removeEventListener('error', recoverA)
      vidA.removeEventListener('ended', recoverA)
      vidB.removeEventListener('canplay', recoverB)
      vidB.removeEventListener('stalled', recoverB)
      vidB.removeEventListener('error', recoverB)
      vidB.removeEventListener('ended', recoverB)
    }
  }, [])

  const isInteracting = status.state === 'Listening' || status.state === 'Speaking'

  return (
    <div
      className={`character-stage ${isInteracting ? 'is-interacting' : ''} ${isCrossfading ? 'is-crossfading' : ''}`}
      aria-hidden="true"
    >
      <video
        ref={videoRefA}
        src={sinonVideo}
        autoPlay
        muted
        playsInline
        preload="auto"
        onLoadedData={() => setIsReady(true)}
        onPlaying={() => setIsReady(true)}
        className={`character-video video-a ${isReady && activeVideo === 'A' ? 'video-active' : 'video-inactive'}`}
      />
      <video
        ref={videoRefB}
        src={sinonVideo}
        muted
        playsInline
        preload="auto"
        className={`character-video video-b ${isReady && activeVideo === 'B' ? 'video-active' : 'video-inactive'}`}
      />
      {/* Lớp chớp sáng hòa trộn nhẹ khi chuyển giao vòng lặp */}
      <div className={`stage-capcut-flash ${isCrossfading ? 'flash-active' : ''}`} />
      {/* Lớp mặt nạ Gradient chuyển tiếp mềm xuống nền tối */}
      <div className="stage-vignette" />
      {/* Quầng sáng Hologram Emerald phản ứng theo trạng thái */}
      <div className="stage-ambient-glow" />
    </div>
  )
}

export const CharacterStage = React.memo(
  CharacterStageInner,
  (prev, next) => prev.status.state === next.status.state
)
