# BÁO CÁO ĐỒNG BỘ TÀI LIỆU ĐẶC TẢ SRS v2.1 (TRỢ LÝ ẢO CÁ NHÂN PVA)
*Ngày cập nhật: 15/11/2026*  
*Quy chuẩn tuân thủ: Rule 6 (Safety & Approval) & Rule 53 (Coding Standards)*

---

## 1. Mục đích và Phạm vi cập nhật
Tài liệu này ghi nhận toàn bộ các bổ sung, điều chỉnh về mặt kiến trúc, yêu cầu chức năng (FR) và đặc tả kỹ thuật giữa mã nguồn thực tế và tài liệu đặc tả `SRS v2.1 - Trợ lý ảo cá nhân PVA` (cũng như `SRS v2.0` và `Project III`).

Các nội dung này được chuẩn hóa nhằm đồng bộ trực tiếp vào tài liệu đặc tả chính thức:

---

## 2. Chi tiết các nội dung đồng bộ kỹ thuật

### 2.1. Yêu cầu chức năng FR-01: Ngữ cảnh hội thoại đa lượt (Multi-turn Context)
- **Đặc tả bổ sung:**
  - Hệ thống áp dụng chiến lược cửa sổ trượt (Sliding Window Context) ghi nhớ **10 lượt hội thoại gần nhất** (tương đương tối đa 20 tin nhắn gồm 10 tin người dùng và 10 tin phản hồi của trợ lý ảo).
  - Khi vượt quá 20 tin nhắn, các tin nhắn cũ nhất sẽ tự động được trượt ra khỏi context của model theo nguyên tắc FIFO mà không làm mất dữ liệu đã lưu trong CSDL.
  - Mỗi request gửi đến mô hình AI luôn bắt đầu bằng `DEFAULT_SYSTEM_PROMPT` bằng tiếng Việt:
    ```
    "Bạn là PVA (Personal Virtual Assistant), một trợ lý ảo cá nhân thông minh, thân thiện, bảo mật và hữu ích. Bạn luôn phản hồi bằng tiếng Việt rõ ràng, ngắn gọn, tự nhiên và chính xác."
    ```
  - **Kiểm thử nghiệm thu:** Bộ kiểm thử tự động xác nhận đạt bài kiểm tra 3 lượt hội thoại liên tiếp (Turn 1: Tên, Turn 2: Tuổi, Turn 3: Hỏi tổng hợp) bảo toàn 100% ngữ cảnh gửi tới `ChatModel`.

### 2.2. Tắt chế độ suy nghĩ (`think: false`) cho mô hình Qwen3
- **Đặc tả bổ sung:**
  - Để tối ưu hóa thời gian phản hồi dưới 200ms và loại bỏ các đoạn suy nghĩ rác (reasoning stream) từ dòng mô hình Qwen3 (Qwen 2.5 / Qwen 3 reasoning), trường `think: false` được cấu hình trực tiếp ở cấp cao nhất của request JSON payload gửi tới API `/api/chat` của Ollama.
  - Đồng thời duy trì bộ lọc fallback stream bằng Regex và TextDecoder để đảm bảo không một thẻ `<think>...</think>` nào lọt ra giao diện người dùng.

### 2.3. Tầng lưu trữ Transactional & Công tắc lưu trữ (Persistence Toggle)
- **Đặc tả bổ sung tại Mục 8.4 (Cơ sở dữ liệu SQLite Embedded):**
  - **Port mới:** `ConversationRepository` trong `src/core/ports/ConversationRepository.ts` quản lý việc lấy hội thoại hoạt động, đọc lịch sử tin nhắn và ghi nhận lượt hội thoại.
  - **Adapter SQLite:** `SqliteConversationRepository` trong `src/adapters/db/SqliteConversationRepository.ts` sử dụng `better-sqlite3`.
  - **Tính nguyên tử (ACID Transaction):** Toàn bộ lượt hội thoại (gồm tin nhắn User và tin nhắn Assistant) được lưu trữ trong một SQLite Transaction duy nhất qua `db.transaction(...)`. Nếu có bất kỳ lỗi nào xảy ra khi ghi tin nhắn assistant, tin nhắn user cũng sẽ được tự động rollback.
  - **Công tắc bật/tắt lưu (Persistence Toggle):**
    - Trạng thái được lưu trong bảng `settings` với khóa `'chat_persistence'` (`'true' | 'false'`).
    - Khi Bật (mặc định): Tin nhắn được ghi vào database và tự động nạp lại khi ứng dụng khởi động lại.
    - Khi Tắt: Tin nhắn chỉ duy trì trong bộ nhớ tạm (RAM) của phiên làm việc hiện tại và không ghi vào database, tăng cường bảo mật riêng tư theo yêu cầu người dùng.

### 2.4. Giao diện người dùng phong cách Facebook Messenger & Avatar PVA
- **Đặc tả bổ sung tại Mục 6 (Giao diện người dùng):**
  - **Khung chat Messenger:**
    * Bỏ hoàn toàn các nhãn tiêu đề "Bạn" và "PVA" phía trên bong bóng tin nhắn.
    * Bong bóng tin nhắn tự co giãn ôm trọn nội dung (`width: fit-content; max-width: 72%`), không tạo khoảng trống thừa bên trong bubble.
    * Thời gian gửi mặc định được ẩn; chỉ hiển thị khi người dùng bấm vào bong bóng tin nhắn tương ứng (Click-to-view timestamp).
  - **Avatar đại diện:**
    * Thay thế biểu tượng robot emoji trên Header và Avatar trợ lý ảo bằng ảnh đại diện chính thức tại `resources/ava.jpg`.
    * Căn lề dưới (bottom-aligned): Avatar trợ lý được căn dưới cùng hàng với đáy bong bóng tin nhắn (`align-items: flex-end`, `margin-bottom: 2px`) chuẩn phong cách Facebook Messenger.
  - **Tên hiển thị trợ lý ảo:**
    * Cập nhật danh xưng hiển thị trên giao diện người dùng thành **Sinon** (Header, Empty State chào mừng, câu hỏi gợi ý và ô nhập liệu).
  - **Làm sạch Header:**
    * Ẩn thông báo "Ollama sẵn sàng" khi hệ thống ở trạng thái hoạt động tốt (`healthy`), chỉ hiển thị trạng thái khi đang kết nối hoặc có sự cố.
    * Ẩn tag `qwen 3.1` (`qwen3:1.7b`) trên Header để giao diện tối giản, hiện đại và tập trung vào nội dung trò chuyện.

### 2.5. Đáp ứng hoàn chỉnh UC-06: Màn hình lịch sử hội thoại
- **Đặc tả bổ sung tại Mục 5 (Use Case Specification - UC-06):**
  - **Danh sách hội thoại (Basic Flow):** Nút `🕒 Lịch sử` trên Header mở thanh trượt Liquid Glass Drawer hiển thị danh sách hội thoại lưu trong SQLite, sắp xếp theo thời gian mới nhất, kèm số lượng tin nhắn và đoạn trích tin nhắn cuối.
  - **Xem chi tiết & Chuyển đổi ngữ cảnh (Flow 4-6):** Bấm chọn một cuộc hội thoại sẽ đóng drawer và tải toàn bộ tin nhắn chi tiết lên giao diện chính, đồng thời cập nhật ngữ cảnh trượt trong `ChatService` để người dùng tiếp tục trò chuyện liền mạch.
  - **Tạo hội thoại mới:** Nút `＋ Cuộc trò chuyện mới` cho phép bắt đầu phiên làm việc mới độc lập.
  - **Xóa có xác nhận (Confirmation Dialog):** Xóa cuộc hội thoại yêu cầu xác nhận qua Modal an toàn (`ConfirmModal`), tự động cascade xóa sạch các tin nhắn và chỉ mục `messages_fts` tương ứng nhờ foreign keys SQLite.
  - **Trạng thái rỗng (Alternative Flow A1):** Hiển thị giao diện thân thiện "Chưa có cuộc trò chuyện nào được lưu" khi chưa có dữ liệu.

---

## 3. Cập nhật các bảng đối chiếu Architecture & IPC Contracts
- **Bổ sung IPC Channels mới:**
  - `chat:history:load`: Lấy danh sách tin nhắn từ CSDL.
  - `chat:history:get-persistence`: Đọc trạng thái cấu hình lưu lịch sử.
  - `chat:history:set-persistence`: Bật hoặc tắt lưu lịch sử.
  - `chat:history:clear`: Xóa lịch sử hội thoại hiện tại.
  - `chat:conversations:list`: Lấy danh sách tất cả cuộc hội thoại kèm số tin nhắn.
  - `chat:conversations:get`: Lấy chi tiết tin nhắn theo mã cuộc hội thoại.
  - `chat:conversations:switch`: Chuyển đổi cuộc hội thoại hoạt động và nạp lại ngữ cảnh.
  - `chat:conversations:create`: Khởi tạo cuộc hội thoại mới.
  - `chat:conversations:delete`: Xóa cuộc hội thoại và cascade tin nhắn liên quan.
- **Bổ sung Preload Interface:**
  - `window.api.chat.loadHistory()`
  - `window.api.chat.getPersistence()`
  - `window.api.chat.setPersistence(enabled: boolean)`
  - `window.api.chat.clearHistory()`
  - `window.api.chat.listConversations()`
  - `window.api.chat.getConversation(id: number)`
  - `window.api.chat.switchConversation(id: number)`
  - `window.api.chat.createConversation(title?: string)`
  - `window.api.chat.deleteConversation(id: number)`
