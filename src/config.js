const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

const DEFAULTS = {
  token: '',
  channelId: '',
  targetBotIds: [],

  matchLabels: [],
  matchCustomIds: [],
  matchAll: false,

  selectStrategy: 'first',
  selectLabels: [],

  delayMin: 1500,
  delayMax: 4000,
  cooldownMs: 30000,
  pollIntervalMs: 5000,
  scanLimit: 50,
  dryRun: false,
};

const NUMERIC = ['delayMin', 'delayMax', 'cooldownMs', 'pollIntervalMs', 'scanLimit'];
const LIST = ['targetBotIds', 'matchLabels', 'matchCustomIds', 'selectLabels'];
const ENUM = { selectStrategy: ['first', 'default'] };

function coerce(cfg) {
  for (const key of NUMERIC) {
    if (cfg[key] !== undefined && typeof cfg[key] !== 'number') {
      cfg[key] = Number(cfg[key]) || DEFAULTS[key];
    }
  }
  for (const key of LIST) {
    if (typeof cfg[key] === 'string') {
      cfg[key] = cfg[key].split(',').map((s) => s.trim()).filter(Boolean);
    }
    if (!Array.isArray(cfg[key])) cfg[key] = DEFAULTS[key];
  }
  cfg.matchAll = Boolean(cfg.matchAll);
  cfg.dryRun = Boolean(cfg.dryRun);

  for (const [key, allowed] of Object.entries(ENUM)) {
    if (!allowed.includes(cfg[key])) cfg[key] = DEFAULTS[key];
  }

  if (cfg.delayMin > cfg.delayMax) {
    [cfg.delayMin, cfg.delayMax] = [cfg.delayMax, cfg.delayMin];
  }
  if (cfg.delayMin < 0) cfg.delayMin = 0;
  return cfg;
}

function applyFlags(cfg, flags = {}) {
  for (const [key, value] of Object.entries(flags)) {
    if (!(key in DEFAULTS)) continue;
    cfg[key] = value;
  }
  return coerce(cfg);
}

function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        out.flags[key] = true;
      } else {
        out.flags[key] = next;
        i += 1;
      }
    } else {
      out._.push(arg);
    }
  }
  return out;
}

function load(flags = {}) {
  let fileCfg = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      fileCfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (err) {
      throw new Error(`config.json khong parse duoc: ${err.message}`);
    }
  }

  const cfg = coerce({ ...DEFAULTS, ...fileCfg });

  if (process.env.DISCORD_TOKEN) cfg.token = process.env.DISCORD_TOKEN;
  applyFlags(cfg, flags);

  return cfg;
}

function validate(cfg, { needChannel = true } = {}) {
  const problems = [];
  if (!cfg.token) {
    problems.push(
      'thieu token. Cach 1: copy config.example.json thanh config.json roi dien token. ' +
      'Cach 2: dat bien moi truong DISCORD_TOKEN',
    );
  }
  if (needChannel && !cfg.channelId) problems.push('thieu channelId');
  if (problems.length) throw new Error(problems.join(' | '));
}

module.exports = { load, validate, parseArgs, coerce, applyFlags, DEFAULTS, CONFIG_PATH };
