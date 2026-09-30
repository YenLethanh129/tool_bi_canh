#!/usr/bin/env node
const log = require('./src/log');
const { main } = require('./src/cli');

main().catch((err) => {
  log.err(err.message || String(err));
  process.exit(1);
});
