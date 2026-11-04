import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { GROQ_URL, keyHelp } from './groq.mjs';
import { CODEX_HELP } from './codex.mjs';

// Default command runner: returns { ok, out }. Never throws.
function defaultRun(cmd, args) {
  try {
    const out = execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32', timeout: 15000 });
    return { ok: true, out: String(out).trim() };
  } catch (e) {
    return { ok: false, out: String(e.stderr || e.message || '').trim() };
  }
}

// Returns [{ status: 'OK'|'MISSING'|'WARN', name, detail, fix? }]. Pure of side effects except a temp write probe.
export async function runDoctor({
  config, online = false, env = process.env, nodeVersion = process.versions.node, run = defaultRun,
  fetchFn = fetch, home = homedir(), cwd = process.cwd(),
}) {
  const res = [];
  const add = (status, name, detail, fix) => res.push({ status, name, detail, fix });

  const major = Number(nodeVersion.split('.')[0]);
  major >= 18
    ? add('OK', 'Node.js', `v${nodeVersion}`)
    : add('MISSING', 'Node.js', `v${nodeVersion} (need >= 18)`, 'Install Node 18 or newer from https://nodejs.org');

  if (config.ais.includes('codex')) {
    const cmd = config.codex.command;
    const v = run(cmd, ['--version']);
    if (!v.ok) add('MISSING', 'Codex CLI', 'not found', CODEX_HELP.replace(/\n/g, ' | '));
    else {
      add('OK', 'Codex CLI', v.out.split('\n')[0]);
      const l = run(cmd, ['login', 'status']);
      l.ok
        ? add('OK', 'Codex login', l.out.split('\n')[0] || 'logged in')
        : add('WARN', 'Codex login', 'could not confirm a session (older Codex versions lack "login status")', 'codex login');
    }
  }

  const key = env.GROQ_API_KEY;
  if (config.ais.includes('groq')) {
    if (!key) add('MISSING', 'GROQ_API_KEY', 'not set', keyHelp().replace(/\n/g, ' | '));
    else if (!key.startsWith('gsk_') || key.length < 20 || key.length > 200) {
      add('WARN', 'GROQ_API_KEY', `set, ${key.length} characters, but it does not look like a Groq key (expected to start with gsk_)`, 'Create a new key at https://console.groq.com/keys');
    } else add('OK', 'GROQ_API_KEY', `set, ${key.length} characters`);

    if (online) {
      if (!key) add('WARN', 'Groq online check', 'skipped (no key)');
      else {
        try {
          const r = await fetchFn(`${GROQ_URL}/models`, { headers: { Authorization: `Bearer ${key}` } });
          if (r.ok) {
            const rl = ['x-ratelimit-limit-requests', 'x-ratelimit-limit-tokens', 'x-ratelimit-remaining-requests', 'x-ratelimit-remaining-tokens']
              .map((h) => [h, r.headers?.get?.(h)]).filter(([, v]) => v).map(([h, v]) => `${h.replace('x-ratelimit-', '')}=${v}`);
            add('OK', 'Groq online check', `key accepted${rl.length ? '; limits: ' + rl.join(', ') : ''}`);
          } else add('MISSING', 'Groq online check', `HTTP ${r.status}`, r.status === 401 ? 'Create a new key at https://console.groq.com/keys and store it again in GROQ_API_KEY' : 'Retry later; see https://groqstatus.com');
        } catch (e) {
          add('MISSING', 'Groq online check', `network error: ${e.message}`, 'Check your internet connection and rerun: node consult.mjs doctor --online');
        }
      }
    }
  }

  const out = resolve(cwd, config.outputDir);
  try {
    mkdirSync(out, { recursive: true });
    const probe = join(out, '.write-test');
    writeFileSync(probe, 'x'); rmSync(probe);
    add('OK', 'Output folder', out);
  } catch (e) {
    add('MISSING', 'Output folder', `${out} is not writable (${e.code || e.message})`, 'Set "outputDir" in consult.config.json to a writable folder');
  }

  const skill = join(home, '.claude', 'skills', 'consult', 'SKILL.md');
  existsSync(skill)
    ? add('OK', 'Skill installed', skill)
    : add('MISSING', 'Skill installed', `${skill} not found`, 'node consult.mjs install');
  return res;
}

export function formatDoctor(results) {
  return results.map((r) => `${r.status.padEnd(7)} ${r.name}: ${r.detail}${r.fix ? `\n        fix: ${r.fix}` : ''}`).join('\n');
}
