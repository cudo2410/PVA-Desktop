import { Menu, Tray, nativeImage } from 'electron'

export interface TrayManagerOptions {
  iconPath: string
  balloonIconPath?: string
  tooltip?: string
  onShowWindow: () => void
  onQuit: () => void
}

export class TrayManager {
  private tray: Tray | null = null
  private readonly options: TrayManagerOptions

  constructor(options: TrayManagerOptions) {
    this.options = options
  }

  init(): void {
    if (this.tray) {
      return
    }

    const rawIcon = nativeImage.createFromPath(this.options.iconPath)
    const trayIcon =
      process.platform === 'win32' && !rawIcon.isEmpty()
        ? rawIcon.resize({ width: 16, height: 16 })
        : rawIcon

    this.tray = new Tray(trayIcon)
    this.tray.setToolTip(this.options.tooltip || 'PVA – Asada Sinon')

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Mở PVA',
        click: () => this.options.onShowWindow()
      },
      { type: 'separator' },
      {
        label: 'Thoát PVA',
        click: () => this.options.onQuit()
      }
    ])

    this.tray.setContextMenu(contextMenu)

    this.tray.on('click', () => {
      this.options.onShowWindow()
    })

    this.tray.on('double-click', () => {
      this.options.onShowWindow()
    })

    this.tray.on('balloon-click', () => {
      this.options.onShowWindow()
    })
  }

  /**
   * Hiển thị thông báo hệ thống qua Windows System Tray kèm ảnh đại diện nhân vật.
   * Không gọi removeBalloon() cưỡng bức để Windows tự lưu thông báo vào Trung tâm thông báo (Notification Center).
   */
  displayBalloon(title: string, content: string, options?: { silent?: boolean }): boolean {
    if (!this.tray || this.tray.isDestroyed() || process.platform !== 'win32') {
      return false
    }

    try {
      const iconSource = this.options.balloonIconPath || this.options.iconPath
      const rawIcon = nativeImage.createFromPath(iconSource)
      // Thu nhỏ về 64x64 32-bit PNG ARGB chuẩn Win32 HICON (tránh Win32 từ chối ảnh JPEG 1200x1200)
      const safeIcon = !rawIcon.isEmpty()
        ? nativeImage.createFromBuffer(rawIcon.resize({ width: 64, height: 64 }).toPNG())
        : undefined
      const hasCustomIcon = Boolean(safeIcon && !safeIcon.isEmpty())

      console.log(
        `[TrayManager] displayBalloon("${title}", silent=${Boolean(options?.silent)}, customIcon=${hasCustomIcon})`
      )

      this.tray.displayBalloon({
        title,
        content,
        icon: hasCustomIcon ? safeIcon : undefined,
        iconType: hasCustomIcon ? 'custom' : 'info',
        largeIcon: true,
        noSound: Boolean(options?.silent),
        respectQuietTime: false
      })
      return true
    } catch (err: unknown) {
      console.error('[TrayManager] Không thể hiển thị balloon notification:', err)
      return false
    }
  }

  destroy(): void {
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
    }
  }
}
