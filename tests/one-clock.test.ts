import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// "One clock": requestAnimationFrame is called in src/clock/frame.ts and nowhere else. (The worker host under src/engine/host runs in
// its own thread and has no animation frames; the copied engine is excluded.)
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|js|jsx|mjs)$/.test(n) ? [p] : [];
});

test('requestAnimationFrame appears only in clock/frame.ts', () => {
  const bad: string[] = [];
  for (const f of walk('src')) {
    if (f.startsWith(join('src', 'engine', 'hales')) || f.startsWith(join('src', 'engine', 'host'))) continue;
    if (f === join('src', 'clock', 'frame.ts')) continue;
    const text = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (/requestAnimationFrame|cancelAnimationFrame/.test(text)) bad.push(f);
  }
  assert.deepEqual(bad, [], 'draw through the clock: clock.hold / clock.invalidate / Tweened');
});

test('R3F canvases never run their own loop', () => {
  const bad: string[] = [];
  for (const f of walk('src').filter((p) => p.endsWith('.tsx'))) {
    const text = readFileSync(f, 'utf8');
    if (/<Canvas\b/.test(text) && !/frameloop="never"/.test(text)) bad.push(f);
  }
  assert.deepEqual(bad, [], '<Canvas frameloop="never"> and <ClockBridge/> inside it');
});
