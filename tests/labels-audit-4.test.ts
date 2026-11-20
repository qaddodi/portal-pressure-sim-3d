// The 20 Nov audit, section 4 (labels): a slide names exactly what it asks for; free play names 2D's set for its level and zoom; labels carry the unit, the change badge, the lens's own reading and
// its alerts; labels ride the camera and cross over, never blink; a label under a card or past the edge fades out whole.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { CameraRig } from '../src/scene/camera/rig.ts';
import { LabelController, NO_STATE, type Draw, type LabelDeps } from '../src/scene/labels/controller.ts';
import { FADE } from '../src/scene/labels/alpha.ts';
import { ANAT_EXTRA, CHIP_NODES, KEY_NODES, freeSet, flaggedStations, keepExtras, type FreeEnv } from '../src/scene/labels/free-set.ts';
import { StationExtras, badgeOff, badgeOn, fmtFlow, throughput, type ReadEnv } from '../src/scene/labels/readings.ts';
import { EDGES } from '../src/engine/hales/portal/topology.js';
import { stationRuns, lineSize } from '../src/scene/labels/type.ts';

const mac = { w: 1440, h: 900, safe: { top: 0, right: 0, bottom: 0, left: 0 } };
const phone = { w: 393, h: 852, safe: { top: 59, right: 0, bottom: 34, left: 0 } };
const measure: LabelDeps['measure'] = (t, size, _w, track = 0) => t.length * size * 0.56 + track * t.length;

interface World { ctl: LabelController; step(ms?: number): void; set(o: Partial<{ moving: boolean; dx: number; blockers: { x0: number; y0: number; x1: number; y1: number }[]; zoom: number }>): void; names(): string[]; byId(id: string): Draw | undefined }
function world(vp = mac, deps: Partial<LabelDeps> = {}, state: Partial<typeof NO_STATE> = {}): World {
  const room = { x: 0, y: 0, w: vp.w, h: vp.h };
  const rig = new CameraRig('play', room); rig.resize(vp.w, vp.h); rig.goTo('play', room, 0, 0); rig.update(0);
  let t = 1000, moving = false, dx = 0, blockers: { x0: number; y0: number; x1: number; y1: number }[] = [], zoom = 1;
  const d = {
    now: () => t, project: (p: Vector3, o: { x: number; y: number }) => { rig.project(p, o); o.x += dx; return o; }, cameraMoving: () => moving,
    free: () => ({ x0: 0, y0: 0, x1: vp.w, y1: vp.h }), view: () => ({ x0: 0, y0: 56, x1: vp.w, y1: vp.h }), vp: () => vp, reversed: () => false, words: () => null,
    blockers: () => blockers, measure, pressure: () => 5, reading: () => null, cathere: () => 0, zoom: () => zoom, ...deps,
  } as unknown as LabelDeps;
  const ctl = new LabelController(d); ctl.setState({ ...NO_STATE, ...state });
  return {
    ctl, step: (ms = 1200) => { for (let i = 0; i < ms / 16; i++) { t += 16; ctl.tick(); } },
    set: (o) => { if (o.moving !== undefined) moving = o.moving; if (o.dx !== undefined) dx = o.dx; if (o.blockers) blockers = o.blockers; if (o.zoom !== undefined) zoom = o.zoom; ctl.markDirty(); },
    names: () => ctl.out.filter((x) => x.kind === 'station' && !x.ghost && !x.id.startsWith('organ:')).map((x) => x.id).sort(), byId: (id) => ctl.out.find((x) => x.id === id && !x.ghost),
  };
}

// ── 19: a slide names exactly what it asks for ──
test('a slide shows only the stations its words light and its labels ask for: none of the free-play set', () => {
  const w = world(mac, {}, { presenting: true, named: new Set(['RHV']), shown: new Set(['RA']) });
  w.step();
  assert.deepEqual(w.names(), ['RA', 'RHV']);
  const none = world(mac, {}, { presenting: true });
  none.step();
  assert.deepEqual(none.names(), [], 'a slide with no labels shows none');
});

test('on a slide the varices stand only with the patient\'s varices, as 2D gates them (presentLabels with VAR and GV deleted)', () => {
  let on = { VAR: false, GV: false };
  const w = world(mac, { present: (id: 'VAR' | 'GV') => on[id] }, { presenting: true, shown: new Set(['VAR', 'GV', 'RA']) });
  assert.deepEqual(w.ctl.active().map((m) => m.id).sort(), ['RA']);
  on = { VAR: true, GV: false };
  assert.deepEqual(w.ctl.active().map((m) => m.id).sort(), ['RA', 'VAR']);
  on = { VAR: true, GV: true };
  assert.deepEqual(w.ctl.active().map((m) => m.id).sort(), ['GV', 'RA', 'VAR']);
});

// ── 21: free play ──
const env = (o: Partial<FreeEnv> = {}): FreeEnv => ({ level: 'key', zoomed: false, compact: false, hasVar: false, hasGv: false, ra: 3, reversed: () => false, stenosed: [], picked: null, ...o });
test('free play at the Key level: the three key stations, the hepatic artery, the flagged ones, and the rest as optional names on a wide screen only', () => {
  const wide = freeSet(env());
  assert.deepEqual([...KEY_NODES].every((id) => wide.show.has(id)), true);
  assert.ok(wide.show.has('HA'), 'the hepatic artery is named at every size and zoom');
  for (const id of CHIP_NODES) assert.ok(wide.show.has(id) || id === 'VAR', `${id} is asked for (as an optional name)`);
  assert.deepEqual([...wide.minor].sort(), CHIP_NODES.filter((id) => !KEY_NODES.includes(id) && id !== 'VAR').sort());
  const small = freeSet(env({ compact: true }));
  assert.deepEqual([...small.show].sort(), ['CONF', 'HA', 'RHV', 'SIN_R'], 'a phone keeps to the key ones');
  assert.equal(small.minor.size, 0);
  assert.equal(freeSet(env({ level: 'none' })).show.size, 0, 'a label level of none names nothing');
  const all = freeSet(env({ level: 'all', compact: true }));
  assert.ok(CHIP_NODES.filter((i) => i !== 'VAR').every((id) => all.show.has(id) && all.must.has(id)), 'All asks for every station and leaves none out for want of room');
  assert.deepEqual(all.extra, [...ANAT_EXTRA]);
});

test('the findings flag stations: varices, a raised right atrium, a vein whose blood runs backwards, either end of a narrowed vessel', () => {
  const f = flaggedStations({ hasVar: true, hasGv: true, ra: 12, reversed: (id) => id === 'SMV', stenosed: ['SV', 'IVCI', 'NOT_A_STATION'] });
  assert.deepEqual(f.sort(), ['GV', 'IVCI', 'RA', 'SMV', 'SV', 'VAR']);
  const s = freeSet(env({ compact: true, hasVar: true, ra: 12 }));
  assert.ok(s.show.has('VAR') && s.show.has('RA') && s.must.has('RA'), 'flagged and never left out');
  assert.ok(!freeSet(env({ hasVar: false })).show.has('VAR'), 'no varices, no varices callout');
});

test('zoomed in, the extra stations stand where 80 px (64 compact) round their dot is free of every other, in 2D\'s order', () => {
  const dots = new Map([['CONF', { x: 100, y: 100 }], ['MHV', { x: 150, y: 100 }], ['LHV', { x: 400, y: 100 }], ['RPV', { x: 460, y: 100 }]]);
  assert.deepEqual(keepExtras(['MHV', 'LHV', 'RPV'], dots, ['CONF'], 80), ['LHV'], 'MHV is 50 px from CONF; RPV 60 px from LHV, which stood first');
  assert.deepEqual(keepExtras(['MHV', 'LHV', 'RPV'], dots, ['CONF'], 64), ['LHV'].concat([]), 'compact: 64 px, RPV (60 from LHV) still has no room');
  const z = freeSet(env({ zoomed: true }));
  assert.deepEqual(z.extra, [...ANAT_EXTRA]);
  assert.deepEqual(freeSet(env()).extra, [], 'not zoomed in: none');
});

test('the controller names the Key set in free play, adds the extras when the figure is zoomed in, and takes them away again when it is not', () => {
  const w = world(mac, {}, {});
  w.step();
  assert.ok(w.names().includes('CONF') && w.names().includes('RHV') && w.names().includes('SIN_R'));
  assert.ok(!w.names().includes('MHV'));
  w.set({ zoom: 2 });
  w.step();
  assert.ok(w.ctl.extrasKept.length > 0, `zoomed in, ${w.ctl.extrasKept.length} extra stations find room`);
  w.set({ zoom: 1 });
  w.step();
  assert.deepEqual(w.ctl.extrasKept, []);
  const phoneW = world(phone, {}, {});
  phoneW.step();
  assert.ok(phoneW.names().every((id) => ['CONF', 'SIN_R', 'RHV', 'HA', 'VAR'].includes(id)), `a phone names only ${phoneW.names()}`);
});

// ── 20: the unit, the change badge, the lens's reading, the alerts ──
const NE = EDGES.length;
const frame = (q: (k: number) => number) => ({ P: new Float64Array(60).fill(10), Q: Float64Array.from({ length: NE }, (_, k) => q(k)), D: Float64Array.from({ length: NE }, (_, k) => (EDGES[k] as { d?: number }).d ?? 5) });
const renv = (o: Partial<ReadEnv> = {}): ReadEnv => ({ f: frame(() => 1), healthy: null, refP: null, lens: 'pressure', cmp: false, presenting: false, selected: false, lit: false, veinShown: () => true, ...o });
test('a pressure carries its unit only on a slide or when selected, and its change badge only where it is asked for (a slide\'s lit station, the selected one, the Change lens, a pinned moment)', () => {
  const ex = new StationExtras(), ref = new Float64Array(60).fill(4);
  assert.equal(ex.read('CONF', 12, renv({ refP: ref })).unit, '', 'free play: the legend says the unit');
  assert.equal(ex.read('CONF', 12, renv({ refP: ref })).delta, '', 'free play: no badge');
  assert.equal(ex.read('CONF', 12, renv({ refP: ref, presenting: true })).unit, 'mmHg');
  assert.equal(ex.read('CONF', 12, renv({ refP: ref, presenting: true })).delta, '', 'on a slide only a lit station');
  const lit = ex.read('CONF', 12, renv({ refP: ref, presenting: true, lit: true }));
  assert.equal(lit.delta, '+8.0'); assert.equal(lit.up, true);
  assert.equal(ex.read('CONF', 12, renv({ refP: ref, selected: true })).unit, 'mmHg');
  assert.equal(ex.read('CONF', 12, renv({ refP: ref, selected: true })).delta, '+8.0');
  assert.equal(ex.read('CONF', 12, renv({ refP: ref, lens: 'delta' })).delta, '+8.0');
  assert.equal(ex.read('CONF', 1, renv({ refP: ref, cmp: true, lens: 'delta' })).delta, '−3.0', 'a true minus sign');
});

test('the change badge comes at 5 mmHg and goes only below 4 (while comparing: 1 and 0.7), so a value at the line does not add and drop it each beat', () => {
  assert.deepEqual([badgeOn(false), badgeOff(false), badgeOn(true), badgeOff(true)], [5, 4, 1, 0.7]);
  const ex = new StationExtras(), ref = new Float64Array(60).fill(10), e = renv({ refP: ref, presenting: true, lit: true });
  assert.equal(ex.read('SMV', 14.9, e).delta, '', '4.9: under 5');
  assert.equal(ex.read('SMV', 15.1, e).delta, '+5.1');
  assert.equal(ex.read('SMV', 14.5, e).delta, '+4.5', 'stays while 4 or more');
  assert.equal(ex.read('SMV', 13.9, e).delta, '', 'goes below 4');
});

test('the flow lens reads the blood entering the station in L/min, and its change as a share; the oxygen lens the saturation in % O2', () => {
  const ex = new StationExtras();
  const into = EDGES.findIndex((e: { to: string }) => e.to === 'SMV');
  const f = frame((k) => (k === into ? 10 : 0));
  const r = ex.read('SMV', 9, renv({ f, lens: 'flow', presenting: true, lit: true, healthy: { Q: frame((k) => (k === into ? 5 : 0)).Q } }));
  assert.equal(r.number, '0.6'); assert.equal(r.unit, 'L/min'); assert.equal(r.delta, '+100%'); assert.equal(r.up, true);
  assert.equal(ex.read('SMV', 9, renv({ f, lens: 'flow' })).unit, '', 'free play: the flow legend says it');
  assert.equal(fmtFlow(0.03), '< 0.1'); assert.equal(fmtFlow(1.234), '1.2');
  assert.ok(Math.abs(throughput(f.Q, 'SMV') - 0.6) < 1e-9);
  const o = ex.read('SMV', 9, renv({ f, lens: 'oxygen', presenting: true }));
  assert.equal(o.unit, '% O₂'); assert.match(o.number!, /^\d+$/);
});

test('the velocity lens reads the fastest Doppler velocity at the station in cm/s and names a stopped or stagnant vein: "no flow", "stasis"; a bed says "microcirculation"', () => {
  const ex = new StationExtras();
  const idx = (id: string) => EDGES.findIndex((e: { id: string }) => e.id === id);
  const k = idx('PV_TRUNK');
  const fast = ex.read('CONF', 8, renv({ f: frame((i) => (i === k ? 12 : 0)), lens: 'velocity', presenting: true }));
  assert.match(fast.number!, /^\d+$/); assert.equal(fast.unit, 'cm/s'); assert.equal(fast.alert, '');
  const none = ex.read('CONF', 8, renv({ f: frame(() => 0), lens: 'velocity' }));
  assert.equal(none.alert, 'no flow'); assert.equal(none.unit, '');
  const bed = ex.read('SIN_R', 8, renv({ lens: 'velocity', veinShown: (e) => EDGES.find((x: { id: string; kind: string }) => x.id === e)?.kind === 'liver' }));
  assert.equal(bed.note, 'microcirculation');
  const closed = ex.read('SMV', 8, renv({ lens: 'velocity', veinShown: () => false }));
  assert.equal(closed.note, 'collaterals closed');
  assert.deepEqual(ex.read('HA', 8, renv()), ex.read('HA', 9, renv({ presenting: true })), 'the hepatic artery is its name only');
});

test('the layout reserves what follows the name: a unit, a badge and an alert widen the box, and the pressure\'s unit is the first thing a short label lets go', () => {
  const vp = mac, plain = lineSize(stationRuns('Portal vein', true, false), vp, measure).w;
  const unit = lineSize(stationRuns('Portal vein', true, false, '00.0', { value: '00.0', unit: 'mmHg' }), vp, measure).w;
  const badge = lineSize(stationRuns('Portal vein', true, false, '00.0', { value: '00.0', unit: 'mmHg', delta: '+00.0' }), vp, measure).w;
  assert.ok(plain < unit && unit < badge);
  const w = world(mac, { extras: (_n: string, _P: number | null, f: { presenting: boolean }) => ({ lens: 'pressure', number: null, unit: f.presenting ? 'mmHg' : '', delta: '', up: false, alert: '', note: '' }) }, { presenting: true, shown: new Set(['CONF']) });
  w.step();
  const d = w.byId('CONF')!;
  assert.equal(d.unit, 'mmHg');
  const forms = w.ctl.stationForms(w.ctl.active()[0]!.station, false, 'v', { value: '00.0', unit: 'mmHg', delta: '+00.0' });
  assert.ok(forms.length >= 4 && forms[forms.length - 1]!.bare && forms[0]!.w > forms[forms.length - 1]!.w, 'whole, then abbreviated, then without the unit and the badge');
});

// ── 22–24: labels ride the camera, cross over, fade at cards and the edge ──
const shown = { presenting: true, shown: new Set(['CONF', 'RHV', 'SIN_R']), named: new Set<string>() };
test('labels ride the camera in flight: they stay drawn and follow their dots, then are placed again where it lands', () => {
  const w = world(mac, {}, shown);
  w.step();
  const before = w.byId('CONF')!, ids = w.names();
  assert.ok(ids.length >= 2);
  w.set({ moving: true });
  for (let i = 0; i < 20; i++) { w.set({ dx: i * 6 }); w.step(16); }
  const now = w.byId('CONF')!;
  assert.ok(now && now.alpha > 0.99, 'still drawn in flight');
  assert.ok(Math.abs(now.x - before.x - 19 * 6) < 1.5, `carried by its dot: moved ${now.x - before.x} px`);
  assert.ok(Math.abs(now.dot!.x - before.dot!.x - 19 * 6) < 1.5);
  w.set({ moving: false });
  w.step(800);
  assert.deepEqual(w.names(), ids, 'the same names stand once it has landed');
});

test('a dot that jumps (a cut) is not carried: every label leaves and comes back once the picture is still', () => {
  const w = world(mac, {}, shown);
  w.step();
  const ids = w.names();
  w.set({ dx: 400 });
  w.step(160);
  assert.equal(w.names().length, 0, 'gone');
  w.step(FADE.settleMs + 900);
  assert.deepEqual(w.names(), ids);
});

test('a label that is no longer asked for leaves at once, even while the camera is moving; one that comes in waits for the picture to be still', () => {
  const w = world(mac, {}, shown);
  w.step();
  w.set({ moving: true });
  w.ctl.setState({ ...NO_STATE, ...shown, shown: new Set(['CONF', 'SV']) });
  w.step(300);
  assert.ok(!w.names().includes('RHV'), 'RHV is gone while the camera moves');
  assert.ok(!w.names().includes('SV'), 'SV waits for the landing');
  w.set({ moving: false });
  w.step(900);
  assert.ok(w.names().includes('SV'));
});

test('a label that comes to stand under a card or past the edge fades out whole in 160 ms (never cut), and comes back once it stands clear', () => {
  const w = world(mac, {}, shown);
  w.step();
  const d = w.byId('RHV')!;
  const card = { x0: d.x - 5, y0: d.y - 5, x1: d.x + d.w + 5, y1: d.y + d.h + 5 };
  w.set({ moving: true, blockers: [card] });   // (a card slides in while the camera carries the labels: they are not placed again until it lands)
  w.step(48);
  const mid = w.byId('RHV');
  assert.ok(!mid || (mid.alpha > 0 && mid.alpha < 1), 'it is easing out, not gone in one frame');
  w.step(FADE.roomMs + 64);
  assert.equal(w.byId('RHV'), undefined, 'out whole');
  w.set({ blockers: [] });
  w.step(FADE.roomMs + 64);
  assert.ok(w.byId('RHV')!.alpha > 0.99, 'back once clear');
  w.set({ moving: false });
  // past the edge
  const e = world({ ...mac, w: 700 }, { view: () => ({ x0: 0, y0: 56, x1: 700, y1: 900 }) } as Partial<LabelDeps>, shown);
  e.step();
  e.set({ moving: true });
  let partial = false;
  for (let i = 1; i <= 60; i++) { e.set({ dx: -i * 20 }); e.step(16); if (e.ctl.out.some((x) => x.kind === 'station' && x.alpha > 0.02 && x.alpha < 0.98)) partial = true; }
  assert.equal(e.names().length, 0, 'carried off the edge: every label has faded out');
  assert.ok(partial, 'and they eased out, none shown cut');
});

test('a label wanted at a new spot is drawn twice while it crosses over, the old picture as it was and the new, their shares summing to one', () => {
  const w = world(mac, {}, shown);
  w.step();
  const before = w.byId('CONF')!;
  // a card comes in near the label's spot: the solver puts it elsewhere
  w.set({ blockers: [{ x0: before.x - 8, y0: before.y - 8, x1: before.x + before.w + 8, y1: before.y + before.h + 8 }] });
  let saw = false;
  for (let i = 0; i < 80; i++) {
    w.step(16);
    const main = w.ctl.out.find((x) => x.id === 'CONF' && !x.ghost), ghost = w.ctl.out.find((x) => x.id === 'CONF~old');
    if (ghost && main) { saw = true; assert.ok(Math.abs(main.mix + ghost.mix - 1) < 1e-9); assert.equal(ghost.dot, null); assert.ok(main.dot, 'the ring stays'); }
  }
  assert.ok(saw || w.byId('CONF') === undefined, 'crossed over (or the card took the label away)');
});
