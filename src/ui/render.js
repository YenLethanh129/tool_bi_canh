const log = require('../log');
const { c } = log;

function renderScanStatus(scan) {
  const found = scan.matches.length
    ? `${c.green}thấy: ${scan.matches.slice(-3).join(', ')}${c.reset}`
    : `${c.yellow}chưa thấy${c.reset}`;
  log.plain(`${c.gray}      quét ${scan.messages} tin nhắn / ${scan.buttons} nút — ${found}${c.reset}`);
}

function renderDump(entries) {
  if (entries.length === 0) {
    log.warn('khong thay message nao co nut. Hay scroll toi message can xem roi chay lai dump');
    return;
  }

  for (const e of entries) {
    log.plain();
    log.plain(`${c.bold}${e.messageId}${c.reset}  ${c.gray}${e.text}${c.reset}`);
    for (const b of e.buttons) {
      const state = b.disabled ? `${c.red}[disabled]${c.reset}` : `${c.green}[ready]${c.reset}`;
      log.plain(`  ${state} ${c.yellow}<${b.tag}>${c.reset} "${b.label}" ${c.dim}${b.cls}${c.reset}`);
    }
  }
  const ids = entries.filter((e) => e.buttons.some((b) => !b.disabled));

  log.plain();
  log.plain(`${c.bold}Dán thẳng vào plan.json ("steps"):${c.reset}`);
  log.plain(`  ${c.magenta}[${ids.map((e) => `"${e.messageId}"`).join(', ')}]${c.reset}`);

  const withMany = ids.find((e) => e.buttons.filter((b) => !b.disabled).length > 1);
  if (withMany) {
    const first = withMany.buttons.find((b) => !b.disabled);
    log.plain();
    log.plain(`${c.gray}Message này có nhiều nút, cần chỉ định:${c.reset}`);
    log.plain(`  { "messageId": "${withMany.messageId}", "text": "${first.label}" }`);
  }

  log.plain();
  log.plain(`${c.gray}Lấy ID thủ công: chuột phải tin nhắn -> Copy Message ID / Sao chép ID Tin nhắn${c.reset}`);
  log.plain(`${c.gray}Trong plan chỉ cần điền id, tool tự tìm nút đầu tiên chưa bị khóa.${c.reset}`);
}

module.exports = { renderScanStatus, renderDump };