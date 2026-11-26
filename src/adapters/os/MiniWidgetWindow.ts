import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

export const MINI_WIDGET_WIDTH = 300
export const MINI_WIDGET_HEIGHT = 196
export const MINI_WIDGET_MARGIN = 4
export const MINI_WIDGET_MIN_WIDTH = 220
export const MINI_WIDGET_MIN_HEIGHT = 148
export const MINI_WIDGET_MAX_WIDTH = 680
export const MINI_WIDGET_MAX_HEIGHT = 460

export interface MiniWidgetBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface MiniWidgetWindowOptions {
  preloadPath: string
  rendererHtmlPath: string
}

/**
 * Cửa sổ thu nhỏ kiểu Microsoft Teams (Mini Floating Widget) hiện ngay khi người dùng thu nhỏ (_) PVA.
 * Kéo di chuyển tự do trên Desktop, luôn nổi, không hiện icon thừa trên Taskbar.
 */
export class MiniWidgetWindow {
  private win: BrowserWindow | null = null
  private wantVisible = false
  private isReadyToShow = false
  private hideTimer: ReturnType<typeof setTimeout> | null = null
  private readonly options: MiniWidgetWindowOptions

  constructor(options: MiniWidgetWindowOptions) {
    this.options = options
  }

  private clearHideTimer(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer)
      this.hideTimer = null
    }
  }

  private sendVisibility(visible: boolean): void {
    if (this.win && !this.win.isDestroyed() && !this.win.webContents.isDestroyed()) {
      this.win.webContents.send('mini-widget:visibility', visible)
    }
  }

  private ensureWindow(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) {
      return this.win
    }

    const workArea = screen.getPrimaryDisplay().workArea
    const win = new BrowserWindow({
      width: MINI_WIDGET_WIDTH,
      height: MINI_WIDGET_HEIGHT,
      minWidth: MINI_WIDGET_MIN_WIDTH,
      minHeight: MINI_WIDGET_MIN_HEIGHT,
      maxWidth: MINI_WIDGET_MAX_WIDTH,
      maxHeight: MINI_WIDGET_MAX_HEIGHT,
      x: Math.round(workArea.x + workArea.width - MINI_WIDGET_WIDTH - MINI_WIDGET_MARGIN),
      y: Math.round(workArea.y + workArea.height - MINI_WIDGET_HEIGHT - MINI_WIDGET_MARGIN),
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      webPreferences: {
        preload: this.options.preloadPath,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    win.setAlwaysOnTop(true, 'floating')

    this.isReadyToShow = false
    win.once('ready-to-show', () => {
      this.isReadyToShow = true
      if (this.wantVisible && !win.isDestroyed()) {
        win.showInactive()
        this.sendVisibility(true)
      }
    })

    win.on('closed', () => {
      this.clearHideTimer()
      this.win = null
      this.isReadyToShow = false
      this.wantVisible = false
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      const base = process.env['ELECTRON_RENDERER_URL'].replace(/#.*$/, '')
      void win.loadURL(`${base}#mini-widget`)
    } else {
      void win.loadFile(this.options.rendererHtmlPath, { hash: 'mini-widget' })
    }

    this.win = win
    return win
  }

  prewarm(): void {
    if (!this.win || this.win.isDestroyed()) {
      this.ensureWindow()
    }
  }

  show(): void {
    this.clearHideTimer()
    this.wantVisible = true
    const win = this.ensureWindow()
    if (this.isReadyToShow) {
      if (!win.isVisible()) {
        win.showInactive()
      }
      this.sendVisibility(true)
    }
  }

  hide(): void {
    this.wantVisible = false
    this.clearHideTimer()
    if (this.win && !this.win.isDestroyed() && this.win.isVisible()) {
      this.sendVisibility(false)
      this.hideTimer = setTimeout(() => {
        this.hideTimer = null
        if (!this.wantVisible && this.win && !this.win.isDestroyed() && this.win.isVisible()) {
          this.win.hide()
        }
      }, 185)
    }
  }

  isVisible(): boolean {
    return Boolean(this.win && !this.win.isDestroyed() && this.wantVisible)
  }

  getCurrentHeight(): number {
    if (this.win && !this.win.isDestroyed()) {
      return this.win.getBounds().height
    }
    return MINI_WIDGET_HEIGHT
  }

  getBounds(): MiniWidgetBounds | null {
    if (!this.win || this.win.isDestroyed()) return null
    const bounds = this.win.getBounds()
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
  }

  resizeTo(bounds: MiniWidgetBounds): void {
    if (!this.win || this.win.isDestroyed()) return
    const width = Math.max(
      MINI_WIDGET_MIN_WIDTH,
      Math.min(MINI_WIDGET_MAX_WIDTH, Math.round(bounds.width))
    )
    const height = Math.max(
      MINI_WIDGET_MIN_HEIGHT,
      Math.min(MINI_WIDGET_MAX_HEIGHT, Math.round(bounds.height))
    )
    const x = Math.round(bounds.x)
    const y = Math.round(bounds.y)

    this.win.setResizable(true)
    this.win.setBounds({ x, y, width, height }, false)
    this.win.setResizable(false)
  }

  destroy(): void {
    this.clearHideTimer()
    this.wantVisible = false
    if (this.win && !this.win.isDestroyed()) {
      this.win.destroy()
    }
    this.win = null
    this.isReadyToShow = false
  }
}

export function createDefaultMiniWidgetWindow(baseDir: string): MiniWidgetWindow {
  return new MiniWidgetWindow({
    preloadPath: join(baseDir, '../preload/index.js'),
    rendererHtmlPath: join(baseDir, '../renderer/index.html')
  })
}
