const fs = require('fs');
const path = require('path');

const { parseArgs, coerce } = require('../config');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'config.json');

const DEFAULTS = {
  // === Trinh duyet ===
  edgeProfile: './.edge-profile',
  headless: false,
  discordUrl: 'https://discord.com/app',

  // === Cham ngay truoc / sau khi bam ===
  delayMin: 1200,
  delayMax: 3500,
  settleMs: 900,
  afterClickMs: 1500,

  // === Bam ===
  // Discord (React) thay moi DOM lien tuc -> handle cu bi "detached" giua luc
  // tim nut va luc bam. clickRetries: so lan tim lai roi bam lai
  clickRetries: 3,
  clickTimeoutMs: 6000,

  // === So lan thu tim nut ===
  // maxAttempts: so lan quet toi da cho mot step
  // retryMs:       nghi giua hai lan quet
  // -> thoi gian that cua mot step = maxAttempts * retryMs, cat som khi het
  //    findTimeoutMs. Do la cong thuc de tinh so lan thu thay vi ban phai do.
  maxAttempts: 12,
  retryMs: 250,

  // Step chi nhieu ten nut: cho ngan, khong thay nut nao thi sang step sau ngay
  tryMs: 2500,
  // Step co messageId/messageText: cho lau hon, vi phai doi bot gui tin nhan
  findTimeoutMs: 20000,

  // === Mo trang ===
  channelUrl: '',
  navTimeoutMs: 30000,

  // === Vong lap ===
  loop: false,
  loopDelay: 3000,
  // Bam xong thi quay lai buoc 0 thay vi di tiep danh sach
  restart: true,
};

const NUMERIC = [
  'delayMin', 'delayMax', 'settleMs', 'afterClickMs',
  'clickRetries', 'clickTimeoutMs',
  'maxAttempts', 'retryMs', 'tryMs', 'findTimeoutMs',
  'navTimeoutMs', 'loopDelay',
];

function load(flags = {}) {
  let fileCfg = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      fileCfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (err) {
      throw new Error(`config.json khong parse duoc: ${err.message}`);
    }
  }

  const cfg = { ...DEFAULTS, ...pick(fileCfg) };
  for (const [key, value] of Object.entries(flags)) {
    if (key in DEFAULTS) cfg[key] = value;
  }

  cfg.headless = truthy(cfg.headless);
  cfg.loop = truthy(cfg.loop);
  cfg.restart = truthy(cfg.restart);
  for (const key of NUMERIC) {
    if (cfg[key] !== undefined && typeof cfg[key] !== 'number') {
      cfg[key] = Number(cfg[key]) || DEFAULTS[key];
    }
  }
  if (cfg.delayMin > cfg.delayMax) [cfg.delayMin, cfg.delayMax] = [cfg.delayMax, cfg.delayMin];

  cfg.edgeProfile = path.resolve(path.join(__dirname, '..', '..'), cfg.edgeProfile);
  return cfg;
}

function truthy(value) {
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function pick(fileCfg) {
  const out = {};
  for (const key of Object.keys(DEFAULTS)) {
    if (fileCfg[key] !== undefined) out[key] = fileCfg[key];
  }
  return out;
}

function validate(cfg, { needUrl = false } = {}) {
  const problems = [];
  if (needUrl && !cfg.channelUrl) {
    problems.push('thieu channelUrl (link kenh, co the kem message id o cuoi)');
  }
  if (problems.length) throw new Error(problems.join(' | '));
}

module.exports = { load, validate, parseArgs, DEFAULTS, CONFIG_PATH, truthy };
