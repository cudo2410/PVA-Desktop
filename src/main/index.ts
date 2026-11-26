import { app, shell, BrowserWindow, screen, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import avaIcon from '../../resources/ava.jpg?asset'
import { OllamaChatModel } from '@adapters/ai/OllamaChatModel'
import { ChatService } from '@core/services/ChatService'
import { TaskService } from '@core/services/TaskService'
import { ReminderService } from '@core/services/ReminderService'
import { RuleRouter } from '@core/services/RuleRouter'
import { registerChatIpc } from '@adapters/ipc/chat.ipc'
import { registerTasksIpc } from '@adapters/ipc/tasks.ipc'
import { registerRemindersIpc } from '@adapters/ipc/reminders.ipc'
import { initDatabase, closeDatabase } from '@adapters/db/database'
import { runMigrations } from '@adapters/db/migrator'
import { SqliteConversationRepository } from '@adapters/db/SqliteConversationRepository'
import { SqliteTaskRepository } from '@adapters/db/SqliteTaskRepository'
import { SqliteReminderRepository } from '@adapters/db/SqliteReminderRepository'
import { InAppScheduler } from '@adapters/scheduler/InAppScheduler'
import { WindowsNotifier } from '@adapters/os/WindowsNotifier'
import type { MainWindowMode } from '@adapters/os/WindowsNotifier'
import { TrayManager } from '@adapters/os/TrayManager'
import {
  ToastOverlayWindow,
  createDefaultToastOverlayWindow
} from '@adapters/os/ToastOverlayWindow'
import {
  MiniWidgetWindow,
  MINI_WIDGET_MARGIN,
  createDefaultMiniWidgetWindow
} from '@adapters/os/MiniWidgetWindow'

const APP_USER_MODEL_ID = 'com.pva.desktop'

// Cho phép Web Audio API phát âm thanh thông báo tùy chỉnh ngay cả khi cửa sổ đang thu nhỏ/ẩn khay
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// Tắt riêng DirectComposition video overlay trên Windows để tránh lỗi đen khung <video>
// khi kết hợp border-radius + backdrop-filter (vẫn giữ nguyên tăng tốc GPU cho toàn app)
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('disable-direct-composition-video-overlays')
}

let mainWindow: BrowserWindow | null = null
let trayManager: TrayManager | null = null
let toastOverlayWindow: ToastOverlayWindow | null = null
let miniWidgetWindow: MiniWidgetWindow | null = null
let reminderServiceInstance: ReminderService | null = null
let isQuitting = false

function getMainWindowMode(): MainWindowMode {
  if (miniWidgetWindow?.isVisible()) {
    return 'minimized'
  }
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) {
    return 'hidden'
  }
  if (mainWindow.isMinimized()) {
    return 'minimized'
  }
  return 'visible'
}

function broadcastToRenderers(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      if (payload !== undefined) {
        win.webContents.send(channel, payload)
      } else {
        win.webContents.send(channel)
      }
    }
  }
}

function showAndFocusMainWindow(): void {
  miniWidgetWindow?.hide()
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  if (!mainWindow.isVisible()) {
    mainWindow.show()
  }
  mainWindow.focus()
}

function createWindow(): void {
  const workArea = screen.getPrimaryDisplay().workAreaSize
  const defaultWidth = Math.min(1360, Math.max(960, workArea.width - 40))
  const defaultHeight = Math.min(800, Math.max(620, workArea.height - 40))

  mainWindow = new BrowserWindow({
    width: defaultWidth,
    height: defaultHeight,
    minWidth: 720,
    minHeight: 540,
    center: true,
    backgroundColor: '#060a0e',
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    // Khởi tạo trước MiniWidget ẩn ở nền sau khi cửa sổ chính mở để lần thu nhỏ đầu tiên hiện mượt tức thì
    setTimeout(() => {
      if (!isQuitting) {
        miniWidgetWindow?.prewarm()
      }
    }, 600)
  })

  // Khi thu nhỏ (_) -> hiện cửa sổ thu nhỏ kiểu Microsoft Teams
  mainWindow.on('minimize', () => {
    if (!isQuitting) {
      miniWidgetWindow?.show()
    }
  })

  mainWindow.on('restore', () => {
    miniWidgetWindow?.hide()
  })

  mainWindow.on('show', () => {
    miniWidgetWindow?.hide()
  })

  // Bấm X -> tắt cả cửa sổ chính lẫn cửa sổ nhỏ, chỉ chạy ngầm dưới System Tray (FR-05)
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      miniWidgetWindow?.hide()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Khóa đơn tiến trình tránh chạy 2 bản PVA song song bắn trùng nhắc nhở
const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  // Khai báo AppUserModelId: dùng com.pva.desktop ở bản đóng gói (đồng bộ electron-builder.yml),
  // còn ở chế độ dev dùng process.execPath để Windows không nuốt thông báo khi chưa cài shortcut Start Menu
  const effectiveAppUserModelId = is.dev ? process.execPath : APP_USER_MODEL_ID
  if (process.platform === 'win32') {
    app.setAppUserModelId(effectiveAppUserModelId)
  }

  app.on('second-instance', () => {
    showAndFocusMainWindow()
  })

  const ollamaModel = new OllamaChatModel({ model: 'qwen3:1.7b' })
  const ruleRouter = new RuleRouter()

  app.whenReady().then(async () => {
    electronApp.setAppUserModelId(effectiveAppUserModelId)

    // Khởi tạo cửa sổ thu nhỏ kiểu Teams và cửa sổ nổi thông báo Desktop
    miniWidgetWindow = createDefaultMiniWidgetWindow(__dirname)
    toastOverlayWindow = createDefaultToastOverlayWindow(__dirname)

    ipcMain.on('mini-widget:restore', () => {
      showAndFocusMainWindow()
    })

    ipcMain.on('mini-widget:hide-to-tray', () => {
      miniWidgetWindow?.hide()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide()
      }
    })

    ipcMain.handle('mini-widget:get-bounds', () => {
      return miniWidgetWindow?.getBounds() ?? null
    })

    ipcMain.on('mini-widget:resize', (_, rawBounds: unknown) => {
      if (!rawBounds || typeof rawBounds !== 'object') return
      const b = rawBounds as Record<string, unknown>
      const x = Number(b.x)
      const y = Number(b.y)
      const width = Number(b.width)
      const height = Number(b.height)
      if (![x, y, width, height].every(Number.isFinite)) return
      miniWidgetWindow?.resizeTo({ x, y, width, height })
    })

    ipcMain.on('reminders:open-from-toast', (_, openTasksDrawer?: unknown) => {
      showAndFocusMainWindow()
      if (openTasksDrawer && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('reminders:open-drawer')
      }
    })

    ipcMain.on('reminders:overlay-empty', () => {
      toastOverlayWindow?.hide()
    })

    ipcMain.on('reminders:overlay-mouse', (_, ignore: unknown) => {
      toastOverlayWindow?.setIgnoreMouseEvents(Boolean(ignore))
    })

    // Khởi tạo icon khay hệ thống (System Tray) trước để WindowsNotifier có thể dùng displayBalloon dự phòng
    trayManager = new TrayManager({
      iconPath: icon,
      balloonIconPath: avaIcon,
      tooltip: 'PVA – Asada Sinon',
      onShowWindow: () => showAndFocusMainWindow(),
      onQuit: () => {
        isQuitting = true
        app.quit()
      }
    })
    trayManager.init()

    // Khởi tạo Database SQLite nhúng, chạy migrations và nối các Services theo kiến trúc Hexagonal
    try {
      const db = initDatabase()
      const migrationResult = await runMigrations(db)
      console.log('[SQLite] Database initialized successfully. Migrations:', migrationResult)

      const conversationRepo = new SqliteConversationRepository(db)
      const taskRepo = new SqliteTaskRepository(db)
      const reminderRepo = new SqliteReminderRepository(db)

      const scheduler = new InAppScheduler({
        onError: (jobId, err) => {
          console.error(`[InAppScheduler] Lỗi khi thực thi ${jobId}:`, err)
        }
      })
      const notifier = new WindowsNotifier({
        iconPath: avaIcon,
        onOpenWindow: () => showAndFocusMainWindow(),
        getMainWindowMode: () => getMainWindowMode(),
        onNotifyInApp: (payload) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('reminders:fired', payload)
          }
        },
        onNotifyOverlay: (payload) => {
          const offset = miniWidgetWindow?.isVisible()
            ? miniWidgetWindow.getCurrentHeight() + MINI_WIDGET_MARGIN
            : 0
          toastOverlayWindow?.pushToast(payload, offset)
        },
        onPlayCustomSound: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('reminders:play-sound')
            return true
          }
          return false
        },
        preferTrayBalloon: is.dev && process.platform === 'win32',
        onFallbackBalloon: (title, body, silent) =>
          trayManager?.displayBalloon(title, body, { silent }) ?? false
      })
      const reminderService = new ReminderService(reminderRepo, scheduler, notifier, {
        onStateChanged: () => broadcastToRenderers('reminders:updated')
      })
      reminderServiceInstance = reminderService

      const taskService = new TaskService(taskRepo, {
        onTaskDeleted: async (taskId) => {
          await reminderService.cancelScheduledForTask(taskId)
        }
      })

      const restoreSummary = await reminderService.restoreOnStartup()
      console.log(
        `[Reminders] Restored: ${restoreSummary.rescheduled.length} scheduled, ${restoreSummary.missed.length} missed, ${restoreSummary.regenerated.length} recurring regenerated.`
      )

      const chatService = new ChatService(ollamaModel, {
        repository: conversationRepo,
        intentRouter: ruleRouter,
        taskService,
        reminderService,
        onTasksChanged: () => broadcastToRenderers('tasks:updated'),
        onRemindersChanged: () => broadcastToRenderers('reminders:updated')
      })
      await chatService.init()

      registerChatIpc(chatService)
      registerTasksIpc(taskService)
      registerRemindersIpc(reminderService)
    } catch (err) {
      console.error('[SQLite] Failed to initialize database:', err)
      const fallbackChatService = new ChatService(ollamaModel, { intentRouter: ruleRouter })
      registerChatIpc(fallbackChatService)
    }

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    void ollamaModel.ensureServerRunning().then(async (isReady) => {
      if (isReady) {
        console.log('[Ollama] Local Ollama server is running and ready.')
      } else {
        console.warn('[Ollama] Ollama server is not running or auto-start is still in progress.')
      }
      try {
        const health = await ollamaModel.health()
        broadcastToRenderers('chat:model:status', health)
      } catch {
        broadcastToRenderers('chat:model:status', {
          ok: isReady,
          status: isReady ? 'healthy' : 'unhealthy',
          code: isReady ? undefined : 'MODEL_UNAVAILABLE'
        })
      }
    })

    createWindow()

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      } else {
        showAndFocusMainWindow()
      }
    })
  })

  app.on('window-all-closed', () => {
    // Chỉ thoát khi người dùng chọn Thoát từ khay hệ thống (hoặc thoát trên non-Windows)
    if (isQuitting && process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('before-quit', () => {
    isQuitting = true
    reminderServiceInstance?.dispose()
    miniWidgetWindow?.destroy()
    toastOverlayWindow?.destroy()
    trayManager?.destroy()
    closeDatabase()
  })
}
