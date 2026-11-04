import { appendFileSync, copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { ConsultError, voicesOf } from './config.mjs';
import { drawOthers } from './labels.mjs';
import { H, buildP1, buildRoundPrompt } from './prompts.mjs';
import { callGroq, estimateTokens } from './groq.mjs';
import { runCodex } from './codex.mjs';

const read = (dir, f) => {
  try { return readFileSync(join(dir, f), 'utf8'); }
  catch { throw new ConsultError(`Missing ${f} in ${dir}.`); }
};

const LABELS = { critique: 'Response', final: 'Critique', merge: 'Proposal', vote: 'Proposal' };

function resolvePrompt(round, dir, prompt) {
  let key = prompt;
  if (!key) {
    if (existsSync(join(dir, `h${round}.txt`))) return { h: read(dir, `h${round}.txt`), label: round === 3 ? 'Critique' : 'Response' };
    key = round === 2 ? 'critique' : round === 3 ? 'final' : null;
    if (!key) throw new ConsultError(`Round ${round} needs --prompt merge|vote|<file> (see ALL.md, "agree" stage).`);
  }
  if (H[key]) return { h: H[key], label: LABELS[key] };
  const f = isAbsolute(key) ? key : existsSync(join(dir, key)) ? join(dir, key) : resolve(key);
  if (!existsSync(f)) throw new ConsultError(`Prompt "${key}" is not critique|final|merge|vote nor an existing file.`);
  return { h: readFileSync(f, 'utf8'), label: 'Response' };
}

// Builds every file of a round; calls Codex/Groq unless dryRun. Returns a report.
export async function runRound({ round, dir, prompt, label, mode, dryRun = false, config, deps = {} }) {
  const { groq = callGroq, codex = runCodex, rng = Math.random, log = () => {} } = deps;
  const voices = voicesOf(config);
  const ais = config.ais;
  const prompts = {};
  let others = null;

  if (round === 1) {
    if (!existsSync(join(dir, 'p1.txt'))) {
      if (!mode) throw new ConsultError(`No p1.txt in ${dir}. Pass --mode attack|check|plan|deep|ideas to build it from ctx.txt, or write p1.txt yourself.`);
      writeFileSync(join(dir, 'p1.txt'), buildP1(read(dir, 'ctx.txt'), mode));
    }
    for (const v of ais) prompts[v] = 'p1.txt';
  } else {
    const prev = round - 1;
    for (const v of voices) read(dir, `${v}_r${prev}.txt`); // all three previous answers must exist
    const { h, label: dl } = resolvePrompt(round, dir, prompt);
    const lab = label || dl;
    const ctx = read(dir, 'ctx.txt');
    const mapFile = join(dir, `map_r${round}.txt`);
    rmSync(mapFile, { force: true });
    others = {};
    for (const v of voices) {
      const o = drawOthers(v, voices, rng);
      others[v] = o;
      const text = buildRoundPrompt({
        ctx, h, prev, label: lab,
        own: read(dir, `${v}_r${prev}.txt`),
        others: o.map((x) => read(dir, `${x}_r${prev}.txt`)),
      });
      const name = `prompt_${v}_r${round}.txt`;
      writeFileSync(join(dir, name), text);
      appendFileSync(mapFile, `reader=${v} ${o.map((x, i) => `${String.fromCharCode(65 + i)}=${x}`).join(' ')}\n`);
      if (v === 'claude') copyFileSync(join(dir, name), join(dir, `claude_in_r${round}.txt`));
      else prompts[v] = name;
    }
  }

  const est = {};
  let groqTokens = 0;
  for (const v of ais) {
    const chars = readFileSync(join(dir, prompts[v]), 'utf8').length;
    est[v] = v === 'groq' ? estimateTokens('x'.repeat(chars), config.groq.maxOutputTokens) : null;
    if (est[v]) groqTokens += est[v];
  }
  const report = { round, prompts, map: others, estimatedGroqTokens: groqTokens, dryRun };
  if (dryRun) return report;

  const jobs = ais.map(async (v) => {
    const outFile = join(dir, `${v}_r${round}.txt`);
    const pf = join(dir, prompts[v]);
    if (v === 'codex') await codex(pf, outFile, config.codex.command);
    else writeFileSync(outFile, await groq({ prompt: readFileSync(pf, 'utf8'), config, log }));
    log(`${v}: wrote ${outFile}`);
  });
  const results = await Promise.allSettled(jobs);
  const failed = results.map((r, i) => (r.status === 'rejected' ? `${ais[i]}: ${r.reason.message}` : null)).filter(Boolean);
  if (failed.length) {
    throw new ConsultError(`Round ${round} failed:\n${failed.join('\n')}\nDo not continue with a single voice; fix the cause and rerun: consult round ${round} ${dir}`);
  }
  return report;
}
