// Audit 4.9 (item 25): the TIPS and DIPS stents' own labels and the Doppler's prox / mid / dist velocity column, as the 2D app has them (geomItem, velItem).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { CameraRig } from '../src/scene/camera/rig.ts';
import { lensDistance, type Shot } from '../src/scene/camera/shots.ts';
import { LabelController, NO_STATE, type Draw, type LabelDeps } from '../src/scene/labels/controller.ts';
import { FADE } from '../src/scene/labels/alpha.ts';
import { MM, SHORT, STENT_STATIONS, stentStationById, decodeGeo, encodeGeo, geoId, geoLines, geoSets, geoSize, pointId, pointName, type GeoFacts, type PointRead, type StentView } from '../src/scene/labels/stent-labels.ts';
import { BeatMean, pointVelocity } from '../src/scene/labels/stent-reads.ts';

const mac = { w: 1440, h: 1000, safe: { top: 0, right: 0, bottom: 0, left: 0 } };   // (1000, not 900: the free-play figure is 5 % bigger (Zoom fit, 25 Nov), and on a 900 px screen the stent's middle point lost its place beside its neighbours; the screen was enlarged for the same reason before, see below)
// Since the placed anatomy became the app's (77b24d5a) the whole-body camera of this test world shows the stent small, so the three points and the stent's label do not all find room on the old screens: these two are 1.5 and 2 times the old ones. The label logic is under test, not the camera.
const phone = { w: 393, h: 852, safe: { top: 59, right: 0, bottom: 34, left: 0 } };
const measure: LabelDeps['measure'] = (t, size, _w, track = 0) => t.length * size * 0.56 + track * t.length;

interface Knobs { ready: boolean; only: string | null; all: boolean; sampled: 'proximal' | 'mid' | 'distal' | null; facts: GeoFacts | null; vel: Record<string, PointRead> }
function world(vp = mac, k: Partial<Knobs> = {}, shot: Shot | 'play' = 'play') {
  const knobs: Knobs = { ready: true, only: 'TIPS', all: false, sampled: null, facts: { d: 10, waist: null, wLen: 0, sten: null, end: 'distal' }, vel: {
    proximal: { number: '99', none: false, tint: 'rgb(1, 2, 3)' }, mid: { number: '120', none: false, tint: '' }, distal: { number: 'No flow', none: true, tint: '' } }, ...k };
  const room = { x: 0, y: 0, w: vp.w, h: vp.h };
  const rig = new CameraRig('play', room); rig.resize(vp.w, vp.h); rig.goTo(shot, room, 0, 0); rig.update(0);
  let t = 1000;
  const stents: StentView = { ready: (sid) => knobs.ready && (!knobs.only || knobs.only === sid), all: () => knobs.all, sampled: () => knobs.sampled, facts: () => knobs.facts, read: (_s, p) => knobs.vel[p]! };
  const d = {
    now: () => t, project: (p: Vector3, o: { x: number; y: number }) => rig.project(p, o), cameraMoving: () => false,
    free: () => ({ x0: 0, y0: 0, x1: vp.w, y1: vp.h }), view: () => ({ x0: 0, y0: 56, x1: vp.w, y1: vp.h }), vp: () => vp, reversed: () => false, words: () => null,
    blockers: () => [], measure, pressure: () => 5, reading: () => null, cathere: () => 0, stents: () => stents,
  } as unknown as LabelDeps;
  const ctl = new LabelController(d); ctl.setState({ ...NO_STATE });
  return {
    ctl, knobs, step: (ms = 1200) => { for (let i = 0; i < ms / 16; i++) { t += 16; ctl.tick(); } },
    byId: (id: string): Draw | undefined => ctl.out.find((x) => x.id === id && !x.ghost),
    ids: () => ctl.out.filter((x) => !x.ghost && x.id.startsWith('TIPS') || !x.ghost && x.id.startsWith('DIPS')).map((x) => x.id).sort(),
  };
}

test('MM writes a whole number as one and any other with one decimal (2D MM)', () => {
  assert.equal(MM(10), '10'); assert.equal(MM(9.97), '10'); assert.equal(MM(6.3), '6.3'); assert.equal(MM(5), '5'); assert.equal(MM(5.5), '5.5');
});

test('a stent says its diameter; its waist and end stenosis follow a line each, and shorten by whole lines, end stenosis first', () => {
  const none = geoLines('TIPS', { d: 10, waist: null, wLen: 0, sten: null, end: 'distal' });
  assert.deepEqual(none[0]!.map((r) => r.t), ['TIPS', '10', 'mm']); assert.equal(none.length, 1); assert.equal(geoSets(none).length, 1);
  const full = geoLines('TIPS', { d: 10, waist: 6.3, wLen: 3, sten: 5, end: 'distal' });
  assert.equal(full.length, 3);
  assert.deepEqual(full[1]!.map((r) => r.t), ['6.3', 'mm', '×', '3', 'cm'], 'the waist is its numbers only');
  assert.deepEqual(full[2]!.map((r) => r.t), ['distal stenosis', '5', 'mm']);
  const sets = geoSets(full);
  assert.deepEqual(sets.map((s) => s.length), [3, 2, 1], 'the whole; the end stenosis let go; the stent alone');
  const mid = geoSets(geoLines('DIPS', { d: 9, waist: 6, wLen: 4, sten: null, end: 'distal' }));
  assert.deepEqual(mid.map((s) => s.length), [2, 1]);
});

test('a stent label is taller for every line it has, and a shorter set is never wider', () => {
  const sets = geoSets(geoLines('TIPS', { d: 10, waist: 6.3, wLen: 3, sten: 5, end: 'proximal' }));
  const s = sets.map((l) => geoSize(l, mac, measure));
  assert.ok(s[0]!.h > s[1]!.h && s[1]!.h > s[2]!.h, 'each line adds its height');
  assert.ok(s[0]!.w >= s[1]!.w && s[1]!.w >= s[2]!.w);
});

test('the lines survive being written as one string and read back (a crossfade compares and keeps the old words)', () => {
  const lines = geoLines('TIPS', { d: 10, waist: 6.3, wLen: 3, sten: 5, end: 'proximal' });
  assert.deepEqual(decodeGeo(encodeGeo(lines)), lines);
});

test('a phone writes the three points short, a laptop with the stent named', () => {
  assert.equal(pointName('TIPS', 'proximal', false), 'TIPS proximal'); assert.equal(pointName('DIPS', 'distal', false), 'DIPS distal');
  assert.deepEqual([pointName('TIPS', 'proximal', true), pointName('TIPS', 'mid', true), pointName('TIPS', 'distal', true)], ['Prox', 'Mid', 'Dist']);
  assert.deepEqual(SHORT, { proximal: 'Prox', mid: 'Mid', distal: 'Dist' });
});

test('the stent labels are no station a slide can name: they stand with the stent', () => {
  assert.equal(STENT_STATIONS.length, 8);
  assert.ok(STENT_STATIONS.every((s) => s.stent && !s.vessel && s.node === null));
  assert.ok(STENT_STATIONS.some((s) => s.id === geoId('TIPS')) && STENT_STATIONS.some((s) => s.id === pointId('DIPS', 'mid')));
});

test('a drawn, settled stent has its own label; one not yet settled has none', () => {
  const w = world(mac, { ready: false }); w.step();
  assert.deepEqual(w.ids(), [], 'no stent, no label');
  const v = world(mac, { only: null }); v.step();
  assert.ok(v.byId('TIPS:geo') && v.byId('DIPS:geo'), 'both stents have theirs');
  assert.deepEqual(v.ids().filter((i) => !i.endsWith(':geo')), [], 'the three points only on a slide that reads them');
});

test('a slide that reads the stent at its three points calls all of them out, with the stent label beside', () => {
  const w = world({ ...mac, w: 2880, h: 1800 }, { all: true }); w.step();
  const ids = w.ids().filter((i) => i.startsWith('TIPS'));
  assert.deepEqual(ids, ['TIPS:distal', 'TIPS:geo', 'TIPS:mid', 'TIPS:proximal']);
  assert.equal(w.byId('TIPS:proximal')!.word, 'TIPS proximal');
  assert.equal(w.byId('TIPS:proximal')!.value, '99'); assert.equal(w.byId('TIPS:proximal')!.unit, 'cm/s');
  assert.equal(w.byId('TIPS:proximal')!.tint, 'rgb(1, 2, 3)', 'the number takes the velocity colour');
});

test('an occluded point says "No flow" and no unit; the point the Doppler samples is named in bold', () => {
  const w = world(mac, { all: true, sampled: 'mid' }); w.step();
  const d = w.byId('TIPS:distal')!;
  assert.equal(d.value, 'No flow'); assert.equal(d.unit, '');
  assert.equal(w.byId('TIPS:mid')!.gate, true); assert.equal(w.byId('TIPS:proximal')!.gate, false);
});

test('a phone names the points short', () => {
  // The phone itself, 393 x 852, framed the way a TIPS slide frames the stent (a close shot on its middle, the slide's own camera): the three points stand there, short. On the whole-body framing the stent is 52 px long,
  // the proximal, middle and distal points stand 26 px apart on one spot with the stent's own label, and the solver rightly keeps only what has room (that framing is not what a stent slide shows).
  const mid = stentStationById('TIPS:mid')!.at(0, new Vector3());
  const close: Shot = { yaw: 0, pitch: 0, r: lensDistance(0.9), target: [mid.x, mid.y, mid.z], half: [0.35, 0.35] };
  const w = world(phone, { all: true }, close); w.step();
  const words = ['proximal', 'mid', 'distal'].map((p) => w.byId(`TIPS:${p}`)?.word).filter(Boolean);
  assert.equal(words.length, 3, 'all three stand');
  assert.ok(words.every((x) => ['Prox', 'Mid', 'Dist'].includes(x!)), words.join());
});

test('a stent whose geometry changes crosses its words over (nothing blinks), and one that goes fades out over D_SMALL, never in one frame', () => {
  const w = world(mac); w.step();
  const was = w.byId('TIPS:geo')!.word;
  w.knobs.facts = { d: 10, waist: 6, wLen: 4, sten: null, end: 'distal' };
  w.step(16);
  const mid = w.byId('TIPS:geo')!;
  assert.ok(mid.alpha > 0, 'still there while its words change');
  w.step();
  assert.notEqual(w.byId('TIPS:geo')!.word, was, 'the new words stand');
  assert.ok(decodeGeo(w.byId('TIPS:geo')!.word).length === 2, 'the waist has its own line');
  w.knobs.ready = false;
  w.step(16);
  assert.ok(w.byId('TIPS:geo') && w.byId('TIPS:geo')!.alpha > 0.5, 'a stent that goes is still easing out one frame on');
  w.step(FADE.outMs + 48);
  assert.equal(w.byId('TIPS:geo'), undefined);
});

test('the Doppler samples a stent: its label points at the third the gate reads', () => {
  const w = world(mac); w.step();
  const a = w.byId('TIPS:geo')!.anchor!;
  w.knobs.sampled = 'distal'; w.step();
  const b = w.byId('TIPS:geo')!.anchor!;
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 5, 'the dot moved along the stent');
});

test('a point reads the open stent velocity times its third\'s factor, and the beat mean follows the last few seconds', () => {
  assert.equal(pointVelocity({}, 'TIPS', 'mid', 100), 100 * 1, 'an open stent: every third reads the same');
  const m = new BeatMean();
  assert.equal(m.mean('a', 100, 0), 100);
  assert.equal(m.mean('a', 120, 1000), 110, 'a plain average until tau has passed');
  assert.equal(m.mean('a', 90, 9000), 90, 'a gap of over 3 s starts again');
});

test('a stent\'s labels wait while the state is easing in (they read the glide\'s parameters: "TIPS 8 mm" beside a 10 mm stent, tips-complete 20, 23 Nov review)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/scene/labels/stent-reads.ts', import.meta.url), 'utf8');
  assert.match(src, /!stentOpen\(f, k\) \|\| f\.morphing\) \{ calm\.delete\(sid\); return false; \}/);
});
