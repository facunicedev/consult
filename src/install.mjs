import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from './config.mjs';

const ITEMS = ['SKILL.md', 'ALL.md', 'consult.mjs', 'src', 'package.json', 'LICENSE'];

// Copies the skill to ~/.claude/skills/consult (or --dir). Keeps an existing consult.config.json.
export function install(target = join(homedir(), '.claude', 'skills', 'consult')) {
  if (target === ROOT) return { target, copied: [], note: 'Already running from the install folder.' };
  mkdirSync(target, { recursive: true });
  for (const f of ITEMS) cpSync(join(ROOT, f), join(target, f), { recursive: true });
  const cfg = join(target, 'consult.config.json');
  if (!existsSync(cfg)) cpSync(join(ROOT, 'consult.config.json'), cfg);
  return { target, copied: ITEMS, note: 'Existing consult.config.json is never overwritten.' };
}
