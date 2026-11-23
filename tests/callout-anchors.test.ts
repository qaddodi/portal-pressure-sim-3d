// Where a slide's lobule callout stands (Mohammad, 23 Nov: "the location should be around sinusoids, that's where resistance is. Not some random area to the right").
// Root cause: figure-calls.ts named three fixed places ('triad:0' = the tract at angle 0, 'zone:2' = a point on a hepatocyte plate 9 to 12 lumens off the nearest sinusoid, 'centre' = the central vein), none
// of them the place the slide's camera frames. Now the places are resolved on the net's own vessels, on the side the shots frame (scene/lobule/callout-spot.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLobule } from '../src/scene/lobule/geometry.ts';
import { BAND, SINUSOID_RING_R, calloutSpot, framedTriad, isCalloutName, type CalloutName } from '../src/scene/lobule/callout-spot.ts';
import { stationAt } from '../src/scene/lobule/captions.ts';
import { sinRadius, DISC_R } from '../src/scene/lobule/widths.ts';
import { LOBULE_CAMS, LOBULE_R, lobuleShot, lobuleToScene, type LobuleCam } from '../src/scene/lobule/shots.ts';
import { LOBULE_SCALE, lobuleWorld } from '../src/scene/lobule/frames.ts';
import { figurePlan } from '../src/ui/deck/figure-plan.ts';
import { figureCalls } from '../src/ui/deck/figure-calls.ts';
import { RW_LOADERS } from '../src/decks/rw/copied/index.ts';
import { AG_IDS, loadAgDeck } from '../src/decks/ag/index.ts';
import { HP_IDS, loadHpDeck } from '../src/decks/hp/index.ts';

const net = buildLobule(7);
/** The congested central vein's widest drawn radius (view.ts cvRadiusNow at congU 1, no fibrosis). */
const CV_MAX = DISC_R.cv + 0.05;

type Slide = Parameters<typeof figurePlan>[0];
const slides = async () => {
  const decks: { id: string; slides?: readonly unknown[] }[] = [...(await Promise.all(Object.values(RW_LOADERS).map((l) => l()))), ...(await Promise.all(AG_IDS.map((id) => loadAgDeck(id)))), ...(await Promise.all(HP_IDS.map((id) => loadHpDeck(id))))];
  return decks.flatMap((d) => ((d.slides ?? []) as Slide[]).filter((s) => s.callout).map((s) => ({ deck: d.id, slide: s })));
};

test('the framed tract is the triad nearest the corner at angle pi, whatever it is numbered', () => {
  const near = net.triads.map((t) => ({ i: t.i, d: Math.hypot(t.x + 1, t.y) })).sort((a, b) => a.d - b.d)[0]!;
  assert.equal(framedTriad(net.triads), near.i);
  assert.ok(near.d < 1e-9, 'the corner the lobule shots frame');
  // renumbered triads: the answer follows the geometry
  assert.equal(framedTriad([...net.triads].reverse()), net.triads.length - 1 - near.i);
});

test('the tract place is the framed tract\'s centre', () => {
  const t = net.triads[framedTriad(net.triads)]!, s = calloutSpot(net, 'tract');
  assert.ok(Math.hypot(s.x - t.x, s.y - t.y) < 1e-6);
});

test('a sinusoid place is a sample of a real sinusoid course, inside its zone band, with a ring that clears the central vein and the station name', () => {
  for (const name of ['sinusoid:mid', 'sinusoid:zone3'] as const) {
    const s = calloutSpot(net, name), c = net.courses.find((k) => k.id === s.course)!;
    assert.ok(c && (c.kind === 's0' || c.kind === 's1' || c.kind === 's2'), `${name} stands on a sinusoid course`);
    let nearest = Infinity, rho = 0;
    c.pts.forEach(([x, y], i) => { const d = Math.hypot(x - s.x, y - s.y); if (d < nearest) { nearest = d; rho = c.rho[i]!; } });
    assert.ok(nearest < 0.25 * sinRadius(c.kind as 's0' | 's1' | 's2', rho), `${name} is on the sinusoid's axis (${nearest.toExponential(2)} from it)`);
    const band = name === 'sinusoid:mid' ? { lo: 0.4, hi: 0.6 } : { lo: 0.15, hi: 0.3 };
    assert.ok(rho >= band.lo && rho <= band.hi, `${name} rho ${rho.toFixed(3)} is in its zone`);
    assert.ok(Math.abs(rho - (name === 'sinusoid:mid' ? BAND.mid.rho : BAND.zone3.rho)) <= 0.02 + 1e-9);
    assert.equal(s.r, SINUSOID_RING_R);
    assert.ok(Math.hypot(s.x, s.y) - s.r >= CV_MAX + 0.04, `${name}'s ring stays clear of the central vein even when congested`);
  }
  const mid = calloutSpot(net, 'sinusoid:mid'), st = stationAt(net, framedTriad(net.triads), 'sin');
  assert.ok(Math.hypot(mid.x - st[0], mid.y - st[1]) >= 3 * SINUSOID_RING_R - 1e-9, 'the ring and the "Sinusoids" station never share a place');
});

test('every slide\'s callout resolves to a named place, and the place is inside its slide\'s camera frame (landscape and portrait)', async () => {
  let n = 0; const outsideLobule: string[] = [];
  for (const { deck, slide } of await slides()) {
    const call = figureCalls(figurePlan(slide)).cards.find((c) => c.id === 'callout');
    assert.ok(call && 'lobule' in call.anchor, `${deck}/${slide.id}: the callout is drawn`);
    const name = call.anchor.lobule;
    assert.ok(isCalloutName(name), `${deck}/${slide.id}: "${name}" is a named place`);
    const cam = slide.cam as string;
    if (!(LOBULE_CAMS as readonly string[]).includes(cam) || cam === 'sinusoid') { outsideLobule.push(`${deck}/${slide.id} (cam ${cam})`); continue; }   // (the separate sinusoid view draws no lobule plate: LabelLayer stands lobule callouts only while the lobule is the figure)
    const shot = lobuleShot(cam as LobuleCam), s = calloutSpot(net, name as CalloutName);
    const w = lobuleWorld(lobuleToScene(s.x, s.y)), rw = s.r * LOBULE_R * LOBULE_SCALE;
    for (const half of [shot.half, shot.halfNarrow!]) {
      assert.ok(Math.abs(w[0] - shot.target[0]) + rw <= half[0] + 1e-12, `${deck}/${slide.id} (${cam}): ${name} is inside the frame across`);
      assert.ok(Math.abs(w[1] - shot.target[1]) + rw <= half[1] + 1e-12, `${deck}/${slide.id} (${cam}): ${name} is inside the frame up and down`);
    }
    n++;
  }
  assert.ok(n >= 12, `the lobule's callouts were judged (${n})`);
  // the one callout whose slide frames the sinusoid view (hp lobule/cirr) is listed, not given a ring of its own here
  assert.deepEqual(outsideLobule, ['lobule/cirr (cam sinusoid)']);
});
