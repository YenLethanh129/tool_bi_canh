// Parse argv thanh { _: [posotional...], flags: {...} }.
// Flag co gia tri an toan: "--loop true" -> 'true', "--dryRun" -> true.
// Flag lap lai nhieu lan gom thanh mang: --step A --step B -> ['A','B'].

function parseArgs(argv = []) {
  const out = { _: [], flags: {} };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      out._.push(arg);
      continue;
    }

    const key = arg.slice(2);
    const next = argv[i + 1];
    const value = next === undefined || next.startsWith('--') ? true : next;
    if (value !== true) i += 1;

    const prev = out.flags[key];
    if (prev === undefined) out.flags[key] = value;
    else if (Array.isArray(prev)) prev.push(value);
    else out.flags[key] = [prev, value];
  }

  return out;
}

module.exports = { parseArgs };