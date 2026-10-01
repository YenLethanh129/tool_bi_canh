// Mo ta moi thong so cua tool. Them 1 option = them 1 dong o day, khong phai
// sua them o DEFAULT / NUMERIC / truthy() nhu truoc.
//
// type:  string | boolean | ms | int | path | url
//         ms  = so mili giay >= 0
//         int = so nguyen >= 1
//         path= duong dan, duoc resolve thanh absolute luc load
//         url = link trang

const SCHEMA = {
  // === Trinh duyet ===
  edgeProfile: { type: 'path', default: './.edge-profile' },
  // De trong = tu do cac duong dan Edge thuong gap (tu doi voi may)
  edgePath: { type: 'path', default: '' },
  headless: { type: 'boolean', default: false },
  discordUrl: { type: 'url', default: 'https://discord.com/app' },

  // === Mo trang ===
  channelUrl: { type: 'url', default: '' },
  navTimeoutMs: { type: 'ms', default: 30000 },
  settleMs: { type: 'ms', default: 900 },

  // === Cham ngay truoc / sau khi bam ===
  delayMin: { type: 'ms', default: 1200 },
  delayMax: { type: 'ms', default: 3500 },
  afterClickMs: { type: 'ms', default: 1500 },

  // === Bam ===
  // Discord (React) thay moi DOM lien tuc -> handle cu bi "detached" giua luc
  // tim nut va luc bam. clickRetries: so lan tim lai roi bam lai.
  clickRetries: { type: 'int', default: 3 },
  clickTimeoutMs: { type: 'ms', default: 6000 },

  // === So lan thu tim nut ===
  // maxAttempts: so lan quet toi da cho mot step
  // retryMs:       nghi giua hai lan quet
  // -> thoi gian that cua mot step = maxAttempts * retryMs, cat som khi het
  //    findTimeoutMs. Do la cong thuc de tinh so lan thu thay vi ban phai do.
  maxAttempts: { type: 'int', default: 12 },
  retryMs: { type: 'ms', default: 250 },

  // Step chi nhieu ten nut: cho ngan, khong thay nut nao thi sang step sau ngay
  tryMs: { type: 'ms', default: 2500 },
  // Step co messageId/messageText: cho lau hon, vi phai doi bot gui tin nhan
  findTimeoutMs: { type: 'ms', default: 20000 },

  // === Vong lap ===
  loop: { type: 'boolean', default: false },
  loopDelay: { type: 'ms', default: 3000 },
  // Bam xong thi quay lai buoc 0 thay vi di tiep danh sach
  restart: { type: 'boolean', default: true },
  // true = doc lai file plan o dau moi vong, nen sua plan giua chung duoc
  reloadPlan: { type: 'boolean', default: false },
};

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

function toNumber(value, fallback, { min = 0, integer = false }) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  const v = integer ? Math.round(n) : n;
  return v < min ? (integer ? min : Math.max(0, v)) : v;
}

const COERCERS = {
  string: (v, d) => (v === undefined || v === null ? d : String(v)),
  boolean: (v, d) => (typeof v === 'boolean' ? v : TRUTHY.has(String(v).trim().toLowerCase())),
  ms: (v, d) => toNumber(v, d, { min: 0 }),
  int: (v, d) => toNumber(v, d, { min: 1, integer: true }),
  path: (v, d) => String(v ?? d).trim() || d,
  url: (v, d) => String(v ?? d).trim(),
};

function defaults() {
  const out = {};
  for (const [key, rule] of Object.entries(SCHEMA)) out[key] = rule.default;
  return out;
}

// Ep ve 1 config sach: chi giu key co trong SCHEMA, dung type cua no.
// Mot option la trong config.json nhung thua key deu bi bo qua.
function normalize(raw = {}) {
  const cfg = defaults();
  for (const [key, rule] of Object.entries(SCHEMA)) {
    if (raw[key] !== undefined) cfg[key] = COERCERS[rule.type](raw[key], rule.default);
  }
  if (cfg.delayMin > cfg.delayMax) [cfg.delayMin, cfg.delayMax] = [cfg.delayMax, cfg.delayMin];
  return cfg;
}

function describe() {
  return Object.entries(SCHEMA)
    .map(([key, rule]) => `${key} (${rule.type}) = ${JSON.stringify(rule.default)}`)
    .join('\n');
}

module.exports = { SCHEMA, COERCERS, defaults, normalize, describe };