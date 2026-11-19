import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { buildStent, lumenShare, type StentSpec } from '../src/scene/devices/stent/stent-build.ts';
import { mergeTubes } from '../src/scene/devices/tube-rings.ts';
import { CelScene } from '../src/scene/scene.ts';
import { indexOf } from '../src/engine/vessel-data.ts';
import { LUMEN_STEP, WAIST_STEP, profileAt, waistSpan } from '../src/engine/hales/portal/stent-geom.js';
import { bareOf } from '../src/scene/procedures/copied/stent-mesh.js';

const straight = (over: Partial<StentSpec> = {}): StentSpec => ({
  at: (a, o) => o.set(a, 0, 0), tan: (_a, o) => o.set(1, 0, 0), A: 1, R: 0.03, lenCm: 8,
  geom: { len: 8, waist: 0, trans: 0, red: 0 }, s: 0, site: 5 / 6, covered: true, ...over,
});

test('the steps are the 2D app\'s: 0.5 cm for the waist, 0.5 mm for a lumen', () => {
  assert.equal(WAIST_STEP, 0.5);
  assert.equal(LUMEN_STEP, 0.5);
});

test('the waist is always mid stent, and the lumen share is the engine\'s profileAt', () => {
  const spec = straight({ geom: { len: 8, waist: 3, trans: 1, red: 0.4 } });
  const p = buildStent(spec);
  const w = waistSpan(spec.geom) as { c: number };
  assert.equal(w.c, 0.5, 'centred');
  for (let i = 0; i < p.profile.length; i++) assert.ok(Math.abs(p.profile[i]! - lumenShare(spec, i / (p.profile.length - 1))) < 1e-6);
  const min = Math.min(...p.profile), at = p.profile.indexOf(min) / (p.profile.length - 1);
  assert.ok(Math.abs(min - 0.6) < 1e-6, 'a 0.4 reduction leaves 0.6');
  assert.ok(Math.abs(at - 0.5) < 0.2, 'the flat of the waist surrounds the middle');
  assert.equal(profileAt(spec.geom, 0, 5 / 6, 0.5), 0.6);
});

test('the end stenosis is short and sits at its end; the waist stays mid and the two are separate', () => {
  const spec = straight({ s: 0.5, site: 5 / 6, geom: { len: 8, waist: 2, trans: 0, red: 0.3 } });
  const p = buildStent(spec);
  assert.ok(lumenShare(spec, 5 / 6) <= 0.5 + 1e-9, 'distal end narrowed to half');
  assert.ok(Math.abs(lumenShare(spec, 0.5) - 0.7) < 1e-9, 'the waist is untouched by it');
  assert.ok(lumenShare(spec, 0.05) === 1, 'the open stent is whole');
  assert.ok(p.profile.length > 10);
});

test('a covered stent has a bare stretch of 2 of its 8 cm at the portal end, a graft, a gold band and a gold tab', () => {
  const p = buildStent(straight());
  assert.ok(Math.abs(p.bareEnd - bareOf(1, 8)) < 1e-9, `bare ${p.bareEnd}`);
  assert.ok(Math.abs(p.bareEnd - 0.25) < 1e-9);
  assert.ok(p.graft.length > 4 && p.graftEnd > p.bareEnd && p.graftEnd <= 1);
  assert.ok(p.band.length > 8, 'gold band');
  assert.ok(p.tab.length >= 2, 'gold tab');
  assert.ok(p.wires.length >= 6, `rings ${p.wires.length}`);
  // every wire stays on the cylinder it sits on: its distance from the axis is the lumen's radius there
  for (const w of p.wires) for (const r of w) { const d = Math.hypot(r.c.y, r.c.z); assert.ok(d <= 0.03 + 1e-9 && d > 0.03 * 0.2, `radius ${d}`); }
});

test('the wires of the bare stretch are nested so their crowns touch: every other ring turned half a crown', () => {
  const p = buildStent(straight());
  const bareRings = p.wires.filter((w) => w[0]!.c.x < p.bareEnd - 1e-6);
  assert.ok(bareRings.length >= 2);
  const peak = (w: typeof bareRings[number]) => w.reduce((m, r) => (r.c.x > m ? r.c.x : m), -1);
  assert.ok(peak(bareRings[0]!) > 0 && bareRings.every((w) => w.length > 20));
});

test('wires merge into one geometry (one draw) with the attributes the cel shaders read', () => {
  const p = buildStent(straight());
  const g = mergeTubes(p.wires.map((w) => w.map((r) => ({ ...r, r: p.wireR }))), 6);
  for (const n of ['position', 'normal', 'uv', 'tang']) assert.ok(g.getAttribute(n), n);
  assert.ok(g.index!.count > 0 && g.getAttribute('position').count > 100);
  const empty = mergeTubes([], 6);
  assert.equal(empty.drawRange.count, 0);
});

test('the TIPS stent is in while the shunt is as wide as a stent (D >= 3 mm), out when it is not, and the vessel carries the narrowing', () => {
  const s = new CelScene();
  const st = s.procs.stents.get('TIPS')!;
  assert.ok(st && s.procs.stents.get('DIPS'));
  const k = indexOf('TIPS'), D = new Float32Array(400);
  D[k] = 8;
  const params = { stentGeom: { TIPS: { len: 8, waist: 2, trans: 0, red: 0.4 } } };
  assert.equal(st.group.visible, false);
  s.procs.syncStents({ D }, params, true);
  assert.equal(st.goal, 1);
  assert.equal(st.amount, 1);
  st.update(16);
  assert.equal(st.group.visible, true);
  const narrow = s.vesselObject('TIPS')!.toonMesh.geometry.getAttribute('narrow');
  assert.ok(narrow, 'the vessel has the narrowing attribute');
  let max = 0; for (let i = 0; i < narrow.count; i++) max = Math.max(max, narrow.getX(i));
  assert.ok(Math.abs(max - 0.4) < 0.02, `the waist narrows the lumen by 0.4 (${max})`);
  D[k] = 0;
  s.procs.syncStents({ D }, params);
  assert.equal(st.goal, 0);
  for (let i = 0; i < 40; i++) st.update(30);
  assert.equal(st.group.visible, false, 'eased out');
  s.dispose();
});

test('a different diameter rebuilds the stent at the lumen\'s own width', () => {
  const s = new CelScene();
  const st = s.procs.stents.get('DIPS')!;
  const D = new Float32Array(400); D[indexOf('DIPS')] = 6;
  s.procs.syncStents({ D }, {}, true);
  const r6 = st.paths!.u;
  D[indexOf('DIPS')] = 10;
  s.procs.syncStents({ D }, {}, true);
  assert.ok(st.paths!.u > r6, 'a wider stent is built at a wider lumen');
  s.dispose();
});

test('Vector3 positions are finite everywhere', () => {
  const p = buildStent(straight({ geom: { len: 8, waist: 4, trans: 2, red: 0.7 }, s: 0.8, site: 1 / 6 }));
  for (const w of [...p.wires, p.graft, p.band, p.tab]) for (const r of w) assert.ok(Number.isFinite(r.c.x + r.c.y + r.c.z) && r.c instanceof Vector3);
});
