const log = require('../log');
const session = require('../browser/session');
const { pageApi, CMD } = require('../browser/page-api');
const { renderDump } = require('../ui/render');

// Xem hien trang trang: tin nhan nao co nut, ten nut la gi, id bao nhieu.
// Dung de lay gia tri bo vao plan.json.
async function dump(cfg, url) {
  if (!url) throw new Error('thieu url kenh. Vi du: node edge.js dump "https://discord.com/channels/111/222"');
  if (!/^https?:\/\//.test(url)) {
    throw new Error(`"${url}" khong phai link kenh. Phai bat dau bang https://discord.com/channels/...`);
  }

  return session.withSession(cfg, async (page) => {
    await session.openUrl(page, url, cfg);
    renderDump(await page.evaluate(pageApi, { cmd: CMD.DUMP }));
    log.info('keo chu den kenh, thay message can xem, roi chay lai dump neu thay');
  });
}

module.exports = { dump };