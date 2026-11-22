import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// "One source of time" (R3): the app reads time and waits through the clock (clock.now / clock.after / clock.every / clock.cancel), so the audit's
// speed mode changes ONE number (clock.setScale) and a whole slide change can run in node on a fake Env. performance.now, setTimeout, setInterval and
// their clear calls are allowed only in src/clock/ (the clock's own default Env) and the engine's worker host and copied engine. The .js files copied
// byte for byte from 2D (`*.copied.js`) are not rewritten: they take their timers as injected parameters, and the 3D side passes the clock's.
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
});
const EXEMPT = [join('src', 'clock') + '/', join('src', 'engine', 'hales') + '/', join('src', 'engine', 'host') + '/'];

test('performance.now, setTimeout and setInterval appear only in src/clock/ (allowance 0)', () => {
  const bad: string[] = [];
  for (const f of walk('src')) {
    if (EXEMPT.some((e) => f.startsWith(e))) continue;
    const text = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    // (any receiver: `win.setTimeout` paired with `clock.cancel` is the laser bug of c2ed15a3, so a timer of another source is not written at all)
    const hits = text.match(/\bperformance\.now\b|\b(?:setTimeout|setInterval|clearTimeout|clearInterval)\b/g);
    if (hits) bad.push(`${f} (${hits.length})`);
  }
  assert.deepEqual(bad, [], 'read time with clock.now(); wait with clock.after(fn, ms, tag) / clock.every(); cancel with clock.cancel(id)');
});
