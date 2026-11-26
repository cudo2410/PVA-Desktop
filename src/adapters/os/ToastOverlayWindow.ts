import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import type { NotificationPayload } from '../../core/ports/Notifier'

const OVERLAY_WIDTH = 456
const OVERLAY_HEIGHT = 540

export interface ToastOverlayWindowOptions {
  preloadPath: string
  rendererHtmlPath: string
}

/**
 * Cửa sổ thông báo nổi Desktop trong suốt (kiểu Microsoft Teams) dùng khi cửa sổ chính PVA đang thu nhỏ.
 * Không cướp focus, xuyên chuột vùng trống và tự ẩn khi hết thông báo.
 */
export class ToastOverlayWindow {
  private win: BrowserWindow | null = null
  private isReady = false
  private pendingPayloads: NotificationPayload[] = []
  private currentBottomOffset = 0
  private readonly options: ToastOverlayWindowOptions

  constructor(options: ToastOverlayWindowOptions) {
    this.options = options
  }

  private ensureWindow(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) {
      return this.win
    }

    const workArea = screen.getPrimaryDisplay().workArea
    const win = new BrowserWindow({
      width: OVERLAY_WIDTH,
      height: OVERLAY_HEIGHT,
      x: Math.round(workArea.x + workArea.width - OVERLAY_WIDTH),
      y: Math.round(workArea.y + workArea.height - OVERLAY_HEIGHT),
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      show: false,
      webPreferences: {
        preload: this.options.preloadPath,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    win.setAlwaysOnTop(true, 'pop-up-menu')
    win.setIgnoreMouseEvents(true, { forward: true })

    this.isReady = false
    win.webContents.once('did-finish-load', () => {
      this.isReady = true
      if (this.pendingPayloads.length > 0 && !win.isDestroyed()) {
        const queued = [...this.pendingPayloads]
        this.pendingPayloads = []
        for (const payload of queued) {
          win.webContents.send('reminders:overlay-toast', payload)
        }
        this.positionAndShow(win)
      }
    })

    win.on('closed', () => {
      this.win = null
      this.isReady = false
      this.pendingPayloads = []
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      const base = process.env['ELECTRON_RENDERER_URL'].replace(/#.*$/, '')
      void win.loadURL(`${base}#toast-overlay`)
    } else {
      void win.loadFile(this.options.rendererHtmlPath, { hash: 'toast-overlay' })
    }

    this.win = win
    return win
  }

  private positionAndShow(win: BrowserWindow): void {
    const workArea = screen.getPrimaryDisplay().workArea
    const maxHeight = Math.max(220, workArea.height - this.currentBottomOffset)
    const height = Math.min(OVERLAY_HEIGHT, maxHeight)
    win.setBounds({
      x: Math.round(workArea.x + workArea.width - OVERLAY_WIDTH),
      y: Math.round(workArea.y + workArea.height - height - this.currentBottomOffset),
      width: OVERLAY_WIDTH,
      height
    })
    if (!win.isVisible()) {
      win.showInactive()
    }
  }

  pushToast(payload: NotificationPayload, bottomOffset = 0): void {
    this.currentBottomOffset = Math.max(0, bottomOffset)
    const win = this.ensureWindow()
    if (!this.isReady) {
      this.pendingPayloads.push(payload)
      return
    }
    this.positionAndShow(win)
    win.webContents.send('reminders:overlay-toast', payload)
  }

  setIgnoreMouseEvents(ignore: boolean): void {
    if (!this.win || this.win.isDestroyed()) return
    if (ignore) {
      this.win.setIgnoreMouseEvents(true, { forward: true })
    } else {
      this.win.setIgnoreMouseEvents(false)
    }
  }

  hide(): void {
    if (!this.win || this.win.isDestroyed()) return
    this.win.setIgnoreMouseEvents(true, { forward: true })
    if (this.win.isVisible()) {
      this.win.hide()
    }
  }

  destroy(): void {
    this.pendingPayloads = []
    if (this.win && !this.win.isDestroyed()) {
      this.win.destroy()
    }
    this.win = null
    this.isReady = false
  }
}

export function createDefaultToastOverlayWindow(baseDir: string): ToastOverlayWindow {
  return new ToastOverlayWindow({
    preloadPath: join(baseDir, '../preload/index.js'),
    rendererHtmlPath: join(baseDir, '../renderer/index.html')
  })
}
