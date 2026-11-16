import Database from 'better-sqlite3'
import {
  ConversationRecord,
  ConversationRepository,
  StoredMessage
} from '../../core/ports/ConversationRepository'
import { DatabaseError } from '../../core/models/ModelError'
import { getDatabase } from './database'

export class SqliteConversationRepository implements ConversationRepository {
  private readonly db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  private safeExecute<T>(fn: () => T, actionDesc: string): T {
    try {
      return fn()
    } catch (err: unknown) {
      if (err instanceof DatabaseError) {
        throw err
      }
      const detail = err instanceof Error ? err.message : String(err)
      throw new DatabaseError(`Không thể ${actionDesc} do cơ sở dữ liệu không khả dụng: ${detail}`)
    }
  }

  async getOrCreateActiveConversation(
    defaultTitle = 'Cuộc hội thoại chính'
  ): Promise<ConversationRecord> {
    return this.safeExecute(() => {
      const row = this.db
        .prepare(
          'SELECT id, title, created_at as createdAt FROM conversations ORDER BY id DESC LIMIT 1'
        )
        .get() as { id: number; title: string; createdAt: string } | undefined

      if (row) {
        return row
      }

      return this.createConversationSync(defaultTitle)
    }, 'lấy hoặc tạo cuộc hội thoại hoạt động')
  }

  private createConversationSync(defaultTitle: string): ConversationRecord {
    const insertStmt = this.db.prepare('INSERT INTO conversations (title) VALUES (?)')
    const result = insertStmt.run(defaultTitle)
    const newId = Number(result.lastInsertRowid)

    const created = this.db
      .prepare('SELECT id, title, created_at as createdAt FROM conversations WHERE id = ?')
      .get(newId) as { id: number; title: string; createdAt: string }

    return {
      ...created,
      messageCount: 0
    }
  }

  async createConversation(title?: string): Promise<ConversationRecord> {
    return this.safeExecute(() => {
      const defaultTitle =
        title ||
        `Hội thoại ${new Date().toLocaleDateString('vi-VN', {
          day: '2-digit',
          month: '2-digit'
        })} ${new Date().toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit'
        })}`

      return this.createConversationSync(defaultTitle)
    }, 'tạo cuộc hội thoại mới')
  }

  async listConversations(): Promise<ConversationRecord[]> {
    return this.safeExecute(() => {
      const rows = this.db
        .prepare(
          `SELECT
             c.id,
             c.title,
             c.created_at as createdAt,
             COUNT(m.id) as messageCount,
             (
               SELECT content FROM messages
               WHERE conversation_id = c.id
               ORDER BY id DESC LIMIT 1
             ) as lastMessage,
             (
               SELECT content FROM messages
               WHERE conversation_id = c.id AND role = 'user'
               ORDER BY id ASC LIMIT 1
             ) as firstUserMessage
           FROM conversations c
           LEFT JOIN messages m ON c.id = m.conversation_id
           GROUP BY c.id
           ORDER BY c.id DESC`
        )
        .all() as (ConversationRecord & { firstUserMessage?: string })[]

      // Tự động nâng cấp tiêu đề cho các cuộc hội thoại cũ đang mang tên mặc định nếu đã có câu hỏi đầu tiên
      for (const row of rows) {
        if (
          row.firstUserMessage &&
          (row.title === 'Cuộc hội thoại chính' ||
            row.title === 'Cuộc trò chuyện mới' ||
            row.title === 'Hội thoại mới' ||
            /^Hội thoại \d{2}\/\d{2}/.test(row.title))
        ) {
          const clean = row.firstUserMessage
            .trim()
            .replace(/\r?\n|\r/g, ' ')
            .replace(/\s+/g, ' ')
          const newTitle = clean.length > 80 ? clean.slice(0, 80).trim() + '...' : clean
          if (newTitle) {
            this.db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(newTitle, row.id)
            row.title = newTitle
          }
        }
      }

      return rows
    }, 'lấy danh sách cuộc hội thoại')
  }

  async getConversationMessages(conversationId: number): Promise<StoredMessage[]> {
    return this.safeExecute(() => {
      const rows = this.db
        .prepare(
          `SELECT id, conversation_id as conversationId, role, content, created_at as createdAt
           FROM messages
           WHERE conversation_id = ?
           ORDER BY id ASC`
        )
        .all(conversationId) as StoredMessage[]

      return rows
    }, 'lấy tin nhắn cuộc hội thoại')
  }

  async getRecentMessages(conversationId: number, limit = 20): Promise<StoredMessage[]> {
    return this.safeExecute(() => {
      const rows = this.db
        .prepare(
          `SELECT id, conversation_id as conversationId, role, content, created_at as createdAt
           FROM messages
           WHERE conversation_id = ?
           ORDER BY id DESC
           LIMIT ?`
        )
        .all(conversationId, limit) as StoredMessage[]

      return rows.reverse()
    }, 'lấy tin nhắn gần đây')
  }

  async saveTurnInTransaction(
    conversationId: number,
    userMessage: { role: 'user'; content: string },
    assistantMessage: { role: 'assistant'; content: string }
  ): Promise<{ userMessageId: number; assistantMessageId: number }> {
    return this.safeExecute(() => {
      const runTx = this.db.transaction(() => {
        const stmt = this.db.prepare(
          'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)'
        )

        const userResult = stmt.run(conversationId, userMessage.role, userMessage.content)
        const assistantResult = stmt.run(
          conversationId,
          assistantMessage.role,
          assistantMessage.content
        )

        return {
          userMessageId: Number(userResult.lastInsertRowid),
          assistantMessageId: Number(assistantResult.lastInsertRowid)
        }
      })

      return runTx()
    }, 'lưu lượt hội thoại')
  }

  async deleteConversation(conversationId: number): Promise<boolean> {
    return this.safeExecute(() => {
      const res = this.db.prepare('DELETE FROM conversations WHERE id = ?').run(conversationId)
      return res.changes > 0
    }, 'xóa cuộc hội thoại')
  }

  async updateConversationTitle(conversationId: number, title: string): Promise<void> {
    return this.safeExecute(() => {
      this.db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(title, conversationId)
    }, 'cập nhật tiêu đề cuộc hội thoại')
  }

  async getPersistenceEnabled(): Promise<boolean> {
    return this.safeExecute(() => {
      const row = this.db
        .prepare('SELECT value FROM settings WHERE key = ?')
        .get('chat_persistence') as { value: string } | undefined

      if (!row) {
        return true
      }

      return row.value === 'true' || row.value === '1'
    }, 'lấy trạng thái lưu trữ')
  }

  async setPersistenceEnabled(enabled: boolean): Promise<void> {
    return this.safeExecute(() => {
      const stmt = this.db.prepare(`
        INSERT INTO settings (key, value)
        VALUES ('chat_persistence', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `)
      stmt.run(enabled ? 'true' : 'false')
    }, 'cập nhật trạng thái lưu trữ')
  }

  async clearHistory(conversationId?: number): Promise<void> {
    return this.safeExecute(() => {
      if (conversationId !== undefined) {
        this.db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(conversationId)
      } else {
        this.db.prepare('DELETE FROM messages').run()
      }
    }, 'xóa lịch sử trò chuyện')
  }
}
