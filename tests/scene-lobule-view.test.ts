import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShared } from '../src/scene/materials/cel.ts';
import { AXIAL_KINDS, N, buildLobule, hexFrac, inletBow, zoneOf } from '../src/scene/lobule/geometry.ts';
import { LOBULE_CAMS, LOBULE_ORIGIN, LOBULE_R, SINUSOID_ORIGIN, lobuleShot, sinusoidShot } from '../src/scene/lobule/shots.ts';
import { SIN_SCALE, lobuleWorld, sinusoidWorld } from '../src/scene/lobule/frames.ts';
import { WASH_DELAY_MS, WASH_MS, washAmount, washFront, washProgress, washSpan } from '../src/scene/lobule/wash.ts';
import { LOBULE_PARTS, SINUSOID_PARTS } from '../src/scene/lobule/parts.ts';
import { LOBULE_PALETTES, EXTRA_TONES } from '../src/scene/lobule/tones.ts';
import { LobuleView, litParts, PLATE_PAINTED } from '../src/scene/lobule/view.ts';
import { SinusoidView } from '../src/scene/sinusoid/view.ts';
import { Batch } from '../src/scene/lobule/batch.ts';
import { PALETTES, LOOK_IDS } from '../src/scene/palette.ts';
import { easeToward, type LobuleModel, type SinusoidTargets } from '../src/scene/lobule/model.ts';
import type { CelObject } from '../src/scene/materials/cel.ts';

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
  assert.equal(kind('ly').length, 48 + 24 + 12, 'a space of Disse beside every sinusoid');
  assert.ok(kind('an').length > 10, 'cross-links between neighbouring sinusoids');
  assert.equal(net.septa.length, 3);
  assert.deepEqual(net.corners.map((c) => Math.round(Math.hypot(c[0], c[1]) * 1e6) / 1e6), [1, 1, 1, 1, 1, 1]);
});

test('it is built from the same seed, in the same order, every time (the 3D lobule is one lobule)', () => {
  const again = buildLobule();
  assert.equal(JSON.stringify(again.courses.map((c) => c.pts[10])), JSON.stringify(net.courses.map((c) => c.pts[10])));
  assert.equal(again.cells.length, net.cells.length);
});

test('blood runs inlet to central vein: every sinusoid course starts at the portal side and ends near the centre, and the courses have N evenly spaced points', () => {
  for (const c of net.courses) assert.equal(c.pts.length, N, `${c.kind} ${c.id}`);
  for (const c of kind('s0')) { assert.ok(c.rho[0]! > 0.7, `s0 starts at rho ${c.rho[0]}`); assert.ok(c.rho[N - 1]! < 0.75); }
  for (const c of kind('s2')) { assert.ok(c.rho[0]! < 0.5); assert.ok(c.rho[N - 1]! < net.rcv0 * 1.4, 'the third generation enters the central vein'); }
  for (const c of net.courses) {
    if (AXIAL_KINDS.has(c.kind)) continue;
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

test('the amber is a recolour of the blood\'s own vessels only: sinusoids, links and the central vein, never the tracts or the lymph', () => {
  const v = new LobuleView(createShared());
  const wash = v.set.get('wash').group.children;
  assert.equal(wash.length, 2, 'one overlay over the sinusoids, one over the central vein');
  for (const k of ['cords', 'lymph', 'portal-tracts', 'inlets'] as const) assert.ok(!v.set.get(k).group.children.some((g) => wash.includes(g)));
});

test('the wash overlay is hidden until the wash runs, grows its front with the time, and goes away with the view', () => {
  const v = new LobuleView(createShared());
  v.setVisible(true);
  const [sin, cv] = v.set.get('wash').group.children;
  v.update(0);
  assert.equal(sin!.visible || cv!.visible, false);
  v.startWash(0);
  v.update(100);
  assert.equal(sin!.visible, false, 'the eye finds the vessel first');
  v.update(WASH_DELAY_MS + 1000);
  assert.ok(sin!.visible && cv!.visible);
  const reveal = (o: CelObject) => o.ink.uniforms.reveal!.value as number;
  const wash = v.objects.filter((o) => v.set.get('wash').group.children.includes(o.group));
  const r1 = reveal(wash[0]!);
  v.update(WASH_DELAY_MS + 2500);
  assert.ok(reveal(wash[0]!) > r1, 'the front moves outward');
  assert.ok(v.update(WASH_DELAY_MS + 2600), 'frames keep coming while it runs');
  v.update(WASH_DELAY_MS + WASH_MS + 100);
  assert.ok(v.washProgress === 1);
  v.setVisible(false);
  assert.equal(v.update(1e6), false, 'a hidden view asks for nothing');
});

// ---- parts, tones, the artist's swap-in --------------------------------------------------------------------------------------------

test('every part of both views exists as a named, placeholder part, ready for the artist to swap in', () => {
  const l = new LobuleView(createShared()), s = new SinusoidView(createShared());
  assert.deepEqual([...l.set.parts.keys()], [...LOBULE_PARTS]);
  assert.deepEqual([...s.set.parts.keys()], [...SINUSOID_PARTS]);   // (the sinusoid is one drawn shader on a plane, in its first part: tests/scene-sinusoid-lift.test.ts)
  assert.deepEqual(l.set.remaining(), [...LOBULE_PARTS]);
  for (const name of LOBULE_PARTS) if (!PLATE_PAINTED.includes(name)) assert.ok(l.set.get(name).group.children.length > 0, `lobule part ${name} has placeholder art`);
  for (const name of PLATE_PAINTED) assert.equal(l.set.get(name).group.children.length, 0, `${name} is painted on the plate, as 2D paints it, with no geometry of its own`);
});

test('swapping a part replaces its placeholder and nothing else; the state, the wash and the shots go on addressing the part', async () => {
  const { Group } = await import('three');
  const l = new LobuleView(createShared());
  const before = l.objects.length;
  const art = new Group(); art.name = 'lobule/cords';
  l.swap('cords', art);
  assert.equal(l.set.get('cords').placeholder, false);
  assert.equal(l.set.get('cords').group.children.length, 0, 'the placeholder is gone');
  assert.ok(l.group.children.includes(art));
  assert.ok(l.set.get('sinusoids').placeholder);
  assert.ok(l.set.remaining().length === LOBULE_PARTS.length - 1);
  assert.ok(l.objects.length === before, 'other parts keep their objects');
  l.setVisible(true); l.setModel(model({ congU: 0.5 })); assert.doesNotThrow(() => l.update(0));
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

const marked = (v: LobuleView) => v.objects.filter((o) => o.isVessel);
const flowOf = (o: CelObject) => o.toon.uniforms.headAmount!.value as number;   // (the flow heads, 2D's chevrons: shading.ts)
const speedOf = (o: CelObject) => o.toon.uniforms.stubSpeed!.value as number;
const settle = (v: LobuleView | SinusoidView, from = 0, ms = 1500) => { for (let t = from; t <= from + ms; t += 16) v.update(t); return from + ms; };

test('lymph chevrons run on the terminal lymphatics, in toward the tract, while the Lymph layer is on; the space of Disse is a plain sleeve under its sinusoid and carries none (a yellow edge on every sinusoid)', () => {
  const v = new LobuleView(createShared());
  v.setVisible(true); v.snapModel(model()); settle(v);
  const ly = v.objects.filter((o) => v.set.get('lymph').group.children.includes(o.group) && o.isVessel);
  assert.ok(ly.length >= 1);
  const marked = ly.filter((o) => flowOf(o) > 0.99);
  assert.equal(marked.length, 1, 'chevrons on the lymphatics alone');
  assert.ok(speedOf(marked[0]!) > 0, 'with their course (in toward the tract)');
});

test('hepatic lymph rises in cirrhosis, and the chevrons quicken with it', () => {
  const calm = new LobuleView(createShared()), wet = new LobuleView(createShared());
  for (const [v, m] of [[calm, model()], [wet, model({ lymph: 5.5, lyProt: 0.43 })]] as const) { v.setVisible(true); v.snapModel(m); settle(v); }
  const lt = (v: LobuleView) => v.objects.filter((o) => v.set.get('lymph').group.children.includes(o.group) && o.isVessel && flowOf(o) > 0.99).map(speedOf)[0]!;
  assert.ok(Math.abs(lt(wet)) > Math.abs(lt(calm)) * 1.4);
});

test('turning the Lymph layer off fades the ducts away (they shrink to nothing, never pop) and stops their frames', () => {
  const v = new LobuleView(createShared());
  v.setVisible(true); v.snapModel(model()); let t = settle(v);
  const lymph = v.set.get('lymph').group;
  assert.ok(lymph.visible);
  v.setLayers({ lymph: false });
  v.update(t += 16); assert.ok(lymph.visible, 'still going at the first frame');
  const lt = v.objects.find((o) => lymph.children.includes(o.group) && o.isVessel)!;
  const mid = lt.toon.uniforms.inflate!.value as number;
  assert.ok(mid < 0 && mid > -0.04, 'shrinking');
  t = settle(v, t);
  assert.equal(lymph.visible, false);
});

test('blood\'s chevrons follow the Blood menu as in the 2D lobule: on for every vessel by default, off when switched off, the named parts alone for "key chevrons only"', () => {
  assert.deepEqual([...litParts(['lobule:sinusoid'])], ['sinusoids']);
  assert.ok(litParts(['lobule:central']).has('central-vein') && litParts(['lobule:central']).has('sinusoids'));
  assert.ok(litParts(['lobule:triad']).has('portal-tracts') && litParts(['lobule:triad']).has('sinusoids'));
  const v = new LobuleView(createShared());
  v.setVisible(true); v.snapModel(model());
  const blood = marked(v).filter((o) => !v.set.get('lymph').group.children.includes(o.group) && !v.set.get('bile').group.children.includes(o.group));
  let t = settle(v);
  assert.ok(blood.length >= 5);
  for (const o of blood) assert.equal(flowOf(o), 1, 'the blood moves, nothing named');
  v.setBlood({ chevrons: false, keyChevrons: false }); t = settle(v, t);
  for (const o of blood) assert.equal(flowOf(o), 0, 'Blood > Chevrons off');
  v.setBlood({ chevrons: true, keyChevrons: true }); v.setLit(litParts(['lobule:sinusoid'])); t = settle(v, t);
  const sinus = blood.filter((o) => v.set.get('sinusoids').group.children.includes(o.group));
  assert.equal(sinus.length, 3);
  for (const o of sinus) assert.equal(flowOf(o), 1);
  for (const o of blood.filter((o) => !sinus.includes(o))) assert.equal(flowOf(o), 0, 'key chevrons only: the named parts');
});

test('the marks run at the 2D painter\'s speeds (sinusoids 1 : 1.45 : 2.05 of sqrt(flow), faster in the inlets and the arteriole\'s twig), and reversed portal flow runs the inlets\' marks backward', () => {
  const v = new LobuleView(createShared());
  v.setVisible(true); v.snapModel(model()); settle(v);
  const m = marked(v), speed = (part: string, i = 0) => speedOf(m.filter((o) => v.set.get(part as 'sinusoids').group.children.includes(o.group))[i]!);
  const [a, b, c] = [speed('sinusoids', 0), speed('sinusoids', 1), speed('sinusoids', 2)];
  assert.ok(a > 0 && Math.abs(b / a - 1.45) < 1e-6 && Math.abs(c / a - 2.05) < 1e-6);
  assert.ok(speed('inlets') > a, 'the inlets run faster than the first sinusoids');
  v.snapModel(model({ portal: 0.8, rev: { pre: true, sin: false, post: false } })); settle(v, 2000);
  assert.ok(speed('inlets') < 0, 'reversed portal flow: marks the other way');
  v.snapModel(model({ flow: 0.8, rev: { pre: false, sin: true, post: false } })); settle(v, 4000);
  const still = m.filter((o) => v.set.get('sinusoids').group.children.includes(o.group))[0]!;
  assert.equal(still.toon.uniforms.flowBands!.value, 1, 'a still sinusoid carries smoke (soft bands), not chevrons, as in 2D');
  assert.ok(Math.abs(speedOf(still)) < 0.3, 'the smoke drifts slowly');
});

// ---- states ------------------------------------------------------------------------------------------------------------------------

const targets = (o: Partial<SinusoidTargets> = {}): SinusoidTargets => ({ por: 1, col: 0, bm: 0, mv: 1, act: 0, lum: 1, pinch: 0, v: 1, filt: 1, prot: 1, ...o });

test('the lobule\'s disease states: the plate is painted again for a new state (collagen, nutmeg, stellate cells, zone 3 dropping out), congested zone 3 sinusoids dilate', () => {
  const v = new LobuleView(createShared());
  v.setVisible(true); v.snapModel(model()); settle(v);
  const healthy = v.plate.key;
  assert.match(healthy, /^light\|0,0,0,0,0,0$/, 'a healthy lobule\'s plate has no collagen, congestion or activation');
  const s2 = () => v.objects.find((o) => o.tone === ('sin2' as never))!.toon.uniforms.inflate!.value as number;
  assert.ok(Math.abs(s2()) < 1e-9);
  const before = v.plate.paints;
  v.setModel(model({ s: 0.85, septU: 1, fibPre: 0.7, fibPost: 0.6, congU: 0.8, act: 0.9, fibSin: 0.8, zone: { pre: 3, sin: 20, post: 3 } }));
  settle(v, 2000, 3000);
  assert.equal(v.plate.paints, before + 1, 'painted once for the new state, not on every eased frame');
  assert.equal(v.plate.key, 'light|26,32,26,29,22,19');
  assert.ok(s2() > 0, 'congested zone-3 sinusoids dilate');
  settle(v, 6000, 1000);
  assert.equal(v.plate.paints, before + 1, 'a state that holds paints nothing more');
});

test('a batch builds tubes with every attribute the cel shaders read, and caps close an end-on vessel', () => {
  const b = new Batch();
  const len = b.tube([[0, 0, 0], [1, 0, 0], [2, 0, 0]], { radius: 0.1, radial: 6, capped: true, uvx: (_i, arc) => arc });
  assert.ok(Math.abs(len - 2) < 1e-9);
  const g = b.build();
  for (const a of ['position', 'normal', 'uv', 'tang']) assert.ok(g.getAttribute(a), a);
  assert.equal(g.getAttribute('position').count, 3 * 7 + 2 * (1 + 7));
  assert.ok(g.getIndex()!.count % 3 === 0);
  const nrm = g.getAttribute('normal');
  for (let i = 0; i < nrm.count; i++) assert.ok(Math.abs(Math.hypot(nrm.getX(i), nrm.getY(i), nrm.getZ(i)) - 1) < 1e-6);
});

test('a state target eases and lands exactly (the lobule\'s own use of easeToward)', () => {
  const cur = { a: 0 };
  while (easeToward(cur, { a: 1 }, 16));
  assert.equal(cur.a, 1);
});

test('with the Bile layer off (2D starts with it on) the vessels are gone; turning it on grows the canaliculi and canals out of nothing, and their arrowheads run out toward the tract (against the blood)', () => {
  const v = new LobuleView(createShared());
  v.setVisible(true); v.snapModel(model()); v.setLayers({ bile: false }); let t = settle(v);
  const bile = v.set.get('bile').group;
  assert.equal(bile.visible, false, 'off');
  const objs = v.objects.filter((o) => bile.children.includes(o.group));
  assert.equal(objs.length, 2, 'channels and canals');
  v.setLayers({ bile: true });
  v.update(t += 16); assert.ok(bile.visible, 'on at the first frame of the fade');
  assert.ok((objs[0]!.toon.uniforms.inflate!.value as number) < 0, 'still growing');
  t = settle(v, t);
  for (const o of objs) { assert.ok(Math.abs(o.toon.uniforms.inflate!.value as number) < 1e-6, 'full size'); assert.equal(flowOf(o), 1, 'arrowheads on'); assert.ok(speedOf(o) > 0, 'run against the blood (bile.ts lays every course from the central vein out to the tract, so forward is out)'); }
  v.setLayers({ bile: false }); t = settle(v, t);
  assert.equal(bile.visible, false);
});

test('the Zones layer is 2D\'s radial gradient over the plate, easing in and back off with no new painting', () => {
  const v = new LobuleView(createShared());
  v.setVisible(true); v.snapModel(model()); let t = settle(v);
  const paints = v.plate.paints;
  assert.equal(v.zones.amount, 0); assert.equal(v.zones.mesh.visible, false);
  v.setLayers({ zones: true }); v.update(t += 16);
  assert.ok(v.zones.amount > 0 && v.zones.amount < 0.17, 'easing in');
  t = settle(v, t);
  assert.ok(Math.abs(v.zones.amount - 0.17) < 1e-9, '2D\'s opacity on Light');
  v.setLayers({ zones: false }); t = settle(v, t);
  assert.equal(v.zones.amount, 0); assert.equal(v.zones.mesh.visible, false);
  assert.equal(v.plate.paints, paints, 'the tissue was not painted again');
});
