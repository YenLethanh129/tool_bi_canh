const { Clicker } = require('./clicker');
const { scanMessages } = require('./scanner');
const cfgModule = require('./config');
const log = require('./log');
const net = require('./client');

const { c } = log;

function renderScan(entries, cfg) {
  if (entries.length === 0) {
    log.warn('khong tim thay message nao co component');
    return;
  }

  for (const e of entries) {
    const tag = e.fromTarget ? `${c.green}TARGET${c.reset}` : `${c.gray}--${c.reset}`;
    log.plain();
    log.plain(
      `${c.bold}${e.id}${c.reset}  ${tag}  ${c.cyan}${e.authorTag}${c.reset}  ${c.gray}${(e.createdAt ?? new Date()).toISOString().slice(11, 19)}${c.reset}`,
    );
    log.plain(`  ${c.gray}text: ${c.reset}${e.preview}`);

    for (const comp of e.components) {
      const matched = e.matched.includes(comp);
      const mark = matched ? `${c.green}*${c.reset}` : ' ';
      const ready = comp.disabled || !comp.customId;
      const state = ready ? `${c.red}[skip]${c.reset}` : `${c.green}[ready]${c.reset}`;
      const id = comp.customId ? `${c.magenta}${comp.customId}${c.reset}` : `${c.gray}(no custom_id)${c.reset}`;
      const label = comp.label ? `"${comp.label}"` : comp.options ? `${comp.options.length} option` : '';
      const link = comp.url ? ` ${c.gray}${comp.url}${c.reset}` : '';
      log.plain(`  ${mark} ${state} ${c.yellow}${comp.type}${c.reset} ${label} ${c.gray}id=${c.reset}${id}${link}`);
      if (comp.options) {
        for (const opt of comp.options) {
          const def = opt.isDefault ? `${c.yellow} (mac dinh)${c.reset}` : '';
          log.plain(`      ${c.gray}-${c.reset} ${opt.label} ${c.dim}(${opt.value})${c.reset}${def}`);
        }
      }
    }
  }

  log.plain();
  const total = entries.reduce((n, e) => n + e.actionable.length, 0);
  const matched = entries.reduce((n, e) => n + e.matched.length, 0);
  log.plain(`${c.gray}${'-'.repeat(52)}${c.reset}`);
  log.plain(
    `${total} component bam duoc, ${c.green}${matched} khop filter${c.reset}. ` +
    `Bam: ${c.cyan}node index.js click <messageId> <customId|label>${c.reset}`,
  );
}

async function cmdScan(cfg) {
  cfgModule.validate(cfg);
  const client = await net.connect(cfg);
  const channel = net.resolveChannel(cfg.channelId);
  if (!channel) throw new Error(`khong tim thay channel ${cfg.channelId}`);

  const messages = await channel.messages.fetch({ limit: cfg.scanLimit });
  const entries = scanMessages([...messages.values()].reverse(), cfg);
  renderScan(entries, cfg);

  await client.destroy();
}

async function cmdClick(cfg, argv) {
  cfgModule.validate(cfg, { needChannel: false });
  const [messageId, target] = argv;
  if (!messageId || !target) {
    throw new Error('thieu tham so: node index.js click <messageId> <customId|label>');
  }

  const client = await net.connect(cfg);
  try {
    const channel = net.resolveChannel(cfg.channelId);
    if (!channel) throw new Error(`khong tim thay channel ${cfg.channelId}`);

    const clicker = new Clicker(channel, cfg);
    const res = await clicker.clickById(messageId, target);

    if (res.ok) {
      if (res.dryRun) {
        log.warn(
          `DRY-RUN: se bam ${res.kind} "${res.label}" (custom_id=${res.customId}) sau ${Math.round(res.delay)}ms`,
        );
      } else if (res.noResponse) {
        log.ok(
          `da gui interaction cho ${res.kind} (custom_id=${res.customId}), bot khong phan hoi trong 5s`,
        );
      } else {
        log.ok(`da bam ${res.kind} "${res.label}" (custom_id=${res.customId})`);
      }
    } else {
      log.err(`khong bam duoc: ${res.reason}`);
      process.exitCode = 1;
    }
  } finally {
    await client.destroy();
  }
}

async function cmdWatch(cfg, argv) {
  cfgModule.validate(cfg);
  const once = argv.includes('--once') || cfg.once === true;

  const client = await net.connect(cfg);
  const channel = net.resolveChannel(cfg.channelId);
  if (!channel) throw new Error(`khong tim thay channel ${cfg.channelId}`);

  const clicker = new Clicker(channel, cfg);
  net.writePid();
  log.info(`channel: ${channel.name || channel.id} (${channel.id})`);
  log.info(`filter : ${describeFilter(cfg)}`);
  log.info(
    `delay  : ${cfg.delayMin}-${cfg.delayMax}ms | cooldown ${cfg.cooldownMs}ms | poll ${cfg.pollIntervalMs}ms`,
  );
  if (cfg.dryRun) log.warn('DRY-RUN dang bat: se khong bam that');
  log.info('nhan Ctrl+C de dung\n');

  let running = true;
  let busy = false;
  let pending = [];

  client.on('messageCreate', (m) => {
    if (m.channelId === cfg.channelId) pending.push(m);
  });
  client.on('messageUpdate', (oldM, newM) => {
    if (newM?.channelId === cfg.channelId) pending.push(newM);
  });

  const shutdown = async (code = 0) => {
    if (!running) return;
    running = false;
    log.info('dang dung...');
    net.clearPid();
    try {
      client.destroy();
    } catch {
      /* ignore */
    }
    process.exit(code);
  };

  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));

  const tick = async () => {
    if (busy || !running) return;
    busy = true;

    let messages;
    try {
      if (pending.length > 0) {
        messages = pending;
        pending = [];
      } else {
        const fetched = await channel.messages.fetch({ limit: cfg.scanLimit });
        messages = [...fetched.values()];
      }
    } catch (err) {
      log.err(`khong doc duoc channel: ${err.message}`);
      busy = false;
      return;
    }

    try {
      const entries = scanMessages([...messages].reverse(), cfg);

      for (const entry of entries) {
        if (!running) break;
        if (entry.matched.length === 0) continue;

        for (const target of entry.matched) {
          if (!running) break;
          const kind = target.isButton ? 'button' : 'select';
          log.click(`match ${kind} "${target.label ?? target.customId}" tren ${entry.id}`);

          const res = await clicker.clickComponent(entry.id, target);

          if (res.ok) {
            if (res.dryRun) {
              log.warn(`DRY-RUN: se bam sau ${Math.round(res.delay)}ms`);
            } else if (res.noResponse) {
              log.ok(`da gui interaction, bot khong phan hoi trong 5s (${entry.id})`);
            } else {
              log.ok(
                `da bam ${res.kind} "${res.label ?? '?'}" tren ${entry.id}` +
                (res.values ? ` voi values=[${res.values.join(', ')}]` : ''),
              );
            }
            if (once) {
              await shutdown(0);
              return;
            }
            break;
          }

          log.warn(`bo qua: ${res.reason}`);
        }
      }
    } catch (err) {
      log.err(`vong quet loi: ${err.message}`);
    } finally {
      busy = false;
    }
  };

  while (running) {
    await tick();
    await new Promise((r) => setTimeout(r, cfg.pollIntervalMs));
  }
}

function describeFilter(cfg) {
  if (cfg.matchAll) return 'TAT CA button';
  const parts = [];
  if (cfg.matchCustomIds.length) parts.push(`custom_id in [${cfg.matchCustomIds.join(', ')}]`);
  if (cfg.matchLabels.length) parts.push(`label in [${cfg.matchLabels.join(', ')}]`);
  return parts.length ? parts.join(' AND ') : 'KHONG CO filter (se khong bam gi)';
}

function cmdStop() {
  const pid = net.readPid();
  if (!pid) {
    log.warn('khong co tien trinh watch nao dang chay');
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
    log.ok(`da gui tin hieu dung tien trinh ${pid}`);
    net.clearPid();
  } catch (err) {
    log.err(`khong dung duoc pid ${pid}: ${err.message}`);
  }
}

function printHelp() {
  log.plain(`
${c.bold}tool-bi-canh${c.reset} - CLI quet va bam nut trong message Discord

${c.bold}Cach dung${c.reset}
  node index.js <lenh> [tham so] [--flag gia tri]

${c.bold}Lenh${c.reset}
  ${c.cyan}scan${c.reset}                      quet channel, in ra message + component + custom_id
  ${c.cyan}click${c.reset} <messageId> <button>   bam 1 component (button = custom_id hoac label)
  ${c.cyan}watch${c.reset}                     tu dong quet va bam lien tuc theo filter
  ${c.cyan}stop${c.reset}                     dung watch dang chay o cua so khac
  ${c.cyan}help${c.reset}                     xem huong dan nay

${c.bold}Flag quan trong${c.reset}
  --channel <id>            override channelId
  --matchLabels "A,B,C"     chi bam nut co label trong danh sach
  --matchCustomIds "a,b"    chi bam component co custom_id trong danh sach
  --matchAll                bam tat ca (can than!)
  --selectLabels "A,B"      select menu: chon option co label/value trong danh sach
  --selectStrategy first    select menu: 'first' (mac dinh) hoac 'default'
  --delayMin 1500           do tre nho nhat (ms)
  --delayMax 4000           do tre lon nhat (ms)
  --cooldownMs 30000        khong bam lai cung 1 component trong 30s
  --pollIntervalMs 5000     chu ky quet channel
  --scanLimit 50            so message lay moi lan quet
  --dryRun true             chi ghi log, khong bam that
  --once                    watch: bam 1 lan roi dung

${c.bold}Vi du${c.reset}
  node index.js scan --channel 1234567890
  node index.js watch --channel 1234567890 --matchLabels "Xac nhan,Tiep tuc" --delayMin 2000 --delayMax 5000
  node index.js click 1234567890123456789 "Xac nhan" --dryRun true
`);
}

async function main() {
  const { _, flags } = cfgModule.parseArgs(process.argv.slice(2));
  const command = _[0];

  if (!command || command === 'help' || flags.help) {
    printHelp();
    return;
  }

  const cfg = cfgModule.load(flags);

  switch (command) {
    case 'scan':
      return cmdScan(cfg);
    case 'click':
      return cmdClick(cfg, _.slice(1));
    case 'watch':
      return cmdWatch(cfg, _.slice(1));
    case 'stop':
      return cmdStop();
    default:
      printHelp();
      throw new Error(`lenh khong hop le: ${command}`);
  }
}

module.exports = { main, printHelp };
