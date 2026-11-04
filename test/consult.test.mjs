import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drawOthers } from '../src/labels.mjs';
import { buildP1, buildRoundPrompt, H, MODES } from '../src/prompts.mjs';
import { extractActa, buildActa } from '../src/acta.mjs';
import { callGroq, paceWait } from '../src/groq.mjs';
import { loadConfig, DEFAULTS, ConsultError } from '../src/config.mjs';
import { runRound } from '../src/rounds.mjs';
import { runDoctor } from '../src/doctor.mjs';
import { main } from '../src/cli.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'consult-test-'));
const voices = ['codex', 'groq', 'claude'];
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test('label draw never gives a reader its own answer, and uses every other voice once', () => {
  for (let s = 1; s < 200; s++) {
    for (const v of voices) {
      const o = drawOthers(v, voices, seeded(s));
      assert.equal(o.length, 2);
      assert.ok(!o.includes(v));
      assert.deepEqual([...o].sort(), voices.filter((x) => x !== v).sort());
    }
  }
});

test('label draw varies the order', () => {
  const seen = new Set();
  for (const r of [0.1, 0.9]) seen.add(drawOthers('claude', voices, () => r).join());
  assert.equal(seen.size, 2);
});

test('round 1 prompt: context first, mode prompt, then common closing; unknown mode rejected', () => {
  const p = buildP1('CONTEXT\nTASK: decide X', 'deep');
  assert.ok(p.startsWith('CONTEXT'));
  assert.ok(p.indexOf(MODES.deep) > p.indexOf('TASK'));
  assert.match(p, /do not invent it/);
  assert.throws(() => buildP1('x', 'nope'), /Unknown mode/);
});

test('round 2/3 prompt carries own answer and anonymous items without names', () => {
  const p = buildRoundPrompt({ ctx: 'CTX', h: H.critique, prev: 1, own: 'MINE', others: ['ONE', 'TWO'], label: 'Response' });
  assert.match(p, /YOUR PREVIOUS ANSWER \(round 1\) ===\nMINE/);
  assert.match(p, /=== Response A ===\nONE/);
  assert.match(p, /=== Response B ===\nTWO/);
  assert.doesNotMatch(p, /codex|groq|claude/i);
  const p3 = buildRoundPrompt({ ctx: 'CTX', h: H.final, prev: 2, own: 'M', others: ['a', 'b'], label: 'Critique' });
  assert.match(p3, /=== Critique B ===/);
  assert.match(p3, /AGREEMENTS/);
});

test('acta extraction starts at AGREEMENTS and is capped; fallback to tail', () => {
  const t = 'intro\nlots of text\nAGREEMENTS\n- one\nDISAGREEMENTS\n- two\n' + 'z'.repeat(5000);
  const a = extractActa(t);
  assert.ok(a.startsWith('AGREEMENTS'));
  assert.equal(a.length, 2500);
  assert.equal(extractActa('no marker here'), 'no marker here');
});

test('buildActa writes one anonymous block per voice, and errors clearly when r3 is missing', () => {
  const d = tmp();
  for (const v of voices) writeFileSync(join(d, `${v}_r3.txt`), `${v} said\nAGREEMENTS\n- ok from ${v}`);
  const f = buildActa(d, 'attack', voices, seeded(3));
  const txt = readFileSync(f, 'utf8');
  assert.equal((txt.match(/--- Final position/g) || []).length, 3);
  assert.doesNotMatch(txt, /said/);
  const d2 = tmp();
  assert.throws(() => buildActa(d2, 'x', voices), /Missing \w+_r3\.txt/);
});

test('pacing: waits for the per-minute window and never negative', () => {
  assert.equal(paceWait(null, 0, 8000), 0);
  assert.equal(paceWait({ at: 0, est: 4000 }, 0, 8000), 32); // 30s + 2s margin
  assert.equal(paceWait({ at: 0, est: 4000 }, 60000, 8000), 0);
});

const okRes = (text) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ choices: [{ message: { content: text } }] }) });
const errRes = (status, ra) => ({ ok: false, status, headers: { get: (h) => (h === 'retry-after' ? ra : null) }, json: async () => ({}) });

test('groq: success, never logs or returns the key, sends the configured model', async () => {
  const d = tmp(); let sent; const logs = [];
  const fetchFn = async (url, init) => { sent = { url, init }; return okRes('hi'); };
  const out = await callGroq({ prompt: 'p', config: DEFAULTS, apiKey: 'gsk_SECRETSECRETSECRET1', fetchFn, sleep: async () => {}, stateFile: join(d, 's.json'), log: (m) => logs.push(m) });
  assert.equal(out, 'hi');
  assert.equal(JSON.parse(sent.init.body).model, 'openai/gpt-oss-120b');
  assert.equal(JSON.parse(sent.init.body).max_completion_tokens, 2500);
  assert.ok(!logs.join().includes('SECRET'));
});

test('groq: second call sleeps to respect tokens/min; 429 retries then succeeds', async () => {
  const d = tmp(); const sleeps = []; let n = 0;
  const base = { prompt: 'x'.repeat(3000), config: DEFAULTS, apiKey: 'k', stateFile: join(d, 's.json'), sleep: async (s) => sleeps.push(s), now: () => 1000 };
  await callGroq({ ...base, fetchFn: async () => okRes('a') });
  assert.equal(sleeps.length, 0);
  await callGroq({ ...base, fetchFn: async () => (n++ === 0 ? errRes(429, '7') : okRes('b')) });
  assert.ok(sleeps[0] > 20, 'pacing wait first'); // (1000+2500)/8000*60 + 2
  assert.equal(sleeps[1], 7, 'honours retry-after');
});

test('groq: persistent 429 gives a clear error; 401 and missing key too', async () => {
  const d = tmp();
  const base = { prompt: 'p', config: { ...DEFAULTS, groq: { ...DEFAULTS.groq, retries: 2 } }, apiKey: 'k', stateFile: join(d, 's.json'), sleep: async () => {} };
  await assert.rejects(callGroq({ ...base, fetchFn: async () => errRes(429) }), /kept answering 429 after 2 attempts/);
  await assert.rejects(callGroq({ ...base, fetchFn: async () => errRes(401) }), /rejected the API key/);
  await assert.rejects(callGroq({ ...base, apiKey: '', fetchFn: async () => okRes('x') }), /GROQ_API_KEY is not set[\s\S]*console\.groq\.com\/keys/);
});

test('groq: refuses when the estimated daily budget would be exceeded', async () => {
  const d = tmp(); const cfg = { ...DEFAULTS, groq: { ...DEFAULTS.groq, tokensPerDay: 3000 } };
  const base = { prompt: 'p', config: cfg, apiKey: 'k', stateFile: join(d, 's.json'), sleep: async () => {}, fetchFn: async () => okRes('ok') };
  await callGroq(base);
  await assert.rejects(callGroq(base), /daily Groq budget/);
});

test('config: defaults, overrides, and validation errors', () => {
  const d = tmp();
  assert.equal(loadConfig(undefined, d).groq.model, DEFAULTS.groq.model === 'x' ? '' : loadConfig(undefined, d).groq.model);
  writeFileSync(join(d, 'consult.config.json'), JSON.stringify({ groq: { model: 'm', maxOutputTokens: 100 }, ais: ['groq'] }));
  const c = loadConfig(undefined, d);
  assert.equal(c.groq.model, 'm');
  assert.equal(c.groq.tokensPerMinute, 8000, 'unset values keep defaults');
  assert.deepEqual(c.ais, ['groq']);
  writeFileSync(join(d, 'bad.json'), JSON.stringify({ ais: ['gemini'] }));
  assert.throws(() => loadConfig('bad.json', d), ConsultError);
  writeFileSync(join(d, 'bad2.json'), '{nope');
  assert.throws(() => loadConfig('bad2.json', d), /Invalid JSON/);
  assert.throws(() => loadConfig('missing.json', d), /not found/);
});

function seedRound1(d) {
  writeFileSync(join(d, 'ctx.txt'), 'Decision: REST or GraphQL for our public API?\nTASK: pick one.');
  for (const v of voices) writeFileSync(join(d, `${v}_r1.txt`), `answer of ${v}`);
}

test('dry-run end to end: round 1 and 2 build files, call nobody, report tokens', async () => {
  const d = tmp(); writeFileSync(join(d, 'ctx.txt'), 'CTX\nTASK: decide');
  const boom = () => { throw new Error('must not be called'); };
  const deps = { groq: boom, codex: boom };
  const r1 = await runRound({ round: 1, dir: d, mode: 'attack', dryRun: true, config: DEFAULTS, deps });
  assert.ok(existsSync(join(d, 'p1.txt')));
  assert.ok(r1.estimatedGroqTokens > 2500);
  assert.ok(!existsSync(join(d, 'codex_r1.txt')));
  seedRound1(d);
  const r2 = await runRound({ round: 2, dir: d, dryRun: true, config: DEFAULTS, deps, rng: undefined });
  for (const v of voices) assert.ok(existsSync(join(d, `prompt_${v}_r2.txt`)));
  assert.ok(existsSync(join(d, 'claude_in_r2.txt')));
  const map = readFileSync(join(d, 'map_r2.txt'), 'utf8').trim().split('\n');
  assert.equal(map.length, 3);
  for (const line of map) { const [, reader] = /reader=(\w+)/.exec(line); assert.ok(!new RegExp(`[AB]=${reader}\\b`).test(line)); }
  assert.doesNotMatch(readFileSync(join(d, 'prompt_codex_r2.txt'), 'utf8'), /answer of codex[\s\S]*answer of codex/);
  assert.equal(r2.dryRun, true);
});

test('real round with mocks: both AIs write their files; a failing AI aborts with a clear message', async () => {
  const d = tmp(); seedRound1(d);
  const calls = [];
  const codex = async (pf, out) => { calls.push('codex'); writeFileSync(out, 'codex r2'); };
  const groq = async () => { calls.push('groq'); return 'groq r2'; };
  await runRound({ round: 2, dir: d, config: DEFAULTS, deps: { codex, groq } });
  assert.deepEqual(calls.sort(), ['codex', 'groq']);
  assert.equal(readFileSync(join(d, 'groq_r2.txt'), 'utf8'), 'groq r2');
  const bad = async () => { throw new ConsultError('Your Codex session expired. Run:  codex login'); };
  await assert.rejects(runRound({ round: 2, dir: d, config: DEFAULTS, deps: { codex: bad, groq } }), /codex login[\s\S]*single voice/);
});

test('round 2+ errors clearly if a previous answer is missing; merge needs a label from H', async () => {
  const d = tmp(); writeFileSync(join(d, 'ctx.txt'), 'c');
  await assert.rejects(runRound({ round: 2, dir: d, dryRun: true, config: DEFAULTS }), /Missing codex_r1\.txt/);
  seedRound1(d);
  for (const v of voices) writeFileSync(join(d, `${v}_r3.txt`), 'x');
  await assert.rejects(runRound({ round: 4, dir: d, dryRun: true, config: DEFAULTS }), /needs --prompt/);
  const m = await runRound({ round: 4, dir: d, prompt: 'merge', dryRun: true, config: DEFAULTS });
  assert.match(readFileSync(join(d, 'prompt_groq_r4.txt'), 'utf8'), /=== Proposal A ===/);
  assert.equal(m.dryRun, true);
});

test('doctor: all OK with mocks, key never printed; failures give exact fixes', async () => {
  const d = tmp();
  const run = (cmd, args) => (args[0] === '--version' ? { ok: true, out: 'codex 1.0.0' } : { ok: true, out: 'Logged in' });
  const key = 'gsk_' + 'a'.repeat(40);
  const fetchFn = async () => ({ ok: true, status: 200, headers: { get: (h) => (h === 'x-ratelimit-limit-tokens' ? '8000' : null) } });
  const res = await runDoctor({ config: { ...DEFAULTS, outputDir: join(d, 'out') }, online: true, env: { GROQ_API_KEY: key }, nodeVersion: '20.1.0', run, fetchFn, home: d, cwd: d });
  const text = JSON.stringify(res);
  assert.ok(!text.includes(key));
  assert.match(text, /set, 44 characters/);
  assert.match(text, /tokens=8000/);
  assert.equal(res.find((r) => r.name === 'Skill installed').status, 'MISSING');
  assert.equal(res.find((r) => r.name === 'Node.js').status, 'OK');

  const bad = await runDoctor({ config: DEFAULTS, env: {}, nodeVersion: '16.0.0', run: () => ({ ok: false, out: '' }), home: d, cwd: d });
  assert.equal(bad.find((r) => r.name === 'Node.js').status, 'MISSING');
  assert.match(bad.find((r) => r.name === 'Codex CLI').fix, /npm install -g @openai\/codex/);
  assert.match(bad.find((r) => r.name === 'GROQ_API_KEY').fix, /console\.groq\.com\/keys/);
  const weird = await runDoctor({ config: DEFAULTS, env: { GROQ_API_KEY: 'abc' }, nodeVersion: '20.0.0', run, home: d, cwd: d });
  assert.equal(weird.find((r) => r.name === 'GROQ_API_KEY').status, 'WARN');
  const rej = await runDoctor({ config: DEFAULTS, online: true, env: { GROQ_API_KEY: key }, nodeVersion: '20.0.0', run, fetchFn: async () => ({ ok: false, status: 401, headers: { get: () => null } }), home: d, cwd: d });
  assert.match(rej.find((r) => r.name === 'Groq online check').fix, /new key/);
});

test('cli: new + round --dry-run through main() with a config pointing at a temp output dir', async () => {
  const d = tmp(); const lines = [];
  const cfg = join(d, 'c.json'); writeFileSync(cfg, JSON.stringify({ outputDir: join(d, 'out') }));
  const dir = await main(['new', 'plan', 'Ship v1?', '--config', cfg], (m) => lines.push(m));
  writeFileSync(join(dir, 'ctx.txt'), 'CTX\nTASK: order the steps');
  await main(['round', '1', dir, '--mode', 'plan', '--dry-run', '--config', cfg], (m) => lines.push(m));
  assert.match(lines.join('\n'), /DRY RUN round 1/);
  assert.ok(existsSync(join(dir, 'p1.txt')));
  await assert.rejects(main(['bogus', '--config', cfg], () => {}), /Unknown command/);
});
