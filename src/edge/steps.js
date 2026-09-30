const SNOWFLAKE = /^\d{17,20}$/;

// Chuan hoa 1 step. Chap nhan ca 3 dang:
//   "111222333444555666"                       -> chi co message id
//   { "messageId": "111..." }                  -> tu tim nut dau tien trong message
//   { "messageId": "111...", "text": "OK" }    -> tim nut theo ten
const FIELDS = new Set([
  'messageId', 'messageText', 'text', 'index', 'order', 'wait',
  'goto', 'shot', 'optional', 'scroll', 'force',
  'delayMin', 'delayMax', 'afterClickMs', 'findTimeoutMs',
]);

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

  if (step.text === undefined && step.messageId === undefined
    && step.messageText === undefined && !step.wait && !step.goto && !step.shot) {
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

  for (const key of ['delayMin', 'delayMax', 'afterClickMs', 'wait', 'findTimeoutMs']) {
    if (step[key] !== undefined) {
      step[key] = Number(step[key]);
      if (!Number.isFinite(step[key]) || step[key] < 0) {
        throw new Error(`${where}.${key} phai la so >= 0`);
      }
    }
  }

  return step;
}

function normalizeSteps(list) {
  return list.map((raw, i) => normalizeStep(raw, `step ${i + 1}`));
}

// Step co y nghia "bam nut" khi khong can chi dinh ten nut
function isClickStep(step) {
  return !!(step.text || step.messageId || step.messageText);
}

module.exports = { normalizeStep, normalizeSteps, isClickStep, SNOWFLAKE, FIELDS };
