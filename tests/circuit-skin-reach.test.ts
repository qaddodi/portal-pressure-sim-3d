// The Circuit's junction skins stand on the map while their tubes fly (Mohammad, 21 Nov, iPhone, twice: pieces at the top of the Circuit "flying off upwards" on the way back to the Anatomy).
// A skin cannot travel, so it may show only while its tube is within a hair of its map place. The window used to be a third of the journey (SKIN_CIRC_IN 0.65), and the journeys on an upright map
// reach five scene units (the iliac and heart-row ends cross the whole figure): a skin hung 1.6 units behind its tube. This pins the gap for every vessel end, wide and upright, and the gate that draws them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COURSES, N_TRACK } from '../src/scene/circuit/course.ts';
import { turnScenePt } from '../src/scene/circuit/map.ts';
import { circSkinsOn, peelAt } from '../src/scene/circuit/peel.ts';
import { SKIN_CIRC_IN } from '../src/scene/vessels/skin/types.ts';

/** The farthest any course sample travels between the body and the map (scene units), for a turn. */
function longestJourney(rr: number): { id: string; d: number } {
  let best = { id: '', d: 0 };
  const q: [number, number] = [0, 0];
  for (const [id, g] of COURSES) for (let i = 0; i < N_TRACK; i++) {
    turnScenePt(g.C[i]!.x, g.C[i]!.y, rr, q);
    const d = Math.hypot(q[0] - g.A[i]!.x, q[1] - g.A[i]!.y);
    if (d > best.d) best = { id, d };
  }
  return best;
}

test('a skin shows only while its tube is within a tenth of a scene unit of the map place, wide and upright', () => {
  for (const rr of [0, 1]) {
    const far = longestJourney(rr);
    const gap = (1 - SKIN_CIRC_IN) * far.d;
    assert.ok(gap < 0.12, `rr ${rr}: a skin starts to show with ${far.id} ${gap.toFixed(2)} units from the map place`);
    assert.ok(far.d > 3, 'the journeys are long (the premise of the window): a window of a share of them is a gap of units');
  }
});

test('the gate draws a skin exactly while any skin has colour: never hidden with alpha, never drawn with none', () => {
  for (let i = 0; i <= 2000; i++) {
    const t = i / 2000;
    let any = false;
    for (let r = 0; r <= 1.0001; r += 0.01) if (peelAt(t, Math.min(1, r)) > SKIN_CIRC_IN) any = true;
    assert.equal(circSkinsOn(t, SKIN_CIRC_IN), any, `t ${t}`);
  }
  assert.equal(circSkinsOn(0.5, SKIN_CIRC_IN), false);
  assert.equal(circSkinsOn(1, SKIN_CIRC_IN), true);
});
