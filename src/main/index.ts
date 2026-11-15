import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { OllamaChatModel } from '@adapters/ai/OllamaChatModel'
import { ChatService } from '@core/services/ChatService'
import { registerChatIpc } from '@adapters/ipc/chat.ipc'
import { initDatabase, closeDatabase } from '@adapters/db/database'
import { runMigrations } from '@adapters/db/migrator'
import { SqliteConversationRepository } from '@adapters/db/SqliteConversationRepository'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Khởi tạo Adapter OllamaChatModel (qwen3:1.7b)
const ollamaModel = new OllamaChatModel({ model: 'qwen3:1.7b' })

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.electron')

  // Khởi tạo Database SQLite nhúng và chạy migrations tự động
  try {
    const db = initDatabase()
    const migrationResult = await runMigrations(db)
    console.log('[SQLite] Database initialized successfully. Migrations:', migrationResult)

    const conversationRepo = new SqliteConversationRepository(db)
    const chatService = new ChatService(ollamaModel, { repository: conversationRepo })
    await chatService.init()
    registerChatIpc(chatService)
  } catch (err) {
    console.error('[SQLite] Failed to initialize database:', err)
    const fallbackChatService = new ChatService(ollamaModel)
    registerChatIpc(fallbackChatService)
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Tự động kiểm tra và khởi chạy ngầm Ollama server (nếu chưa chạy) song song với giao diện
  void ollamaModel.ensureServerRunning().then((isReady) => {
    if (isReady) {
      console.log('[Ollama] Local Ollama server is running and ready.')
    } else {
      console.warn('[Ollama] Ollama server is not running or auto-start is still in progress.')
    }
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  closeDatabase()
})
