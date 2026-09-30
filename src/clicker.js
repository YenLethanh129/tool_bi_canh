const {
  extractComponents,
  findComponent,
  matchComponent,
  isActionable,
  resolveSelectValues,
} = require('./scanner');
const log = require('./log');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Loi thu vien nem ra, so voi interaction co that bai gui di hay khong.
const HARD_FAILURES = ['BUTTON_NOT_FOUND', 'BUTTON_CANNOT_CLICK', 'SELECT_MENU_NOT_FOUND', 'INVALID_TYPE'];
const SOFT_FAILURES = ['INTERACTION_FAILED'];

function errorCode(err) {
  return String(err?.message ?? err?.name ?? err ?? '');
}

function describeError(err) {
  const code = errorCode(err);
  if (code.includes('MESSAGE_ID_NOT_FOUND')) return 'message khong ton tai (da xoa hoac sai id)';
  if (code.includes('BUTTON_NOT_FOUND')) return 'khong con nut nay trong message';
  if (code.includes('BUTTON_CANNOT_CLICK')) return 'nut dang bi disable';
  if (code.includes('SELECT_MENU_MIN_VALUES')) return 'so lua chon it hon min_values';
  if (code.includes('SELECT_MENU_MAX_VALUES')) return 'so lua chon nhieu hon max_values';
  if (code.includes('RATE_LIMIT')) return 'bi rate limit';
  return code || 'loi khong xac dinh';
}

class Clicker {
  constructor(channel, cfg) {
    this.channel = channel;
    this.cfg = cfg;
    this.cooldown = new Map();
    this.stats = { attempted: 0, clicked: 0, noResponse: 0, skipped: 0, failed: 0 };
  }

  key(messageId, component) {
    return `${messageId}:${component.customId}`;
  }

  cooldownLeft(key) {
    const last = this.cooldown.get(key);
    if (last === undefined) return 0;
    return Math.max(0, this.cfg.cooldownMs - (Date.now() - last));
  }

  randomDelay() {
    const { delayMin, delayMax } = this.cfg;
    return delayMin + Math.random() * Math.max(0, delayMax - delayMin);
  }

  // force: true bat buoc goi API. Khong co flag nay thi thu vien tra ve ban
  // dang cache -> component cu khong bao gio duoc lam moi truocc khi bam.
  async fetchMessage(messageId) {
    return this.channel.messages.fetch(messageId, { force: true });
  }

  async inspect(messageId) {
    const message = await this.fetchMessage(messageId);
    return { message, components: extractComponents(message) };
  }

  async performAction(message, component) {
    if (component.isButton) {
      return { kind: 'button', response: await message.clickButton(component.customId) };
    }

    const values = resolveSelectValues(component, this.cfg);
    if (!values) {
      throw new Error('SELECT_MENU_NOT_FOUND: khong co option nao khop');
    }
    return {
      kind: 'select',
      values,
      response: await message.selectMenu(component.customId, values),
    };
  }

  async clickById(messageId, target) {
    this.stats.attempted += 1;

    let components;
    try {
      ({ components } = await this.inspect(messageId));
    } catch (err) {
      this.stats.failed += 1;
      return { ok: false, reason: describeError(err) };
    }

    const component = findComponent(components, target);
    if (!component) {
      this.stats.failed += 1;
      return { ok: false, reason: `khong tim thay component khop "${target}"` };
    }
    return this.clickComponent(messageId, component);
  }

  async clickComponent(messageId, component) {
    if (!isActionable(component)) {
      this.stats.skipped += 1;
      const why = component.disabled
        ? 'component dang bi disable'
        : component.isButton
          ? 'nut khong co custom_id (nut link khong bam duoc)'
          : 'component khong the tuong tac';
      return { ok: false, reason: why };
    }

    const key = this.key(messageId, component);
    const left = this.cooldownLeft(key);
    if (left > 0) {
      this.stats.skipped += 1;
      return { ok: false, reason: `dang cooldown con ${Math.ceil(left / 1000)}s` };
    }

    const delay = this.randomDelay();
    log.info(`cho ${Math.round(delay)}ms truoc khi bam...`);
    await sleep(delay);

    let message;
    let components;
    try {
      ({ message, components } = await this.inspect(messageId));
    } catch (err) {
      this.stats.failed += 1;
      return { ok: false, reason: `refetch that bai: ${describeError(err)}` };
    }

    const fresh = findComponent(components, component.customId);
    if (!fresh) {
      this.stats.failed += 1;
      return { ok: false, reason: 'component bi xoa trong luc cho' };
    }
    if (fresh.disabled) {
      this.stats.skipped += 1;
      return { ok: false, reason: 'component bi disable trong luc cho' };
    }

    this.cooldown.set(key, Date.now());

    if (this.cfg.dryRun) {
      this.stats.skipped += 1;
      return {
        ok: true,
        dryRun: true,
        delay,
        label: fresh.label,
        customId: fresh.customId,
        kind: fresh.isButton ? 'button' : 'select',
      };
    }

    try {
      const result = await this.performAction(message, fresh);

      // INTERACTION_FAILED = da gui interaction di roi, chi la bot khong phan hoi
      // trong 5s. Van coi la thanh cong.
      if (SOFT_FAILURES.some((code) => errorCode(result.error).includes(code))) {
        this.stats.noResponse += 1;
        return { ok: true, noResponse: true, delay, kind: result.kind };
      }

      this.stats.clicked += 1;
      return {
        ok: true,
        delay,
        kind: result.kind,
        values: result.values,
        label: fresh.label,
        customId: fresh.customId,
        response: result.response,
      };
    } catch (err) {
      const code = errorCode(err);
      if (HARD_FAILURES.some((h) => code.includes(h))) {
        this.stats.skipped += 1;
        // Nut vua bi disable hoac bi thay the giua luc cho va luc bam ->
        // khong co tac dung gi, xoa cooldown de vong sau thu lai.
        this.cooldown.delete(key);
        return { ok: false, reason: describeError(err) };
      }
      if (SOFT_FAILURES.some((s) => code.includes(s))) {
        this.stats.noResponse += 1;
        return { ok: true, noResponse: true, delay, kind: fresh.isButton ? 'button' : 'select' };
      }
      this.stats.failed += 1;
      this.cooldown.delete(key);
      return { ok: false, reason: `bam loi: ${describeError(err)}` };
    }
  }

  // Quet channel, bam moi component khop filter tren tung message
  async clickMatches() {
    const messages = await this.channel.messages.fetch({ limit: this.cfg.scanLimit });
    const results = [];

    for (const message of messages.values()) {
      const candidates = extractComponents(message).filter((c) => matchComponent(c, this.cfg));
      if (candidates.length === 0) continue;

      for (const candidate of candidates) {
        const res = await this.clickComponent(message.id, candidate);
        results.push({ ...res, messageId: message.id, component: candidate });
        if (res.ok) break;
      }
    }

    return results;
  }
}

module.exports = { Clicker, sleep, describeError, HARD_FAILURES, SOFT_FAILURES };
