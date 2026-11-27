// A-D11 / owner W19 (27 Nov): on a portrait phone the lobule's Zone 2 name gives way to the tract's names, never the other way round.
// Held on the real frames of every screen the lobule is judged on (tests/lobule-frame.ts), with and without the Zones layer, the hint pill up or not:
//  - on a portrait phone no station (portal venule, sinusoids, central vein, arteriole, ductule, lymph) is left out while room exists for it that Zone 2 would have taken: every station the same frame places without
//    any zone names is placed with them (Zone 2 may be the one left out);
//  - Zone 2 ranks under every station there; on every other screen it ranks as the other zones do.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLobule } from '../src/scene/lobule/geometry.ts';
import { buildLobuleCaptions, zoneRank } from '../src/scene/lobule/captions.ts';
import { solve } from '../src/scene/labels/solver.ts';
import { SIZES, frame } from './lobule-frame.ts';

const net = buildLobule();
const measure = (t: string) => t.length * 6.8;
function run(s: (typeof SIZES)[number], pill: boolean, zones: boolean) {
  const f = frame(s), blockers = pill ? f.blockers : [];
  const inView = (x: number, y: number) => x > f.view.x0 + 64 && x < f.view.x1 - 64 && y > f.view.y0 + 64 && y < f.view.y1 - 64 && !blockers.some((b) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1);
  const c = buildLobuleCaptions({ proj: f.proj, vp: { w: s.w, h: s.h }, measure, net, layers: { zones, lymph: true }, inView });
  return { c, out: solve({ items: c.items, view: f.view, blockers, lines: c.lines, keep: c.keep }) };
}
const STATIONS = ['triad', 'sin', 'cv', 'ha', 'bd', 'lymph'];

test('Zone 2 ranks under every station on a portrait phone, as the other zones do elsewhere', () => {
  for (const s of SIZES) {
    const portrait = s.w <= 430 && s.h > s.w, { c } = run(s, false, true);
    const z2 = c.items.find((i) => i.id === 'z:2')!, z1 = c.items.find((i) => i.id === 'z:1')!;
    assert.equal(z1.pri, 95, `${s.name}: Zone 1 keeps its rank`);
    assert.equal(zoneRank(2, { w: s.w, h: s.h }), z2.pri);
    if (portrait) for (const k of STATIONS) assert.ok(z2.pri < c.items.find((i) => i.id === k)!.pri, `${s.name}: Zone 2 ranks under ${k}`);
    else assert.equal(z2.pri, 95, `${s.name}: Zone 2 ranks with the others`);
  }
});

for (const s of SIZES.filter((x) => x.w <= 430 && x.h > x.w)) for (const pill of [true, false]) {
  test(`${s.name}${pill ? ', hint pill up' : ''}: with the Zones layer every station the figure places without zone names is still placed`, () => {
    const bare = new Set(run(s, pill, false).out.placed.map((p) => p.id)), withZones = new Set(run(s, pill, true).out.placed.map((p) => p.id));
    const lost = STATIONS.filter((k) => bare.has(k) && !withZones.has(k));
    assert.deepEqual(lost, [], `stations the zone names took the room of (placed with zones: ${[...withZones]})`);
  });
}
