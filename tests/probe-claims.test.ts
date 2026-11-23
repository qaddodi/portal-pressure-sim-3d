// Labels keep clear of the settled Doppler probe (owner, 23 Nov 2026: "labels should be clear of it if possible"): its footprint (body, line of sight, gate) is a blocker for the label solver and the figure's cards,
// stable under the view's small drift so it does not ask the solver again each frame, and gone as soon as the probe leaves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { createShared } from '../src/scene/materials/cel.ts';
import { DopplerProbe } from '../src/scene/devices/probes/doppler-probe.ts';
import { probeClaims } from '../src/scene/labels/probe-claims.ts';
import { solve } from '../src/scene/labels/solver.ts';
import type { Box, ScreenEnv } from '../src/scene/devices/probes/screen.ts';

const st = { s: 560, cx: 380, cy: 760, dx: 0, dy: 0 };
const env: ScreenEnv = {
  project: (p: Vector3, out) => { out.x = st.cx + st.dx + p.x * st.s; out.y = st.cy + st.dy - p.y * st.s; return out; },
  size: () => ({ w: 1180, h: 820 }), cards: () => [{ x0: 760, y0: 80, x1: 1170, y1: 760 }], avoid: () => [], moving: () => false, presenting: () => true,
};
function stand(d: DopplerProbe, on = true, ms = 2500, from = 0): number {
  let now = from;
  for (let t = 0; t < ms; t += 16) { now += 16; d.update(16, on, 'PV_TRUNK', null, env, now); }
  return now;
}
const foot = (d: DopplerProbe): Box[] => { const o: Box[] = []; d.footprint(o); return o; };
const hit = (a: Box, b: Box): boolean => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

test('a settled probe claims its body, its line of sight and its gate; none before it stands, none after it leaves', () => {
  const d = new DopplerProbe(createShared());
  assert.equal(foot(d).length, 0);
  let now = stand(d);
  const f = foot(d), body = d.bodyBox, g = d.gateAtScreen;
  assert.ok(f.length >= 3, `boxes: ${f.length}`);
  assert.ok(f.some((b) => hit(b, body)), 'the body is claimed');
  assert.ok(f.some((b) => g.x >= b.x0 && g.x <= b.x1 && g.y >= b.y0 && g.y <= b.y1), 'the gate is claimed');
  stand(d, false, 2500, now);
  assert.equal(foot(d).length, 0, 'gone once it has left');
  d.dispose();
});

test('the claim does not change under the view\'s small drift (it would ask the solver again every frame)', () => {
  const d = new DopplerProbe(createShared());
  let now = stand(d);
  probeClaims.set(foot(d));
  let last = probeClaims.boxes, changes = 0;
  const N = 120;
  for (let t = 0; t < N; t++) {
    st.dx = 1.2 * Math.sin(t / 9); st.dy = 1 * Math.cos(t / 7) - 1;
    now += 16; d.update(16, true, 'PV_TRUNK', null, env, now);
    probeClaims.set(foot(d));
    if (probeClaims.boxes !== last) { changes++; last = probeClaims.boxes; }
  }
  st.dx = 0; st.dy = 0;
  assert.ok(changes <= 4, `the claim changed ${changes} times in ${N} frames of a 1 px drift`);
  d.dispose();
});

test('a name whose best spot is under the probe is placed clear of it; without the claim it stands there', () => {
  const d = new DopplerProbe(createShared());
  stand(d);
  const f = foot(d), b = d.bodyBox;
  // a dot just right of the probe's line of sight, whose preferred side (west) is the probe itself
  const it = { id: 'X', ax: b.x1 + 82, ay: (b.y0 + b.y1) / 2, au: 0.5, forms: [{ text: 'Portal vein', w: 90, h: 20 }], pri: 1, must: true, dirs: ['W'] as never, vw: 3 };
  assert.ok(!f.some((c) => it.ax >= c.x0 && it.ax <= c.x1 && it.ay >= c.y0 && it.ay <= c.y1), 'the dot itself is clear of the claim');
  const view = { x0: 0, y0: 0, x1: 1180, y1: 820 };
  const boxOf = (p: { dx: number; dy: number; w: number; h: number }): Box => ({ x0: it.ax + p.dx, y0: it.ay + p.dy, x1: it.ax + p.dx + p.w, y1: it.ay + p.dy + p.h });
  const free = solve({ items: [it], view, blockers: [] }).placed[0]!, claimed = solve({ items: [it], view, blockers: f }).placed[0];
  assert.ok(f.some((c) => hit(boxOf(free), c)), 'without the claim the name stands over the probe');
  assert.ok(claimed, 'with it, it still has a place');
  assert.ok(!f.some((c) => hit(boxOf(claimed!), c)), 'with the claim it stands clear of every box of the probe');
  d.dispose();
});

test('the label layer and the figure\'s cards both read the claim, and only the solve does (a label already there is eased away, not faded out whole)', () => {
  const layer = readFileSync(new URL('../src/scene/labels/LabelLayer.tsx', import.meta.url), 'utf8');
  assert.match(layer, /claims: \(\) => probeClaims\.boxes/);
  assert.match(layer, /scopeClaims\.boxes, probeClaims\.boxes/, 'the figure\'s cards keep clear of it too');
  const ctl = readFileSync(new URL('../src/scene/labels/controller.ts', import.meta.url), 'utf8');
  assert.match(ctl, /blockers = \[\.\.\.d\.blockers\(\), \.\.\.\(d\.claims\?\.\(\) \?\? \[\]\)\]/);
  assert.match(ctl, /const roomBlk = \[\.\.\.d\.blockers\(\)\]/, 'the fade-out-under-a-card rule does not use the probe\'s claim');
  const lay = readFileSync(new URL('../src/scene/devices/probes/layer.ts', import.meta.url), 'utf8');
  assert.match(lay, /probeClaims\.set\(this\.claim\)/);
});
