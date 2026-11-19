// The wall's pure model against the 2D formulas (instruments.js createVarixWall, engine varix, wall-read.js): Laplace's σ = ΔP · r / w, the index worked out from the shown ΔP, r and w, the share over the
// tear point (150), the four meter states at 40 / 70 / 100 %, and a slide's pinned stress easing into the last. Node only: no browser, no drawing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { wallIndex, wallRead, wallShare } from '../src/engine/hales/portal/wall-read.js';
import { VARIX } from '../src/engine/hales/portal/engine.js';
import { pinWall, wallReadings, wallState } from '../src/ui/tests/endo/wall.ts';
import { instrumentOf, planOf } from '../src/ui/talk/instruments.ts';
import { toolEvidence } from '../src/ui/talk/tool-landed.ts';

const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

test('the index is Laplace\'s ΔP · r / w from the numbers the tiles show, so the tiles multiply out', () => {
  for (const [ptm, r, w] of [[17, 3.2, 0.45], [17.3, 3.1, 0.4], [4.04, 1.0, 1.0], [30, 6, 0.12], [-3, 2, 0.5], [12.26, 2.234, 0.3331]] as const) {
    const p = round(Math.max(0, ptm), 1), rr = round(r, 2), ww = round(w, 3);
    const want = Math.round(ww > 0 ? (p * rr) / ww : 0);
    assert.equal(wallIndex(ptm, r, w), want, `index of ${ptm}, ${r}, ${w}`);
    const t = wallRead({ ptm, r, w });
    assert.equal(t.index, String(want));
    assert.equal(t.ptm, p.toFixed(1)); assert.equal(t.r, rr.toFixed(2)); assert.equal(t.w, ww.toFixed(3));
    assert.equal(Math.round((+t.ptm * +t.r) / +t.w), +t.index, 'multiplying the tiles gives the index shown');
  }
  assert.equal(wallIndex(10, 2, 0), 0, 'no wall, no index (not infinity)');
});

test('the share is the stress index over the tear point, and the two-breath mean is what every screen prints', () => {
  assert.equal(VARIX.Tcrit, 150);
  const v = { ptm: 17, r: 3.2, w: 0.45, ratio: 0.8, ratioShown: wallIndex(17, 3.2, 0.45) / VARIX.Tcrit };
  assert.equal(wallShare(v), v.ratioShown, 'no mean yet: the shown ratio');
  assert.equal(wallShare({ ...v, ratioMean: 0.5 }), 0.5, 'the mean wins');
  assert.equal(wallShare({ ...v, ratioMean: NaN }), v.ratioShown);
});

test('the meter has four states at 40, 70 and 100 % of the tear point, as 2D wallState', () => {
  assert.deepEqual([0, 0.4, 0.41, 0.7, 0.71, 1, 1.01].map(wallState), ['ok', 'ok', 'caution', 'caution', 'danger', 'danger', 'critical']);
  const two = '/home/claude/two-d-pin/src/ui/instruments.js';
  if (existsSync(two)) assert.ok(readFileSync(two, 'utf8').includes("const wallState = (r) => (r > 1 ? 'critical' : r > 0.7 ? 'danger' : r > 0.4 ? 'caution' : 'ok');"), '2D keeps the same rule');
});

test('the readings print as 2D does: the sentence from the model, the big number and word from the slide\'s pin, the bar from the model', () => {
  const v = { r: 3.2, w: 0.45, ptm: 17, ratio: 0.8, ratioMean: 0.8, ratioShown: 0.8 };
  const live = wallReadings(v);
  assert.equal(live.pct, '80'); assert.equal(live.state, 'danger'); assert.equal(live.word, 'Near rupture threshold');
  const pinned = wallReadings(v, 0.3);
  assert.equal(pinned.pct, '30'); assert.equal(pinned.state, 'ok'); assert.equal(pinned.word, 'Low');
  assert.equal(pinned.stress, live.stress, 'the sentence keeps the model\'s own share');
  assert.equal(pinned.barState, 'danger', 'so does the meter bar');
  assert.equal(pinned.fill, live.fill);
  assert.equal(wallReadings({ ...v, ratioMean: 1.5 }).fill, '0% 0px', 'the bar is full past the tear point');
  assert.equal(wallReadings({ ...v, ratioMean: 0 }).fill, '-100% 0px');
});

test('a slide\'s pinned stress eases into the last one inside a second (35% of the way), and starts from itself otherwise', () => {
  let p = pinWall({ v: NaN, t: 0 }, 0.5, 1000);
  assert.equal(p.v, 0.5);
  p = pinWall(p, 1.0, 1500);
  assert.ok(Math.abs(p.v - (0.5 + 0.5 * 0.35)) < 1e-12);
  p = pinWall(p, 1.0, 3000);
  assert.equal(p.v, 1.0, 'after a second it takes the new one whole');
  assert.ok(Number.isNaN(pinWall(p, undefined, 3100).v), 'nothing pinned: the model\'s own');
  assert.ok(Number.isNaN(pinWall(p, null, 3100).v));
});

test('the wall slides open the scope pane\'s wall view and are carried by the pane that draws it', () => {
  assert.equal(planOf('wall', {}).view, 'wall');
  const e = instrumentOf('wall')!;
  assert.equal(e.status, 'plays'); assert.equal(e.gap, undefined);
  assert.equal(toolEvidence('wall'), 'src/ui/tests/endo/WallView.tsx');
  const view = readFileSync(new URL('../src/ui/tests/endo/WallView.tsx', import.meta.url), 'utf8');
  assert.match(view, /<Chart tag="endo-wall"/, 'drawn on the shared chart drawer');
  assert.doesNotMatch(view, /getContext|requestAnimationFrame|<canvas/);
});
