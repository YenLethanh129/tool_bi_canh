const log = require('../log');
const { describe: describeConfig } = require('../config/schema');

const { c } = log;

function printHelp() {
  log.plain(`
${c.bold}tool-bi-canh edge${c.reset} - tự động bấm nút trong Discord web qua Edge thật

Bạn đăng nhập bằng chính tài khoản của mình trong cửa sổ Edge thật.
Không dùng token, không phải self-bot.

${c.bold}Lệnh${c.reset}
  ${c.cyan}login${c.reset}                    mở Edge, đăng nhập tay, lưu profile cho lần sau
  ${c.cyan}dump${c.reset} <channelUrl>        xem tin nhắn nào có nút, in ra để lấy text / id
  ${c.cyan}run${c.reset} <plan.json>          chạy kế hoạch
  ${c.cyan}run${c.reset} --url <u> --step ... chạy ngay trên dòng lệnh, không cần file

${c.bold}Cách ngắn gọn nhất${c.reset} - chỉ cần id tin nhắn
  ${c.cyan}"111222333444555666"${c.reset}   -> tự tìm nút đầu tiên trong tin nhắn đó
  ${c.cyan}node edge.js run --url "<kenh>" --step "111222333444555666"${c.reset}

${c.bold}Chỉ theo tên nút (luồng hội thoại)${c.reset}
  ${c.gray}--${c.reset}step '{"text":"Bắt Đầu"}'                ${c.gray}quét cả trang, bấm nút mới nhất${c.reset}
  Danh sách step là danh sách nút CẦN BẤM theo thứ tự ưu tiên, không phải
  chuỗi bước bắt buộc. Mỗi nút chờ --tryMs, chưa thấy thì thử nút ở step sau.
  Bấm được một nút tên là quay lại bước 1 ngay (--restart false để tắt).
  Step có messageId thì vẫn đi đúng thứ tự.

${c.bold}Step${c.reset} (mọi thứ đều tuỳ chọn)
  ${c.gray}--${c.reset}step '{"messageId":"111","text":"Xác nhận"}'   ${c.gray}chỉ định nút${c.reset}
  ${c.gray}--${c.reset}step '{"messageId":"111"}'                      ${c.gray}nút đầu tiên${c.reset}
  ${c.gray}--${c.reset}step '{"text":"Tiếp tục"}'                      ${c.gray}nút trong bất kỳ tin nhắn${c.reset}
  ${c.gray}--${c.reset}step '{"messageText":"nội dung","text":"OK"}'   ${c.gray}tìm tin nhắn theo text${c.reset}
  ${c.gray}--${c.reset}step '{"index":1,"text":"OK"}'                  ${c.gray}nút thứ 2${c.reset}
  ${c.gray}--${c.reset}step '{"wait":2000}'                            ${c.gray}chờ${c.reset}
  ${c.gray}--${c.reset}step '{"goto":"https://discord.com/channels/1/2/3"}'  ${c.gray}đổi trang${c.reset}
  ${c.gray}--${c.reset}step '{"shot":"buoi1.png"}'                     ${c.gray}chụp màn hình${c.reset}
  thêm được: "optional":true, "scroll":false, "delayMin", "delayMax",
              "maxAttempts", "retryMs", "findTimeoutMs"

${c.bold}Flag${c.reset}
  ${c.bold}Số lần thử${c.reset}
  --maxAttempts 12       số lần quét tối đa cho 1 step
  --retryMs 250          nghỉ giữa 2 lần quét (ms)
                         ${c.gray}thời gian chờ = maxAttempts × retryMs${c.reset}
  --tryMs 2500           giới hạn chờ cho step chỉ có tên nút
  --findTimeoutMs 20000  giới hạn chờ cho step có messageId
  ${c.bold}Bấm${c.reset}
  --delayMin 1200        độ trễ nhỏ nhất trước khi bấm (ms)
  --delayMax 3500        độ trễ lớn nhất trước khi bấm (ms)
  --afterClickMs 1500    chờ sau khi bấm (ms)
  --settleMs 900         chờ giao diện ổn định sau khi mở trang (ms)
  ${c.bold}Vòng lặp${c.reset}
  --loop true            chạy lặp lại cho tới khi bấm Ctrl+C
  --loopDelay 3000       chờ giữa hai lần quét (ms)
  --restart true         bấm xong nút tên thì quay lại bước 1
  --reloadPlan true      đọc lại file plan ở đầu mỗi vòng (sửa plan khi
                         đang chạy cũng được, file hỏng thì giữ bản cũ)
  ${c.bold}Trình duyệt${c.reset}
  --headless true        chạy ẩn (mặc định false để bạn thấy)
  --edgeProfile "D:\\..." thư mục lưu profile (mặc định ./.edge-profile)
  --edgePath "D:\\..."   đường dẫn msedge.exe (mặc định tự dò)

  ${c.gray}Mọi thông số trên đều đặt được trong config.json, xem config.example.json${c.reset}

${c.bold}Khi không tìm thấy${c.reset}
  Báo rõ số lần thử và thời gian đã chờ:
  ${c.gray}[1/15] không tìm thấy nút "Nguy hiểm quá" trong trang hiện tại${c.reset}
  ${c.gray}      (đã thử 12/12 lần trong 2841ms)${c.reset}
  Tin nhắn ID không có: in "${c.red}Không tìm thấy tin nhắn ID {id}${c.reset}"
  Nút tên chưa xuất hiện: thử nút ở step tiếp theo, không dừng cả chạy.
  Cuối vòng in danh sách nút chưa xuất hiện để biết cần chỉ plan hay chờ bot.

${c.bold}Cấu hình${c.reset}
  ${c.gray}node edge.js config    in toan bo thong so + gia tri mac dinh${c.reset}

${c.bold}Ví dụ${c.reset}
  node edge.js login
  node edge.js dump "https://discord.com/channels/111/222"
  node edge.js run plan.json
  node edge.js run plan.json --loop true
  node edge.js run --url "https://discord.com/channels/111/222" --step "111222333444555666"
`);
}

function printConfig() {
  log.plain(`${c.bold}Thông số trong config.json${c.reset}`);
  log.plain(`${c.gray}${describeConfig()}${c.reset}`);
  log.plain('');
  log.plain(`${c.gray}Đặt trong config.json, hoặc ghi đè tạm bằng --tên giá trị${c.reset}`);
}

module.exports = { printHelp, printConfig };