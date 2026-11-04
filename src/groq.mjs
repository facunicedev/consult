import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConsultError } from './config.mjs';

export const GROQ_URL = 'https://api.groq.com/openai/v1';

export function keyHelp() {
  const win = process.platform === 'win32';
  return [
    'GROQ_API_KEY is not set.',
    '  1. Create a free key at https://console.groq.com/keys (never paste it into a chat).',
    win
      ? '  2. In a terminal run:  setx GROQ_API_KEY "paste-your-key-here"   then open a NEW terminal.'
      : '  2. Add to ~/.zshrc or ~/.bashrc:  export GROQ_API_KEY="paste-your-key-here"   then run: source ~/.zshrc (or open a new terminal).',
  ].join('\n');
}

// Rough estimate: 1 token ~ 3 characters of input, plus the output cap.
export const estimateTokens = (text, maxOut) => Math.ceil(text.length / 3) + maxOut;

// Seconds to wait so the previous call's tokens fall out of the per-minute window.
export function paceWait(prev, nowMs, tokensPerMinute) {
  if (!prev) return 0;
  const w = Math.ceil((60 * prev.est) / tokensPerMinute - (nowMs - prev.at) / 1000 + 2);
  return Math.max(0, w);
}

const defaultSleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

function readState(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

export const defaultStateFile = () => join(tmpdir(), 'consult_groq_state.json');

export async function callGroq({
  prompt, config, apiKey = process.env.GROQ_API_KEY, fetchFn = fetch,
  sleep = defaultSleep, now = Date.now, stateFile = defaultStateFile(), log = () => {},
}) {
  if (!apiKey) throw new ConsultError(keyHelp());
  const g = config.groq;
  const est = estimateTokens(prompt, g.maxOutputTokens);
  const today = new Date(now()).toISOString().slice(0, 10);
  const prev = readState(stateFile);
  const dayTokens = prev && prev.day === today ? prev.dayTokens : 0;
  if (dayTokens + est > g.tokensPerDay) {
    throw new ConsultError(`Estimated daily Groq budget would be exceeded (${dayTokens} used + ${est} needed > ${g.tokensPerDay}). Wait until tomorrow, or raise groq.tokensPerDay in consult.config.json if your plan allows it.`);
  }
  const wait = paceWait(prev, now(), g.tokensPerMinute);
  if (wait > 0) { log(`pacing: waiting ${wait}s for the per-minute token limit`); await sleep(wait); }
  writeFileSync(stateFile, JSON.stringify({ at: now(), est, day: today, dayTokens: dayTokens + est }));

  for (let i = 1; i <= g.retries; i++) {
    let res;
    try {
      res = await fetchFn(`${GROQ_URL}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: g.model, messages: [{ role: 'user', content: prompt }], max_completion_tokens: g.maxOutputTokens }),
      });
    } catch (e) {
      throw new ConsultError(`Could not reach Groq (${e.message}). Check your internet connection and retry the same command.`);
    }
    if (res.status === 429 || res.status === 503) {
      if (i < g.retries) {
        const ra = Number(res.headers?.get?.('retry-after'));
        const s = Number.isFinite(ra) && ra > 0 ? Math.min(ra, 120) : 20 * i;
        log(`Groq answered ${res.status}; retry ${i}/${g.retries - 1} in ${s}s`);
        await sleep(s);
        continue;
      }
      throw new ConsultError(`Groq kept answering ${res.status} after ${g.retries} attempts (rate limit or overload). Stop and wait (the free tier resets per minute and per day), then rerun the same round command. Check usage at https://console.groq.com/settings/limits`);
    }
    if (res.status === 401) throw new ConsultError('Groq rejected the API key (401). Create a new key at https://console.groq.com/keys and store it again in GROQ_API_KEY.');
    if (!res.ok) throw new ConsultError(`Groq returned HTTP ${res.status}. Rerun the same command; if it persists, check https://groqstatus.com`);
    const data = await res.json();
    const out = data?.choices?.[0]?.message?.content;
    if (!out) throw new ConsultError(`Groq returned an empty answer (finish_reason: ${data?.choices?.[0]?.finish_reason}). Rerun the same command.`);
    return out;
  }
}
