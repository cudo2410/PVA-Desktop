import React, { useEffect, useRef, useState } from 'react'
import sinonVideo from '../assets/video.mp4'
import type { AppStatusInfo } from '../../../core/models/AppStatus'

interface CharacterStageProps {
  status: AppStatusInfo
}

export const CharacterStage: React.FC<CharacterStageProps> = ({ status }) => {
  const videoRefA = useRef<HTMLVideoElement | null>(null)
  const videoRefB = useRef<HTMLVideoElement | null>(null)
  const [activeVideo, setActiveVideo] = useState<'A' | 'B'>('A')
  const [isCrossfading, setIsCrossfading] = useState<boolean>(false)
  const crossfadeTriggeredRef = useRef<boolean>(false)

  // Hiệu ứng chuyển tiếp kết hợp phong cách CapCut (Zoom nhẹ + Gaussian Blur Dissolve + Hologram Light Flash)
  useEffect(() => {
    const vidA = videoRefA.current
    const vidB = videoRefB.current
    if (!vidA || !vidB) return

    vidA.currentTime = 0
    vidB.currentTime = 0
    void vidA.play().catch(() => {})

    const checkTime = (): void => {
      const current = activeVideo === 'A' ? vidA : vidB
      const next = activeVideo === 'A' ? vidB : vidA

      if (!current.duration || isNaN(current.duration)) return

      const timeLeft = current.duration - current.currentTime
      // Khi thời gian còn lại <= 0.55s, kích hoạt chuyển tiếp kết hợp CapCut giữa 2 video
      if (timeLeft <= 0.55 && !crossfadeTriggeredRef.current) {
        crossfadeTriggeredRef.current = true
        setIsCrossfading(true)
        next.currentTime = 0
        void next.play().catch(() => {})
        setActiveVideo(activeVideo === 'A' ? 'B' : 'A')

        setTimeout(() => {
          setIsCrossfading(false)
        }, 550)
      } else if (timeLeft > 1.0) {
        crossfadeTriggeredRef.current = false
      }
    }

    const timer = setInterval(checkTime, 100)
    return () => clearInterval(timer)
  }, [activeVideo])

  const isInteracting = status.state === 'Listening' || status.state === 'Speaking'

  return (
    <div
      className={`character-stage ${isInteracting ? 'is-interacting' : ''} ${isCrossfading ? 'is-crossfading' : ''}`}
      aria-hidden="true"
    >
      <video
        ref={videoRefA}
        src={sinonVideo}
        muted
        playsInline
        preload="auto"
        className={`character-video video-a ${activeVideo === 'A' ? 'video-active' : 'video-inactive'}`}
      />
      <video
        ref={videoRefB}
        src={sinonVideo}
        muted
        playsInline
        preload="auto"
        className={`character-video video-b ${activeVideo === 'B' ? 'video-active' : 'video-inactive'}`}
      />
      {/* Lớp chớp sáng hòa trộn Hologram CapCut khi chuyển giao vòng lặp */}
      <div className={`stage-capcut-flash ${isCrossfading ? 'flash-active' : ''}`} />
      {/* Lớp mặt nạ Gradient chuyển tiếp mềm xuống nền tối */}
      <div className="stage-vignette" />
      {/* Quầng sáng Hologram Emerald phản ứng theo trạng thái */}
      <div className="stage-ambient-glow" />
    </div>
  )
}
