const fs = require('fs');
const path = require('path');

const json = require('../util/json');
const { parseArgs } = require('../util/args');
const { SCHEMA, normalize } = require('./schema');

const ROOT = path.join(__dirname, '..', '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');

// Thu tu uu tien: mac dinh < config.json < --flag < bien moi truong.
// Flag chi duoc ghi de key co trong SCHEMA nen `--loop true` bat duoc,
// con `--soMi` thi bi bo qua thay vi lam hong config.
function load(flags = {}, env = process.env) {
  let fileCfg = {};
  if (fs.existsSync(CONFIG_PATH)) fileCfg = json.read(CONFIG_PATH, 'config.json');

  const cfg = normalize({ ...fileCfg, ...pick(flags) });

  for (const [key, rule] of Object.entries(SCHEMA)) {
    if (rule.type !== 'path') continue;
    if (cfg[key]) cfg[key] = path.resolve(ROOT, cfg[key]);
    else delete cfg[key];
  }
  if (env.EDGE_PATH && !cfg.edgePath) cfg.edgePath = path.resolve(env.EDGE_PATH);

  return cfg;
}

function pick(flags) {
  const out = {};
  for (const key of Object.keys(SCHEMA)) {
    if (flags[key] !== undefined) out[key] = flags[key];
  }
  return out;
}

module.exports = { load, parseArgs, normalize, CONFIG_PATH };