import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { LINE, linesOf } from '../src/ui/charts/flowtime/model.ts';

// Encephalopathy 8 (captures bbe955e5 and 572259fd on every device): "no card is up yet". Root cause: the line that added `iap` to LINE ended in a `//` comment that swallowed the `he:` entry written after it, so the
// flow-time chart of "Closing the shunt raises the portal pressure again" (lines ppg and he) threw while it was built, and CardBoundary took both cards of the slide away with it.
const walk = (d: URL): string[] => readdirSync(d).flatMap((n) => { const u = new URL(`${n}${statSync(new URL(n, d)).isDirectory() ? '/' : ''}`, d); return statSync(u).isDirectory() ? walk(u) : [u.pathname]; });

test('every line a deck\'s flow-time chart plots is a line the chart knows', () => {
  const missing: string[] = [];
  for (const f of walk(new URL('../src/decks/', import.meta.url)).filter((p) => /\.ts$/.test(p))) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/"kind":\s*"(?:flowtime|evgraph)",[^{}]*?"lines":\s*\[([^\]]*)\]/g)) {
      for (const k of m[1]!.match(/"([^"]+)"/g) ?? []) if (!(k.slice(1, -1) in LINE)) missing.push(`${f.split('/src/')[1]}: ${k}`);
    }
  }
  assert.deepEqual(missing, []);
});
test('the encephalopathy risk line is there, drawn on the upper axis after the PPG', () => {
  assert.ok('he' in LINE && 'iap' in LINE);
  const rows = linesOf(['ppg', 'he']);
  assert.equal(rows[0]![4], 'PPG');
  assert.equal(rows[1]![4], 'Model HE index');
});
test('no entry of LINE is written after a // on its line', () => {
  const src = readFileSync(new URL('../src/ui/charts/flowtime/model.ts', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('export const LINE'), src.indexOf('\n}\n', src.indexOf('export const LINE')));
  for (const l of block.split('\n')) assert.ok(!/\/\/.*\b\w+: \[/.test(l), `a line entry sits inside a comment: ${l.slice(0, 80)}`);
});
