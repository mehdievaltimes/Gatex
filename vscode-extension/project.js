'use strict';

// Match the deliberately small, documented project.yml format used by lwf.py.
function parseProject(text) {
  const settings = {};
  const keys = new Set(['name', 'type', 'language', 'engine', 'source']);
  for (const [index, raw] of text.split(/\r?\n/u).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([a-z_]+):\s*(.+)$/u.exec(line);
    const fail = message => { throw new Error(`project.yml:${index + 1}: ${message}`); };
    if (!match) fail('expected key: value (flat scalars only).');
    const key = match[1];
    let value = match[2];
    if (!keys.has(key) || Object.hasOwn(settings, key)) fail(`unknown or duplicate key ${key}.`);
    if (value.startsWith('"')) {
      try { value = JSON.parse(value); } catch { fail('invalid JSON quoted string.'); }
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1).replace(/''/gu, "'");
    } else if (!/^[\p{L}\p{N}_ .-]+$/u.test(value)) {
      fail('quote this value using JSON double quotes.');
    }
    if (typeof value !== 'string') fail('values must be strings.');
    settings[key] = value;
  }
  settings.source ??= 'paper.tex';
  if (!/^[\p{L}\p{N}_][\p{L}\p{N}_ .-]*\.tex$/u.test(settings.source)) {
    throw new Error('project.yml: source must be a root-level .tex filename.');
  }
  return settings;
}

module.exports = { parseProject };
