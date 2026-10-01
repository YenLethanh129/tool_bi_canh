const { pageApi, CMD } = require('../browser/page-api');
const { findOptions } = require('./locator');

// React cua Discord thay moi DOM rat lien tuc: giua luc tool tim nut va luc
// bam, tin nhan co the duoc render lai -> handle cu khong con "attached".
// Day la viec thuong gap trong Discord, khong phai loi, nen phai tim lai
// chu khong phai dung ca chay.
const STALE = /not attached to the DOM|detached|no longer attached|not visible|intercepts pointer|Execution context was destroyed/i;

function isStale(err) {
  return STALE.test(err?.message || '');
}

// Bam nut. Neu handle bi React thay moi thi tim lai roi bam lai, toi da
// cfg.clickRetries lan, cuoi cung thu force mot lan. Ok:false va lastErr=null
// nghia la nut da bien mat han khong tim lai duoc.
async function clickElement(page, cfg, step, el) {
  const opts = findOptions(step);
  const timeout = step.clickTimeoutMs ?? cfg.clickTimeoutMs;
  let target = el;
  let lastErr = null;
  let attempt = 0;

  for (attempt = 1; attempt <= cfg.clickRetries; attempt += 1) {
    if (attempt > 1) {
      const again = await page.evaluateHandle(pageApi, opts);
      const fresh = again.asElement();
      target = fresh || null;
    }
    if (target) {
      try {
        await target.click({ timeout });
        return { ok: true, attempt, lastErr: null };
      } catch (err) {
        lastErr = err;
        if (!isStale(err)) return { ok: false, attempt, lastErr };
        target = null;
      }
    }
    if (attempt < cfg.clickRetries) await page.waitForTimeout(cfg.retryMs);
  }

  // Het luot. Neu nut chi bi che o gi (intercepts pointer) thi force se duoc.
  if (lastErr) {
    const again = await page.evaluateHandle(pageApi, opts);
    const fresh = again.asElement();
    if (fresh) {
      try {
        await fresh.click({ timeout, force: true });
        return { ok: true, attempt: attempt + 1, lastErr: null };
      } catch (err) {
        return { ok: false, attempt, lastErr: err };
      }
    }
  }
  return { ok: false, attempt, lastErr: null };
}

module.exports = { clickElement, isStale };