// The Circuit's sinusoid lanes (SIN_RR, SIN_LL) drew streaky dark specks along their length (Mohammad, 24 Nov, iPhone, Healthy, Circuit). ROOT CAUSE: a vessel built of a trunk and strands carries every strand on the one map
// course, so the map drew five more tubes along the trunk's line, each with its own ring spacing; with the strands' map radius share (`rkc`) at 0 the lane draws clean (headless A/B, same frame). The map draws a vessel as ONE
// tube: where the trunk is drawn, no strand has a map radius. Pinned for every vessel with a map course, at the build and after a rebuild at a new shape (the tubes are rebuilt by shape-track.ts, which lays the same rule).
// Node only. Run: node --test tests/circuit-strands-on-map.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK } from '../src/scene/vessels/network.ts';
import { REST, coursesOf, tubularOf } from '../src/scene/vessels/shape.ts';
import { buildTubes } from '../src/scene/vessels/tubes.ts';
import { COURSES } from '../src/scene/circuit/course.ts';
import { slicesFor } from '../src/scene/circuit/geometry.ts';
import { sewOnMap } from '../src/scene/circuit/map-sewn.ts';

test('on the map a vessel whose trunk is drawn has no strand drawn along it (every vessel with a map course; the sinusoid lanes among them)', () => {
  let lanes = 0, checked = 0;
  for (const def of NETWORK) {
    if (!def.plan || !COURSES.has(def.id)) continue;
    const b = buildTubes(coursesOf(def, REST), tubularOf(def, slicesFor(def.id)), def.radius);
    sewOnMap(def.id, b.geometry, b.runs);
    if (b.runs.length < 2) continue;
    const rkc = b.geometry.getAttribute('rkc'), trunkOpen = rkc.getX(b.runs[0]!.tubeStart) > 0;
    if (!trunkOpen) continue;
    checked++;
    for (let r = 1; r < b.runs.length; r++) {
      const run = b.runs[r]!;
      let drawn = 0;
      for (let v = run.tubeStart; v < run.tubeStart + run.tubeCount + 2 * run.capCount; v++) if (rkc.getX(v) > 0) drawn++;
      assert.equal(drawn, 0, `${def.id}: strand ${r} has ${drawn} vertices with a map radius, a second tube along the trunk's lane`);
    }
    if (def.id === 'SIN_RR' || def.id === 'SIN_LL') lanes++;
  }
  assert.equal(lanes, 2, 'both sinusoid lanes are checked');
  assert.ok(checked >= 2, 'at least the lanes are checked');
});

// ROOT CAUSE of the ragged dark seam down the sinusoid lane and the trunk to the central vein (Mohammad, 25 Nov, iPhone, Circuit; the 24ba3f05 fix zeroed the strands' map share `rkc` but they still drew): the vertex stage threw a
// tube of no radius off the screen only when the BODY's share `rk` was 0, not the share of the view being drawn. A strand with rkc 0 and rk > 0 was collapsed to a line but still drew its crossing shadow hull, whose width (shadowPx)
// does not depend on the lumen: five dark hairline tubes along the trunk's axis (hiding the lane's shadow mesh in a headless run removed the seam). The rule: the discard reads the radius share of the view (rkE = mix(rk, rkc, circShare)).
import { VESSEL_VS } from '../src/scene/vessels/shaders.ts';
test('the vertex stage drops a tube whose radius share IN THIS VIEW is 0 (rkE), not only the body\'s (rk): a strand folded on the map draws nothing, not even its shadow hull', () => {
  assert.match(VESSEL_VS, /float rkE = mix\(rk, rkc, circShare\)/, 'rkE is the view\'s own radius share');
  assert.match(VESSEL_VS, /if \(rkE <= 0\.0\) gl_Position = vec4\(2\.0, 2\.0, 2\.0, 1\.0\)/, 'a tube with no radius in this view is sent off the screen');
  assert.doesNotMatch(VESSEL_VS, /if \(rk <= 0\.0\)/, 'the body\'s share alone must not decide it');
});

test('every vessel the map folds has strand vertices with rk > 0 and rkc 0 (the case the discard must catch), the sinusoid lanes among them', () => {
  const folded = new Set<string>();
  for (const def of NETWORK) {
    if (!def.plan || !COURSES.has(def.id)) continue;
    const b = buildTubes(coursesOf(def, REST), tubularOf(def, slicesFor(def.id)), def.radius);
    sewOnMap(def.id, b.geometry, b.runs);
    if (b.runs.length < 2) continue;
    const rk = b.geometry.getAttribute('rk'), rkc = b.geometry.getAttribute('rkc'), run = b.runs[1]!;
    if (rkc.getX(run.tubeStart) === 0 && rk.getX(run.tubeStart) > 0) folded.add(def.id);
  }
  assert.ok(folded.has('SIN_RR') && folded.has('SIN_LL'), `folded: ${[...folded].join(',')}`);
});
