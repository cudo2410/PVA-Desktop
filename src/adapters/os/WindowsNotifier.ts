import { Notification, nativeImage } from 'electron'
import type { NotificationPayload, Notifier } from '../../core/ports/Notifier'

export type MainWindowMode = 'visible' | 'minimized' | 'hidden'

export interface WindowsNotifierOptions {
  iconPath?: string
  onOpenWindow?: () => void
  getMainWindowMode?: () => MainWindowMode
  onNotifyInApp?: (payload: NotificationPayload) => void
  onNotifyOverlay?: (payload: NotificationPayload) => void
  onPlayCustomSound?: () => boolean
  preferTrayBalloon?: boolean
  onFallbackBalloon?: (title: string, body: string, silent: boolean) => boolean
}

export class WindowsNotifier implements Notifier {
  private readonly iconPath?: string
  private readonly onOpenWindow?: () => void
  private readonly getMainWindowMode: () => MainWindowMode
  private readonly onNotifyInApp?: (payload: NotificationPayload) => void
  private readonly onNotifyOverlay?: (payload: NotificationPayload) => void
  private readonly onPlayCustomSound?: () => boolean
  private readonly preferTrayBalloon: boolean
  private readonly onFallbackBalloon?: (title: string, body: string, silent: boolean) => boolean
  // Giữ tham chiếu các Notification đang hiển thị để tránh V8 GC thu hồi trước khi người dùng bấm vào
  private readonly activeNotifications = new Set<Notification>()

  constructor(options?: WindowsNotifierOptions) {
    this.iconPath = options?.iconPath
    this.onOpenWindow = options?.onOpenWindow
    this.getMainWindowMode = options?.getMainWindowMode ?? (() => 'hidden')
    this.onNotifyInApp = options?.onNotifyInApp
    this.onNotifyOverlay = options?.onNotifyOverlay
    this.onPlayCustomSound = options?.onPlayCustomSound
    this.preferTrayBalloon = Boolean(options?.preferTrayBalloon)
    this.onFallbackBalloon = options?.onFallbackBalloon
  }

  notify(payload: NotificationPayload): void {
    const mode = this.getMainWindowMode()
    console.log(
      `[WindowsNotifier] Firing reminder #${payload.reminderId} (window=${mode}): "${payload.body}"`
    )

    // Chế độ 1: Cửa sổ chính đang hiển thị -> chỉ hiện Toast kính mờ trong App + âm thanh tùy chỉnh
    if (mode === 'visible' && this.onNotifyInApp) {
      this.onNotifyInApp(payload)
      return
    }

    // Chế độ 2: Cửa sổ chính đang thu nhỏ (minimized) -> chỉ hiện cửa sổ nổi Desktop kiểu Teams + âm thanh tùy chỉnh
    if (mode === 'minimized' && this.onNotifyOverlay) {
      this.onNotifyOverlay(payload)
      return
    }

    // Chế độ 3: Đã đóng cửa sổ chạy ngầm dưới System Tray -> thông báo Windows (lưu trong Win + N) + âm thanh tùy chỉnh
    const customSoundPlayed = this.onPlayCustomSound ? this.onPlayCustomSound() : false
    const silenceOsSound = customSoundPlayed

    if (this.preferTrayBalloon && this.onFallbackBalloon) {
      const shown = this.onFallbackBalloon(payload.title, payload.body, silenceOsSound)
      if (shown) {
        return
      }
    }

    if (!Notification.isSupported()) {
      console.warn(
        '[WindowsNotifier] Thông báo hệ điều hành không được hỗ trợ, chuyển sang dự phòng Tray.'
      )
      this.onFallbackBalloon?.(payload.title, payload.body, silenceOsSound)
      return
    }

    try {
      const rawIcon = this.iconPath ? nativeImage.createFromPath(this.iconPath) : undefined
      const icon =
        rawIcon && !rawIcon.isEmpty()
          ? nativeImage.createFromBuffer(rawIcon.resize({ width: 128, height: 128 }).toPNG())
          : undefined
      const notification = new Notification({
        title: payload.title,
        body: payload.body,
        icon: icon && !icon.isEmpty() ? icon : undefined,
        silent: silenceOsSound,
        timeoutType: 'default'
      })

      this.activeNotifications.add(notification)

      const cleanup = (): void => {
        this.activeNotifications.delete(notification)
      }

      notification.on('click', () => {
        this.onOpenWindow?.()
        cleanup()
      })

      notification.on('close', () => {
        cleanup()
      })

      notification.on('failed', (_event, error) => {
        console.warn('[WindowsNotifier] Windows Toast thất bại, chuyển sang dự phòng Tray:', error)
        cleanup()
        this.onFallbackBalloon?.(payload.title, payload.body, silenceOsSound)
      })

      notification.show()
    } catch (err: unknown) {
      console.error('[WindowsNotifier] Không thể hiển thị thông báo Windows:', err)
      this.onFallbackBalloon?.(payload.title, payload.body, silenceOsSound)
    }
  }
}
