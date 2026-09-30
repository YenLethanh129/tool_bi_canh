const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

const ts = () => new Date().toISOString().slice(11, 19);

const log = {
  info: (m) => console.log(`${C.gray}[${ts()}]${C.reset} ${m}`),
  ok: (m) => console.log(`${C.gray}[${ts()}]${C.reset} ${C.green}${m}${C.reset}`),
  warn: (m) => console.log(`${C.gray}[${ts()}]${C.reset} ${C.yellow}${m}${C.reset}`),
  err: (m) => console.log(`${C.gray}[${ts()}]${C.reset} ${C.red}${m}${C.reset}`),
  click: (m) => console.log(`${C.gray}[${ts()}]${C.reset} ${C.magenta}${C.bold}>> ${m}${C.reset}`),
  plain: (m = '') => console.log(m),
  c: C,
};

module.exports = log;
