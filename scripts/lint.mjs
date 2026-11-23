#!/usr/bin/env node
// `npm run lint`: the files nobody may hand-edit, then the project's rules over src/ (scripts/lint-rules.mjs, one pass, about a second).
// Each rule has an allowance in scripts/lint-allow.json: more hits than that fails; fewer is a prompt to lower it (`node scripts/lint.mjs --update` does).
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { lintFiles, judge, RULES, conflictMarkers, css2dEdits } from './lint-rules.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const problems = [];
const pinned = JSON.parse(readFileSync(join(root, 'src/engine/PINNED.json'), 'utf8'));
if (!pinned.engine?.commit) problems.push('src/engine/PINNED.json has no pinned commits: run npm run sync:engine');
for (const f of ['AGENTS.md', 'CLAUDE.md', 'index.html']) if (!existsSync(join(root, f))) problems.push(`missing ${f}`);

// Conflict markers anywhere in a tracked text file (never allowed, no allowance): a merge that was committed with them breaks the build.
let tracked = [];
try { tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 }).split('\0').filter((f) => /\.(m?[jt]sx?|json|css|html|md|ya?ml|glsl|vert|frag|txt)$/.test(f) && existsSync(join(root, f))); } catch { /* (no git: the check is skipped) */ }
for (const f of tracked) { const at = conflictMarkers(readFileSync(join(root, f), 'utf8')); if (at.length) problems.push(`${f}: unresolved merge conflict markers at line ${at.slice(0, 5).join(', ')}`); }

// The 2D stylesheets are 2D's bytes (rule no-css2d-edit, no allowance): a hand edit or a hand-made sheet in src/ui/css2d fails here.
{
  const dir = join(root, 'src/ui/css2d');
  const source = JSON.parse(readFileSync(join(dir, 'SOURCE.json'), 'utf8'));
  problems.push(...css2dEdits(readdirSync(dir).filter((n) => n.endsWith('.css')).map((name) => ({ name, bytes: readFileSync(join(dir, name)) })), source));
}

const walk = (dir) => readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => {
  const p = `${dir}/${e.name}`;
  return e.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.d.ts') ? [p] : [];
});
const files = walk('src').map((path) => ({ path, text: readFileSync(join(root, path), 'utf8') }));
const allowPath = join(root, 'scripts/lint-allow.json');
const allow = existsSync(allowPath) ? JSON.parse(readFileSync(allowPath, 'utf8')) : {};
const hits = lintFiles(files);
const { counts, over, under } = judge(hits, allow);

if (process.argv.includes('--update')) {
  const next = Object.fromEntries(Object.keys(RULES).map((r) => [r, Math.min(counts[r], allow[r] ?? counts[r])]));
  writeFileSync(allowPath, `${JSON.stringify(next, null, 2)}\n`);
  console.log('lint: allowances written to scripts/lint-allow.json', next);
  process.exit(problems.length ? 1 : 0);
}
for (const r of over) {
  problems.push(`${r}: ${counts[r]} hits, allowance ${allow[r] ?? 0} (what the rule says: the comment above it in scripts/lint-rules.mjs)`);
  const seen = new Set(); // the hits are not tied to "the new ones", so list them all but cap the noise
  for (const h of hits.filter((x) => x.rule === r).slice(0, 12)) if (!seen.has(`${h.path}:${h.line}`)) { seen.add(`${h.path}:${h.line}`); problems.push(`  ${h.path}:${h.line}  ${h.text}`); }
}
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
for (const r of under) console.log(`lint: ${r} is down to ${counts[r]} (allowance ${allow[r] ?? 0}): run node scripts/lint.mjs --update and commit scripts/lint-allow.json`);
console.log(`lint: ok (${files.length} files, ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')})`);
