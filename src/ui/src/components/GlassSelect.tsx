import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './GlassControls.css'

export interface GlassSelectOption<T extends string> {
  value: T
  label: string
  description?: string
}

export interface GlassSelectProps<T extends string> {
  value: T
  options: readonly GlassSelectOption<T>[]
  onChange: (value: T) => void
  ariaLabel: string
  prefixIcon?: React.ReactNode
  prefixLabel?: string
  accentTone?: 'emerald' | 'purple' | 'danger' | 'neutral'
  compact?: boolean
  menuWidth?: number
  align?: 'left' | 'right'
}

export function GlassSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  prefixIcon,
  prefixLabel,
  accentTone = 'neutral',
  compact = false,
  menuWidth,
  align = 'right'
}: GlassSelectProps<T>): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const [rendered, setRendered] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 180
  })

  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((opt) => opt.value === value) ?? options[0]

  const closeMenu = (): void => {
    if (!isOpen) return
    setIsOpen(false)
    if (rendered) {
      setIsClosing(true)
    }
  }

  const toggleMenu = (): void => {
    if (isOpen) {
      closeMenu()
      return
    }
    setRendered(true)
    setIsClosing(false)
    setIsOpen(true)
  }

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const responsiveMin = Math.round(Math.min(240, Math.max(168, window.innerWidth * 0.16)))
    const targetWidth = Math.max(menuWidth ?? 0, rect.width, responsiveMin)
    const estimatedHeight = Math.min(options.length * 44 + 16, window.innerHeight * 0.45)
    const spaceBelow = window.innerHeight - rect.bottom - 12
    const openUp = spaceBelow < estimatedHeight && rect.top > estimatedHeight

    const top = openUp
      ? Math.max(10, rect.top - estimatedHeight - 6)
      : Math.min(window.innerHeight - estimatedHeight - 10, rect.bottom + 6)
    const preferredLeft = align === 'left' ? rect.left : rect.right - targetWidth
    const left = Math.max(10, Math.min(window.innerWidth - targetWidth - 10, preferredLeft))

    setCoords({ top, left, width: targetWidth })
  }, [isOpen, rendered, menuWidth, options.length, align])

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (e: MouseEvent): void => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return
      }
      setIsOpen(false)
      setIsClosing(true)
    }

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setIsOpen(false)
        setIsClosing(true)
        triggerRef.current?.focus()
      }
    }

    const handleResize = (): void => {
      setIsOpen(false)
      setIsClosing(true)
    }

    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleResize)
    return (): void => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleResize)
    }
  }, [isOpen])

  const handleMenuAnimationEnd = (e: React.AnimationEvent): void => {
    if (e.target === e.currentTarget && isClosing) {
      setRendered(false)
      setIsClosing(false)
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`glass-select-trigger tone-${accentTone} ${compact ? 'is-compact' : ''} ${isOpen ? 'is-open' : ''}`}
        onClick={toggleMenu}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {prefixIcon && <span className="glass-select-icon">{prefixIcon}</span>}
        <span className="glass-select-label">
          {prefixLabel ? `${prefixLabel}: ` : ''}
          {selectedOption?.label ?? ''}
        </span>
        <svg
          className={`glass-select-chevron ${isOpen ? 'is-rotated' : ''}`}
          viewBox="0 0 24 24"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {rendered &&
        createPortal(
          <div
            ref={menuRef}
            className={`glass-select-popover ${isClosing ? 'is-closing' : ''}`}
            role="listbox"
            aria-label={ariaLabel}
            style={{
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              transformOrigin: align === 'left' ? 'top left' : 'top right'
            }}
            onAnimationEnd={handleMenuAnimationEnd}
          >
            {options.map((opt) => {
              const isSelected = opt.value === value
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`glass-select-option ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => {
                    onChange(opt.value)
                    closeMenu()
                  }}
                >
                  <span className="glass-select-option-text">
                    <span className="glass-select-option-title">{opt.label}</span>
                    {opt.description && (
                      <span className="glass-select-option-desc">{opt.description}</span>
                    )}
                  </span>
                  {isSelected && (
                    <svg
                      className="glass-select-check"
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>,
          document.body
        )}
    </>
  )
}
