const readline = require('readline');

const log = require('../log');
const edge = require('./edge');
const { pageApi, CMD } = require('./page-api');

// Mo Edge, chay fn(page), luon dong lai. Moi command deu di qua day nen
// khong command nao quen `context.close()`.
async function withSession(cfg, fn) {
  const { context, page } = await edge.launch(cfg);
  try {
    return await fn(page);
  } finally {
    await context.close().catch(() => {});
  }
}

// Discord mo link co danh message id o cuoi se nhay toi tin nhan CU do, khong
// phai tin nhan moi nhat. Luon cuon xuong day truoc khi thao tac.
async function scrollToLatest(page) {
  for (let i = 0; i < 8; i += 1) {
    const before = await page.evaluate(pageApi, { cmd: CMD.HEIGHT }).catch(() => null);
    if (before === null) return false;

    await page.evaluate(pageApi, { cmd: CMD.SCROLL, to: 'bottom', times: 1 });
    await page.waitForTimeout(500);

    const after = await page.evaluate(pageApi, { cmd: CMD.HEIGHT }).catch(() => null);
    if (after === null || after === before) {
      await page.evaluate(pageApi, { cmd: CMD.SCROLL, to: 'bottom', times: 1 });
      return true;
    }
  }
  return true;
}

async function openUrl(page, url, cfg = {}) {
  log.info(`mo ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const ok = await scrollToLatest(page);
  if (ok) log.info('đã cuộn xuống tin nhắn mới nhất');
  // Cho React ve lai DOM truoc khi quet, tranh quet vao trang dang chua render xong
  if (cfg.settleMs) await page.waitForTimeout(cfg.settleMs);
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, resolve)).finally(() => rl.close());
}

// Cho nguoi dung 5 phut dang nhap Discord trong cua so Edge vua mo.
async function waitForLogin(page, cfg = {}) {
  await page.goto(cfg.discordUrl || 'https://discord.com/app', { waitUntil: 'domcontentloaded' });
  log.plain('');
  log.warn('DANG DANG NHAP TRINH DUYET. Hay dang nhap Discord trong cua so Edge vua mo.');
  log.warn('Tool se tu phat hien khi ban vao duoc server.');
  log.plain('');

  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    const ok = await page.evaluate(
      () => !!document.querySelector('[id^="chat-messages-"], [class*="guildsnav"]'),
    ).catch(() => false);
    if (ok) {
      log.ok('da dang nhap xong');
      await page.waitForTimeout(2000);
      return true;
    }
    await page.waitForTimeout(1000);
  }
  throw new Error('het 5 phut chua dang nhap duoc');
}

module.exports = { withSession, openUrl, scrollToLatest, waitForLogin, ask };