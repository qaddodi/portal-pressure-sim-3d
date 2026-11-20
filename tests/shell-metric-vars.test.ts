// Root cause of the History card at the top-left corner (Mac) and the Layers sheet floating mid-screen (phone): the shell's `--m-*` numbers (metricVars) were never put on .sh-root,
// so each sheet rule that reads one (`right: calc(... var(--sh-pad-x))`, `top: calc(... var(--m-pill-h))`) was invalid and the sheet fell back to the corner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { metricVars } from '../src/ui/shell/metrics.ts';

test('the shell root carries the metric variables', () => {
  const src = readFileSync('src/ui/shell/Shell.tsx', 'utf8');
  assert.match(src, /const METRICS = metricVars\(\)/);
  assert.match(src, /className="sh-root"[^>]*style=\{METRICS\}/);
});
test('every --m-* a stylesheet reads is one metricVars defines', () => {
  const have = new Set(Object.keys(metricVars()));
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith('.css') ? [`${d}/${e.name}`] : []);
  const missing: string[] = [];
  for (const f of walk('src')) for (const m of readFileSync(f, 'utf8').matchAll(/var\((--m-[a-z0-9-]+)(?=[,)])/g)) if (!have.has(m[1]!) && !new RegExp(`${m[1]}\\s*:`).test(readFileSync(f, 'utf8'))) missing.push(`${f} ${m[1]}`);
  assert.deepEqual(missing, []);
});
