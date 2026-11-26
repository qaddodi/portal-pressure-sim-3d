// Where a slide's lobule callout stands (Mohammad, 23 Nov: "the location should be around sinusoids, that's where resistance is. Not some random area to the right").
// Root cause: figure-calls.ts named three fixed places ('triad:0' = the tract at angle 0, 'zone:2' = a point on a hepatocyte plate 9 to 12 lumens off the nearest sinusoid, 'centre' = the central vein), none
// of them the place the slide's camera frames. Now the places are resolved on the net's own vessels, on the side the shots frame (scene/lobule/callout-spot.ts).
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { buildLobule } from '../src/scene/lobule/geometry.ts';
import { BAND, CV_RING_AIR, CV_RING_R, SINUSOID_RING_R, calloutSpot, framedTriad, isCalloutName, type CalloutName } from '../src/scene/lobule/callout-spot.ts';
import { stationAt } from '../src/scene/lobule/captions.ts';
import { sinRadius, DISC_R } from '../src/scene/lobule/widths.ts';
import { LOBULE_CAMS, LOBULE_R, lobuleShot, lobuleToScene, type LobuleCam } from '../src/scene/lobule/shots.ts';
import { LOBULE_SCALE, lobuleWorld } from '../src/scene/lobule/frames.ts';
import { figurePlan } from '../src/ui/deck/figure-plan.ts';
import { figureCalls } from '../src/ui/deck/figure-calls.ts';
import { RW_IDS } from '../src/decks/rw/copied/index.ts';
import { AG_IDS, loadAgDeck } from '../src/decks/ag/index.ts';
import { HP_IDS, loadHpDeck } from '../src/decks/hp/index.ts';
import { loadSource } from '../src/decks/source.ts';

const net = buildLobule(7);
/** The congested central vein's widest drawn radius (view.ts cvRadiusNow at congU 1, no fibrosis). */
const CV_MAX = DISC_R.cv + 0.05;

type Slide = Parameters<typeof figurePlan>[0];
const slides = async () => {
  const decks: { id: string; slides?: readonly unknown[] }[] = [...(await Promise.all(RW_IDS.map((id) => loadSource(id)))), ...(await Promise.all(AG_IDS.map((id) => loadAgDeck(id)))), ...(await Promise.all(HP_IDS.map((id) => loadHpDeck(id))))];
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

// ---- the central-vein slides (Plan 46; Mohammad, 23 Nov: "SOS resistance is in the central vein dude wtf") -----------------------------------------------------
test('the five slides whose callout is at the central vein: the Resistance ones ring the vein, the one that names sinusoids rings a zone 3 sinusoid', async () => {
  const want: Record<string, string> = { 'rw/postsin': 'central', 'hp/lobule/sos': 'central', 'hp/outflow/sos': 'central', 'hp/lobule/cong': 'sinusoid:zone3' };
  const seen: Record<string, string> = {};
  for (const { deck, slide } of await slides()) {
    const s = slide as Slide & { id: string; callout: { at: string; label: string } };
    if (s.callout.at !== 'cv') continue;
    const call = figureCalls(figurePlan(slide)).cards.find((c) => c.id === 'callout')!;
    const name = (call.anchor as { lobule: string }).lobule;
    // the rule itself: a label that names sinusoids rings a sinusoid, every other central-vein label rings the vein
    assert.equal(name, /sinusoid/i.test(s.callout.label) ? 'sinusoid:zone3' : 'central', `${deck}/${s.id} "${s.callout.label}"`);
    seen[`${deck === 'rw' || deck === 'sites' ? 'rw' : deck}/${s.id}`] = name;
  }
  const keys = Object.keys(seen);
  assert.ok(keys.length >= 4, `the central-vein slides were found (${keys.join(', ')})`);
  for (const k of keys) { const w = Object.entries(want).find(([id]) => k.endsWith(id.split('/').slice(1).join('/'))); if (w) assert.equal(seen[k], w[1], k); }
  assert.ok(keys.some((k) => seen[k] === 'central') && keys.some((k) => seen[k] === 'sinusoid:zone3'));
});

test('"central" is the central vein course\'s own point, with the ring round the vein and its air', () => {
  const cv = net.courses.find((c) => c.kind === 'cv')!, s = calloutSpot(net, 'central');
  assert.ok(Math.abs(s.x - cv.pts.reduce((a, p) => a + p[0], 0) / cv.pts.length) < 1e-12 && Math.abs(s.y - cv.pts.reduce((a, p) => a + p[1], 0) / cv.pts.length) < 1e-12, 'the middle of the vein\'s own points');
  assert.ok(Math.hypot(s.x, s.y) < 1e-9, 'the plate\'s centre');
  assert.equal(s.r, CV_RING_R); assert.ok(Math.abs(CV_RING_R - 1.2 * DISC_R.cv) < 1e-12);
  assert.ok(isCalloutName('central'));
});

test('at the widest congestion the vein ring (1.2 x the vein) still clears the sinusoid places (the nearest leaves 0.028 R: the rings never touch)', () => {
  const ring = CV_RING_AIR * CV_MAX;
  for (const name of ['sinusoid:zone3', 'sinusoid:mid'] as const) {
    const s = calloutSpot(net, name), gap = Math.hypot(s.x, s.y) - s.r - ring;
    assert.ok(gap >= 0.02, `${name}: the vein ring (${ring.toFixed(3)}) leaves ${gap.toFixed(3)} R to the sinusoid ring`);
  }
});

test('"central" is never used for a label that names sinusoids, and a sinusoid place is never used for a label of the vein', () => {
  const src = readFileSync('src/ui/deck/figure-calls.ts', 'utf8');
  assert.match(src, /plan\.callout\.at === 'cv' \? \(\/sinusoid\/i\.test\(plan\.callout\.label\) \? 'sinusoid:zone3' : 'central'\)/);
});
