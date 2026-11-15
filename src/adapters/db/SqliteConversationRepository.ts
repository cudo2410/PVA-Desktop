import Database from 'better-sqlite3'
import {
  ConversationRecord,
  ConversationRepository,
  StoredMessage
} from '../../core/ports/ConversationRepository'
import { getDatabase } from './database'

export class SqliteConversationRepository implements ConversationRepository {
  private readonly db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  async getOrCreateActiveConversation(
    defaultTitle = 'Cuộc hội thoại chính'
  ): Promise<ConversationRecord> {
    const row = this.db
      .prepare(
        'SELECT id, title, created_at as createdAt FROM conversations ORDER BY id DESC LIMIT 1'
      )
      .get() as { id: number; title: string; createdAt: string } | undefined

    if (row) {
      return row
    }

    const insertStmt = this.db.prepare('INSERT INTO conversations (title) VALUES (?)')
    const result = insertStmt.run(defaultTitle)
    const newId = Number(result.lastInsertRowid)

    const created = this.db
      .prepare('SELECT id, title, created_at as createdAt FROM conversations WHERE id = ?')
      .get(newId) as { id: number; title: string; createdAt: string }

    return created
  }

  async getRecentMessages(conversationId: number, limit = 20): Promise<StoredMessage[]> {
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
  }

  async saveTurnInTransaction(
    conversationId: number,
    userMessage: { role: 'user'; content: string },
    assistantMessage: { role: 'assistant'; content: string }
  ): Promise<{ userMessageId: number; assistantMessageId: number }> {
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

    return Promise.resolve(runTx())
  }

  async getPersistenceEnabled(): Promise<boolean> {
    const row = this.db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get('chat_persistence') as { value: string } | undefined

    if (!row) {
      return true
    }

    return row.value === 'true' || row.value === '1'
  }

  async setPersistenceEnabled(enabled: boolean): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO settings (key, value)
      VALUES ('chat_persistence', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `)
    stmt.run(enabled ? 'true' : 'false')
    return Promise.resolve()
  }

  async clearHistory(conversationId?: number): Promise<void> {
    if (conversationId !== undefined) {
      this.db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(conversationId)
    } else {
      this.db.prepare('DELETE FROM messages').run()
    }
    return Promise.resolve()
  }
}
