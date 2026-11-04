import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync, writeFileSync as wf } from 'node:fs';
import { join, resolve } from 'node:path';
import { ConsultError, loadConfig, voicesOf } from './config.mjs';
import { MODES } from './prompts.mjs';
import { runRound } from './rounds.mjs';
import { buildActa } from './acta.mjs';
import { install } from './install.mjs';
import { runDoctor, formatDoctor } from './doctor.mjs';

const HELP = `consult - blind, anonymous multi-AI debate for Claude Code

Usage: node consult.mjs <command> [options]

  new <mode> <topic>              create a work folder (modes: ${Object.keys(MODES).join(', ')})
  round <n> <dir> [options]       run round n in <dir>
        --mode <mode>             round 1 only: build p1.txt from ctx.txt if it does not exist
        --prompt <name|file>      critique | final | merge | vote | path to a prompt file
        --label <word>            word used for the anonymous items (Response, Critique, Proposal)
        --dry-run                 build every file and prompt, call nobody, print estimated tokens
  acta <dir> <mode>               build acta_<mode>.txt (anonymous final positions of round 3)
  transcript <dir> <file>         join all rounds and the letter maps into one text file
  doctor [--online]               check requirements; --online also tests the Groq key (no tokens spent)
  install [--dir <path>]          copy the skill to ~/.claude/skills/consult

Global: --config <file>   use a specific consult.config.json`;

export function parseArgs(argv) {
  const pos = []; const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      if (['dry-run', 'online', 'help'].includes(k)) opt[k] = true;
      else opt[k] = argv[++i];
    } else pos.push(a);
  }
  return { pos, opt };
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'topic';

export async function main(argv, out = console.log) {
  const { pos, opt } = parseArgs(argv);
  const [cmd, ...args] = pos;
  if (!cmd || opt.help || cmd === 'help') return out(HELP);
  const config = loadConfig(opt.config);
  const log = (m) => out(`  ${m}`);

  switch (cmd) {
    case 'new': {
      const [mode, ...t] = args;
      if (!MODES[mode]) throw new ConsultError(`Usage: node consult.mjs new <${Object.keys(MODES).join('|')}> <topic>`);
      const dir = resolve(config.outputDir, `${new Date().toISOString().slice(0, 10)}_${mode}_${slug(t.join(' '))}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'ctx.txt'), '');
      out(`Work folder: ${dir}\nWrite the context page to ctx.txt (data first, TASK block last), then: node consult.mjs round 1 "${dir}" --mode ${mode}`);
      return dir;
    }
    case 'round': {
      const round = Number(args[0]);
      if (!Number.isInteger(round) || round < 1 || !args[1]) throw new ConsultError('Usage: node consult.mjs round <n> <dir> [--mode m] [--prompt p] [--label l] [--dry-run]');
      const dir = resolve(args[1]);
      if (!existsSync(dir)) throw new ConsultError(`Folder not found: ${dir}`);
      const r = await runRound({ round, dir, prompt: opt.prompt, label: opt.label, mode: opt.mode, dryRun: !!opt['dry-run'], config, deps: { log } });
      out(r.dryRun
        ? `DRY RUN round ${round}: files built in ${dir}; nothing was sent. Estimated Groq tokens for this round: ${r.estimatedGroqTokens} (daily free limit in config: ${config.groq.tokensPerDay}).`
        : `Round ${round} done in ${dir}.`);
      if (round > 1 && !r.dryRun) out(`Next: read claude_in_r${round}.txt and write claude_r${round}.txt (do not open map_r${round}.txt yet).`);
      return r;
    }
    case 'acta': {
      if (args.length < 2) throw new ConsultError('Usage: node consult.mjs acta <dir> <mode>');
      return out(`Wrote ${buildActa(resolve(args[0]), args[1], voicesOf(config))}`);
    }
    case 'transcript': {
      if (args.length < 2) throw new ConsultError('Usage: node consult.mjs transcript <dir> <file>');
      const dir = resolve(args[0]); const parts = [];
      for (const r of [1, 2, 3]) for (const v of voicesOf(config)) {
        const f = join(dir, `${v}_r${r}.txt`);
        if (existsSync(f)) parts.push(`===== ROUND ${r} - ${v} =====\n${readFileSync(f, 'utf8').trim()}\n`);
      }
      for (const m of readdirSync(dir).filter((f) => /^map_r\d+\.txt$/.test(f)).sort()) parts.push(`===== LETTER MAP ${m} =====\n${readFileSync(join(dir, m), 'utf8')}`);
      wf(resolve(args[1]), parts.join('\n'));
      return out(`Wrote ${resolve(args[1])}`);
    }
    case 'doctor': {
      const res = await runDoctor({ config, online: !!opt.online });
      out(formatDoctor(res));
      if (res.some((r) => r.status === 'MISSING')) process.exitCode = 1;
      return res;
    }
    case 'install': {
      const r = install(opt.dir && resolve(opt.dir));
      return out(`Installed to ${r.target}. ${r.note}\nNext: node "${join(r.target, 'consult.mjs')}" doctor`);
    }
    default:
      throw new ConsultError(`Unknown command "${cmd}".\n\n${HELP}`);
  }
}
