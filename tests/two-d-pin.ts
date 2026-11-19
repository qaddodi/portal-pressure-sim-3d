// The 2D checkout the copy checks compare against. Every copy script here is pinned to ONE 2D commit (PIN: the 2D preview branch's tip the parity plan reads from), so a check that
// found some other checkout lying beside this one (2D's main moves on) failed on files that were never wrong. A check now runs only against a checkout whose HEAD is the pin, and
// is skipped, with the reason, against any other: `git -C <2D> worktree add <dir> b3058ef3` and `PPS_2D_REPO=<dir> npm test`.
// Moving the pin is one decision for every copy script at once: change PIN here and re-run each `scripts/copy-*.mjs --from <2D at the new pin>`.
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

export const PIN = 'b3058ef3';

/** The 2D checkout at the pin that holds `file`, as { repo } to run against, or { skip } (a reason) for the test's options. */
export function pinned2D(file: string): { repo: string; skip: false } | { repo: ''; skip: string } {
  const here = new URL('..', import.meta.url).pathname;
  const candidates = [process.env.PPS_2D_REPO, '/home/claude/portal-pressure-simulator', `${here}../portal-pressure-simulator`].filter((p): p is string => !!p);
  let other = '';
  for (const repo of candidates) {
    if (!existsSync(`${repo}/${file}`)) continue;
    let head = '';
    try { head = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* not a git checkout */ }
    if (head.startsWith(PIN)) return { repo, skip: false };
    other = `${repo} is at ${head.slice(0, 8) || 'an unknown commit'}`;
  }
  return { repo: '', skip: other ? `${other}, not the pin ${PIN} (git worktree add <dir> ${PIN}; PPS_2D_REPO=<dir>)` : `no 2D checkout at the pin ${PIN} (set PPS_2D_REPO)` };
}
