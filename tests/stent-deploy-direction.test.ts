// A stent deploys from its distal end to its proximal one (owner, 26 Nov 2026: "the stent should deploy from distal (portal end) to proximal (hepatic vein end)"): the front opens at the portal vein end first
// and reaches the hepatic vein end last. Root cause: no stent had a direction at all, each one faded in whole. ONE rule now (stent-deploy.ts): the stent's paths carry their place along the stent in uv.x
// (Ring.u, 0 at the portal end of the shunt's own course), one front (`reveal`) cuts every part alike, and the TIPS and DIPS stents, a vein's stent and the Circuit's all take their front from `stentDeploy`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './device-clock.ts';
import { createShared } from '../src/scene/materials/cel.ts';
import { StentDevice } from '../src/scene/devices/stent/stent-device.ts';
import { VeinStent } from '../src/scene/devices/stent/vein-stent.ts';
import { STENT_DEPLOY_MS, stentDeploy } from '../src/scene/devices/stent/stent-deploy.ts';
import { courseOf } from '../src/scene/vessels/network.ts';
import { indexOf, EDGE_COUNT } from '../src/engine/vessel-data.ts';
import { EDGES } from '../src/engine/hales/portal/topology.js';
import type { DeviceObject } from '../src/scene/devices/device-object.ts';

const front = (o: DeviceObject): number => o.toon.uniforms.reveal!.value as number;
/** How far from the stent's portal end the furthest part still shown reaches (scene units): vertices whose place along the stent is behind the front. */
function reach(o: DeviceObject, from: { x: number; y: number; z: number }): number {
  const g = o.toonMesh.geometry, pos = g.getAttribute('position'), uv = g.getAttribute('uv'), f = front(o);
  let far = 0;
  for (let i = 0; i < pos.count; i++) if (uv.getX(i) <= f) far = Math.max(far, Math.hypot(pos.getX(i) - from.x, pos.getY(i) - from.y, pos.getZ(i) - from.z));
  return far;
}

test('the deploy rule: the front only moves one way with the opening, from nothing to the whole stent, and the stent is faded in before the front is far', () => {
  assert.equal(stentDeploy(0).front, 0); assert.equal(stentDeploy(1).front, 1); assert.equal(stentDeploy(1).alpha, 1); assert.equal(stentDeploy(0).alpha, 0);
  let prev = -1, prevA = -1;
  for (let i = 0; i <= 100; i++) { const d = stentDeploy(i / 100); assert.ok(d.front >= prev - 1e-12 && d.alpha >= prevA - 1e-12); prev = d.front; prevA = d.alpha; }
  assert.ok(stentDeploy(0.1).front < 0.05 && stentDeploy(0.1).alpha > 0.99, 'whole in strength while the front has hardly started');
});

for (const id of ['TIPS', 'DIPS'] as const) {
  test(`${id}: the stent opens from the portal end first and reaches the hepatic vein end last, over time`, () => {
    const e = (EDGES as { id: string; from: string; to: string }[]).find((x) => x.id === id)!;
    assert.ok(/^(RPV|PVH)/.test(e.from), `${id}'s course starts at the portal vein (${e.from}), so uv.x = 0 is the portal end`);
    const st = new StentDevice(id, createShared());
    const D = new Float32Array(EDGE_COUNT); D[indexOf(id)] = 8;
    st.sync({ D } as never, null, false);
    assert.equal(st.goal, 1); assert.equal(st.amount, 0);
    const pts = courseOf(id), portal = { x: pts[0]![0], y: pts[0]![1], z: pts[0]![2] };
    // every part of the stent (wires, graft, band, tab) carries its place along the stent, 0 at the portal end to 1 at the other
    for (const o of [st.wires, st.graft, st.gold, st.back]) {
      const uv = o.toonMesh.geometry.getAttribute('uv'); let lo = 1, hi = 0;
      for (let i = 0; i < uv.count; i++) { lo = Math.min(lo, uv.getX(i)); hi = Math.max(hi, uv.getX(i)); }
      assert.ok(hi - lo > 0.4, `a part spans the stent's length in uv.x (${lo.toFixed(2)} to ${hi.toFixed(2)})`);
    }
    const reaches: number[] = [], fronts: number[] = [];
    for (let t = 0; t <= STENT_DEPLOY_MS + 100; t += 50) {
      st.update(t === 0 ? 0 : 50);
      reaches.push(reach(st.wires, portal)); fronts.push(front(st.wires));
    }
    assert.equal(st.amount, 1);
    for (let i = 1; i < reaches.length; i++) {
      assert.ok(reaches[i]! >= reaches[i - 1]! - 1e-9, `the deployed front never goes back toward the portal end (step ${i})`);
      assert.ok(fronts[i]! >= fronts[i - 1]! - 1e-12);
    }
    const whole = reaches[reaches.length - 1]!, third = reaches[Math.floor(reaches.length / 3)]!, tenth = reaches[Math.floor(reaches.length / 10)]!;
    assert.ok(reaches[0]! < whole * 0.2, 'at the start only the portal end is open');
    assert.ok(tenth < third && third < whole, `it opens progressively: ${tenth.toFixed(4)} < ${third.toFixed(4)} < ${whole.toFixed(4)}`);
    // the hepatic end is shown last: the stent's first quarter (the front at 0.25) lies well short of its far end
    const g = st.wires.toonMesh.geometry, pos = g.getAttribute('position'), uv = g.getAttribute('uv');
    let farthestAtQuarter = 0; const q = 0.25;
    for (let i = 0; i < pos.count; i++) if (uv.getX(i) <= q) farthestAtQuarter = Math.max(farthestAtQuarter, Math.hypot(pos.getX(i) - portal.x, pos.getY(i) - portal.y, pos.getZ(i) - portal.z));
    assert.ok(farthestAtQuarter < whole * 0.6, `the first quarter lies at the portal end (${farthestAtQuarter.toFixed(4)} of ${whole.toFixed(4)})`);
  });
}

test('the shadow and every part of the stent take the one front', () => {
  const st = new StentDevice('TIPS', createShared());
  const D = new Float32Array(EDGE_COUNT); D[indexOf('TIPS')] = 8;
  st.sync({ D } as never, null, false);
  st.update(STENT_DEPLOY_MS * 0.4);
  const f = front(st.wires);
  assert.ok(f > 0.05 && f < 0.95, `mid-deploy (${f})`);
  for (const o of st.objects) assert.equal(front(o), f, 'every part has the one front');
  assert.equal(st.graft.shadow!.material.uniforms.reveal!.value, f, 'the sleeve\'s shadow shares it');
});

test('a stent in a vein opens the same way (the same rule), from the course\'s start', () => {
  const v = new VeinStent('RHV_IVC', createShared());
  v.want(true, false);
  v.update(STENT_DEPLOY_MS * 0.4);
  const f = v.wires.toon.uniforms.reveal!.value as number;
  assert.ok(f > 0.05 && f < 0.95, `mid-deploy (${f})`);
  const uv = v.wires.toonMesh.geometry.getAttribute('uv'); let hi = 0;
  for (let i = 0; i < uv.count; i++) hi = Math.max(hi, uv.getX(i));
  assert.ok(hi > 0.9, 'its wires carry their place along the stent');
});
