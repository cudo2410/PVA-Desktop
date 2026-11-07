import Database from 'better-sqlite3'
import { readdir, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join, parse } from 'path'

export interface MigrationResult {
  applied: string[]
  skipped: string[]
}

/**
 * Bộ chạy migration SQLite tự động theo thứ tự đánh số (001, 002, ...).
 * - Sử dụng Transaction để bảo toàn tính nguyên tử (atomic) khi chạy migration.
 * - Kiểm tra phiên bản trong bảng `schema_migrations` để tránh chạy lại.
 */
export async function runMigrations(
  db: Database.Database,
  migrationsDir?: string
): Promise<MigrationResult> {
  const dir = migrationsDir || resolveMigrationsDir()

  // 1. Đảm bảo bảng schema_migrations luôn tồn tại
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT NOT NULL PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  // 2. Lấy danh sách phiên bản đã áp dụng
  const rows = db.prepare('SELECT version FROM schema_migrations;').all() as { version: string }[]
  const appliedSet = new Set<string>(rows.map((r) => String(r.version)))

  if (!existsSync(dir)) {
    return { applied: [], skipped: [] }
  }

  const files = (await readdir(dir))
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))

  const applied: string[] = []
  const skipped: string[] = []

  const executeMigration = db.transaction((sqlContent: string, version: string) => {
    db.exec(sqlContent)
    db.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (?);').run(version)
  })

  for (const file of files) {
    const version = parse(file).name
    if (appliedSet.has(version)) {
      skipped.push(version)
      continue
    }

    const sqlPath = join(dir, file)
    const sqlContent = await readFile(sqlPath, 'utf-8')

    executeMigration(sqlContent, version)
    applied.push(version)
  }

  return { applied, skipped }
}

/**
 * Xác định thư mục migrations linh hoạt trong môi trường dev lẫn production.
 */
function resolveMigrationsDir(): string {
  const possiblePaths = [
    join(process.cwd(), 'migrations'),
    join(__dirname, '../../migrations'),
    join(__dirname, '../migrations')
  ]

  for (const p of possiblePaths) {
    if (existsSync(p)) {
      return p
    }
  }

  return join(process.cwd(), 'migrations')
}
