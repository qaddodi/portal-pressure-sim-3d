// The code checks as audit checks: the typecheck (`tsc --noEmit`) and the lint (`scripts/lint.mjs`), run as the repo runs them, their output turned into findings. Node only.
import { spawnSync } from 'node:child_process';
import { ROOT } from './world.mjs';

/** `npm run typecheck`: one finding per error, id from the code and the file and the message with its numbers taken out. */
export function typecheck() {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [`${ROOT}node_modules/typescript/bin/tsc`, '--noEmit', '--pretty', 'false'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
  const errors = [];
  for (const line of `${r.stdout}\n${r.stderr}`.split('\n')) {
    const m = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(line);
    if (m) errors.push({ file: m[1], line: Number(m[2]), code: m[4], message: m[5] });
  }
  return { errors, seconds: (Date.now() - t0) / 1000, status: r.status, crashed: r.status !== 0 && !errors.length ? `${r.stdout}${r.stderr}`.slice(0, 400) : '' };
}

/** `npm run lint`: a problem is a line that does not start with a space; the indented lines after it are its places. */
export function lint() {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [`${ROOT}scripts/lint.mjs`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  const problems = [];
  if (r.status) for (const line of `${r.stdout}\n${r.stderr}`.split('\n')) {
    if (!line.trim()) continue;
    if (/^\s/.test(line) && problems.length) problems.at(-1).places.push(line.trim());
    else problems.push({ head: line.trim(), places: [] });
  }
  return { problems, seconds: (Date.now() - t0) / 1000, status: r.status };
}
