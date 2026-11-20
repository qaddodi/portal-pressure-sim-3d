import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeHighlight as walk, outlineStrength, DEFAULT_RANGE, END_FADE, Highlight, type HighlightEdge, type HighlightRange } from '../src/scene/highlight.ts';
import { CelScene } from '../src/scene/scene.ts';

// the flow walk past the ends, when asked for (a pick asks for none: DEFAULT_RANGE is 0)
const WALK: HighlightRange = { ahead: 0.5, behind: 0.2 };
const computeHighlight = (pick: string | readonly string[], e: readonly HighlightEdge[]) => walk(pick, e, WALK);
const edges = (() => { const s = new CelScene(); const e = s.vessels.map((o) => o.edge!); s.dispose(); return e; })();

test('a picked vessel is always on, whole, and a vein the engine cuts in pieces is one vein', () => {
  const m = computeHighlight(['PV_TRUNK_1', 'PV_TRUNK'], edges);
  assert.equal(m.get('PV_TRUNK')?.dir, 0);
  assert.equal(m.get('PV_TRUNK_1')?.dir, 0);
  assert.equal(outlineStrength({ dir: 0, offset: 0 }, 0.5, 1), 1);
});

test('a pick runs on into nothing by default (the range is none), and the vein\'s own line fades away at its two outer ends and comes to full a fade in', () => {
  assert.deepEqual(DEFAULT_RANGE, { ahead: 0, behind: 0 });
  const m = walk(['PV_TRUNK_1', 'PV_TRUNK'], edges);
  assert.deepEqual([...m.keys()].sort(), ['PV_TRUNK', 'PV_TRUNK_1'], 'only the vein itself');
  const a = m.get('PV_TRUNK')!, b = m.get('PV_TRUNK_1')!;
  const len = edges.filter((e) => e.id === 'PV_TRUNK' || e.id === 'PV_TRUNK_1').reduce((t, e) => t + e.length, 0);
  assert.ok(Math.abs(a.fade! - END_FADE * len) < 1e-9);
  // the shader's line at a distance d from the nearest outer end: 0 at the end, 1 a fade in (smoothstep)
  const at = (d: number) => { const t = Math.min(1, Math.max(0, d / a.fade!)); return t * t * (3 - 2 * t); };
  assert.equal(at(0), 0); assert.equal(at(a.fade!), 1); assert.ok(at(a.fade! / 2) > 0.4 && at(a.fade! / 2) < 0.6);
  // exactly one end of each piece is an outer end, the other runs on into the other piece
  const outer = [a, b].map((x) => [x.start === 0, x.end === 0]);
  assert.equal(outer.flat().filter(Boolean).length, 2, 'the vein has two outer ends');
  for (const x of [a, b]) for (const v of [x.start!, x.end!]) assert.ok(v === 0 || v < 1e3, 'a joint is a distance along the vein, not a fade');
});

test('a lone vessel fades at both its ends; the lit set of a shunt\'s targets has no fade (whole)', () => {
  const m = walk('V_KID_L', edges).get('V_KID_L')!;
  assert.equal(m.start, 0); assert.equal(m.end, 0); assert.ok(m.fade! > 0);
  const s = new CelScene();
  s.highlight.setOnly(['V_KID_L']);
  const u = s.vessels.find((o) => o.edge!.id === 'V_KID_L')!.ink.uniforms;
  assert.deepEqual((u.hiEnds!.value as { x: number; y: number }).x, 1e3, 'targets are whole: no end to fade');
  s.dispose();
});

test('the outline runs on downstream through both portal branches (when a range is asked for)', () => {
  const m = computeHighlight(['PV_TRUNK_1', 'PV_TRUNK'], edges);
  assert.equal(m.get('PVH_R')?.dir, 1);
  assert.equal(m.get('PVH_L')?.dir, 1);
  assert.equal(m.get('PVH_R')?.offset, 0);
  assert.ok(m.get('PVH_R_1')!.offset > 0, 'the next piece starts where the first ends');
});

test('and reaches only a short way upstream: the three feeding veins, nothing further', () => {
  const m = computeHighlight(['PV_TRUNK_1', 'PV_TRUNK'], edges);
  for (const id of ['SV_CONF', 'SMV_CONF', 'LGV_CONF']) assert.equal(m.get(id)?.dir, -1, id);
  assert.equal(m.has('SV_MID'), false, 'the mid splenic vein is further back than "short behind"');
});

test('long ahead, short behind: the same distance is stronger ahead than behind', () => {
  const d = 0.15;
  const ahead = outlineStrength({ dir: 1, offset: 0 }, d, 5, WALK);
  const behind = outlineStrength({ dir: -1, offset: 0 }, 5 - d, 5, WALK);
  assert.ok(ahead > 0.75 && behind < 0.2, `ahead ${ahead.toFixed(2)} behind ${behind.toFixed(2)}`);
});

test('the outline fades to nothing by the end of its range', () => {
  assert.ok(outlineStrength({ dir: 1, offset: WALK.ahead }, 0, 1, WALK) < 0.001);
  assert.ok(outlineStrength({ dir: 1, offset: 0 }, 0, 1, WALK) > 0.999);
  const a = outlineStrength({ dir: 1, offset: 0 }, 0.1, 5, WALK), b = outlineStrength({ dir: 1, offset: 0 }, 0.3, 5, WALK);
  assert.ok(a > b, 'monotone fade');
});

test('a hepatic vein pick runs on into the cava and the atrium', () => {
  const m = computeHighlight(['RHV_IVC_1', 'RHV_IVC'], edges);
  assert.equal(m.get('IVCS_RA')?.dir, 1);
});

test('nothing else is dimmed: only the pick uniforms ever change', () => {
  const s = new CelScene();
  const toonBefore = s.vessels.map((o) => [o.toon.uniforms.color.value.getHex(), o.toon.uniforms.shade.value.getHex()]);
  s.pick('PV_TRUNK');
  assert.equal(s.highlight.picked, 'PV_TRUNK');
  let t = 0; while (s.highlight.step(16)) t += 16; assert.ok(t < 600);
  const toonAfter = s.vessels.map((o) => [o.toon.uniforms.color.value.getHex(), o.toon.uniforms.shade.value.getHex()]);
  assert.deepEqual(toonAfter, toonBefore);
  const pv = s.vessels.find((o) => o.edge!.id === 'PV_TRUNK')!;
  assert.equal(pv.toon.uniforms.inflate.value, 0, 'the pick does not grow the tube (glow-hull.test.ts: the dark bands)');
  assert.equal(pv.ink.uniforms.hiOn.value, 1);
  const first = s.vessels.find((o) => o.edge!.id === 'PV_TRUNK_1')!;
  assert.equal(first.ink.uniforms.hiOn.value, 1, 'picking either piece picks the whole vein');
  const other = s.vessels.find((o) => o.edge!.id === 'V_KID_L')!;   // (a vein on no flow path from the portal trunk; the hepatic veins lie within its range at the 2D figure's own scale)
  assert.equal(other.ink.uniforms.hiOn.value, 0);
  s.pick(null);
  while (s.highlight.step(16)) { /* fade out */ }
  assert.equal(pv.ink.uniforms.hiOn.value, 0);
  assert.equal(pv.toon.uniforms.inflate.value, 0);
  s.dispose();
});

test('the highlight reports motion only while fading, so a still scene draws nothing', () => {
  const s = new CelScene();
  assert.equal(s.highlight.step(16), false);
  s.highlight.set('PV_TRUNK');
  assert.equal(s.highlight.step(16), true);
  while (s.highlight.step(16)) { /* settle */ }
  assert.equal(s.highlight.step(16), false);
  s.dispose();
});

test('Highlight ignores ids it does not draw', () => {
  const s = new CelScene();
  const h = new Highlight(s.vessels);
  h.set('NOT_A_VESSEL');
  assert.equal(h.picked, null);
  s.dispose();
});
