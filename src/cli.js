const config = require('./config');
const { printHelp, printConfig } = require('./ui/help');
const { login } = require('./commands/login');
const { dump } = require('./commands/dump');
const { run } = require('./commands/run');

// Bang lenh. Them lenh moi = them 1 dong o day, khong sua switch.
//   run(cfg, args, flags)
//   needsConfig: false => lenh khong can doc config.json
const COMMANDS = {
  login: { run: (cfg) => login(cfg) },
  dump: {
    run: (cfg, args, flags) => dump(cfg, flags.url || args[0] || cfg.channelUrl),
  },
  run: {
    run: (cfg, args, flags) => run(cfg, {
      file: args[0],
      steps: flags.step,
      url: flags.url,
    }),
  },
  config: { run: () => printConfig(), needsConfig: false },
  help: { run: () => printHelp(), needsConfig: false },
};

async function main(argv = process.argv.slice(2)) {
  const { _, flags } = config.parseArgs(argv);
  const [command, ...args] = _;

  if (!command || flags.help) return COMMANDS.help.run();

  const entry = COMMANDS[command];
  if (!entry) {
    printHelp();
    throw new Error(`lenh khong hop le: ${command}`);
  }

  const cfg = entry.needsConfig === false ? null : config.load(flags);
  return entry.run(cfg, args, flags);
}

module.exports = { main, printHelp };