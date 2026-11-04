import { spawn } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { ConsultError } from './config.mjs';

export const CODEX_HELP = 'Codex CLI is not installed or not on PATH.\n  Install:  npm install -g @openai/codex\n  Then:     codex login   (uses your ChatGPT account)';

function q(s) { return `"${s.replace(/"/g, '\\"')}"`; }

// Runs: codex exec --skip-git-repo-check --sandbox read-only --ephemeral -o <out> -  < promptFile
export function runCodex(promptFile, outFile, command = 'codex', spawnFn = spawn) {
  return new Promise((resolve, reject) => {
    const args = ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '--ephemeral', '-o', outFile, '-'];
    // On Windows the npm shim is codex.cmd, which needs a shell.
    const win = process.platform === 'win32';
    const child = win
      ? spawnFn(`${command} ${args.map((a) => (a.includes(' ') ? q(a) : a)).join(' ')}`, { shell: true, stdio: ['pipe', 'ignore', 'pipe'] })
      : spawnFn(command, args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    child.stderr?.on('data', (d) => { err += d; });
    child.on('error', (e) => reject(new ConsultError(e.code === 'ENOENT' ? CODEX_HELP : `Codex failed to start: ${e.message}`)));
    child.on('close', (code) => {
      if (code === 0 && existsSync(outFile) && statSync(outFile).size > 0) return resolve();
      const hint = /refresh token|expired|log ?in|unauthorized/i.test(err)
        ? 'Your Codex session expired. Run:  codex login'
        : /not recognized|not found/i.test(err) ? CODEX_HELP
        : `Codex exited with code ${code}. Run it by hand to see why:  codex exec "say hi"`;
      reject(new ConsultError(hint));
    });
    createReadStream(promptFile).pipe(child.stdin);
  });
}
