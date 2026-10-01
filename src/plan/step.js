const SNOWFLAKE = /^\d{17,20}$/;

// Moi truong duoc phep trong 1 step. Tho so moi -> them vao day, khong can sua
// logic o noi nao khac.
const FIELDS = new Set([
  'messageId', 'messageText', 'text', 'index', 'order', 'wait',
  'goto', 'shot', 'optional', 'scroll', 'force',
  'delayMin', 'delayMax', 'afterClickMs', 'findTimeoutMs',
]);

const NUMBERS = ['delayMin', 'delayMax', 'afterClickMs', 'wait', 'findTimeoutMs'];
const TARGET_FIELDS = ['messageId', 'messageText', 'text', 'wait', 'goto', 'shot'];

// Chuan hoa 1 step. Chap nhan ca 3 dang:
//   "111222333444555666"                       -> chi co message id
//   { "messageId": "111..." }                  -> tu tim nut dau tien trong message
//   { "messageId": "111...", "text": "OK" }    -> tim nut theo ten
function normalizeStep(raw, where = 'step') {
  let step = raw;

  if (typeof step === 'number') step = String(step);
  if (typeof step === 'string') step = { messageId: step };

  if (!step || typeof step !== 'object' || Array.isArray(step)) {
    throw new Error(`${where} khong hop le: ${JSON.stringify(raw)}`);
  }

  const unknown = Object.keys(step).filter((k) => !FIELDS.has(k));
  if (unknown.length) {
    throw new Error(`${where} co truong la: ${unknown.join(', ')}`);
  }

  if (step.messageId !== undefined && !SNOWFLAKE.test(String(step.messageId))) {
    throw new Error(`${where}.messageId khong phai snowflake: ${step.messageId}`);
  }

  const empty = TARGET_FIELDS.every((k) => step[k] === undefined || step[k] === '' || !step[k]);
  if (empty) {
    throw new Error(`${where} rong, can it nhat "messageId", "text", "wait", "goto" hoac "shot"`);
  }

  if (step.index !== undefined) {
    step.index = Number(step.index);
    if (!Number.isInteger(step.index) || step.index < 0) {
      throw new Error(`${where}.index phai la so nguyen >= 0`);
    }
  }

  if (step.order !== undefined) {
    step.order = String(step.order).toLowerCase();
    if (!['newest', 'oldest'].includes(step.order)) {
      throw new Error(`${where}.order phai la "newest" hoac "oldest"`);
    }
  }

  for (const key of NUMBERS) {
    if (step[key] === undefined) continue;
    step[key] = Number(step[key]);
    if (!Number.isFinite(step[key]) || step[key] < 0) {
      throw new Error(`${where}.${key} phai la so >= 0`);
    }
  }

  return step;
}

function normalizeSteps(list, where = 'plan') {
  if (!Array.isArray(list)) throw new Error(`${where}: "steps" phai la mang`);
  return list.map((raw, i) => normalizeStep(raw, `${where} step ${i + 1}`));
}

// Step co y nghia "bam nut"
function isClickStep(step) {
  return !!(step.text || step.messageId || step.messageText);
}

// Step chi nhieu ten nut, khong gan voi tin nhan nao: cho ngan, va khi bam
// xong thi quay lai buoc 0 (vi danh sach step la danh sach nut CAN BAM).
function isFreeTextStep(step) {
  return isClickStep(step) && !step.messageId && !step.messageText;
}

// Chuoi nhan dang de so sanh xem plan co doi gi giua cac vong hay khong.
function signature(steps) {
  return steps
    .map((s) => s.text ?? s.messageId ?? s.messageText ?? s.goto ?? s.shot ?? 'wait')
    .join('|');
}

module.exports = {
  normalizeStep,
  normalizeSteps,
  isClickStep,
  isFreeTextStep,
  signature,
  SNOWFLAKE,
  FIELDS,
};