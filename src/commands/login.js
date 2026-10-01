const log = require('../log');
const session = require('../browser/session');

async function login(cfg) {
  return session.withSession(cfg, async (page) => {
    await session.waitForLogin(page, cfg);
    log.ok(`profile da luu tai ${cfg.edgeProfile}`);
    log.info('lan sau khong can dang nhap lai. Dong cua so Edge la duoc.');
    await session.ask('nhan Enter de dong Edge...');
  });
}

module.exports = { login };