const fs = require('fs');
const path = require('path');
const readline = require('readline');

const browser = require('./browser');
const runner = require('./runner');
const { normalizeSteps, isClickStep } = require('./steps');
const log = require('../log');
const cfgMod = require('./config');

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
  ${c.bold}Trình duyệt${c.reset}
  --headless true        chạy ẩn (mặc định false để bạn thấy)
  --edgeProfile "D:\\..." thư mục lưu profile (mặc định ./.edge-profile)

  ${c.gray}Mọi thông số trên đều đặt được trong config.json, xem config.example.json${c.reset}

${c.bold}Khi không tìm thấy${c.reset}
  Báo rõ số lần thử và thời gian đã chờ:
  ${c.gray}[1/15] không tìm thấy nút "Nguy hiểm quá" trong trang hiện tại${c.reset}
  ${c.gray}      (đã thử 12/12 lần trong 2841ms)${c.reset}
  Tin nhắn ID không có: in "${c.red}Không tìm thấy tin nhắn ID {id}${c.reset}"
  Nút tên chưa xuất hiện: thử nút ở step tiếp theo, không dừng cả chạy.
  Cuối vòng in danh sách nút chưa xuất hiện để biết cần chỉ plan hay chờ bot.

${c.bold}Vi du${c.reset}
  node edge.js login
  node edge.js dump "https://discord.com/channels/111/222"
  node edge.js run plan.json
  node edge.js run plan.json --loop true
  node edge.js run --url "https://discord.com/channels/111/222" --step "111222333444555666"
`);
}

function parseStepsFromFlags(flags) {
  const raw = flags.step;
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];

  return list.map((item, i) => {
    // Cho phep --step "111222333444555666" hoac --step '{"messageId":"..."}'
    if (typeof item === 'string' && !item.trim().startsWith('{')) {
      return item;
    }
    try {
      return JSON.parse(item);
    } catch {
      throw new Error(`step ${i + 1} khong phai JSON hop le: ${item}`);
    }
  });
}

async function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(question, resolve));
  rl.close();
  return answer;
}

// Lay cac tham so doi vi tri, bo qua ca gia tri cua flag
function positionals(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) i += 1;
      continue;
    }
    out.push(arg);
  }
  return out;
}

function loadPlan() {
  const file = positionals(process.argv.slice(3))[0];
  if (!file) return null;
  const full = path.resolve(file);
  if (!fs.existsSync(full)) return null;
  log.info(`doc keo hoach tu ${file}`);
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

async function cmdLogin(cfg) {
  const { context, page } = await browser.launch(cfg);
  try {
    await browser.waitForLogin(page, cfg);
    log.ok(`profile da luu tai ${cfg.edgeProfile}`);
    log.info('lan sau khong can dang nhap lai. Dong cua so Edge la duoc.');
    await ask('nhan Enter de dong Edge...');
  } finally {
    await context.close().catch(() => {});
  }
}

async function withBrowser(cfg, fn) {
  const { context, page } = await browser.launch(cfg);
  try {
    return await fn(page);
  } finally {
    await context.close().catch(() => {});
  }
}

async function cmdDump(cfg, flags, rest = []) {
  const url = flags.url || rest[0] || cfg.channelUrl;
  if (!url) throw new Error('thieu url kenh. Vi du: node edge.js dump "https://discord.com/channels/111/222"');
  if (!/^https?:\/\//.test(url)) {
    throw new Error(`"${url}" khong phai link kenh. Phai bat dau bang https://discord.com/channels/...`);
  }

  await withBrowser(cfg, async (page) => {
    await browser.openUrl(page, url, cfg);
    await runner.dump(page);
    log.info('keo chu den kenh, thay message can xem, roi chay lai dump neu thay');
  });
}

async function cmdRun(cfg, flags) {
  const plan = loadPlan();
  const raw = plan ? plan.steps : parseStepsFromFlags(flags);
  const url = flags.url || plan?.url || cfg.channelUrl;

  if (!raw || raw.length === 0) {
    throw new Error('khong co step nao. Tao file plan.json hoac dung --step "111222333444555666"');
  }

  let steps;
  try {
    steps = normalizeSteps(raw);
  } catch (err) {
    throw new Error(`${err.message} | vi du plan hop le: {"steps":["111222333444555666"]}`);
  }

  if (!url) throw new Error('thieu url kenh. Dat channelUrl trong config.json hoac dung --url');

  cfgMod.validate({ ...cfg, channelUrl: url });

  const clickCount = steps.filter(isClickStep).length;
  if (clickCount === 0) throw new Error('plan khong co buoc bam nao');

  const loop = cfgMod.truthy(flags.loop ?? cfg.loop ?? false);
  const loopDelay = Number(flags.loopDelay ?? cfg.loopDelay ?? 3000);
  // Bam xong thi quay lai step 0. Danh sach step la danh sach nut CAN BAM theo
  // thu tu uu tien, khong phai chuoi buoc buoc bat ke: sau moi lan bam, thu lai
  // tu dau de bat dung nut dang xuat hien.
  // Chi ap dung khi bat --loop: o che do 1 vong, quay lai buoc 0 se quet lai
  // ngon trang ma khong bao gio ket thuc.
  const restart = loop && cfgMod.truthy(flags.restart ?? cfg.restart ?? true);

  await withBrowser(cfg, async (page) => {
    let round = 0;
    let clicks = 0;
    let stopping = false;

    const stop = () => { stopping = true; };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);

    log.info(`kế hoạch: ${steps.length} bước (${clickCount} bước bấm)`);
    log.info(loop ? 'chế độ lặp: chạy tới khi bấm Ctrl+C' : 'chạy 1 vòng');
    if (restart) log.info('sau mỗi lần bấm nút tên sẽ quay lại bước 1, thử lại từ đầu');
    await browser.openUrl(page, url, cfg);

    for (;;) {
      round += 1;
      let done = 0;
      let skipped = 0;
      let missing = 0;
      let clicked = false;
      const absent = [];

      log.plain('');
      if (round > 1) log.info(`bắt đầu vòng ${round}`);

      for (let i = 0; i < steps.length; i += 1) {
        if (stopping) break;
        const step = steps[i];
        const tag = `${c.gray}[${i + 1}/${steps.length}]${c.reset}`;

        try {
          if (step.wait) {
            log.plain(`${tag} chờ ${step.wait}ms`);
            await page.waitForTimeout(step.wait);
            done += 1;
            continue;
          }
          if (step.goto) {
            await browser.openUrl(page, step.goto, cfg);
            log.ok(`${tag} đã đổi trang`);
            done += 1;
            continue;
          }
          if (step.shot) {
            await page.screenshot({ path: step.shot, fullPage: false });
            log.ok(`${tag} đã chụp ${step.shot}`);
            done += 1;
            continue;
          }
          if (!isClickStep(step)) {
            log.warn(`${tag} bỏ qua, step không có nội dung gì`);
            done += 1;
            continue;
          }

          // Step chi nhieu ten nut: cho ngan, khong thay thi sang nut o
          // step sau ngay. Danh sach step la danh sach nut CAN BAM, tool
          // bam nut dang xuat hien, khong doi het thoi gian o 1 ten.
          const byText = !step.messageId && !step.messageText && !!step.text;
          const stepCfg = byText
            ? { ...cfg, findTimeoutMs: step.findTimeoutMs ?? cfg.tryMs }
            : cfg;
          if (byText) log.plain(`${tag} tìm nút "${step.text}"`);
          await runner.clickStep(page, stepCfg, step);

          clicks += 1;
          clicked = true;
          done += 1;
          log.ok(`${tag} xong (tổng ${clicks} lần bấm)`);

          // Chi danh sach nut moi quay lai buoc 0. Step co messageId la chuoi
          // buoc buoc bat ke: quay lai se bam lai chinh tin nhan do.
          if (restart && byText) {
            // i = -1 de vong for tang len 0 o lan lap tiep theo.
            i = -1;
          }
        } catch (err) {
          // Khong thay tin nhan ID, hoac tin nhan khong co nut: in ra roi
          // chay tiep sang tin nhan sau, khong dung ca chay.
          if (err instanceof runner.SkipStep) {
            skipped += 1;
            if (err instanceof runner.ScopeMissing) missing += 1;
            if (step.text) absent.push(step.text);
            log.err(`${tag} ${err.message}`);
            log.plain(step.messageId
              ? `${c.gray}      -> bỏ qua, chuyển sang tin nhắn tiếp theo${c.reset}`
              : `${c.gray}      -> thử nút ở step tiếp theo${c.reset}`);
            continue;
          }
          if (step.optional) {
            skipped += 1;
            done += 1;
            log.warn(`${tag} lỗi nhưng optional, bỏ qua: ${err.message}`);
            continue;
          }
          log.err(`${tag} DỪNG: ${err.message}`);
          log.info('Chạy "node edge.js dump <url>" để xem hiện trạng.');
          process.off('SIGINT', stop);
          process.off('SIGTERM', stop);
          throw err;
        }
      }

      // Vong chi ket thuc khi quet het danh sach ma khong bam duoc gi.
      const parts = [clicked
        ? `xong ${done}/${steps.length} bước`
        : `quét hết ${steps.length} bước, không có nút nào để bấm`];
      if (skipped) parts.push(`${skipped} bước bị bỏ qua`);
      if (missing) parts.push(`${missing} tin nhắn không tìm thấy`);
      log.plain('');
      if (clicked) log.ok(parts.join(' | '));
      else log.warn(parts.join(' | '));

      if (absent.length) {
        log.plain(`${c.gray}      nút chưa xuất hiện: ${absent.join(', ')}${c.reset}`);
      }

      if (!loop || stopping) break;

      if (clicked) {
        log.plain('');
        log.info(`${clicks} lần bấm, quét lại từ đầu...`);
      }

      if (loopDelay > 0) {
        log.plain('');
        log.info(`chờ ${loopDelay}ms rồi chạy lại từ đầu...`);
        await page.waitForTimeout(loopDelay);
      }
    }

    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    log.info(`đã dừng sau ${round} vòng quét, tổng ${clicks} lần bấm`);
  });
}

async function main() {
  const { _, flags } = cfgMod.parseArgs(process.argv.slice(2));
  const command = _[0];

  if (!command || command === 'help' || flags.help) return printHelp();

  const cfg = cfgMod.load(flags);

  switch (command) {
    case 'login':
      return cmdLogin(cfg);
    case 'dump':
      return cmdDump(cfg, flags, _.slice(1));
    case 'run':
      return cmdRun(cfg, flags);
    default:
      printHelp();
      throw new Error(`lenh khong hop le: ${command}`);
  }
}

module.exports = { main, printHelp };
