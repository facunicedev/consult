import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export class ConsultError extends Error {}

export const DEFAULTS = {
  ais: ['codex', 'groq'],
  outputDir: './consult-output',
  codex: { command: 'codex' },
  groq: {
    model: 'openai/gpt-oss-120b',
    maxOutputTokens: 2500,
    tokensPerMinute: 8000,
    tokensPerDay: 200000,
    retries: 4,
  },
};

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Lookup order: explicit path, ./consult.config.json, the one next to consult.mjs.
export function loadConfig(explicitPath, cwd = process.cwd()) {
  const candidates = explicitPath
    ? [resolve(cwd, explicitPath)]
    : [join(cwd, 'consult.config.json'), join(ROOT, 'consult.config.json')];
  const file = candidates.find((f) => existsSync(f));
  if (explicitPath && !file) throw new ConsultError(`Config file not found: ${candidates[0]}`);
  let user = {};
  if (file) {
    try { user = JSON.parse(readFileSync(file, 'utf8')); }
    catch (e) { throw new ConsultError(`Invalid JSON in ${file}: ${e.message}`); }
  }
  return validate(merge(DEFAULTS, user));
}

function merge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const nested = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object';
    out[k] = nested ? merge(base[k], v) : v;
  }
  return out;
}

function validate(c) {
  const known = ['codex', 'groq'];
  if (!Array.isArray(c.ais) || c.ais.length === 0 || c.ais.some((a) => !known.includes(a))) {
    throw new ConsultError(`Config "ais" must be a non-empty list of: ${known.join(', ')}. Got: ${JSON.stringify(c.ais)}`);
  }
  for (const k of ['maxOutputTokens', 'tokensPerMinute', 'tokensPerDay', 'retries']) {
    if (!Number.isInteger(c.groq[k]) || c.groq[k] <= 0) throw new ConsultError(`Config groq.${k} must be a positive integer.`);
  }
  if (typeof c.groq.model !== 'string' || !c.groq.model) throw new ConsultError('Config groq.model must be a non-empty string.');
  return c;
}

export const voicesOf = (config) => [...config.ais, 'claude'];
