// THE RULE (28 Nov 2026): the app reads the engine's junction table as typed rows (topology.js JUNCTION_ROWS: { node, host, at, label, short, ends, clotOn }, declared in junctions.d.ts), never as positional tuples.
// The root cause it pins: the table was first read as tuples ([node, host, at, label, ends]), so every reader cast it (`as unknown as [string, string, number][]`), indexed it by position (`row[0]`, `r[4]`) and re-parsed it
// by hand, and a field added to a row (`short`, `clotOn`) shifted or hid behind those casts without a type error. The engine's tuple view JUNCTIONS is gone; no code in the app (source, tests, scripts)
// names it, comments aside, and the engine does not export it. A reader that wants a row asks for the field by its name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const walk = (dir: string): string[] => readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => {
  const p = `${dir}/${e.name}`;
  return e.isDirectory() ? (e.name === 'node_modules' || p === 'src/engine' ? [] : walk(p)) : /\.(ts|tsx|js|mjs)$/.test(e.name) ? [p] : [];
});
/** Code only: block comments and `//` comments (not a `//` that follows a colon, a URL) taken out. */
const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

test('no app file names the tuple view JUNCTIONS: every reader of the junction table reads the typed rows (JUNCTION_ROWS)', () => {
  const self = 'tests/junction-rows.test.ts';
  const offenders = [...walk('src'), ...walk('tests'), ...walk('scripts')].filter((f) => f !== self && /\bJUNCTIONS\b/.test(code(readFileSync(join(root, f), 'utf8'))));
  assert.deepEqual(offenders, [], 'these files read the retired tuple view; read JUNCTION_ROWS (rows are objects: node, host, at, label, short, ends, clotOn)');
});

test('the engine exports the rows and no tuple view; every row is an object with its named fields', async () => {
  const topology = await import('../src/engine/hales/portal/topology.js') as Record<string, unknown>;
  assert.ok(!('JUNCTIONS' in topology), 'the engine no longer exports the tuple view');
  const rows = topology.JUNCTION_ROWS as readonly Record<string, unknown>[];
  assert.ok(rows.length > 0);
  for (const r of rows) {
    assert.ok(!Array.isArray(r), 'a row is an object, not a tuple');
    for (const k of ['node', 'host', 'at', 'label', 'short', 'ends', 'clotOn']) assert.ok(k in r, `row ${String(r.node)} has ${k}`);
  }
});
