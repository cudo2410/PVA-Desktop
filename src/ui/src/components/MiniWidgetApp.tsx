import React, { useCallback, useEffect, useRef, useState } from 'react'
import sinonVideo from '../assets/video.mp4'
import './TasksDrawer.css'

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const RESIZE_DIRS: ResizeDir[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
const MINI_MIN_WIDTH = 220
const MINI_MAX_WIDTH = 680
const MINI_MIN_HEIGHT = 148
const MINI_MAX_HEIGHT = 460

function clampValue(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

/**
 * Giao diện cửa sổ thu nhỏ nổi kiểu Microsoft Teams (hash #mini-widget).
 * Hiển thị Asada Sinon dạng khung Matte Gravity Glass có thể kéo di chuyển và kéo giãn trực tiếp
 * từ viền khung, kèm nút phóng to về cửa sổ chính và nút ẩn hoàn toàn xuống khay hệ thống.
 */
export function MiniWidgetApp(): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [isReady, setIsReady] = useState<boolean>(false)
  const [isVisible, setIsVisible] = useState<boolean>(false)

  useEffect(() => {
    document.documentElement.classList.add('is-toast-overlay')
    return (): void => {
      document.documentElement.classList.remove('is-toast-overlay')
    }
  }, [])

  useEffect(() => {
    let rafId: number | null = null
    const unsubscribe = window.api?.window?.onMiniVisibility?.((visible) => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      if (visible) {
        rafId = requestAnimationFrame(() => {
          rafId = null
          setIsVisible(true)
        })
      } else {
        setIsVisible(false)
      }
    })
    return (): void => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
      unsubscribe?.()
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const syncPlayback = (): void => {
      if (!isVisible || document.visibilityState === 'hidden') {
        if (!video.paused) {
          video.pause()
        }
      } else if (video.paused || video.ended) {
        void video.play().catch(() => {})
      }
    }

    syncPlayback()
    document.addEventListener('visibilitychange', syncPlayback)
    return (): void => {
      document.removeEventListener('visibilitychange', syncPlayback)
    }
  }, [isVisible])

  const handleRestore = useCallback((): void => {
    window.api?.window?.restoreFromMini?.()
  }, [])

  const handleHideToTray = useCallback((): void => {
    window.api?.window?.hideMiniToTray?.()
  }, [])

  const handleResizePointerDown = useCallback(
    (dir: ResizeDir) =>
      (e: React.PointerEvent<HTMLDivElement>): void => {
        if (e.button !== 0) return
        e.preventDefault()
        e.stopPropagation()

        const handleEl = e.currentTarget
        const pointerId = e.pointerId
        const startScreenX = e.screenX
        const startScreenY = e.screenY
        let isEnded = false
        let startBounds: { x: number; y: number; width: number; height: number } | null = null

        try {
          handleEl.setPointerCapture(pointerId)
        } catch {
          // Bỏ qua nếu trình duyệt không hỗ trợ capture trên phần tử này
        }

        const onPointerMove = (moveEvent: PointerEvent): void => {
          if (isEnded || !startBounds) return
          const dx = moveEvent.screenX - startScreenX
          const dy = moveEvent.screenY - startScreenY

          let nextX = startBounds.x
          let nextY = startBounds.y
          let nextWidth = startBounds.width
          let nextHeight = startBounds.height

          if (dir.includes('e')) {
            nextWidth = clampValue(startBounds.width + dx, MINI_MIN_WIDTH, MINI_MAX_WIDTH)
          }
          if (dir.includes('w')) {
            nextWidth = clampValue(startBounds.width - dx, MINI_MIN_WIDTH, MINI_MAX_WIDTH)
            nextX = startBounds.x + (startBounds.width - nextWidth)
          }
          if (dir.includes('s')) {
            nextHeight = clampValue(startBounds.height + dy, MINI_MIN_HEIGHT, MINI_MAX_HEIGHT)
          }
          if (dir.includes('n')) {
            nextHeight = clampValue(startBounds.height - dy, MINI_MIN_HEIGHT, MINI_MAX_HEIGHT)
            nextY = startBounds.y + (startBounds.height - nextHeight)
          }

          window.api?.window?.resizeMini?.({
            x: nextX,
            y: nextY,
            width: nextWidth,
            height: nextHeight
          })
        }

        const cleanup = (): void => {
          isEnded = true
          window.removeEventListener('pointermove', onPointerMove)
          window.removeEventListener('pointerup', cleanup)
          window.removeEventListener('pointercancel', cleanup)
          try {
            if (handleEl.hasPointerCapture(pointerId)) {
              handleEl.releasePointerCapture(pointerId)
            }
          } catch {
            // Bỏ qua
          }
        }

        window.addEventListener('pointermove', onPointerMove)
        window.addEventListener('pointerup', cleanup)
        window.addEventListener('pointercancel', cleanup)

        void window.api?.window?.getMiniBounds?.().then((bounds) => {
          if (!isEnded && bounds) {
            startBounds = bounds
          }
        })
      },
    []
  )

  return (
    <div className="mini-widget-shell">
      <div className={`mini-widget-frame ${isVisible ? 'is-visible' : ''}`}>
        <div className="mini-widget-card" role="region" aria-label="Cửa sổ thu nhỏ Asada Sinon">
          <video
            ref={videoRef}
            src={sinonVideo}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            onLoadedData={() => setIsReady(true)}
            onPlaying={() => setIsReady(true)}
            className={`mini-widget-video ${isReady ? 'is-ready' : ''}`}
          />

          <div className="mini-widget-vignette" aria-hidden="true" />

          <div className="mini-widget-controls">
            <button
              type="button"
              className="mini-widget-btn"
              onClick={handleRestore}
              title="Mở lại cửa sổ PVA"
              aria-label="Mở lại cửa sổ PVA"
            >
              <svg className="mini-widget-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M9.5 2.5H13.5V6.5M6.5 13.5H2.5V9.5M13.25 2.75L9 7M2.75 13.25L7 9"
                  stroke="currentColor"
                  strokeWidth="1.65"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              className="mini-widget-btn is-danger"
              onClick={handleHideToTray}
              title="Ẩn hoàn toàn xuống khay hệ thống"
              aria-label="Ẩn hoàn toàn xuống khay hệ thống"
            >
              <svg className="mini-widget-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M4 4L12 12M12 4L4 12"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          <div className="mini-widget-footer">
            <button
              type="button"
              className="mini-widget-identity"
              onClick={handleRestore}
              title="Nhấn để mở lại PVA"
            >
              <span className="mini-widget-dot" aria-hidden="true" />
              <span className="mini-widget-name">Asada Sinon</span>
            </button>
          </div>
        </div>

        {/* 8 vùng nắm kéo resize vô hình bám đúng viền khung card */}
        {RESIZE_DIRS.map((dir) => (
          <div
            key={dir}
            className={`mini-widget-resize-handle is-${dir}`}
            onPointerDown={handleResizePointerDown(dir)}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  )
}
