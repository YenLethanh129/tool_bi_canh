const fs = require('fs');
const path = require('path');

const { Client: SelfBot, Intents } = require('discord.js-selfbot-v13');
const log = require('./log');

const PID_PATH = path.join(__dirname, '..', 'tool.pid');

let client = null;

function createClient() {
  return new SelfBot({
    token: null,
    intents: Intents.ALL,
    rest: { timeout: 20000 },
  });
}

function writePid() {
  fs.writeFileSync(PID_PATH, String(process.pid), 'utf8');
}

function clearPid() {
  try {
    fs.unlinkSync(PID_PATH);
  } catch {
    /* ignore */
  }
}

async function connect(cfg) {
  client = createClient();
  client.removeAllListeners('debug');

  client.on('warn', (m) => log.warn(String(m).split('\n')[0]));
  client.on('error', (e) => log.err(`discord error: ${e.message}`));

  const t0 = Date.now();
  await client.login(cfg.token);
  log.ok(`da dang nhap voi ${client.user.tag} (${Date.now() - t0}ms)`);
  return client;
}

function resolveChannel(id) {
  const cached = client.channels.cache.get(id);
  if (cached) return cached;

  for (const guild of client.guilds.cache.values()) {
    const found = guild.channels.cache.get(id);
    if (found) return found;
  }
  return null;
}

function readPid() {
  if (!fs.existsSync(PID_PATH)) return null;
  return Number(fs.readFileSync(PID_PATH, 'utf8').trim()) || null;
}

module.exports = { connect, createClient, resolveChannel, writePid, clearPid, readPid, PID_PATH, get client() { return client; } };
