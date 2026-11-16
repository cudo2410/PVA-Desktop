import fs from 'node:fs'
import path from 'node:path'

export interface CommandDefinition {
  readonly id: string
  readonly text: string
  readonly category: 'app_control' | 'task_management' | 'information_search' | 'conversation'
}

export interface DatasetItem extends CommandDefinition {
  readonly filename: string
  readonly sampleRate: number
  readonly channels: number
  readonly bitDepth: number
  readonly durationSec: number
  readonly fileSize: number
}

export const COMMANDS: readonly CommandDefinition[] = [
  // Nhóm 1: Điều khiển ứng dụng & Hệ thống (app_control) - 8 câu
  { id: 'cmd_01', text: 'Mở trình duyệt Google Chrome', category: 'app_control' },
  { id: 'cmd_02', text: 'Mở ứng dụng Spotify', category: 'app_control' },
  { id: 'cmd_03', text: 'Tắt máy tính sau ba mươi phút', category: 'app_control' },
  { id: 'cmd_04', text: 'Tăng âm lượng lên năm mươi phần trăm', category: 'app_control' },
  { id: 'cmd_05', text: 'Mở trình quản lý tệp tin', category: 'app_control' },
  { id: 'cmd_06', text: 'Chụp ảnh màn hình máy tính', category: 'app_control' },
  { id: 'cmd_07', text: 'Bật chế độ tiết kiệm pin', category: 'app_control' },
  { id: 'cmd_08', text: 'Khởi động lại máy tính', category: 'app_control' },

  // Nhóm 2: Quản lý công việc & Lịch nhắc nhở (task_management) - 8 câu
  {
    id: 'cmd_09',
    text: 'Tạo nhắc nhở họp nhóm vào chín giờ sáng mai',
    category: 'task_management'
  },
  {
    id: 'cmd_10',
    text: 'Thêm công việc hoàn thành báo cáo đồ án vào danh sách',
    category: 'task_management'
  },
  { id: 'cmd_11', text: 'Hôm nay tôi có những lịch trình nào', category: 'task_management' },
  { id: 'cmd_12', text: 'Đặt báo thức lúc sáu giờ ba mươi phút sáng', category: 'task_management' },
  { id: 'cmd_13', text: 'Xóa nhắc nhở đi mua sách chiều nay', category: 'task_management' },
  { id: 'cmd_14', text: 'Xem danh sách việc cần làm trong tuần này', category: 'task_management' },
  {
    id: 'cmd_15',
    text: 'Đánh dấu công việc nộp bài tập đã hoàn thành',
    category: 'task_management'
  },
  {
    id: 'cmd_16',
    text: 'Lên lịch hẹn gặp giảng viên hướng dẫn vào thứ sáu',
    category: 'task_management'
  },

  // Nhóm 3: Tra cứu thông tin & Hệ thống (information_search) - 7 câu
  { id: 'cmd_17', text: 'Thời tiết hôm nay ở Hà Nội như thế nào', category: 'information_search' },
  { id: 'cmd_18', text: 'Bây giờ là mấy giờ', category: 'information_search' },
  {
    id: 'cmd_19',
    text: 'Kiểm tra dung lượng ổ đĩa C còn trống bao nhiêu',
    category: 'information_search'
  },
  { id: 'cmd_20', text: 'Giá vàng hôm nay tăng hay giảm', category: 'information_search' },
  {
    id: 'cmd_21',
    text: 'Tìm kiếm tài liệu lập trình TypeScript trên mạng',
    category: 'information_search'
  },
  { id: 'cmd_22', text: 'Định nghĩa trí tuệ nhân tạo là gì', category: 'information_search' },
  { id: 'cmd_23', text: 'Ngày mai trời có mưa không', category: 'information_search' },

  // Nhóm 4: Giao tiếp & Trò chuyện với Sinon (conversation) - 7 câu
  { id: 'cmd_24', text: 'Xin chào bạn tên là gì', category: 'conversation' },
  { id: 'cmd_25', text: 'Kể cho tôi nghe một câu chuyện cười ngắn', category: 'conversation' },
  { id: 'cmd_26', text: 'Bạn có thể giúp tôi làm những việc gì', category: 'conversation' },
  { id: 'cmd_27', text: 'Hôm nay tâm trạng của tôi không được tốt lắm', category: 'conversation' },
  { id: 'cmd_28', text: 'Cảm ơn bạn rất nhiều nhé', category: 'conversation' },
  { id: 'cmd_29', text: 'Chúc bạn ngủ ngon và có giấc mơ đẹp', category: 'conversation' },
  { id: 'cmd_30', text: 'Tạm biệt và hẹn gặp lại bạn sau', category: 'conversation' }
]

/**
 * Tạo buffer file WAV PCM chuẩn 16 kHz, Mono (1 channel), 16-bit
 */
export function createPcmWav(sampleRate = 16000, durationSec = 2.0, frequency = 300): Buffer {
  const numChannels = 1
  const bitsPerSample = 16
  const numSamples = Math.floor(sampleRate * durationSec)
  const dataSize = numSamples * numChannels * (bitsPerSample / 8)
  const buffer = Buffer.alloc(44 + dataSize)

  // RIFF chunk descriptor
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8, 'ascii')

  // fmt subchunk
  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16) // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20) // AudioFormat 1 = PCM
  buffer.writeUInt16LE(numChannels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28) // ByteRate
  buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32) // BlockAlign
  buffer.writeUInt16LE(bitsPerSample, 34)

  // data subchunk
  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(dataSize, 40)

  // Sinh dữ liệu âm thanh dạng sóng mượt mà với fade-in và fade-out
  let offset = 44
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate
    let envelope = 1.0
    const fadeDuration = 0.12
    if (t < fadeDuration) {
      envelope = t / fadeDuration
    } else if (t > durationSec - fadeDuration) {
      envelope = Math.max(0, (durationSec - t) / fadeDuration)
    }

    // Tổ hợp sóng âm thanh (harmonic) mô phỏng âm điệu
    const val =
      (Math.sin(2 * Math.PI * frequency * t) * 0.7 +
        Math.sin(2 * Math.PI * (frequency * 1.5) * t) * 0.3) *
      0.18 *
      envelope

    const int16 = Math.floor(val * 32767)
    buffer.writeInt16LE(Math.max(-32768, Math.min(32767, int16)), offset)
    offset += 2
  }

  return buffer
}

export function generateDataset(datasetDir: string): readonly DatasetItem[] {
  if (!fs.existsSync(datasetDir)) {
    fs.mkdirSync(datasetDir, { recursive: true })
  }

  const results: DatasetItem[] = []

  for (let i = 0; i < COMMANDS.length; i++) {
    const cmd = COMMANDS[i]
    const filename = `${cmd.id}.wav`
    const filePath = path.join(datasetDir, filename)

    // Tính toán thời lượng ước lượng dựa trên số lượng từ tiếng Việt (khoảng 2.0s - 3.2s)
    const wordCount = cmd.text.split(' ').length
    const durationSec = Number((1.6 + wordCount * 0.16).toFixed(2))
    const frequency = 220 + (i % 8) * 35

    const wavBuffer = createPcmWav(16000, durationSec, frequency)
    fs.writeFileSync(filePath, wavBuffer)

    results.push({
      ...cmd,
      filename,
      sampleRate: 16000,
      channels: 1,
      bitDepth: 16,
      durationSec,
      fileSize: wavBuffer.length
    })
  }

  // 1. Ghi metadata.json
  const jsonPath = path.join(datasetDir, 'metadata.json')
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2), 'utf-8')

  // 2. Ghi metadata.csv (với UTF-8 BOM để Excel / PowerShell đọc tiếng Việt chuẩn)
  const csvPath = path.join(datasetDir, 'metadata.csv')
  const csvHeader =
    'id,text,category,filename,sample_rate,channels,bit_depth,duration_sec,file_size\n'
  const csvRows = results
    .map(
      (r) =>
        `${r.id},"${r.text.replace(/"/g, '""')}",${r.category},${r.filename},${r.sampleRate},${r.channels},${r.bitDepth},${r.durationSec},${r.fileSize}`
    )
    .join('\n')

  fs.writeFileSync(csvPath, `\uFEFF${csvHeader}${csvRows}\n`, 'utf-8')

  return results
}

// Chạy trực tiếp nếu là script entrypoint
if (process.argv[1] && process.argv[1].endsWith('generate_g1_dataset.ts')) {
  const targetDir = path.resolve(process.cwd(), 'g1-dataset')
  console.log(`Bắt đầu sinh bộ dữ liệu Cổng G1 tại: ${targetDir}`)
  const items = generateDataset(targetDir)
  console.log(`Đã tạo thành công ${items.length} file WAV và metadata (json, csv).`)
}
