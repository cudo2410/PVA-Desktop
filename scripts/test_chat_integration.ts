import { OllamaChatModel } from '../src/adapters/ai/OllamaChatModel.ts'
import { ChatService } from '../src/core/services/ChatService.ts'
import { ModelError } from '../src/core/models/ModelError.ts'

async function runTests(): Promise<void> {
  console.log('=== STARTING CHAT & IPC INTEGRATION TESTS ===\n')

  const model = new OllamaChatModel({
    baseUrl: 'http://localhost:11434',
    model: 'qwen3:1.7b',
    timeoutMs: 60000
  })
  const chatService = new ChatService(model)

  // 1. Health check
  console.log('[Test 1] Kiểm tra sức khỏe Ollama (health check)...')
  const health = await model.health()
  console.log('Health result:', health)
  if (!health.ok) {
    throw new Error(`Health check failed: ${health.reason}`)
  }
  console.log('=> Test 1 PASSED: Ollama đang hoạt động và model qwen3:1.7b sẵn sàng.\n')

  // 2. Chat completion
  console.log('[Test 2] Gửi tin nhắn thực tế qua ChatService: "Xin chào, bạn là ai?"...')
  const start = Date.now()
  const res = await chatService.send('Xin chào, bạn là ai?')
  const elapsed = ((Date.now() - start) / 1000).toFixed(2)
  console.log(`Phản hồi nhận được (${elapsed}s):\n"${res.text}"\n`)
  if (!res.text || res.text.length < 5) {
    throw new Error('Phản hồi từ model quá ngắn hoặc rỗng')
  }
  if (res.text.includes('<think>')) {
    throw new Error('Phản hồi vẫn còn thẻ <think>')
  }
  console.log('=> Test 2 PASSED: Nhận được câu trả lời chuẩn xác và sạch tag suy nghĩ.\n')

  // 3. Validation - reject empty message
  console.log('[Test 3] Kiểm tra chặn tin nhắn rỗng / khoảng trắng...')
  try {
    await chatService.send('   \n  \t  ')
    throw new Error('Thất bại: Lẽ ra phải ném lỗi khi tin nhắn rỗng')
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('trống')) {
      console.log(`Bắt được lỗi hợp lệ: "${err.message}"`)
      console.log('=> Test 3 PASSED: Validation chặn tin nhắn rỗng hoạt động đúng.\n')
    } else {
      throw err
    }
  }

  // 4. Error Handling - MODEL_UNAVAILABLE
  console.log('[Test 4] Kiểm tra mã lỗi MODEL_UNAVAILABLE khi endpoint sai...')
  const unreachableModel = new OllamaChatModel({
    baseUrl: 'http://127.0.0.1:54321', // Port không tồn tại
    model: 'qwen3:1.7b',
    timeoutMs: 3000
  })
  try {
    await unreachableModel.complete([{ role: 'user', content: 'test' }])
    throw new Error('Thất bại: Lẽ ra phải ném lỗi MODEL_UNAVAILABLE')
  } catch (err: unknown) {
    if (err instanceof ModelError && err.code === 'MODEL_UNAVAILABLE') {
      console.log(`Bắt được đúng ModelError: code=${err.code}, message="${err.message}"`)
      console.log('=> Test 4 PASSED: Chuẩn hóa mã lỗi MODEL_UNAVAILABLE chính xác.\n')
    } else {
      throw err
    }
  }

  // 5. Error Handling - MODEL_TIMEOUT
  console.log('[Test 5] Kiểm tra mã lỗi MODEL_TIMEOUT khi quá hạn...')
  const timeoutModel = new OllamaChatModel({
    baseUrl: 'http://localhost:11434',
    model: 'qwen3:1.7b',
    timeoutMs: 1 // 1ms chắc chắn timeout
  })
  try {
    await timeoutModel.complete([{ role: 'user', content: 'test timeout' }])
    throw new Error('Thất bại: Lẽ ra phải ném lỗi MODEL_TIMEOUT')
  } catch (err: unknown) {
    if (err instanceof ModelError && err.code === 'MODEL_TIMEOUT') {
      console.log(`Bắt được đúng ModelError: code=${err.code}, message="${err.message}"`)
      console.log('=> Test 5 PASSED: Chuẩn hóa mã lỗi MODEL_TIMEOUT chính xác.\n')
    } else {
      throw err
    }
  }

  console.log('=== TẤT CẢ 5 BÀI TEST TÍCH HỢP ĐỀU ĐẠT CHUẨN (ALL TESTS PASSED) ===')
}

runTests().catch((err) => {
  console.error('Test suite failed:', err)
  process.exit(1)
})
