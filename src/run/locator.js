const log = require('../log');
const { pageApi, CMD } = require('../browser/page-api');
const { renderScanStatus } = require('../ui/render');
const { StepSkipped, ScopeMissing } = require('./errors');

// Giu nguyen origin + /channels/G/C cua trang hien tai, them ID vao cuoi
function permalink(currentUrl, messageId) {
  let u;
  try {
    u = new URL(currentUrl);
  } catch {
    return null;
  }
  const m = u.pathname.match(/^\/channels\/(\d+)\/(\d+)/);
  if (!m) return null;
  u.pathname = `/channels/${m[1]}/${m[2]}/${messageId}`;
  u.search = '';
  u.hash = '';
  return u.toString();
}

function findOptions(step) {
  return {
    cmd: CMD.FIND,
    messageId: step.messageId ?? null,
    messageText: step.messageText ?? null,
    text: step.text ?? '',
    index: step.index ?? 0,
    order: step.order ?? 'newest',
  };
}

async function messageExists(page, messageId) {
  const scope = await page.evaluateHandle(pageApi, { cmd: CMD.SCOPE, messageId: String(messageId) });
  const found = Boolean(scope.asElement());
  if (scope.dispose) await scope.dispose();
  return found;
}

function describeMiss(step) {
  if (step.messageId) return `tin nhắn ID ${step.messageId} không có nút nào bấm được`;
  if (step.messageText) return `không thấy tin nhắn nào chứa "${step.messageText}"`;
  return `không tìm thấy nút "${step.text ?? ''}" trong trang hiện tại`;
}

// Chi ban veo 1 trang quet, bao cao cho nguoi dung biet dang tim gi.
async function reportProgress(page, step, lastReport) {
  const scan = await page.evaluate(pageApi, { cmd: CMD.SCAN, text: step.text }).catch(() => null);
  if (!scan) return lastReport;
  // Chi in khi trang thai thay doi, tranh 11 step x nhieu dong lam on
  const key = `${scan.messages}/${scan.buttons}/${scan.matches.length}`;
  if (key === lastReport) return lastReport;
  renderScanStatus(scan);
  return key;
}

// Lua thuong gap: bot vua gui tin nhan moi o cuoi chua, nen dung o day va quet lai,
// thay vi cuon len tim (cuon len chi lam tin nhan moi bien mat khoi DOM).
// So lan thu va thoi gian cho deu cau hinh duoc: maxAttempts lan, retryMs moi lan,
// nhung cat som neu het findTimeoutMs.
async function findWithRetry(page, cfg, step, state = { permalinkTried: false }) {
  const maxAttempts = Math.max(1, step.maxAttempts ?? cfg.maxAttempts);
  const retryMs = Math.max(0, step.retryMs ?? cfg.retryMs);
  const startedAt = Date.now();
  const deadline = startedAt + cfg.findTimeoutMs;
  const byText = !step.messageId && !step.messageText && !!step.text;
  let tried = 0;
  let scopeSeen = false;
  let lastReport = '';

  while (tried < maxAttempts && Date.now() < deadline) {
    if (step.messageId) {
      scopeSeen = await messageExists(page, step.messageId) || scopeSeen;
    }

    const handle = await page.evaluateHandle(pageApi, findOptions(step));
    const el = handle.asElement();
    if (el) return el;

    if (handle.dispose) await handle.dispose();

    tried += 1;
    if (tried >= maxAttempts || Date.now() >= deadline) break;

    // In ra dang tim gi, de thay tool dang quet chu khong treo
    if (byText) lastReport = await reportProgress(page, step, lastReport);

    if (step.scroll !== false) {
      if (byText) {
        // Giu o day. Nut cua luong hoi thoai luon o tin nhan moi nhat.
        await page.evaluate(pageApi, { cmd: CMD.SCROLL, to: 'bottom', times: 2 });
      } else {
        await page.evaluate(pageApi, { cmd: CMD.SCROLL, dy: -600 });
      }
    }
    await page.waitForTimeout(retryMs);
  }

  // Message khong hieu duoc trong DOM -> thu mo permalink truoc khi ket luan
  if (step.messageId && !scopeSeen && !state.permalinkTried) {
    const link = permalink(page.url(), step.messageId);
    if (link) {
      state.permalinkTried = true;
      log.warn(`${step.messageId} chưa có trong trang, thử mở permalink...`);
      try {
        await page.goto(link, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);
        if (await messageExists(page, step.messageId)) {
          return findWithRetry(page, { ...cfg, findTimeoutMs: 6000 }, step, state);
        }
      } catch {
        /* bo qua, bao loi chinh */
      }
    }
  }

  if (step.messageId && !scopeSeen) throw new ScopeMissing(step.messageId);

  // Moi step bam deu bo qua roi chay tiep. Danh sach step la danh sach nut can
  // bam: nut nao chua xuat hien thi thu nut o step sau, het danh sach thi quay
  // lai vong sau. Step co messageId cung bo qua nhu vay de vong lap vo han khong
  // bi chet vi mot tin nhan sai.
  throw new StepSkipped(
    `${describeMiss(step)} (đã thử ${tried}/${maxAttempts} lần trong ${Date.now() - startedAt}ms)`,
  );
}

module.exports = {
  findWithRetry,
  findOptions,
  messageExists,
  permalink,
  describeMiss,
};