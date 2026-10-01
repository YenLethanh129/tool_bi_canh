const log = require('../log');
const session = require('../browser/session');
const { createPlanSource } = require('../plan/source');
const { PlanRunner } = require('../run/plan-runner');

// Chay ke hoach. Ke hoach lay tu file (uu tien) hoac tu --step tren dong lenh.
// `reloadPlan` trong config.json = doc lai file o dau moi vong.
async function run(cfg, { file, steps, url }) {
  const source = createPlanSource({ file, steps });

  if (cfg.reloadPlan && !source.reloadable) {
    log.warn('reloadPlan khong co tac dung khi plan lay tu --step, can dung file plan.json');
  }

  return session.withSession(cfg, (page) => (
    new PlanRunner({ cfg, source, page, url }).run()
  ));
}

module.exports = { run };