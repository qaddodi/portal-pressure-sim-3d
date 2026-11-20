import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { UI } from '../src/ui/strings.generated.ts';
import { LENS_WORDS } from '../src/scene/lenses/words.copied.ts';
import { unescapeSource } from '../scripts/gen-ui-strings.mjs';

// What a person must never read in a string: a source escape (a backslash-u), an HTML entity, a doubled backslash.
const BAD = /\\u[0-9a-fA-F]{4}|\\x[0-9a-fA-F]{2}|\\[nt'"]|&(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z]{2,8});/;

function strings(o: unknown, path = '', out: [string, string][] = []): [string, string][] {
  if (typeof o === 'string') out.push([path, o]);
  else if (Array.isArray(o)) o.forEach((v, i) => strings(v, `${path}[${i}]`, out));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) strings(v, `${path}.${k}`, out);
  return out;
}

test('no interface word (UI strings, the lens words) carries a source escape or an HTML entity: the colour menu once said "vessel\\u2019s"', () => {
  const bad = [...strings(UI, 'UI'), ...strings(LENS_WORDS, 'LENS_WORDS')].filter(([, s]) => BAD.test(s)).map(([p, s]) => `${p}: ${s.slice(0, 60)}`);
  assert.deepEqual(bad, []);
});

test('the Velocity and Blood origin descriptions read with their real apostrophe', () => {
  const lens = (id: string) => (UI.lenses as readonly { id: string; note?: string; hint?: string }[]).find((l) => l.id === id);
  assert.match(lens('velocity')!.note ?? '', /each vessel’s own normal/);
  assert.match(lens('origin')!.note ?? '', /each vessel’s blood comes from/);
});

test('the generator turns a source escape into its character, whatever the string', () => {
  assert.equal(unescapeSource('vessel\\u2019s'), 'vessel’s');
  assert.equal(unescapeSource({ a: ['x\\u00e9\\n', 'it\\\'s'] }).a[0], 'xé\n');
  assert.equal(unescapeSource('plain'), 'plain');
  assert.equal(unescapeSource(7), 7);
});

test('no generated or copied data file holds a doubled-backslash escape (the same bug in another table)', () => {
  const files: string[] = [];
  const walk = (d: URL) => { for (const n of readdirSync(d)) { const u = new URL(n, d); if (statSync(u).isDirectory()) walk(new URL(n + '/', d)); else if (/\.(generated|copied)\.ts$/.test(n)) files.push(u.pathname); } };
  walk(new URL('../src/', import.meta.url));
  const bad = files.filter((f) => /\\\\u[0-9a-fA-F]{4}/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(bad, []);
});
