const fs = require('fs');
const { chromium } = require('playwright-core');
const log = require('../log');
const { scrollInPage } = require('./finder');

const EDGE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  `${process.env.LOCALAPPDATA}\\Microsoft\\Edge\\Application\\msedge.exe`,
];

function findEdge() {
  const fromEnv = process.env.EDGE_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  for (const p of EDGE_PATHS) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

async function launch(cfg) {
  const executablePath = findEdge();
  if (!executablePath) {
    throw new Error(
      'khong tim thay Microsoft Edge. Cai Edge, hoac dat duong dan bang bien moi truong EDGE_PATH',
    );
  }

  fs.mkdirSync(cfg.edgeProfile, { recursive: true });
  log.info(`Edge   : ${executablePath}`);
  log.info(`Profile: ${cfg.edgeProfile}`);

  const context = await chromium.launchPersistentContext(cfg.edgeProfile, {
    executablePath,
    headless: cfg.headless,
    viewport: null,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=msEdgeSidebarV2',
    ],
  });

  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(cfg.findTimeoutMs);
  page.setDefaultNavigationTimeout(cfg.navTimeoutMs);

  return { context, page };
}

// Discord mo link co danh message id o cuoi se nhay toi tin nhan CU do, khong
// phai tin nhan moi nhat. Luon cuon xuong day truoc khi thao tac.
async function scrollToLatest(page) {
  for (let i = 0; i < 8; i += 1) {
    const before = await page.evaluate(() => {
      const ol = document.querySelector('[id^="chat-messages-"]');
      return ol ? ol.scrollHeight : null;
    }).catch(() => null);
    if (before === null) return false;

    await page.evaluate(scrollInPage(), { to: 'bottom', times: 1 });
    await page.waitForTimeout(500);

    const after = await page.evaluate(() => {
      const ol = document.querySelector('[id^="chat-messages-"]');
      return ol ? ol.scrollHeight : null;
    }).catch(() => null);

    if (after === null || after === before) {
      await page.evaluate(scrollInPage(), { to: 'bottom', times: 1 });
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

async function waitForLogin(page, cfg = {}) {
  await page.goto(cfg.discordUrl || 'https://discord.com/app', { waitUntil: 'domcontentloaded' });
  log.plain('');
  log.warn('DANG DANG NHAP TRINH DUYET. Hay dang nhap Discord trong cua so Edge vua mo.');
  log.warn('Tool se tu phat hien khi ban vao duoc server.');
  log.plain('');

  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    const ok = await page.evaluate(() => !!document.querySelector('[id^="chat-messages-"], [class*="guildsnav"]'))
      .catch(() => false);
    if (ok) {
      log.ok('da dang nhap xong');
      await page.waitForTimeout(2000);
      return true;
    }
    await page.waitForTimeout(1000);
  }
  throw new Error('het 5 phut chua dang nhap duoc');
}

module.exports = { launch, openUrl, scrollToLatest, waitForLogin, findEdge };
