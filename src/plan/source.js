const fs = require('fs');
const path = require('path');

const json = require('../util/json');
const { normalizeSteps, isClickStep } = require('./step');

function countClicks(steps) {
  return steps.filter(isClickStep).length;
}

// Moi noi doc ke hoach phai noi qua interface nay, khong goi fs.readFile truc
// tiep. Nho vay vong lap chi can hoi `source.current()` la co ke hoach moi, va
// ca thao tac "doc lai plan" chi nam o duy nhat mot cho.
//
//   current() -> { steps, url, error }
//     steps : Step[]  da chuan hoa (rong neu chua doc duoc lan nao)
//     url   : string|null  link trang ma plan neu dinh nghia
//     error : Error|null   ly do doc that bai o LAN NAY (ke ca khi van dung
//                          steps cu, de caller canh bao nguoi dung)

function assertUsable(steps, where) {
  if (steps.length === 0) throw new Error(`${where} khong co step nao`);
  if (countClicks(steps) === 0) throw new Error(`${where} khong co buoc bam nao`);
  return steps;
}

class InlinePlanSource {
  constructor({ steps, where = 'plan' }) {
    this.reloadable = false;
    this.plan = { steps: assertUsable(normalizeSteps(steps, where), where), url: null };
  }

  current() {
    return { ...this.plan, error: null };
  }
}

// Doc plan tu file. Bat buoc: doc lai moi vong (config `reloadPlan`) hoac giu
// nguyen ban doc dau. Neu file dang sua do roi (JSON hong / thieu "steps"), tra
// ve ban hop le cuoi cung kem `error` de nguoi dung khong bi mat chay giua luc.
class FilePlanSource {
  constructor(file) {
    this.file = file;
    this.path = path.resolve(file);
    this.reloadable = true;
    // Doc va kiem tra ngay luc tao: plan sai thi bao loi TRUOC khi mo Edge,
    // chua phai mo xong moi bi.
    this.lastGood = this.read();
  }

  current() {
    try {
      const plan = this.read();
      this.lastGood = plan;
      return { ...plan, error: null };
    } catch (error) {
      if (this.lastGood) return { ...this.lastGood, error };
      return { steps: [], url: null, error };
    }
  }

  read() {
    if (!fs.existsSync(this.path)) {
      throw new Error(`khong tim thay file ${this.file}. Kiem tra lai duong dan plan`);
    }

    const raw = json.read(this.path, this.file);
    if (!raw || typeof raw !== 'object') {
      throw new Error(`${this.file} khong phai object JSON`);
    }

    const steps = assertUsable(normalizeSteps(raw.steps ?? [], this.file), this.file);

    return { steps, url: raw.url ?? null };
  }
}

// Doc plan tu --step tren dong lenh. Cho phep viet gon:
//   --step "111222333444555666"  -> chi co message id
//   --step '{"messageId":"111","text":"Xac nhan"}'
function parseInlineSteps(raw) {
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((item, i) => {
    if (typeof item !== 'string') return item;
    if (!item.trim().startsWith('{')) return item;
    try {
      return JSON.parse(item);
    } catch {
      throw new Error(`step ${i + 1} khong phai JSON hop le: ${item}`);
    }
  });
}

// Chon nguon ke hoach: uu tien file neu co, khong co thi dung --step.
function createPlanSource({ file, steps }) {
  if (file) return new FilePlanSource(file);
  if (!steps || steps.length === 0) {
    throw new Error(
      'khong co step nao. Tao file plan.json hoac dung --step "111222333444555666"',
    );
  }
  return new InlinePlanSource({ steps: parseInlineSteps(steps) });
}

module.exports = {
  createPlanSource,
  countClicks,
  InlinePlanSource,
  FilePlanSource,
};