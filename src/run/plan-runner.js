const log = require('../log');
const session = require('../browser/session');
const { trapStop } = require('../util/signal');
const { isFreeTextStep, signature } = require('../plan/step');
const { countClicks } = require('../plan/source');
const { findAction } = require('./actions');
const { isSkipped } = require('./errors');

const { c } = log;

// Chay mot ke hoach, lap lai cho den khi het viec hoac Ctrl+C.
//
// Nhan manh cua no: doc ke hoach qua `source.current()` MOT LAN O DAU MOI VONG.
//   - source la FilePlanSource + config.reloadPlan = true  => sua file plan giua
//     chung duoc, vong sau thay theo ngay.
//   - source hong, hoac file dang sua do roi => giu plan hop le cuoi cung, in
//     canh bao, khong mat chay.
// Vay "doc lai plan" chi ton tai o day, khong lan sang cho nao khac.
class PlanRunner {
  constructor({ cfg, source, page, url = null }) {
    this.cfg = cfg;
    this.source = source;
    this.page = page;
    this.urlOverride = url;

    this.loop = cfg.loop;
    this.loopDelay = cfg.loopDelay;
    this.reloadPlan = cfg.reloadPlan;
    // Chi danh sach nut moi quay lai buoc 0. Step co messageId la chuoi buoc
    // buoc bat ke: quay lai se bam lai chinh tin nhan do. O che do 1 vong,
    // quay lai buoc 0 se quet lai ngon trang ma khong bao gio ket thuc.
    this.restart = this.loop && cfg.restart;

    this.round = 0;
    this.clicks = 0;
    this.stopping = false;
    this.steps = [];
    this.url = null;
    this.planSignature = null;
  }

  // flags --url thang hon plan, va plan thang hon config.json
  resolveUrl() {
    return this.urlOverride ?? this.planUrl ?? this.cfg.channelUrl;
  }

  loadPlan() {
    const { steps, url, error } = this.source.current();

    if (error && steps.length === 0) throw error;   // chua co ban hop le nao de dung
    if (error) log.warn(`đọc lại kế hoạch lỗi (${error.message}), dùng kế hoạch hiện tại`);

    this.steps = steps;
    this.planUrl = url;
    const sig = signature(steps);

    if (sig !== this.planSignature) {
      this.planSignature = sig;
      if (this.round > 0) {
        log.info(`đã nạp lại kế hoạch: ${steps.length} bước (${countClicks(steps)} bước bấm)`);
      }
    }
  }

  async openCurrentUrl() {
    const url = this.resolveUrl();
    if (!url) {
      throw new Error('thieu url kenh. Dat channelUrl trong config.json hoac dung --url');
    }
    // Chi mo lai trang khi that su doi (doi "url" trong plan), khong mo lai
    // moi vong: se lam mat vi tri cuon va lam nhieu lenh hon.
    if (url !== this.url) {
      this.url = url;
      await session.openUrl(this.page, url, this.cfg);
    }
  }

  async run() {
    const release = trapStop(() => { this.stopping = true; });

    try {
      this.loadPlan();
      log.info(`kế hoạch: ${this.steps.length} bước (${countClicks(this.steps)} bước bấm)`);
      log.info(this.loop ? 'chế độ lặp: chạy tới khi bấm Ctrl+C' : 'chạy 1 vòng');
      if (this.restart) log.info('sau mỗi lần bấm nút tên sẽ quay lại bước 1, thử lại từ đầu');
      await this.openCurrentUrl();

      for (;;) {
        this.round += 1;
        const clicked = await this.runRound();

        if (!this.loop || this.stopping) break;

        if (clicked) {
          log.plain('');
          log.info(`${this.clicks} lần bấm, quét lại từ đầu...`);
        }
        if (this.loopDelay > 0) {
          log.plain('');
          log.info(`chờ ${this.loopDelay}ms rồi chạy lại từ đầu...`);
          await this.waitOrStop(this.loopDelay);
        }

        if (this.stopping) break;
        if (this.reloadPlan) {
          this.loadPlan();
          await this.openCurrentUrl();
        }
      }

      log.info(`đã dừng sau ${this.round} vòng quét, tổng ${this.clicks} lần bấm`);
      return this.clicks;
    } finally {
      release();
    }
  }

  // Cho `stopping` co hoi duoc bat giua duong, thay vi phai doi het loopDelay.
  async waitOrStop(ms) {
    for (let waited = 0; waited < ms; waited += 200) {
      if (this.stopping) return;
      await this.page.waitForTimeout(Math.min(200, ms - waited));
    }
  }

  async runRound() {
    const steps = this.steps;
    let done = 0;
    let skipped = 0;
    let missing = 0;
    let clicked = false;
    const absent = [];

    log.plain('');
    if (this.round > 1) log.info(`bắt đầu vòng ${this.round}`);

    for (let i = 0; i < steps.length; i += 1) {
      if (this.stopping) break;
      const step = steps[i];
      const tag = `${c.gray}[${i + 1}/${steps.length}]${c.reset}`;
      const action = findAction(step);

      if (!action) {
        log.warn(`${tag} bỏ qua, step không có nội dung gì`);
        done += 1;
        continue;
      }

      try {
        const res = await action.execute(step, { page: this.page, cfg: this.cfg, tag });
        done += 1;
        if (!res.clicked) continue;

        this.clicks += 1;
        clicked = true;
        log.ok(`${tag} xong (tổng ${this.clicks} lần bấm)`);

        if (this.restart && isFreeTextStep(step)) {
          // i = -1 de vong for tang len 0 o lan lap tiep theo.
          i = -1;
        }
      } catch (err) {
        // Khong thay tin nhan ID, hoac tin nhan khong co nut: in ra roi
        // chay tiep sang tin nhan sau, khong dung ca chay.
        if (isSkipped(err)) {
          skipped += 1;
          if (err.code === 'scope-missing') missing += 1;
          if (step.text) absent.push(step.text);
          log.err(`${tag} ${err.message}`);
          log.plain(step.messageId
            ? `${c.gray}      -> bỏ qua, chuyển sang tin nhắn tiếp theo${c.reset}`
            : `${c.gray}      -> thử nút ở step tiếp theo${c.reset}`);
          continue;
        }

        if (step.optional) {
          skipped += 1;
          done += 1;
          log.warn(`${tag} lỗi nhưng optional, bỏ qua: ${err.message}`);
          continue;
        }

        log.err(`${tag} DỪNG: ${err.message}`);
        log.info('Chạy "node edge.js dump <url>" để xem hiện trạng.');
        throw err;
      }
    }

    this.report(done, skipped, missing, clicked, absent);
    return clicked;
  }

  // Vong chi ket thuc khi quet het danh sach ma khong bam duoc gi.
  report(done, skipped, missing, clicked, absent) {
    const parts = [clicked
      ? `xong ${done}/${this.steps.length} bước`
      : `quét hết ${this.steps.length} bước, không có nút nào để bấm`];
    if (skipped) parts.push(`${skipped} bước bị bỏ qua`);
    if (missing) parts.push(`${missing} tin nhắn không tìm thấy`);

    log.plain('');
    if (clicked) log.ok(parts.join(' | '));
    else log.warn(parts.join(' | '));

    if (absent.length) {
      log.plain(`${c.gray}      nút chưa xuất hiện: ${absent.join(', ')}${c.reset}`);
    }
  }
}

module.exports = { PlanRunner };