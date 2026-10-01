const fs = require('fs');
const { chromium } = require('playwright-core');

const log = require('../log');

const EDGE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  `${process.env.LOCALAPPDATA}\\Microsoft\\Edge\\Application\\msedge.exe`,
];

// config.edgePath luon duoc uu tien (flag --edgePath hoac bien moi truong
// EDGE_PATH); khong co thi do cac duong dan thuong gap.
function findEdge(cfg = {}) {
  if (cfg.edgePath) {
    if (fs.existsSync(cfg.edgePath)) return cfg.edgePath;
    throw new Error(`edgePath khong ton tai: ${cfg.edgePath}`);
  }
  for (const p of EDGE_PATHS) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

async function launch(cfg) {
  const executablePath = findEdge(cfg);
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

module.exports = { launch, findEdge };