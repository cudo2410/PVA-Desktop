# BÁO CÁO CỔNG KIỂM ĐỊNH G1 & SPIKE CÔNG NGHỆ (TUẦN 3 – MỐC M2)

- **Dự án:** Trợ lý ảo cá nhân PVA (Personal Virtual Assistant – Desktop Windows)
- **Mốc kiểm định:** Cổng G1 / Mốc M2 (Lộ trình MVP 8 tuần – SRS v2.1)
- **Ngày đo thực nghiệm:** 22/11/2026
- **Máy mục tiêu đo kiểm:**
  - **CPU:** Intel Core i5-12500H (12 nhân / 16 luồng, AVX2 / AVX-VNNI)
  - **GPU:** NVIDIA GeForce RTX 3050 Ti Laptop (4.096 MiB VRAM, Driver 546.30) + Intel Iris Xe Graphics
  - **Hệ điều hành & Runtime:** Windows 11, Node.js `v24.11.1`, Electron `44.7.2`, Ollama `0.40.15` (`qwen3:1.7b`), `whisper.cpp` `b5907` (CPU + OpenBLAS x64), Piper `1.8.0` (`OHF-Voice/piper1-gpl`)

---

## 1. Tóm tắt kết quả Cổng G1 & Quyết định (Executive Summary)

| Hạng mục kiểm định | Tiêu chí đạt (SRS v2.1) | Kết quả đo thực tế | Trạng thái |
| :--- | :--- | :--- | :---: |
| **G1.1 – Độ chính xác STT (30 câu)** | **WER ≤ 15%** (đúng ≥ 85% số từ) | **PhoWhisper-small GGML:** `56,30%` (beam=5) / `58,40%` (greedy)<br>**Whisper-small gốc:** `90,76%` | ❌ **KHÔNG ĐẠT** |
| **G1.2 – Tốc độ STT (câu ~5s, CPU)** | **≤ 3.000 ms** trên CPU | **PhoWhisper-small GGML:** `1.867 ms` infer / `2.369 ms` wall (greedy); `2.298 ms` infer / `2.805 ms` wall (beam=5) | ✅ **ĐẠT** |
| **G1.3 – Giọng đọc TTS & Giấy phép** | Nghe chấp nhận được (tự chấm 1–5) + kiểm tra license | **Microsoft An (WinRT):** **`4/5`** (`13–39 ms/câu`, sẵn trong Windows) → **CHỐT**<br>**Piper 1.8.0 (`vi_VN-vais1000-medium`):** **`1/5`** (`556–947 ms/câu`, license `GPL-3.0-or-later` + `CC-BY-4.0`) → **LOẠI** | ✅ **CHỐT MS AN** |
| **Spike Avatar (VRM + `three-vrm`)** | Đo FPS, CPU, RAM, VRAM khi LLM đang chạy | **VRM 3D (68.692 tris):** `163,6 FPS` avg (`157,1` min), Renderer RAM `206 MB`, VRAM `171 MiB`<br>**Dual Video (hiện tại):** `165,0 FPS` avg, Renderer RAM `116,9 MB`, VRAM `179 MiB` | ✅ **ĐẠT NFR-03** |
| **NFR-02 (Hiệu năng phản hồi AI)** | Trạng thái "đang xử lý" **≤ 200 ms**; TTFT mục tiêu **≤ 2.000 ms** (20 câu) | UI state sync **`< 16 ms`**; `qwen3:1.7b` (`think: false`, `num_gpu: 0`): TTFT avg **`230,8 ms`**, p95 **`268,8 ms`**, tốc độ **`26,4 tok/s`** | ✅ **ĐẠT** |
| **NFR-03 (Tài nguyên hệ thống)** | Renderer RAM **≤ 1.024 MB**; VRAM **≤ 3.584 MiB (3,5 GB)** | Renderer RAM max **`206 MB`** (VRM) / **`116,9 MB`** (Video); VRAM max **`171–179 MiB`** | ✅ **ĐẠT** |

### Kết luận Cổng G1 & Quyết định cho FR-03
- **Kết luận Cổng G1 (STT):** **KHÔNG ĐẠT** (do điều kiện cần **WER ≤ 15%** không đạt trên bộ thu âm thực tế 30 câu `g1-dataset`, dù điều kiện tốc độ **≤ 3 giây** đã đạt).
- **Quyết định theo SRS v2.1 (Mục 2.3 & Mục 3 Lộ trình):**
  1. **Hạ mức ưu tiên `FR-03` (Nhập liệu bằng giọng nói / STT) từ `Must` xuống `Should`**. Phiên bản MVP (Project III) tập trung hoàn thiện luồng chat văn bản, quản lý công việc, nhắc nhở, hồ sơ cá nhân và `PermissionGuard` theo đúng lịch trình Tuần 4–8.
  2. **Chốt giọng đọc TTS tùy chọn là `Microsoft An` (chấm `4/5`, gọi qua WinRT `Windows.Media.SpeechSynthesis`)** cho Tuần 6 (đúng nhánh *"[Nếu G1 không đạt] Chỉ thêm TTS bằng Microsoft An (tùy chọn)"* trong lộ trình) và **loại bỏ Piper** (`1/5`, tránh phụ thuộc Python runtime và giấy phép `GPL-3.0-or-later`). Độ trễ chỉ `13–39 ms`, không tăng dung lượng bộ cài `.exe` offline.
  3. **Kiến trúc mở rộng (🔌):** Đã hoàn thiện sẵn 2 domain port [`SpeechToText`](file:///d:/Project%203/PVA/src/core/ports/SpeechToText.ts) và [`TextToSpeech`](file:///d:/Project%203/PVA/src/core/ports/TextToSpeech.ts) trong `src/core/ports/`, cho phép gắn lại `WhisperCppStt` (hoặc mô hình STT cải tiến / micro chuẩn hơn) ở **Giai đoạn 2 (Đồ án tốt nghiệp)** mà không phải sửa nghiệp vụ cốt lõi.

---

## 2. Mục 1 & 2 – Spike STT (`whisper.cpp` + `PhoWhisper-small` GGML vs `Whisper-small` gốc)

### 2.1. Quy trình cài đặt và chuyển đổi mô hình
1. **Binary `whisper.cpp`:** Tải bản build chính thức `b5907` (`whisper-blas-bin-x64.zip`, hỗ trợ CPU AVX2/Alderlake + OpenBLAS, chạy hoàn toàn trên CPU để không tranh VRAM).
2. **Mô hình đối chứng:** `ggml-small.bin` (OpenAI Whisper-small gốc, `487,01 MB`).
3. **Chuyển đổi `PhoWhisper-small` → GGML:**
   - Tải checkpoint gốc `vinai/PhoWhisper-small` từ HuggingFace (giấy phép **BSD-3-Clause**).
   - Chuyển đổi sang định dạng GGML F16 bằng script chính thức `convert-h5-to-ggml.py` kết hợp `mel_filters.npz` của `openai/whisper` → tạo tệp `ggml-phowhisper-small.bin` (`487,60 MB`).
   - **Kiểm chứng tính đúng đắn chuyển đổi:** Chạy đối chiếu 4 mẫu giữa bản PyTorch HuggingFace gốc và bản GGML trên `whisper-cli.exe` cho kết quả đầu ra khớp nhau hoàn toàn (ví dụ `cmd_08.wav`: `"khởi động lại máy tính."` trên cả hai). Chạy kiểm chứng bổ sung trên âm thanh tiếng Việt sạch (`"Đã mở trình duyệt Google Chrome theo yêu cầu của bạn."`) cho kết quả `"đã mở trình duyệt google cờ rôm theo yêu cầu của bạn."` (đúng 10/11 từ tiếng Việt).

### 2.2. Bảng số đo tổng hợp trên bộ 30 câu `g1-dataset` (16 kHz, mono, 16-bit PCM, 238 từ tham chiếu)

| Mô hình & Cấu hình (`-t 8`, CPU OpenBLAS) | Corpus WER (%) | Mean WER/câu (%) | Đúng tuyệt đối (0% WER) | Tổng lỗi / Tổng từ | Thời gian TB (infer / wall) | Câu ~5s (infer / wall) | P95 (infer / wall) | Đạt WER ≤ 15% | Đạt ≤ 3s |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Whisper-small gốc** (`bs=1, bo=1`) | **90,76%** | 92,87% | 0 / 30 | 216 / 238 | 2.107 / 2.591 ms | 2.034 / 2.490 ms | 2.285 / 2.895 ms | ❌ | ✅ |
| **PhoWhisper-small GGML** (`bs=1, bo=1`) | **58,40%** | 58,55% | 1 / 30 | 139 / 238 | **1.837 / 2.337 ms** | **1.867 / 2.369 ms** | 1.976 / 2.551 ms | ❌ | ✅ |
| **PhoWhisper-small GGML** (`bs=5, bo=5`) | **56,30%** | 57,56% | 1 / 30 | 134 / 238 | 2.085 / 2.569 ms | 2.298 / 2.805 ms | 2.258 / 3.063 ms | ❌ | ✅ |

*(Ghi chú: `infer` là thời gian suy luận thuần khi mô hình đã nạp sẵn trên RAM — tương đương chế độ `whisper-server` / worker chạy nền; `wall` là tổng thời gian gồm cả ~370–550 ms nạp mô hình từ ổ đĩa cho mỗi lần gọi CLI.)*

### 2.3. Phân tích WER theo nhóm câu lệnh

| Nhóm lệnh (`category`) | Số câu | Tổng từ | Whisper-small gốc (WER) | PhoWhisper-small greedy (WER) | PhoWhisper-small beam=5 (WER) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `app_control` (Điều khiển ứng dụng) | 8 | 47 | 106,38% | 61,70% | **59,57%** |
| `task_management` (Công việc & nhắc nhở) | 8 | 78 | 78,21% | 58,97% | **55,13%** |
| `information_search` (Tra cứu thông tin) | 7 | 56 | 91,07% | 60,71% | **58,93%** |
| `conversation` (Giao tiếp tự nhiên) | 7 | 57 | 94,74% | 52,63% | **52,63%** |
| **Tổng cộng toàn bộ 30 câu** | **30** | **238** | **90,76%** | **58,40%** | **56,30%** |

### 2.4. Phân tích nguyên nhân gốc rễ (Root Cause Analysis)
1. **PhoWhisper-small vượt trội rõ rệt so với Whisper-small gốc** (giảm WER từ `90,76%` xuống `56,30%`, tức cải thiện **34,46 điểm phần trăm**), đồng thời chạy nhanh hơn (encoder + decoder gọn, ít lặp token rác).
2. **Tại sao WER thực tế vẫn cao hơn ngưỡng 15%?**
   - **Chất lượng tín hiệu micro laptop không đồng đều:** Khảo sát biên độ RMS trên `g1-dataset` cho thấy một số câu thu âm rõ (`cmd_08.wav` RMS = `0,0781` đạt **0,0% WER**; `cmd_27.wav` RMS = `0,0669` đạt **10,0% WER**; `cmd_03.wav` đạt **14,3% WER**; `cmd_09.wav` đạt **20,0% WER**), trong khi nhiều câu khác có âm lượng rất nhỏ/nhiễu nền (`cmd_02.wav` RMS = `0,0122`; `cmd_22.wav` RMS = `0,0141`).
   - **Từ mượn tiếng Anh (Code-switching):** PhoWhisper được tinh chỉnh thuần tiếng Việt nên nhận sai các tên ứng dụng/thuật ngữ tiếng Anh (`Google Chrome`, `Spotify`, `TypeScript`, ổ `C`). Ngay cả trên âm thanh TTS sạch, `"Chrome"` vẫn bị phiên âm thành `"cờ rôm"`.
   - **Nhiễu dữ liệu nhãn ở mẫu `cmd_21.wav`:** Bản ghi `cmd_21.wav` có nội dung âm thanh gần với câu `cmd_22` (`"định nghĩa trí tuệ..."`) thay vì nhãn `"Tìm kiếm tài liệu lập trình TypeScript trên mạng"`, góp phần tăng WER ở nhóm `information_search`.
3. **Hướng cải thiện cho Giai đoạn 2 (Đồ án tốt nghiệp):** Bổ sung tiền xử lý âm thanh (VAD + chuẩn hóa âm lượng AGC + khử nhiễu RNNoise), dùng micro ngoài/headset, bổ sung `initial_prompt` chứa danh sách tên ứng dụng (`Chrome, Spotify, TypeScript`), và thử nghiệm mô hình cỡ lớn hơn (`PhoWhisper-medium` / `Whisper-large-v3-turbo` lượng tử hóa `Q5_0`) khi nâng cấp driver CUDA.

---

## 3. Mục 3 – Đánh giá TTS (`Piper vi_VN-vais1000-medium` vs `Microsoft An`)

### 3.1. Số đo tốc độ tổng hợp trên 5 câu tiếng Việt đại diện

| Câu | Nhóm tình huống | Độ dài âm thanh (Piper / MS An) | Thời gian tạo – Piper 1.8.0 (RTF) | Thời gian tạo – Microsoft An WinRT (RTF) |
| :--- | :--- | :---: | :---: | :---: |
| `tts_01` | Chào hỏi *(lần đầu / cold)* | 3,65 s / 5,39 s | 3.020,5 ms (0,829) | **177,9 ms** (0,033) |
| `tts_02` | Xác nhận công việc | 4,64 s / 5,51 s | 611,5 ms (0,132) | **39,2 ms** (0,007) |
| `tts_03` | Thông báo trạng thái | 3,39 s / 3,54 s | 556,1 ms (0,164) | **13,1 ms** (0,004) |
| `tts_04` | Giải thích kiến thức | 5,49 s / 6,52 s | 714,1 ms (0,130) | **13,3 ms** (0,002) |
| `tts_05` | Cảnh báo lỗi | 5,60 s / 7,17 s | 947,0 ms (0,169) | **22,5 ms** (0,003) |
| **Trung bình ổn định (`tts_02`–`tts_05`)** | — | **4,78 s / 5,69 s** | **707,2 ms (RTF 0,149)** | **22,0 ms (RTF 0,004)** |

### 3.2. Phân tích kỹ thuật & Giấy phép (License Compliance – SRS v2.1)
- **Piper (`vi_VN-vais1000-medium`):**
  - *Phát hiện kỹ thuật quan trọng:* Bản binary C++ cũ `rhasspy/piper` (`2023.11.14-2`, tương ứng Piper 1.2) **bị crash** khi đọc tiếng Việt (`"aɪ" is not a single codepoint`). Model card yêu cầu **Piper ≥ 1.5**, hiện phát hành tại `OHF-Voice/piper1-gpl` dưới dạng gói Python `piper-tts 1.8.0` (tốn thêm runtime Python + `onnxruntime` ~120 MB + model `60,3 MB`).
  - *Giấy phép:* Engine `piper-tts 1.8.0` dùng **`GPL-3.0-or-later`** (copyleft mạnh — cần lưu ý tương thích với giấy phép MIT của PVA nếu nhúng trực tiếp; chỉ nên gọi tách tiến trình con), bộ giọng `VAIS-1000` dùng **`CC-BY-4.0`** (cần ghi nguồn).
- **Microsoft An (Windows OneCore):**
  - Có sẵn trên Windows 11 của máy mục tiêu, gọi qua WinRT `Windows.Media.SpeechSynthesis` (không nằm ở SAPI5 truyền thống).
  - **Không tăng dung lượng bộ cài**, tốc độ cực nhanh (**~22 ms/câu**, nhanh hơn Piper ~32 lần), không phát sinh rủi ro giấy phép mã nguồn mở.

### 3.3. Bảng chấm điểm độ dễ nghe (1–5) & Chốt giọng đọc
*(Trang nghe thử trực tiếp: `d:\Project 3\spike-g1\piper\tts_compare.html`)*

| Engine TTS | Điểm dễ nghe (1–5) | Đánh giá & Lý do | Quyết định |
| :--- | :---: | :--- | :--- |
| **Piper 1.8.0 (`vi_VN-vais1000-medium`)** | **1 / 5** | Chất lượng phát âm tiếng Việt không đạt kỳ vọng người dùng; yêu cầu Python + Piper ≥ 1.5 (`GPL-3.0-or-later`), chậm hơn ~32× | ❌ **LOẠI** |
| **Microsoft An (Windows OneCore WinRT)** | **4 / 5** | Nghe rõ ràng, dễ hiểu; tốc độ siêu nhanh (`13–39 ms/câu`); có sẵn trên Windows 11, không phát sinh dung lượng đóng gói và rủi ro giấy phép | ✅ **CHỐT (TTS tùy chọn MVP)** |

*(Hướng mở rộng Giai đoạn 2 – Đồ án tốt nghiệp: giữ nguyên cổng `TextToSpeech`, bổ sung adapter voice cloning cục bộ như `F5-TTS tiếng Việt` / `viXTTS` nếu muốn clone giọng và ngữ điệu nhân vật riêng.)*

---

## 4. Mục 4 – Spike Avatar: `VRM + three-vrm` vs `Dual Video Seamless Loop`

### 4.1. Kịch bản đo kiểm
- Cô lập trong Electron harness riêng (`spike-g1/avatar-vrm-spike/`, không làm ảnh hưởng `PVA/package.json`).
- Tải mô hình VRM chuẩn `VRM1_Constraint_Twist_Sample.vrm` (**10,78 MB**, **68.692 tam giác**, **18 draw calls**), chạy vòng lặp 60+ FPS với chuyển động xoay đầu, chớp mắt (`blink`) và nhép miệng (`aa`) liên tục trong **20 giây**, **đồng thời gọi Ollama (`qwen3:1.7b`) sinh phản hồi liên tục ở luồng nền**.
- Đo đối chứng trong cùng điều kiện với cơ chế **Dual Video Seamless Loop** (`video.mp4` – Sinon) đang dùng trong [CharacterStage.tsx](file:///d:/Project%203/PVA/src/ui/src/components/CharacterStage.tsx).

### 4.2. Bảng số đo tài nguyên khi LLM (`qwen3:1.7b`) đang chạy đồng thời

| Chỉ số tài nguyên | VRM 3D (`three` + `@pixiv/three-vrm`) | Dual Video (`video.mp4` hiện tại) | Ngưỡng NFR-03 | Đánh giá |
| :--- | :---: | :---: | :---: | :---: |
| **FPS trung bình / tối thiểu** | **163,6 / 157,1 FPS** | **165,0 / 164,9 FPS** | Mượt (≥ 60 FPS) | ✅ Cả hai rất mượt |
| **RAM tiến trình Renderer (TB / Max)** | **205,2 / 206,0 MB** | **115,5 / 116,9 MB** | **≤ 1.024 MB** | ✅ Cả hai ĐẠT |
| **Tổng RAM toàn tiến trình Electron (Max)** | **833,5 MB** | **675,1 MB** | Tham chiếu | Video nhẹ hơn ~19% |
| **CPU tiến trình Renderer / GPU Process** | **2,9% / 4,8%** | **0,9% / 0,8%** | — | Video nhẹ hơn ~4,5× |
| **CPU toàn hệ thống TB (kèm Ollama CPU)** | **89,6%** | **75,8%** | — | Video chừa thêm ~14% CPU cho LLM |
| **Số lượt LLM hoàn tất trong 20s** | **3 lượt** | **4 lượt** | — | Video ít tranh CPU hơn |
| **VRAM GPU RTX 3050 Ti (TB / Max)** | **171 / 171 MiB** | **171,2 / 179 MiB** | **≤ 3.584 MiB (3,5 GB)** | ✅ ĐẠT |

### 4.3. Nhận xét & Khuyến nghị về Avatar
- **Ghi chú kỹ thuật quan trọng về GPU:** Trên máy mục tiêu (Driver NVIDIA `546.30` + Ollama `0.40.15`), CUDA gặp lỗi `device kernel image is invalid`, nên `OllamaChatModel` cấu hình `num_gpu: 0` (chạy `qwen3:1.7b` trên CPU AVX2); đồng thời Electron mặc định render WebGL qua iGPU Intel Iris Xe nên VRAM RTX 3050 Ti giữ rất thấp (`171–179 MiB`).
- **Khuyến nghị MVP:** **Duy trì Dual Video Seamless Loop (Sinon)** cho MVP để tiết kiệm `~89 MB` Renderer RAM, `~14%` CPU và tránh gánh thêm dependency WebGL/tạo model `.vrm` riêng, đồng thời bảo đảm giao diện đạt thẩm mỹ Liquid Glass hiện có.
- **Khuyến nghị GĐ2 (Đồ án tốt nghiệp):** Kết quả Spike chứng minh **VRM 3D hoàn toàn khả thi** về mặt hiệu năng (`163 FPS`, chỉ `206 MB` RAM Renderer), có thể nâng cấp ở GĐ2 khi kết hợp lip-sync theo âm thanh TTS.

---

## 5. Mục 5 – Số liệu nền lần đầu cho NFR-02 và NFR-03

### 5.1. Số liệu nền NFR-02 (20 câu tiếng Việt, `qwen3:1.7b`, `think: false`, `num_gpu: 0`, `temperature: 0.3`)
- **Trạng thái "Đang xử lý" trên UI:** Trong [App.tsx](file:///d:/Project%203/PVA/src/ui/src/App.tsx) (`handleSend`), `appStore.setProcessing(...)` và tin nhắn chờ `status: 'processing'` được cập nhật **đồng bộ trước khi gọi IPC**, thời gian phản hồi giao diện là **1 khung hình React (`~1–16 ms`)**, đạt xa ngưỡng **≤ 200 ms**.
- **Cold start (lần nạp mô hình đầu tiên sau khi khởi động Ollama):** TTFT = **`3.016,3 ms`**, Total = `4.661,1 ms`, tốc độ `26,7 tok/s`.
- **Trạng thái ấm (20 câu liên tiếp):**

| Chỉ số NFR-02 (`qwen3:1.7b`, 20 câu) | Giá trị đo thực tế | Ngưỡng mục tiêu sơ bộ (SRS v2.1) | Kết quả |
| :--- | :---: | :---: | :---: |
| **Thời gian hiện trạng thái "Đang xử lý"** | **< 16 ms** (đồng bộ UI) | ≤ 200 ms | ✅ **ĐẠT** |
| **TTFT Trung bình (Time to First Token)** | **230,8 ms** | ≤ 2.000 ms | ✅ **ĐẠT** (nhanh gấp ~8,7×) |
| **TTFT Trung vị (P50)** | **234,1 ms** | ≤ 2.000 ms | ✅ **ĐẠT** |
| **TTFT Phân vị 95 (P95)** | **268,8 ms** | ≤ 2.000 ms | ✅ **ĐẠT** |
| **TTFT Lớn nhất (Max)** | **270,9 ms** | ≤ 2.000 ms | ✅ **ĐẠT** |
| **Tổng thời gian trả lời TB / P95** *(tối đa 160 tok)* | **4.628,5 ms / 6.565,6 ms** | Ghi nhận làm nền | ✅ Đã ghi nhận |
| **Tốc độ sinh token trung bình** | **26,4 tokens/giây** | Ghi nhận làm nền | ✅ Tốt (vượt tốc độ đọc) |

### 5.2. Số liệu nền NFR-03 (Tài nguyên hệ thống)

| Thành phần đo | Giá trị thực tế (nền Tuần 3) | Ngưỡng NFR-03 (SRS v2.1) | Kết quả |
| :--- | :---: | :---: | :---: |
| **RAM tiến trình giao diện (Renderer)** | **116,9 MB** (Video) / **206,0 MB** (VRM) | ≤ 1.024 MB (1 GB) | ✅ **ĐẠT** |
| **VRAM GPU RTX 3050 Ti (Idle / Đang chạy đồng thời)** | **171 MiB / 179 MiB** | ≤ 3.584 MiB (3,5 GB) | ✅ **ĐẠT** |
| **Rủi ro phát hiện cần lưu ý** | Driver NVIDIA `546.30` gây lỗi CUDA với Ollama `0.40.15` → chạy CPU `num_gpu=0` (CPU đạt ~76–90% khi trả lời) | Cần ghi rõ trong README & FR-15 | ⚠️ Đã ghi nhận & xử lý fallback |

---

## 6. Điểm mở rộng kiến trúc (🔌 Chuẩn bị cho Giai đoạn 2)

Tuân thủ kiến trúc Hexagonal (Ports & Adapters), 2 hợp đồng giao tiếp giọng nói đã được bổ sung vào tầng Core Domain mà **không phụ thuộc** vào bất kỳ thư viện/tiến trình ngoài nào:
- [`src/core/ports/SpeechToText.ts`](file:///d:/Project%203/PVA/src/core/ports/SpeechToText.ts): Định nghĩa `SpeechToText` (`health()`, `transcribeFile()`, `transcribeBuffer()`), `SttOptions`, `SttResult`, `SttSegment`, `SttHealth`, `SttErrorCode`.
- [`src/core/ports/TextToSpeech.ts`](file:///d:/Project%203/PVA/src/core/ports/TextToSpeech.ts): Định nghĩa `TextToSpeech` (`health()`, `listVoices()`, `synthesize()`, `stop()`), `TtsVoice`, `TtsOptions`, `TtsResult`, `TtsHealth`, `TtsErrorCode`.
- [`src/core/ports/VoicePorts.test.ts`](file:///d:/Project%203/PVA/src/core/ports/VoicePorts.test.ts): Bộ unit test kiểm chứng contract bằng fake adapters (`npm run lint`, `npm run typecheck`, `npm test` đạt 59/59 test xanh).

---

## 7. Phụ lục – Dữ liệu thực nghiệm lưu trữ
Toàn bộ log thô và công cụ tái lập thí nghiệm (phục vụ Chương Đánh giá trong Đồ án tốt nghiệp) được lưu trong `d:\Project 3\spike-g1\`:
- `results/stt_benchmark.json` — chi tiết 30 câu × 3 cấu hình STT (`whisper-small`, `phowhisper-small` greedy, `phowhisper-small` beam=5).
- `results/tts_benchmark.json` & `piper/tts_compare.html` — 5 cặp file WAV và bảng so sánh độ trễ Piper vs Microsoft An.
- `results/nfr_and_avatar_benchmark.json` — log 20 câu NFR-02 và chuỗi thời gian FPS/CPU/RAM/VRAM của VRM vs Dual Video.
