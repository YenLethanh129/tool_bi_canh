const TYPE_BY_NUMBER = {
  1: 'ACTION_ROW',
  2: 'BUTTON',
  3: 'STRING_SELECT',
  4: 'TEXT_INPUT',
  5: 'USER_SELECT',
  6: 'ROLE_SELECT',
  7: 'MENTIONABLE_SELECT',
  8: 'CHANNEL_SELECT',
};

const SELECT_TYPES = new Set([
  'STRING_SELECT',
  'USER_SELECT',
  'ROLE_SELECT',
  'MENTIONABLE_SELECT',
  'CHANNEL_SELECT',
]);

function normalizeType(type) {
  if (typeof type === 'number') return TYPE_BY_NUMBER[type] ?? `TYPE_${type}`;
  return type ?? 'UNKNOWN';
}

// Thu vien doi chieu object (customId, type la string) voi raw JSON tu API
// (custom_id, type la so). File nay nhan ca hai.
function extractComponents(message) {
  const items = [];

  for (const row of message.components ?? []) {
    const nodes = Array.isArray(row?.components) ? row.components : [];

    for (const node of nodes) {
      const type = normalizeType(node.type);
      if (type === 'ACTION_ROW') continue;

      const customId = node.customId ?? node.custom_id ?? null;

      items.push({
        type,
        customId,
        label: node.label ?? node.placeholder ?? null,
        style: node.style ?? null,
        disabled: Boolean(node.disabled),
        url: node.url ?? null,
        isButton: type === 'BUTTON',
        isSelect: SELECT_TYPES.has(type),
        minValues: node.minValues ?? node.min_values ?? 1,
        maxValues: node.maxValues ?? node.max_values ?? 1,
        options: Array.isArray(node.options)
          ? node.options.map((o) => ({
            label: o.label ?? null,
            value: o.value ?? null,
            isDefault: Boolean(o.default ?? o.isDefault),
          }))
          : null,
      });
    }
  }

  return items;
}

// Nut link (style LINK) khong co customId nen khong tuong tac duoc.
function isActionable(component) {
  if (component.disabled || !component.customId) return false;
  if (component.isButton) return true;
  if (component.isSelect) return !component.options || component.options.length > 0;
  return false;
}

function matchComponent(component, cfg) {
  if (!isActionable(component)) return false;
  if (cfg.matchAll) return true;
  if (cfg.matchCustomIds.length && cfg.matchCustomIds.includes(component.customId)) return true;
  if (cfg.matchLabels.length) {
    const label = component.label ?? '';
    if (cfg.matchLabels.includes(label)) return true;
  }
  return false;
}

function findComponent(components, target) {
  const needle = String(target);
  const lower = needle.toLowerCase();

  return (
    components.find((c) => c.customId === needle) ??
    components.find((c) => c.label && c.label.toLowerCase() === lower) ??
    components.find((c) => c.label && c.label.toLowerCase().includes(lower)) ??
    components.find((c) => c.customId && c.customId.includes(needle)) ??
    null
  );
}

// Chon gia tri cho select menu. STRING_SELECT nhan value hoac label deu duoc.
function resolveSelectValues(component, cfg) {
  const options = component.options ?? [];
  if (options.length === 0) return null;

  const wanted = (cfg.selectLabels ?? []).map((s) => String(s).toLowerCase());
  if (wanted.length > 0) {
    const hit = options.find(
      (o) => wanted.includes(String(o.label).toLowerCase()) ||
        wanted.includes(String(o.value).toLowerCase()),
    );
    if (!hit) return null;
    return [hit.value];
  }

  const min = Math.max(1, component.minValues ?? 1);

  if (cfg.selectStrategy === 'default') {
    const defaults = options.filter((o) => o.isDefault);
    if (defaults.length > 0) return defaults.slice(0, min).map((o) => o.value);
  }

  // minValues > 1 thi phai chon du so luong, thieu se bi thu vien nem loi
  return options.slice(0, min).map((o) => o.value);
}

function preview(message, max = 70) {
  const raw = (message.content || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '(khong co text)';
  return raw.length > max ? `${raw.slice(0, max)}...` : raw;
}

function scanMessages(messages, cfg) {
  return messages
    .map((message) => {
      const isBot = Boolean(message.author?.bot);
      const fromTarget = cfg.targetBotIds.length
        ? isBot && cfg.targetBotIds.includes(message.author.id)
        : isBot;

      const components = extractComponents(message);

      return {
        id: message.id,
        channelId: message.channelId,
        authorId: message.author?.id,
        authorTag: message.author?.tag ?? message.author?.username ?? 'unknown',
        isBot,
        fromTarget,
        createdAt: message.createdAt,
        preview: preview(message),
        components,
        actionable: components.filter(isActionable),
        matched: components.filter((c) => matchComponent(c, cfg)),
      };
    })
    .filter((entry) => entry.components.length > 0);
}

module.exports = {
  extractComponents,
  isActionable,
  matchComponent,
  findComponent,
  resolveSelectValues,
  preview,
  scanMessages,
  normalizeType,
  SELECT_TYPES,
};
