// The engine starts BEFORE the scene is built, and its worker before the app's code has even arrived (24 Nov, "the splash takes long and snags a few seconds in").
// Root cause: bootEngine was called at the end of main.tsx's start(), after every module had been evaluated, and evaluating Stage.tsx builds the whole 3D scene in one main-thread task (about 1 s on a laptop, three to five on a
// phone). The worker, a thread of its own, sat unstarted through it, so the first patient waited for the scene and the cover's bar read "Starting Hales Engine" for the whole freeze with no engine started.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const STATIC = /^[ \t]*(?:import|export)\s+(?!type\b)(?:[^'"()]*?\sfrom\s*)?['"]([^'"]+)['"]/gm;

/** The order the browser EVALUATES the static graph of `entry` in (depth first, an import before the file that names it, each file once). */
function evalOrder(entry: string): string[] {
  const seen = new Set<string>(), order: string[] = [];
  const walk = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    if (/\.(tsx?|jsx?|mjs)$/.test(file)) for (const m of readFileSync(file, 'utf8').matchAll(STATIC)) {
      const spec = m[1]!; if (!spec.startsWith('.')) continue;
      const p = resolve(dirname(file), spec.split('?')[0]!);
      if (existsSync(p)) walk(p);
    }
    order.push(relative(root, file));
  };
  walk(resolve(root, entry));
  return order;
}

test('main.tsx evaluates the engine\'s start before the scene is built (before Stage.tsx, scene.ts and the scene\'s api)', () => {
  const order = evalOrder('src/main.tsx'), at = (f: string): number => { const i = order.indexOf(f); assert.ok(i >= 0, `${f} is in the boot entry`); return i; };
  const start = at('src/boot/engine-start.ts');
  for (const heavy of ['src/scene/scene.ts', 'src/scene/api.ts', 'src/scene/Stage.tsx', 'src/App.tsx']) assert.ok(start < at(heavy), `engine-start.ts is evaluated before ${heavy}`);
  assert.ok(at('src/boot/started.ts') < start, 'the cover\'s "started" flag is still the first thing it runs');
});

test('engine-start.ts boots the engine at once and main.tsx waits for that one boot (never a second one)', () => {
  const es = readFileSync('src/boot/engine-start.ts', 'utf8'), main = readFileSync('src/main.tsx', 'utf8');
  assert.match(es, /export const engineBooted[^=]*= bootEngine\(\)\.catch\(/);
  assert.equal([...main.matchAll(/bootEngine\(/g)].length, 0, 'main.tsx does not boot the engine itself');
  assert.match(main, /Promise\.all\(\[fontsReady\(\), engineBooted, bakedReady\]\)/);
});

test('the entry starts the worker as it asks for the app, after every page that is not the app has been ruled out', () => {
  const entry = readFileSync('src/entry.ts', 'utf8');
  const early = entry.indexOf('enginePool.early()'), app = entry.lastIndexOf("import('./main.tsx')"), gate = entry.indexOf('if (await plain()) return;');
  assert.ok(gate > 0 && gate < early && early < app, 'plain() first, then the worker, then the app');
  assert.doesNotMatch(entry.slice(0, entry.indexOf('/** False in the live')), /engine\/pool/, 'and the pool is a dynamic import, not one of the entry\'s static ones');
});

test('enginePool.early() makes the live worker once and live() hands that one over once, then makes new ones', async () => {
  const made: object[] = [];
  (globalThis as { Worker?: unknown }).Worker = class { constructor() { made.push(this); } postMessage() { /* none */ } terminate() { /* none */ } };
  try {
    const { enginePool } = await import('../src/engine/pool.ts');
    enginePool.early(); enginePool.early();
    assert.equal(made.length, 1, 'two early() calls make one worker');
    const a = enginePool.live();
    assert.equal(a, made[0], 'live() is the early worker');
    assert.equal(made.length, 1);
    const b = enginePool.live();
    assert.equal(made.length, 2, 'the next live() (a restart) makes its own');
    assert.notEqual(b, a);
  } finally { delete (globalThis as { Worker?: unknown }).Worker; }
});

test('a worker that cannot be made in early() is not an error there: live() says why', async () => {
  const { enginePool } = await import('../src/engine/pool.ts');
  assert.doesNotThrow(() => enginePool.early());
  assert.throws(() => enginePool.live(), /simulation worker could not start/);
});
