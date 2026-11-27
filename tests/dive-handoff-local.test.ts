// The Lobule <-> Sinusoid handoff is local and longer (owner, 27 Nov 2026: "every zoom out should feel like one continuous zoom"): every dive takes one length from a slide and from the
// view button, each part of the sinusoid arrives by its own size on screen (big parts first, a pure function of the camera's distance), and the lobule never stands aside ahead of the
// sinusoid's plates.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diveMs, viewMoveMs, type DiveView } from '../src/scene/camera/dive.ts';
import { ARRIVAL, ARRIVAL_ORDER, HANDOFF, STAND_ASIDE_FROM, TIER_OF, arrival, plateArrival, standAside, tierOf } from '../src/scene/micro3d/sinusoid-arrival.ts';
import { FOCUS, focusBlur } from '../src/scene/micro3d/sinusoid3d.ts';
import { LOBULE_UNDER_FROM } from '../src/scene/parts/shared.ts';
import { DOF_DIVE_PEAK, DOF_PASS_PEAK } from '../src/scene/post-dof.ts';

const VIEWS: DiveView[] = ['body', 'circuit', 'lobule', 'sinusoid'];

test('a dive takes the same time from a deck slide as from the view button, whatever the circuit says', () => {
  for (const a of VIEWS) for (const b of VIEWS) {
    const dm = diveMs(a, b);
    if (dm == null || b === 'body' || b === 'circuit') continue;
    assert.equal(viewMoveMs(a, b, 700), dm, `${a} -> ${b}`);
  }
  assert.equal(viewMoveMs('lobule', 'sinusoid', 0), 1800);
  assert.equal(viewMoveMs('body', 'sinusoid', 0), 3300);
  assert.equal(viewMoveMs('sinusoid', 'body', 0), 3300);
  const api = readFileSync(new URL('../src/scene/api.ts', import.meta.url), 'utf8');
  assert.match(api, /const ms = viewMoveMs\(from, v, cel\.circuit\.changeMs\(\)\);/, 'the view button');
  assert.match(api, /viewMoveMs\(from, v, cel\.circuit\.changeMs\(\)\) \?\?/, 'the deck slide');
});

test('each part of the sinusoid arrives by its size: nothing before the band, whole by landing, never back, big parts first', () => {
  assert.deepEqual([...HANDOFF], [0.25, 0.85]);
  assert.equal(FOCUS[1], HANDOFF[0]); assert.equal(FOCUS[2], HANDOFF[1]);
  for (const t of ARRIVAL_ORDER) {
    const [a, b] = ARRIVAL[t];
    assert.ok(a >= HANDOFF[0] && b <= HANDOFF[1] && a < b, t);
    assert.equal(arrival(t, null), 1, 'at rest whole');
    assert.equal(arrival(t, 0), 0); assert.equal(arrival(t, HANDOFF[0]), 0, `${t}: nothing before the band`);
    assert.equal(arrival(t, HANDOFF[1]), 1); assert.equal(arrival(t, 1), 1, `${t}: whole by landing`);
    let prev = 0;
    for (let i = 0; i <= 1000; i++) { const v = arrival(t, i / 1000); assert.ok(v >= prev - 1e-12, `${t}: monotone in the camera's closeness (zooming out runs it back)`); prev = v; }
  }
  for (let i = 1; i < ARRIVAL_ORDER.length; i++) {
    const p = ARRIVAL[ARRIVAL_ORDER[i - 1]!], q = ARRIVAL[ARRIVAL_ORDER[i]!];
    assert.ok(q[0] >= p[0] && q[1] >= p[1], `${ARRIVAL_ORDER[i]} is not ahead of ${ARRIVAL_ORDER[i - 1]}`);
    for (let k = 0; k <= 1000; k++) { const d = k / 1000; assert.ok(arrival(ARRIVAL_ORDER[i]!, d) <= arrival(ARRIVAL_ORDER[i - 1]!, d) + 1e-12, `at ${d}`); }
  }
  for (const n of ['lumen', 'hepatocytes', 'ground']) assert.equal(tierOf(n), 'plates');
  assert.equal(tierOf('disse'), 'lining'); assert.equal(tierOf('endothelium'), 'lining');
  assert.equal(tierOf('kupffer'), 'fine'); assert.equal(tierOf('stellate'), 'fine');
  assert.equal(tierOf('red-cells'), 'cells'); assert.equal(tierOf('albumin'), 'albumin');
  for (const k of Object.keys(TIER_OF)) assert.ok(ARRIVAL_ORDER.includes(TIER_OF[k]!), k);
});

test('the lobule never stands aside ahead of the sinusoid\'s plates: no share where neither is whole', () => {
  assert.equal(LOBULE_UNDER_FROM, STAND_ASIDE_FROM);
  assert.ok(STAND_ASIDE_FROM >= ARRIVAL.plates[1], 'it starts where the plates are whole');
  for (let i = 0; i <= 2000; i++) {
    const d = i / 2000, lobule = 1 - standAside(d), plates = plateArrival(d);
    assert.ok(plates >= 1 - 1e-12 || lobule >= 1 - 1e-12, `at ${d}: plates ${plates}, lobule ${lobule}`);
  }
  assert.equal(standAside(1), 1, 'nothing of the lobule shows through the landed sinusoid');
  assert.equal(standAside(null), 1);
});

test('the blur is lighter and the handoff is smooth through it', () => {
  // (lighter than before the zoom plan, 27 Nov: the pass-through's 0.7 and the focus pull's 0.4; the plain dive's peak is kept, and the pass-through stays clearly over it)
  assert.ok(DOF_PASS_PEAK < 0.7 && DOF_PASS_PEAK > DOF_DIVE_PEAK * 1.5);
  const mid = focusBlur((FOCUS[1] + FOCUS[2]) / 2);
  assert.ok(mid < 0.4 && mid <= DOF_DIVE_PEAK + 1e-12);
});
