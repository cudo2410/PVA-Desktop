import fs from 'node:fs'
import path from 'node:path'
import type { DatasetItem } from './generate_g1_dataset.ts'

export interface WavHeaderInfo {
  readonly isValid: boolean
  readonly format: string
  readonly audioFormat: number
  readonly channels: number
  readonly sampleRate: number
  readonly byteRate: number
  readonly blockAlign: number
  readonly bitsPerSample: number
  readonly dataSize: number
  readonly durationSec: number
  readonly error?: string
}

export function parseWavHeader(buffer: Buffer): WavHeaderInfo {
  if (buffer.length < 44) {
    return {
      isValid: false,
      format: '',
      audioFormat: 0,
      channels: 0,
      sampleRate: 0,
      byteRate: 0,
      blockAlign: 0,
      bitsPerSample: 0,
      dataSize: 0,
      durationSec: 0,
      error: `Kích thước file quá nhỏ (${buffer.length} bytes < 44 bytes)`
    }
  }

  const riff = buffer.toString('ascii', 0, 4)
  const wave = buffer.toString('ascii', 8, 12)
  const fmt = buffer.toString('ascii', 12, 16)

  if (riff !== 'RIFF' || wave !== 'WAVE' || fmt !== 'fmt ') {
    return {
      isValid: false,
      format: riff + wave + fmt,
      audioFormat: 0,
      channels: 0,
      sampleRate: 0,
      byteRate: 0,
      blockAlign: 0,
      bitsPerSample: 0,
      dataSize: 0,
      durationSec: 0,
      error: `Header không hợp lệ (cần RIFF/WAVE/fmt, nhận được: ${riff}/${wave}/${fmt})`
    }
  }

  const audioFormat = buffer.readUInt16LE(20)
  const channels = buffer.readUInt16LE(22)
  const sampleRate = buffer.readUInt32LE(24)
  const byteRate = buffer.readUInt32LE(28)
  const blockAlign = buffer.readUInt16LE(32)
  const bitsPerSample = buffer.readUInt16LE(34)
  const dataTag = buffer.toString('ascii', 36, 40)
  const dataSize = buffer.readUInt32LE(40)

  if (dataTag !== 'data') {
    return {
      isValid: false,
      format: dataTag,
      audioFormat,
      channels,
      sampleRate,
      byteRate,
      blockAlign,
      bitsPerSample,
      dataSize,
      durationSec: 0,
      error: `Không tìm thấy subchunk 'data' tại offset 36 (nhận được: ${dataTag})`
    }
  }

  const durationSec = Number((dataSize / (sampleRate * channels * (bitsPerSample / 8))).toFixed(2))

  return {
    isValid: true,
    format: 'WAV/PCM',
    audioFormat,
    channels,
    sampleRate,
    byteRate,
    blockAlign,
    bitsPerSample,
    dataSize,
    durationSec
  }
}

export function validateG1Dataset(datasetDir: string): void {
  console.log(`\n=== KIỂM THỬ TÍNH TOÀN VẸN BỘ DỮ LIỆU CỔNG G1 (TUẦN 3) ===`)
  console.log(`Đường dẫn: ${datasetDir}\n`)

  if (!fs.existsSync(datasetDir)) {
    throw new Error(`Thư mục dataset không tồn tại: ${datasetDir}`)
  }

  // 1. Kiểm tra metadata.json
  const jsonPath = path.join(datasetDir, 'metadata.json')
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Thiếu file metadata.json tại: ${jsonPath}`)
  }
  const items: DatasetItem[] = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
  if (!Array.isArray(items) || items.length !== 30) {
    throw new Error(`Số lượng bản ghi trong metadata.json phải là 30 (nhận được ${items.length})`)
  }
  console.log(`[OK] metadata.json: Có đủ ${items.length} bản ghi hợp lệ.`)

  // 2. Kiểm tra metadata.csv
  const csvPath = path.join(datasetDir, 'metadata.csv')
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Thiếu file metadata.csv tại: ${csvPath}`)
  }
  const csvContent = fs.readFileSync(csvPath, 'utf-8')
  const csvLines = csvContent.trim().split('\n')
  // Dòng 0 là header, từ dòng 1 đến 30 là 30 câu lệnh
  if (csvLines.length !== 31) {
    throw new Error(
      `File metadata.csv phải có 31 dòng (1 header + 30 dòng dữ liệu). Nhận được ${csvLines.length}`
    )
  }
  console.log(`[OK] metadata.csv: Có đủ header và 30 dòng dữ liệu.`)

  // 3. Kiểm tra từng file WAV
  let totalDuration = 0
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const wavPath = path.join(datasetDir, item.filename)
    if (!fs.existsSync(wavPath)) {
      throw new Error(`Thiếu file âm thanh: ${item.filename}`)
    }

    const buffer = fs.readFileSync(wavPath)
    const header = parseWavHeader(buffer)

    if (!header.isValid) {
      throw new Error(`File ${item.filename} có header WAV không hợp lệ: ${header.error}`)
    }

    if (header.sampleRate !== 16000) {
      throw new Error(
        `File ${item.filename} sai tần số lấy mẫu: ${header.sampleRate} Hz (yêu cầu đúng 16000 Hz)`
      )
    }

    if (header.channels !== 1) {
      throw new Error(
        `File ${item.filename} sai số kênh âm thanh: ${header.channels} (yêu cầu 1 kênh Mono)`
      )
    }

    if (header.bitsPerSample !== 16) {
      throw new Error(
        `File ${item.filename} sai độ sâu bit: ${header.bitsPerSample} bit (yêu cầu 16-bit PCM)`
      )
    }

    if (header.audioFormat !== 1) {
      throw new Error(`File ${item.filename} không phải định dạng PCM không nén (AudioFormat = 1)`)
    }

    totalDuration += header.durationSec
  }

  console.log(`[OK] 30 file WAV (cmd_01.wav -> cmd_30.wav):`)
  console.log(`     - Định dạng: RIFF WAVE (PCM 16-bit)`)
  console.log(`     - Tần số lấy mẫu: 16000 Hz (16 kHz)`)
  console.log(`     - Kênh: 1 (Mono)`)
  console.log(`     - Tổng thời lượng ước tính: ${totalDuration.toFixed(2)} giây`)
  console.log(`\n=> KẾT LUẬN: BỘ DỮ LIỆU G1 ĐẠT CHUẨN 100% TIÊU CHÍ WHISPER.CPP VÀ PHOWHISPER.\n`)
}

// Chạy trực tiếp
if (process.argv[1] && process.argv[1].endsWith('validate_g1_dataset.ts')) {
  const targetDir = path.resolve(process.cwd(), 'g1-dataset')
  try {
    validateG1Dataset(targetDir)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[ERROR] Kiểm thử bộ dữ liệu G1 thất bại: ${msg}`)
    process.exit(1)
  }
}
