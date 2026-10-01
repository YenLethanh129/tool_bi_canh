const log = require('../log');
const session = require('../browser/session');
const { pageApi, CMD } = require('../browser/page-api');
const { sleep, randomDelay } = require('../util/timing');
const { isFreeTextStep } = require('../plan/step');
const { findWithRetry } = require('./locator');
const { clickElement, isStale } = require('./clicker');
const { StepSkipped } = require('./errors');

// Moi dang step mot Action. Runner chi hoi ACTIONS xem co ai "giu" step nay
// khong, nen them dang step moi = them 1 class vao mang duoi day, khong sua
// vong for trong plan-runner.
//
//   execute(step, ctx) -> { clicked: boolean, label?: string }
//   ctx = { page, cfg, tag }
//
// ctx.tag la "[3/14]" do runner gan, dung de moi action in cùng mot kieu.

class WaitAction {
  canHandle(step) {
    return !!step.wait;
  }

  async execute(step, ctx) {
    log.plain(`${ctx.tag} chờ ${step.wait}ms`);
    await ctx.page.waitForTimeout(step.wait);
    return { clicked: false };
  }
}

class GotoAction {
  canHandle(step) {
    return !!step.goto;
  }

  async execute(step, ctx) {
    await session.openUrl(ctx.page, step.goto, ctx.cfg);
    log.ok(`${ctx.tag} đã đổi trang`);
    return { clicked: false };
  }
}

class ShotAction {
  canHandle(step) {
    return !!step.shot;
  }

  async execute(step, ctx) {
    await ctx.page.screenshot({ path: step.shot, fullPage: false });
    log.ok(`${ctx.tag} đã chụp ${step.shot}`);
    return { clicked: false };
  }
}

class ClickAction {
  canHandle(step) {
    return !!(step.text || step.messageId || step.messageText);
  }

  async execute(step, ctx) {
    const { page, cfg, tag } = ctx;
    const state = { permalinkTried: false };

    // Step chi nhieu ten nut, khong gan voi tin nhan nao: cho ngan, khong thay
    // thi sang nut o step sau ngay. Danh sach step la danh sach nut CAN BAM.
    const byText = isFreeTextStep(step);
    const stepCfg = byText
      ? { ...cfg, findTimeoutMs: step.findTimeoutMs ?? cfg.tryMs }
      : cfg;
    if (byText) log.plain(`${tag} tìm nút "${step.text}"`);

    const el = await findWithRetry(page, stepCfg, step, state);

    try {
      await el.scrollIntoViewIfNeeded({ timeout: 4000 });
    } catch {
      /* bo qua, click se tu xu ly */
    }

    const label = ((await el.innerText().catch(() => '')) || step.text || '?').trim();
    const where = step.messageId ? ` (message ${step.messageId})` : '';
    const delay = randomDelay(step.delayMin ?? cfg.delayMin, step.delayMax ?? cfg.delayMax);
    log.info(`cho ${Math.round(delay)}ms truoc khi bam "${label}"${where}`);
    await sleep(delay);

    const res = await clickElement(page, cfg, step, el);
    if (!res.ok) {
      // Nut bi Discord thay moi luc bam: bo qua step nay, vong sau thu lai
      if (!res.lastErr || isStale(res.lastErr)) {
        throw new StepSkipped(
          `nút "${label}" bị Discord thay mới lúc bấm, thử nút ở step tiếp theo`,
          { code: 'restarted', label },
        );
      }
      throw res.lastErr;
    }
    if (res.attempt > 1) {
      log.warn(`nút bị Discord thay mới, đã bấm lại lần ${res.attempt}`);
    }

    log.ok(`da bam "${label}"${where}`);
    await page.waitForTimeout(step.afterClickMs ?? cfg.afterClickMs);

    const modal = await page.evaluate(pageApi, { cmd: CMD.MODAL });
    if (modal) log.warn('co modal popup - may can ban nhap tay truoc khi chay tiep');

    return { clicked: true, label };
  }
}

// Thu tu quan trong: step co nhieu truong se di vao action dung truong do
// xuat hien truoc.
const ACTIONS = [new WaitAction(), new GotoAction(), new ShotAction(), new ClickAction()];

function findAction(step) {
  return ACTIONS.find((action) => action.canHandle(step)) || null;
}

module.exports = { ACTIONS, findAction };