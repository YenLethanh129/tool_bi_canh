const { dumpInPage, findButtonInPage, findScopeInPage, scanInPage, scrollInPage } = require('./finder');
const log = require('../log');

const { c } = log;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

function randomDelay(min, max) {
  return min + Math.random() * Math.max(0, max - min);
}

// Phan biet 2 truong hop: khong thay tin nhan, va thay tin nhan nhung khong co nut.
// Ca hai deu bo qua step roi chay tiep, khong dung ca chay.
class SkipStep extends Error {
  constructor(message) {
    super(message);
    this.name = 'SkipStep';
    this.skippable = true;
  }
}

class ScopeMissing extends SkipStep {
  constructor(messageId) {
    super(`Không tìm thấy tin nhắn ID ${messageId}`);
    this.name = 'ScopeMissing';
    this.missingMessageId = messageId;
  }
}

async function messageExists(page, messageId) {
  const scope = await page.evaluateHandle(findScopeInPage(), { messageId: String(messageId) });
  const found = Boolean(scope.asElement());
  if (scope.dispose) await scope.dispose();
  return found;
}

// Step chi nhieu ten nut, khong gan voi tin nhan nao.
// Lua thuong gap: bot vua gui tin nhan moi o cuoi chua, nen dung o day va quet lai,
// thay vi cuon len tim (cuon len chi lam tin nhan moi bien mat khoi DOM).
// So lan thu va thoi gian cho deu cau hinh duoc: maxAttempts lan, retryMs moi lan,
// nhung cat som neu het findTimeoutMs.
async function findWithRetry(page, cfg, step) {
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

    const handle = await page.evaluateHandle(findButtonInPage(), {
      messageId: step.messageId ?? null,
      messageText: step.messageText ?? null,
      text: step.text ?? '',
      index: step.index ?? 0,
      order: step.order ?? 'newest',
    });
    const el = handle.asElement();
    if (el) return el;

    if (handle.dispose) await handle.dispose();

    tried += 1;
    if (tried >= maxAttempts || Date.now() >= deadline) break;

    // In ra dang tim gi, de thay tool dang quet chu khong treo
    if (byText) {
      const s = await page.evaluate(scanInPage(), { text: step.text }).catch(() => null);
      if (s) {
        // Chi in khi trang thai thay doi, tranh 11 step x nhieu dong lam on
        const key = `${s.messages}/${s.buttons}/${s.matches.length}`;
        if (key !== lastReport) {
          lastReport = key;
          const found = s.matches.length
            ? `${c.green}thấy: ${s.matches.slice(-3).join(', ')}${c.reset}`
            : `${c.yellow}chưa thấy${c.reset}`;
          log.plain(`${c.gray}      quét ${s.messages} tin nhắn / ${s.buttons} nút — ${found}${c.reset}`);
        }
      }
    }

    if (step.scroll !== false) {
      if (byText) {
        // Giu o day. Nut cua luong hoi thoai luon o tin nhan moi nhat.
        await page.evaluate(scrollInPage(), { to: 'bottom', times: 2 });
      } else {
        await page.evaluate(scrollInPage(), { dy: -600 });
      }
    }
    await page.waitForTimeout(retryMs);
  }

  // Message khong hieu duoc trong DOM -> thu mo permalink truoc khi ket luan
  if (step.messageId && !scopeSeen && !step._permalinkTried) {
    const link = permalink(page.url(), step.messageId);
    if (link) {
      step._permalinkTried = true;
      log.warn(`${step.messageId} chưa có trong trang, thử mở permalink...`);
      try {
        await page.goto(link, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);
        if (await messageExists(page, step.messageId)) {
          return findWithRetry(page, { ...cfg, findTimeoutMs: 6000 }, step);
        }
      } catch {
        /* bo qua, bao loi chinh */
      }
    }
  }

  if (step.messageId && !scopeSeen) {
    throw new ScopeMissing(step.messageId);
  }
  const miss = `${describeMiss(step)} (đã thử ${tried}/${maxAttempts} lần trong ${Date.now() - startedAt}ms)`;
  // Moi step bam deu bo qua roi chay tiep. Danh sach step la danh sach nut can
  // bam: nut nao chua xuat hien thi thu nut o step sau, het danh sach thi quay
  // lai vong sau. Step co messageId cung bo qua nhu vay de vong lap vo han khong
  // bi chet vi mot tin nhan sai.
  throw new SkipStep(miss);
}

function describeMiss(step) {
  if (step.messageId) return `tin nhắn ID ${step.messageId} không có nút nào bấm được`;
  if (step.messageText) return `không thấy tin nhắn nào chứa "${step.messageText}"`;
  return `không tìm thấy nút "${step.text ?? ''}" trong trang hiện tại`;
}

// React cua Discord thay moi DOM rat lien tuc: giua luc tool tim nut va luc
// bam, tin nhan co the duoc render lai -> handle cu khong con "attached".
// Day la viec thuong gap trong Discord, khong phai loi, nen phai tim lai
// chu khong phai dung ca chay.
const STALE = /not attached to the DOM|detached|no longer attached|not visible|intercepts pointer|Execution context was destroyed/i;

function isStale(err) {
  return STALE.test(err?.message || '');
}

function findOptions(step) {
  return {
    messageId: step.messageId ?? null,
    messageText: step.messageText ?? null,
    text: step.text ?? '',
    index: step.index ?? 0,
    order: step.order ?? 'newest',
  };
}

// Bam nut. Neu handle bi React thay moi thi tim lai roi bam lai, toi da
// cfg.clickRetries lan, cuoi cung thu force mot lan. Ok:false va lastErr=null
// nghia la nut da bien mat han khong tim lai duoc.
async function tryClick(page, cfg, step, el) {
  const opts = findOptions(step);
  const timeout = step.clickTimeoutMs ?? cfg.clickTimeoutMs;
  let target = el;
  let lastErr = null;
  let attempt = 0;

  for (attempt = 1; attempt <= cfg.clickRetries; attempt += 1) {
    if (attempt > 1) {
      const again = await page.evaluateHandle(findButtonInPage(), opts);
      const fresh = again.asElement();
      target = fresh || null;
    }
    if (target) {
      try {
        await target.click({ timeout });
        return { ok: true, attempt, lastErr: null };
      } catch (err) {
        lastErr = err;
        if (!isStale(err)) return { ok: false, attempt, lastErr };
        target = null;
      }
    }
    if (attempt < cfg.clickRetries) await page.waitForTimeout(cfg.retryMs);
  }

  // Het luot. Neu nut chi bi che o gi (intercepts pointer) thi force se duoc.
  if (lastErr) {
    const again = await page.evaluateHandle(findButtonInPage(), opts);
    const fresh = again.asElement();
    if (fresh) {
      try {
        await fresh.click({ timeout, force: true });
        return { ok: true, attempt: attempt + 1, lastErr: null };
      } catch (err) {
        return { ok: false, attempt, lastErr: err };
      }
    }
  }
  return { ok: false, attempt, lastErr: null };
}

async function clickStep(page, cfg, step) {
  const el = await findWithRetry(page, cfg, step);

  try {
    await el.scrollIntoViewIfNeeded({ timeout: 4000 });
  } catch {
    /* bo qua, click se tu xu ly */
  }

  const label = ((await el.innerText().catch(() => '')) || step.text || '?').trim();
  const target_msg = step.messageId ? ` (message ${step.messageId})` : '';
  const delay = randomDelay(step.delayMin ?? cfg.delayMin, step.delayMax ?? cfg.delayMax);
  log.info(`cho ${Math.round(delay)}ms truoc khi bam "${label}"${target_msg}`);
  await sleep(delay);

  const res = await tryClick(page, cfg, step, el);

  if (!res.ok) {
    // Nut bi Discord thay moi luc bam: bo qua step nay, vong sau thu lai
    if (!res.lastErr || isStale(res.lastErr)) {
      throw new SkipStep(`nút "${label}" bị Discord thay mới lúc bấm, thử nút ở step tiếp theo`);
    }
    throw res.lastErr;
  }
  if (res.attempt > 1) {
    log.warn(`nút bị Discord thay mới, đã bấm lại lần ${res.attempt}`);
  }

  log.ok(`da bam "${label}"${target_msg}`);
  await page.waitForTimeout(step.afterClickMs ?? cfg.afterClickMs);

  const modal = await page.evaluate(
    () => !!document.querySelector('[role="dialog"], [data-list-item-id*="modal"]'),
  );
  if (modal) log.warn('co modal popup - may can ban nhap tay truoc khi chay tiep');
}

function renderDump(entries) {
  if (entries.length === 0) {
    log.warn('khong thay message nao co nut. Hay scroll toi message can xem roi chay lai dump');
    return;
  }

  for (const e of entries) {
    log.plain();
    log.plain(`${c.bold}${e.messageId}${c.reset}  ${c.gray}${e.text}${c.reset}`);
    for (const b of e.buttons) {
      const state = b.disabled ? `${c.red}[disabled]${c.reset}` : `${c.green}[ready]${c.reset}`;
      log.plain(`  ${state} ${c.yellow}<${b.tag}>${c.reset} "${b.label}" ${c.dim}${b.cls}${c.reset}`);
    }
  }
  const ids = entries.filter((e) => e.buttons.some((b) => !b.disabled));

  log.plain();
  log.plain(`${c.bold}Dán thẳng vào plan.json ("steps"):${c.reset}`);
  log.plain(`  ${c.magenta}[${ids.map((e) => `"${e.messageId}"`).join(', ')}]${c.reset}`);

  const withMany = ids.find((e) => e.buttons.filter((b) => !b.disabled).length > 1);
  if (withMany) {
    const first = withMany.buttons.find((b) => !b.disabled);
    log.plain();
    log.plain(`${c.gray}Message này có nhiều nút, cần chỉ định:${c.reset}`);
    log.plain(`  { "messageId": "${withMany.messageId}", "text": "${first.label}" }`);
  }

  log.plain();
  log.plain(`${c.gray}Lấy ID thủ công: chuột phải tin nhắn -> Copy Message ID / Sao chép ID Tin nhắn${c.reset}`);
  log.plain(`${c.gray}Trong plan chỉ cần điền id, tool tự tìm nút đầu tiên chưa bị khóa.${c.reset}`);
}

async function dump(page) {
  const entries = await page.evaluate(dumpInPage());
  renderDump(entries);
  return entries;
}

module.exports = {
  clickStep,
  dump,
  findWithRetry,
  messageExists,
  permalink,
  randomDelay,
  describeMiss,
  renderDump,
  SkipStep,
  ScopeMissing,
};
