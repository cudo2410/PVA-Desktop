import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname, join } from 'path'

let dbInstance: Database.Database | null = null

export interface DatabaseOptions {
  dbPath?: string
  inMemory?: boolean
  verbose?: boolean
}

/**
 * Xác định đường dẫn file SQLite Database:
 * 1. Sử dụng tham số hoặc biến môi trường `PVA_DB_PATH` nếu có.
 * 2. Trên Electron runtime: lưu tại `app.getPath('userData')/pva.sqlite`.
 * 3. Môi trường kiểm thử / fallback ngoài Electron: lưu tại `data/pva.sqlite`.
 */
export function getDatabasePath(overridePath?: string): string {
  if (overridePath) {
    return overridePath
  }

  if (process.env.PVA_DB_PATH) {
    return process.env.PVA_DB_PATH
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron')
    if (app && typeof app.getPath === 'function') {
      return join(app.getPath('userData'), 'pva.sqlite')
    }
  } catch {
    // Không nằm trong tiến trình Electron
  }

  return join(process.cwd(), 'data', 'pva.sqlite')
}

/**
 * Khởi tạo kết nối SQLite với better-sqlite3:
 * - Bật PRAGMA foreign_keys = ON để đảm bảo toàn vẹn quan hệ bảng.
 * - Sử dụng chế độ WAL (Write-Ahead Logging) cho hiệu năng và an toàn dữ liệu trên Desktop.
 */
export function initDatabase(options?: DatabaseOptions): Database.Database {
  if (dbInstance && dbInstance.open) {
    return dbInstance
  }

  const targetPath = options?.inMemory ? ':memory:' : getDatabasePath(options?.dbPath)

  if (targetPath !== ':memory:') {
    mkdirSync(dirname(targetPath), { recursive: true })
  }

  const db = new Database(targetPath, {
    verbose: options?.verbose ? console.log : undefined
  })

  // Cấu hình các PRAGMA an toàn và tối ưu
  db.pragma('foreign_keys = ON')

  if (targetPath !== ':memory:') {
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
  }

  dbInstance = db
  return db
}

/**
 * Lấy đối tượng Database đang hoạt động.
 */
export function getDatabase(): Database.Database {
  if (!dbInstance || !dbInstance.open) {
    return initDatabase()
  }
  return dbInstance
}

/**
 * Đóng kết nối Database an toàn khi ứng dụng thoát.
 */
export function closeDatabase(): void {
  if (dbInstance && dbInstance.open) {
    dbInstance.close()
  }
  dbInstance = null
}
