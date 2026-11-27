// G6 (Plan 39, Audit 5 finding 5): nothing in the figure switches in one frame. A uniform, opacity or alpha written in src/scene as `cond ? 1 : 0` needs an entry in tests/snap-allow.json
// naming what ramps it (its list only goes down), and no uniform may be shared by both sides of a crossfaded pair: the tail of a lens (the colour held to 55 % along, then eased
// into the junction) is written into each side's own gradient texture (lenses/model.ts TAIL_ON), never a shared `lensTail`. Source-reading, node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const allow = (JSON.parse(readFileSync(new URL('./snap-allow.json', import.meta.url), 'utf8')) as { entries: Record<string, string> }).entries;
const walk = (d: string, out: string[] = []): string[] => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); e.isDirectory() ? walk(p, out) : p.endsWith('.ts') && out.push(p); } return out; };
const files = walk('src/scene').filter((f) => !f.endsWith('debug-view.ts'));
const TERN = /(?:uniforms\.)?(\w+)!?\.(?:value|opacity|alpha)\s*=\s*[^;=]*\?\s*[0-9.]+\s*:\s*[0-9.]+/g;

test('a ternary uniform, opacity or alpha write in src/scene has a named driver (tests/snap-allow.json)', () => {
  const found = new Set<string>();
  for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(TERN)) found.add(`${f.replace('src/scene/', '')} | ${m[1]}`);
  const fresh = [...found].filter((k) => !(k in allow)).sort();
  assert.deepEqual(fresh, [], 'switches in one frame: ease it (src/clock/ease.ts) or list it in tests/snap-allow.json with its driver');
  const stale = Object.keys(allow).filter((k) => !found.has(k));
  assert.deepEqual(stale, [], 'no longer written as a ternary: delete from tests/snap-allow.json');
});

test('no uniform is shared by both sides of a lens crossfade: the tail is each texture\'s own', () => {
  for (const f of files) assert.doesNotMatch(readFileSync(f, 'utf8'), /\blensTail\b/, `${f}: lensTail was one flag for both sides, so a switch moved the outgoing lens's gradient`);
  const model = readFileSync('src/scene/lenses/model.ts', 'utf8');
  assert.match(model, /export const TAIL_ON = 2/);
  assert.match(model, /TAIL_LENSES\.has\(lens\)\) \{ if \(G\[g0 \+ 3\]! > 0\) G\[g0 \+ 3\] = TAIL_ON/);
  for (const f of ['src/scene/vessels/glsl-shared.ts']) assert.match(readFileSync(f, 'utf8'), /float t = g1\.a > 1\.5 \? smoothstep\(0\.55, 1\.0, u\) : u;/, f);
});
