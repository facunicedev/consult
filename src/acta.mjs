import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { shuffle } from './labels.mjs';
import { ConsultError } from './config.mjs';

const MAX = 2500;

// Final position = from the line containing "AGREEMENTS" to the end (cap 2500 chars).
// Falls back to the tail of the text if the voice did not use the marker.
export function extractActa(text) {
  const lines = text.split(/\r?\n/);
  const i = lines.findIndex((l) => /agreements/i.test(l));
  const body = i >= 0 ? lines.slice(i).join('\n') : text.slice(-MAX);
  return body.slice(0, MAX);
}

export function buildActa(dir, mode, voices, rng = Math.random) {
  const out = shuffle(voices, rng).map((v, n) => {
    let text;
    try { text = readFileSync(join(dir, `${v}_r3.txt`), 'utf8'); }
    catch { throw new ConsultError(`Missing ${v}_r3.txt in ${dir}. Finish round 3 before building the acta.`); }
    return `--- Final position ${n + 1} (stage ${mode}) ---\n${extractActa(text)}\n`;
  });
  const file = join(dir, `acta_${mode}.txt`);
  writeFileSync(file, out.join('\n'));
  return file;
}
