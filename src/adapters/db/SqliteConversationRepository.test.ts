import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { join } from 'path'
import { initDatabase, closeDatabase } from './database'
import { runMigrations } from './migrator'
import { SqliteConversationRepository } from './SqliteConversationRepository'

describe('SqliteConversationRepository', () => {
  let db: Database.Database
  let repo: SqliteConversationRepository
  const migrationsDir = join(process.cwd(), 'migrations')

  beforeEach(async () => {
    closeDatabase()
    db = initDatabase({ inMemory: true })
    await runMigrations(db, migrationsDir)
    repo = new SqliteConversationRepository(db)
  })

  afterEach(() => {
    closeDatabase()
  })

  it('1. Tạo mới hoặc lấy cuộc hội thoại hoạt động', async () => {
    const conv1 = await repo.getOrCreateActiveConversation('Hội thoại thử nghiệm')
    expect(conv1.id).toBeGreaterThan(0)
    expect(conv1.title).toBe('Hội thoại thử nghiệm')

    // Gọi lần 2: phải trả về cuộc hội thoại đã tồn tại
    const conv2 = await repo.getOrCreateActiveConversation('Hội thoại khác')
    expect(conv2.id).toBe(conv1.id)
    expect(conv2.title).toBe('Hội thoại thử nghiệm')
  })

  it('2. Lưu cặp tin nhắn user và assistant trong một transaction nguyên tử', async () => {
    const conv = await repo.getOrCreateActiveConversation()
    const result = await repo.saveTurnInTransaction(
      conv.id,
      { role: 'user', content: 'Xin chào PVA' },
      { role: 'assistant', content: 'Chào bạn, tôi có thể giúp gì?' }
    )

    expect(result.userMessageId).toBeGreaterThan(0)
    expect(result.assistantMessageId).toBeGreaterThan(result.userMessageId)

    const messages = await repo.getRecentMessages(conv.id, 10)
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('user')
    expect(messages[0].content).toBe('Xin chào PVA')
    expect(messages[1].role).toBe('assistant')
    expect(messages[1].content).toBe('Chào bạn, tôi có thể giúp gì?')
  })

  it('3. Rollback toàn bộ khi xảy ra lỗi trong transaction lưu tin nhắn', async () => {
    const conv = await repo.getOrCreateActiveConversation()

    // Thử lưu với assistant role không hợp lệ để vi phạm CHECK constraint
    await expect(
      repo.saveTurnInTransaction(
        conv.id,
        { role: 'user', content: 'Tin nhắn hợp lệ' },
        // @ts-expect-error kiểm thử role vi phạm ràng buộc CHECK
        { role: 'invalid_role', content: 'Tin nhắn lỗi' }
      )
    ).rejects.toThrow()

    // Đảm bảo tin nhắn user cũng bị rollback, không còn trong DB
    const messages = await repo.getRecentMessages(conv.id, 10)
    expect(messages).toHaveLength(0)
  })

  it('4. Đọc và cập nhật cấu hình bật/tắt lưu lịch sử (Persistence Toggle)', async () => {
    // Mặc định ban đầu là true (bật lưu)
    const initialEnabled = await repo.getPersistenceEnabled()
    expect(initialEnabled).toBe(true)

    // Tắt lưu
    await repo.setPersistenceEnabled(false)
    expect(await repo.getPersistenceEnabled()).toBe(false)

    // Bật lại
    await repo.setPersistenceEnabled(true)
    expect(await repo.getPersistenceEnabled()).toBe(true)
  })

  it('5. Xóa lịch sử tin nhắn trong cuộc hội thoại', async () => {
    const conv = await repo.getOrCreateActiveConversation()
    await repo.saveTurnInTransaction(
      conv.id,
      { role: 'user', content: 'Msg 1' },
      { role: 'assistant', content: 'Ans 1' }
    )
    expect(await repo.getRecentMessages(conv.id)).toHaveLength(2)

    await repo.clearHistory(conv.id)
    expect(await repo.getRecentMessages(conv.id)).toHaveLength(0)
  })

  it('6. listConversations() trả về danh sách hội thoại kèm số tin nhắn và tin nhắn cuối', async () => {
    const conv1 = await repo.createConversation('Hội thoại 1')
    await repo.saveTurnInTransaction(
      conv1.id,
      { role: 'user', content: 'Tin nhắn đầu tiên' },
      { role: 'assistant', content: 'Phản hồi đầu tiên' }
    )

    const conv2 = await repo.createConversation('Hội thoại 2')
    await repo.saveTurnInTransaction(
      conv2.id,
      { role: 'user', content: 'Chào hội thoại 2' },
      { role: 'assistant', content: 'Chào bạn ở hội thoại 2' }
    )

    const list = await repo.listConversations()
    expect(list.length).toBeGreaterThanOrEqual(2)
    // Sắp xếp ID giảm dần (mới nhất lên đầu)
    expect(list[0].id).toBe(conv2.id)
    expect(list[0].title).toBe('Hội thoại 2')
    expect(list[0].messageCount).toBe(2)
    expect(list[0].lastMessage).toBe('Chào bạn ở hội thoại 2')
  })

  it('7. getConversationMessages() trả về toàn bộ tin nhắn chi tiết theo thứ tự tăng dần', async () => {
    const conv = await repo.createConversation('Xem chi tiết')
    await repo.saveTurnInTransaction(
      conv.id,
      { role: 'user', content: 'A' },
      { role: 'assistant', content: 'B' }
    )
    await repo.saveTurnInTransaction(
      conv.id,
      { role: 'user', content: 'C' },
      { role: 'assistant', content: 'D' }
    )

    const msgs = await repo.getConversationMessages(conv.id)
    expect(msgs).toHaveLength(4)
    expect(msgs[0].content).toBe('A')
    expect(msgs[1].content).toBe('B')
    expect(msgs[2].content).toBe('C')
    expect(msgs[3].content).toBe('D')
  })

  it('8. deleteConversation() xóa cuộc hội thoại và tự động cascade xóa tin nhắn', async () => {
    const conv = await repo.createConversation('Để xóa')
    await repo.saveTurnInTransaction(
      conv.id,
      { role: 'user', content: 'Tin nhắn cần xóa' },
      { role: 'assistant', content: 'Phản hồi cần xóa' }
    )

    const deleted = await repo.deleteConversation(conv.id)
    expect(deleted).toBe(true)

    // Kiểm tra cuộc hội thoại không còn
    const list = await repo.listConversations()
    expect(list.some((c) => c.id === conv.id)).toBe(false)

    // Kiểm tra tin nhắn bên trong cũng đã bị cascade xóa
    const msgs = await repo.getConversationMessages(conv.id)
    expect(msgs).toHaveLength(0)
  })
})
