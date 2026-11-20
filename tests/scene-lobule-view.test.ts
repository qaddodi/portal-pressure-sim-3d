import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShared } from '../src/scene/materials/cel.ts';
import { AXIAL_KINDS, N, buildLobule, hexFrac, inletBow, zoneOf } from '../src/scene/lobule/geometry.ts';
import { LOBULE_CAMS, LOBULE_ORIGIN, LOBULE_R, SINUSOID_ORIGIN, lobuleShot, sinusoidShot } from '../src/scene/lobule/shots.ts';
import { SIN_SCALE, lobuleWorld, sinusoidWorld } from '../src/scene/lobule/frames.ts';
import { WASH_DELAY_MS, WASH_MS, washAmount, washFront, washProgress, washSpan } from '../src/scene/lobule/wash.ts';
import { LOBULE_PARTS, SINUSOID_PARTS } from '../src/scene/lobule/parts.ts';
import { LOBULE_PALETTES, EXTRA_TONES } from '../src/scene/lobule/tones.ts';
import { LobuleView } from '../src/scene/lobule/view.ts';
import { SinusoidView } from '../src/scene/sinusoid/view.ts';
import { PALETTES, LOOK_IDS } from '../src/scene/palette.ts';
import { easeToward, type LobuleModel } from '../src/scene/lobule/model.ts';

const net = buildLobule();
const kind = (k: string) => net.courses.filter((c) => c.kind === k);
const model = (o: Partial<LobuleModel> = {}): LobuleModel => ({
  zone: { pre: 1, sin: 1, post: 1 }, Qs: { pre: 18, sin: 9, post: 18 }, Q0: { pre: 18, sin: 9, post: 18 }, oxy: [0.85, 0.85, 0.75], P1: 11, P2: 8, P3: 5, P4: 4, flow: 1, portal: 1, art: 1, rev: { pre: false, sin: false, post: false },
  lymph: 0.9, lymph0: 0.9, lyProt: 0.87, sigma: 0.15, iap: 5, alb: 4, s: 0, cong: 0, fibSin: 0, fibPre: 0, fibPost: 0, congU: 0, shuntU: 0, septU: 0, act: 0, ...o,
});

// ---- the network is the 2D app's lobule --------------------------------------------------------------------------------------------

test('the lobule is the 2D app\'s: six corners, six triads, 48 + 24 + 12 sinusoids in three generations, one central vein, a lymphatic at every tract', () => {
  assert.equal(net.triads.length, 6);
  assert.equal(kind('pv').length, 6); assert.equal(kind('ha').length, 6); assert.equal(kind('bd').length, 6); assert.equal(kind('lv').length, 6);
  assert.equal(kind('in').length, 12);
  assert.equal(kind('s0').length, 48); assert.equal(kind('s1').length, 24); assert.equal(kind('s2').length, 12);
  assert.equal(kind('cv').length, 1);
  assert.equal(kind('tw').length, 6, 'an arteriole twig into each tract\'s first sinusoid');
  assert.equal(kind('lt').length, 12, 'terminal lymphatics along both of each tract\'s edges');
  assert.ok(kind('ly').length >= (48 + 24 + 12) * 2, 'a lymph channel on each side of every sinusoid');
  assert.ok(kind('an').length > 10, 'cross-links between neighbouring sinusoids');
  assert.equal(net.septa.length, 3);
  assert.deepEqual(net.corners.map((c) => Math.round(Math.hypot(c[0], c[1]) * 1e6) / 1e6), [1, 1, 1, 1, 1, 1]);
});

test('it is built from the same seed, in the same order, every time (the 3D lobule is one lobule)', () => {
  const again = buildLobule();
  assert.equal(JSON.stringify(again.courses.map((c) => c.pts[10])), JSON.stringify(net.courses.map((c) => c.pts[10])));
  assert.equal(again.cells.length, net.cells.length);
});

test('blood runs inlet to central vein: every sinusoid course starts at the portal side and ends near the centre, and the courses have N evenly spaced points (the lymph channels, cut where they meet a vessel, as many as their length needs)', () => {
  for (const c of net.courses) if (c.kind !== 'ly') assert.equal(c.pts.length, N, `${c.kind} ${c.id}`);
  for (const c of kind('s0')) { assert.ok(c.rho[0]! > 0.7, `s0 starts at rho ${c.rho[0]}`); assert.ok(c.rho[N - 1]! < 0.75); }
  for (const c of kind('s2')) { assert.ok(c.rho[0]! < 0.5); assert.ok(c.rho[N - 1]! < net.rcv0 * 1.4, 'the third generation enters the central vein'); }
  for (const c of net.courses) {
    if (AXIAL_KINDS.has(c.kind) || c.kind === 'ly') continue;
    const steps = c.pts.slice(1).map((p, i) => Math.hypot(p[0] - c.pts[i]![0], p[1] - c.pts[i]![1]));
    const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
    assert.ok(steps.every((s) => Math.abs(s - mean) < mean * 0.35 + 1e-9), `${c.kind} ${c.id} evenly spaced`);
  }
});

test('hepatocyte cords: cells fill the hexagon between the sinusoids, none outside it, and all three zones are present, zone 3 nearest the central vein', () => {
  assert.ok(net.cells.length > 150, `${net.cells.length} cells`);
  assert.ok(net.cells.every((c) => hexFrac(c.x, c.y) <= 0.975));
  const z = [1, 2, 3].map((k) => net.cells.filter((c) => zoneOf(c.q) === k).length);
  assert.ok(z.every((n) => n > 10), `zones ${z}`);
  const rho = (k: number) => { const cs = net.cells.filter((c) => zoneOf(c.q) === k); return cs.reduce((a, c) => a + Math.hypot(c.x, c.y), 0) / cs.length; };
  assert.ok(rho(3) < rho(2) && rho(2) < rho(1));
  assert.ok(net.stellate.length >= 20, 'stellate cells in the space of Disse');
});

test('inlet venules leave their triad with the 2D slope and arrive flat, so two meet halfway without a kink', () => {
  assert.equal(inletBow(0), 0);
  assert.ok(Math.abs(inletBow(1) - Math.sin(0.8 * Math.PI)) < 1e-12);
  assert.ok(Math.abs(inletBow(1) - inletBow(0.999)) < 2e-3, 'flat at the end');
});

// ---- the shots ---------------------------------------------------------------------------------------------------------------------

test('every camera name the 2D decks use has a shot, aimed at the lobule (or the sinusoid) and zoomed as in 2D', () => {
  assert.deepEqual([...LOBULE_CAMS].sort(), ['lobule', 'lobule:central', 'lobule:fit', 'lobule:sinusoid', 'lobule:triad', 'sinusoid']);
  const fit = lobuleShot('lobule');
  assert.deepEqual(lobuleShot('lobule:fit'), fit);
  assert.deepEqual(fit.target, lobuleWorld([0, 0, 0]));
  const triad = lobuleShot('lobule:triad'), sin = lobuleShot('lobule:sinusoid'), cv = lobuleShot('lobule:central');
  // the triad station is 12% of the way from the left portal tract toward the centre; the sinusoid station half way; both at twice the fit (shots are in world units: inside the liver)
  assert.ok(Math.abs(triad.target[0] - lobuleWorld([-0.88 * LOBULE_R, 0, 0])[0]) < 1e-12);
  assert.ok(Math.abs(sin.target[0] - lobuleWorld([-0.5 * LOBULE_R, 0, 0])[0]) < 1e-12);
  assert.deepEqual(cv.target, lobuleWorld([0, 0, 0]));
  for (const s of [triad, sin, cv]) { assert.ok(Math.abs(s.half[0] * 2 - fit.half[0]) < 1e-12); }
  const s = sinusoidShot();
  assert.deepEqual(s.target, sinusoidWorld([0, 0, 0]));
  assert.ok(s.half[0] > 3 * SIN_SCALE, 'the whole length of the sinusoid');
  assert.deepEqual(SINUSOID_ORIGIN, [0, 0, 0]); assert.deepEqual(LOBULE_ORIGIN, [0, 0, 0]);
});

// ---- the wedge's amber -------------------------------------------------------------------------------------------------------------

test('the wash waits for the eye, then runs its length, eased; reduced motion shows it finished', () => {
  assert.equal(washProgress(0), 0); assert.equal(washProgress(WASH_DELAY_MS), 0);
  assert.equal(washProgress(WASH_DELAY_MS + WASH_MS), 1); assert.equal(washProgress(1e6), 1);
  assert.ok(Math.abs(washProgress(WASH_DELAY_MS + WASH_MS / 2) - 0.5) < 1e-9);
  assert.equal(washProgress(0, true), 1);
  assert.equal(washAmount(0), 0); assert.ok(washAmount(0.05) > 0.84);
});

test('the front runs from the central vein out past the portal edge, and a course is covered from its end nearer the centre', () => {
  assert.ok(washFront(0) < 0.07 && washFront(0) > 0);
  assert.ok(Math.abs(washFront(1) - 1.1) < 1e-9);
  // a sinusoid runs portal (rho 1) to central (0): the front covers its LAST part first
  const s = kind('s0')[0]!;
  assert.equal(washSpan(s.pts, s.rho, 0.05), null, 'not reached yet');
  const mid = washSpan(s.pts, s.rho, 0.8)!;   // (a first-generation sinusoid ends at rho 0.6, where it merges: the front reaches that end first)
  assert.equal(mid[1], 1); assert.ok(mid[0] > 0 && mid[0] < 1);
  assert.equal(washSpan(s.pts, s.rho, 0.5), null, 'a front inside where it merges has not reached it');
  assert.deepEqual(washSpan(s.pts, s.rho, 1.2), [0, 1], 'covered whole when the front is past it');
  // and a course that runs the other way (the space of Disse, from the plate inward is the same direction; a reversed copy is covered from the start)
  const rev = washSpan([...s.pts].reverse(), [...s.rho].reverse(), 0.8)!;
  assert.equal(rev[0], 0); assert.ok(rev[1] > 0 && rev[1] < 1);
});

test('the wash waits for the eye, then its progress runs to the end while the view shows it, and a hidden view asks for nothing', () => {
  const v = new LobuleView(createShared());
  v.setVisible(true);
  v.update(0);
  assert.equal(v.washProgress, 0);
  v.startWash(0);
  v.update(100);
  assert.equal(v.washProgress, 0, 'the eye finds the vessel first');
  v.update(WASH_DELAY_MS + 1000);
  const k1 = v.washProgress;
  assert.ok(k1 > 0 && k1 < 1);
  v.update(WASH_DELAY_MS + 2500);
  assert.ok(v.washProgress > k1, 'the front moves outward');
  assert.ok(v.update(WASH_DELAY_MS + 2600), 'frames keep coming while it runs');
  v.update(WASH_DELAY_MS + WASH_MS + 100);
  assert.equal(v.washProgress, 1);
  v.setVisible(false);
  assert.equal(v.update(1e6), false, 'a hidden view asks for nothing');
});

// ---- parts, tones ------------------------------------------------------------------------------------------------------------------

test('every part of both views has a name (the cards, labels and taps address them)', () => {
  const s = new SinusoidView(createShared());
  assert.ok(LOBULE_PARTS.includes('sinusoids') && LOBULE_PARTS.includes('central-vein') && LOBULE_PARTS.includes('portal-tracts'));
  assert.deepEqual([...s.set.parts.keys()], [...SINUSOID_PARTS]);
});

test('the tones are made from the looks table: every extra tone in every look, ink visible against the cords', () => {
  for (const id of LOOK_IDS) {
    const p = LOBULE_PALETTES[id];
    for (const t of EXTRA_TONES) assert.match(p.tones[t as never] as string, /^#[0-9A-F]{6}$/i, `${id} ${t}`);
    assert.equal(p.tones.liver, PALETTES[id].tones.liver, 'the scene\'s own tones are untouched');
    assert.notEqual(p.tones['cord3' as never], p.tones['cord1' as never], 'zone 3 is deeper than zone 1');
  }
});

// ---- the lymph chevrons (and none in the sinusoid view) ----------------------------------------------------------------------------

const settle = (v: LobuleView, from = 0, ms = 1500) => { for (let t = from; t <= from + ms; t += 16) v.update(t); return from + ms; };

test('turning the Lymph layer off fades it away (the 3D ducts shrink to nothing, never pop) and stops asking for frames', () => {
  const v = new LobuleView(createShared());
  v.setVisible(true); v.snapModel(model()); let t = settle(v);
  assert.equal(v.lyFade, 1);
  v.setLayers({ lymph: false });
  v.update(t += 16); assert.ok(v.lyFade > 0 && v.lyFade < 1, 'still going at the first frame');
  t = settle(v, t);
  assert.equal(v.lyFade, 0);
  assert.equal(v.update(t + 16), false, 'settled: no frames');
});


test('the lobule\'s disease states: congested zone 3 sinusoids dilate, capillarized ones narrow, the central vein widens with congestion and narrows with its collagen', () => {
  const v = new LobuleView(createShared());
  v.setVisible(true); v.snapModel(model()); settle(v);
  assert.ok(Math.abs(v.sinScaleAt(0.19) - 1) < 1e-9 && Math.abs(v.sinScaleAt(0.75) - 1) < 1e-9);
  const cv0 = v.cvRadiusNow;
  v.setModel(model({ congU: 0.8 }));
  settle(v, 2000, 3000);
  assert.ok(v.sinScaleAt(0.19) > v.sinScaleAt(0.47) && v.sinScaleAt(0.47) > 1, 'congested zone-3 sinusoids dilate most');
  assert.ok(Math.abs(v.sinScaleAt(0.85) - 1) < 1e-9, 'the portal end does not');
  assert.ok(v.cvRadiusNow > cv0);
  v.setModel(model({ zone: { pre: 1, sin: 20, post: 1 }, fibPost: 1 }));
  settle(v, 6000, 3000);
  assert.ok(v.sinScaleAt(0.75) < 1, 'capillarized sinusoids narrow');
  assert.ok(v.cvRadiusNow < cv0, 'the central vein\'s collagen narrows it');
});

test('a state target eases and lands exactly (the lobule\'s own use of easeToward)', () => {
  const cur = { a: 0 };
  while (easeToward(cur, { a: 1 }, 16));
  assert.equal(cur.a, 1);
});

test('the Bile and Zones layers fade in and back off (the 3D lobule grows the canaliculi out of nothing and eases the zones over the plate)', () => {
  const v = new LobuleView(createShared());
  v.setVisible(true); v.snapModel(model()); v.setLayers({ bile: false }); let t = settle(v);
  assert.equal(v.bileFade, 0); assert.equal(v.zoneFade, 0);
  v.setLayers({ bile: true, zones: true });
  v.update(t += 16);
  assert.ok(v.bileFade > 0 && v.bileFade < 1 && v.zoneFade > 0 && v.zoneFade < 1, 'easing in');
  t = settle(v, t);
  assert.equal(v.bileFade, 1); assert.equal(v.zoneFade, 1);
  v.setLayers({ bile: false, zones: false }); t = settle(v, t);
  assert.equal(v.bileFade, 0); assert.equal(v.zoneFade, 0);
});
