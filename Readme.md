# Tool Auto Bí Cảnh Bot Uyên Sư Muội

Tự động bấm nút (button) trong Discord web.

Tool điều khiển **Edge thật** trên máy bạn, đăng nhập bằng chính tài khoản của bạn.
Không dùng token, không phải self-bot, không vi phạm điều khoản của Discord.

Dùng để bấm nút trong luồng hội thoại với bot mà tay bạn không rảnh bấm liên tục.

---

## Yêu cầu

| Cần                                      | Ghi chú                    |
| ---------------------------------------- | -------------------------- |
| Windows                                  | đã test trên Windows 10/11 |
| [Node.js](https://nodejs.org) 18 trở lên | `node -v` kiểm tra         |
| Microsoft Edge                           | có sẵn trên Windows        |

Không cần cài Discord app, không cần token.

---

## Cài đặt

```powershell
git clone <url-của-repo>
cd tool_bi_canh
npm install
```

Không cần build. Chạy thẳng bằng `node edge.js`.

---

## Setup 3 bước

### 1. Đăng nhập Discord một lần

```powershell
node edge.js login
```

Mở ra cửa sổ Edge. Đăng nhập Discord bằng tay. Xong nhấn Enter trong terminal.

Phiên đăng nhập được lưu vào `.edge-profile/`, những lần sau không cần đăng nhập lại.

### 2. Tạo file cấu hình

```powershell
Copy-Item config.example.json config.json
```

`config.example.json` có sẵn toàn bộ thông số, mỗi dòng kèm chú thích.
Tool chạy được với mặc định. Chỉ cần thay đổi URL kênh discord.

### 3. Lấy link kênh

Vào Discord web → bấm chuột phải vào kênh → **Copy Link**. Dạng:

```
https://discord.com/channels/123456789012345678/987654321098765432
```

---

## Sử dụng

## Cấu hình nhanh

Mọi thông số nằm trong `config.json`, xem `config.example.json` để biết ý nghĩa từng dòng.

| Thông số                | Mặc định    | Ý nghĩa                                        |
| ----------------------- | ----------- | ---------------------------------------------- |
| `maxAttempts`           | 12          | số lần quét tối đa cho 1 step                  |
| `retryMs`               | 250         | nghỉ giữa 2 lần quét (ms)                      |
| `tryMs`                 | 2500        | trần chờ cho step chỉ có tên nút               |
| `findTimeoutMs`         | 20000       | trần chờ cho step có `messageId`               |
| `delayMin` / `delayMax` | 1200 / 3500 | chờ ngẫu nhiên trước khi bấm (ms)              |
| `afterClickMs`          | 1500        | chờ sau khi bấm (ms)                           |
| `settleMs`              | 900         | chờ giao diện ổn định sau khi mở trang (ms)    |
| `clickRetries`          | 3           | số lần tìm lại rồi bấm lại khi DOM bị thay mới |
| `loop`                  | false       | chạy lặp vô hạn                                |
| `loopDelay`             | 3000        | chờ giữa 2 lần quét khi không bấm được (ms)    |
| `restart`               | true        | bấm xong quay lại bước đầu                     |
| `reloadPlan`            | false       | đọc lại file plan ở đầu mỗi vòng               |
| `headless`              | false       | `true` = chạy ẩn, không mở cửa sổ              |

Xem toàn bộ thông số kèm kiểu dữ liệu và mặc định:

```powershell
node edge.js config
```

**Chờ bao lâu** không phải do đoán:

```
thời gian chờ 1 step = maxAttempts × retryMs     (mặc định 12 × 250 = 3 giây)
```

Bot phản ứng chậm thì giảm:

```json
"maxAttempts": 5,
"retryMs": 250
```

---

### Bấm nhiều nút theo plan

Truy cập vào đường dẫn kênh url discord của bạn đã lấy, mở bí cảnh và chuẩn bị cho việc bắt đầu

Tạo `plan.json`:

```json
{
  "url": "https://discord.com/channels/123/456",
  "steps": [
    { "text": "Bắt đầu" },
    { "text": "Tiếp tục" },
    { "text": "Hoàn thành" }
  ]
}
```

```powershell
node edge.js run plan.json
```

Trong `plan\` đã có sẵn một số plan, bạn có thể chạy như sau

```powershell
node edge.js run plan\LK_NGV.json
```

/_Luyện khí ngoại vi_/

Nếu bạn muốn thêm bí cảnh mới, copy và sửa một số message lựa chọn option phù hợp!

### Chạy liên tục

```powershell
node edge.js run plan.json --loop true
```

Chạy tới khi bạn bấm `Ctrl+C`. Phù hợp khi bot tự đưa tin nhắn mới và cần bấm ngay.

### Sửa plan khi tool đang chạy

Bật `reloadPlan` trong `config.json`:

```json
"loop": true,
"reloadPlan": true
```

Từ đó ở đầu mỗi vòng tool đọc lại `plan.json`. Sửa file (thêm bớt nút, đổi tên
nút) thì vòng sau dùng ngay bản mới, in:

```
đã nạp lại kế hoạch: 12 bước (12 bước bấm)
```

Trong lúc bạn đang lưu file mà JSON chưa hoàn chỉnh, tool **không** chết — nó in
cảnh báo rồi dùng lại bản plan hợp lệ cuối cùng:

```
đọc lại kế hoạch lỗi (plan/KD.json không parse duoc: ...), dùng kế hoạch hiện tại
```

Đổi cả `"url"` trong plan cũng có tác dụng, nhưng chỉ mở lại trang khi url thật sự
đổi — không mở lại mỗi vòng để khỏi mất vị trí cuộn.

`reloadPlan` không có tác dụng khi plan lấy từ `--step` trên dòng lệnh (không có
file nào để đọc lại), tool sẽ nhắc lúc chạy.

---

## Step có thể viết gì

```json
{ "messageId": "987" }                       bấm nút đầu tiên trong tin nhắn đó
{ "messageId": "987", "text": "Xác nhận" }    bấm đúng nút tên này
{ "messageId": "987", "index": 1 }            bấm nút thứ 2 trong tin nhắn
{ "text": "Tiếp tục" }                       bấm nút này ở tin nhắn mới nhất
{ "messageText": "Chọn mục", "text": "OK" }   tìm tin nhắn theo nội dung rồi bấm nút
{ "wait": 2000 }                             chờ 2 giây
{ "goto": "https://discord.com/channels/1/2" } đổi kênh
{ "shot": "mien.png" }                       chụp màn hình
```

Thêm được: `"optional": true`, `"scroll": false`, `"maxAttempts"`, `"retryMs"`,
`"findTimeoutMs"`, `"delayMin"`, `"delayMax"`, `"afterClickMs"`.

Muốn bấm nút **cũ nhất** thay vì mới nhất: `{"text": "X", "order": "oldest"}`.

---

## Lỗi thường gặp

**`không tìm thấy nút "X" (đã thử 12/12 lần trong 2841ms)`**
Nút chưa xuất hiện. Tăng `maxAttempts`, hoặc xem lại tên nút có đúng không (copy từ
`dump` cho chắc).

**`Không tìm thấy tin nhắn ID 987`**
Sai ID, tin nhắn đã xoá, hoặc tin nhắn nằm quá xa trong lịch sử. Chuột phải tin nhắn →
Copy Message ID để lấy đúng.

**`Element is not attached to the DOM`**
Discord render lại danh sách tin nhắn giữa lúc bấm — chuyện này rất thường xuyên.
Tool đã tự tìm lại và bấm lại tối đa `clickRetries` lần. Vẫn lỗi thì tăng
`clickRetries` lên 5, hoặc giảm `afterClickMs`.

**Tool không tìm thấy gì cả**
Chạy `node edge.js dump "<link kênh>"` xem trang hiện tại đã có gì. Nếu `dump` cũng
trống thì là chưa cuộn tới đúng chỗ — chạy `dump` khi kênh đang mở ở đúng tin nhắn.

**Chạy ẩn mà thấy Edge nhảy cửa sổ**
`"headless": false` trong `config.json` cố ý để bạn quan sát. Đổi thành `true` nếu
muốn chạy không hiện cửa sổ.

---

## Lưu ý

- Dùng tài khoản của chính bạn, trên máy của chính bạn
- Tool chỉ bấm nút trong trang bạn đang đăng nhập, không gửi tin nhắn API
- `.edge-profile/` chứa cookie đăng nhập — **không commit**, đã nằm trong `.gitignore`
- Chạy `--headless true` nếu không muốn dùng chuột bàn phím của bạn
