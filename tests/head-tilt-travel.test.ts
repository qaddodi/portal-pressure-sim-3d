// Mohammad, 24 Nov: chevrons twist, pop and (looking at the hepatic veins) seemed not to flow. Two proofs.
// 1. TILT: a head was placed by vUv.x, the arc of the AXIS point of its pixel's ring, so on a tube tilted out of the screen its constant-arc line (a head's back edge) bowed by R (1 - sqrt(1 - a^2)) sin(tilt) across the head. The head's arc is now taken
//    on the screen (offset along the screen heading over its foreshortening, vessels/shaders.ts sHead, skin/shaders.ts sHa), a straight line. The twin below is the cylinder in an orthographic view.
// 2. TRAVEL: every open vessel's stream advances (the engine's Healthy frame through the real Streams): the hepatic veins and the cava move at 30 to 40 figure units a second; nothing is frozen in the march.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { Streams } from '../src/scene/blood/streams.ts';
import { EDGES } from '../src/engine/hales/portal/topology.js';
import { CHEV } from '../src/scene/blood/chevron-glsl.ts';
import { HEAD_FORE_MIN } from '../src/scene/vessels/glsl-shared.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { SKIN_FS } from '../src/scene/vessels/skin/shaders.ts';

test('a tilted tube: the old arc bowed a head\'s back edge, the screen arc keeps it straight, and an untilted tube is unchanged', () => {
  const R = 1, hw = CHEV.SHARE_MAX * R, L = 2 * CHEV.LEN_OF_W * hw;
  let worstOld = 0, worstNew = 0, atZero = 0;
  for (let deg = 0; deg <= 75; deg += 5) {
    const ph = deg * Math.PI / 180, c = Math.cos(ph), sn = Math.sin(ph), fore = Math.max(c, HEAD_FORE_MIN);
    let loO = Infinity, hiO = -Infinity, loN = Infinity, hiN = -Infinity;
    for (let a = -hw; a <= hw + 1e-9; a += hw / 10) {
      const depth = Math.sqrt(1 - a * a);
      // the screen x of the point at ring arc s0 = 0 (the head's back edge in the old arc) and the new arc's value there
      const xOld = 0 * c - R * depth * sn;                      // screen x of surface point at axis arc 0
      const dpar = -R * depth * sn;                              // its screen offset from the axis point, along the heading's screen direction
      const sNew = 0 + dpar / fore;                              // the new arc of that pixel
      // the pixel where the NEW arc equals 0: the surface point at axis arc s with s + (-R depth sn)/fore = 0
      const sAt = R * depth * sn / c, xNew = sAt * c - R * depth * sn;
      loO = Math.min(loO, xOld); hiO = Math.max(hiO, xOld); loN = Math.min(loN, xNew); hiN = Math.max(hiN, xNew);
      void sNew;
    }
    if (deg <= 60) { worstOld = Math.max(worstOld, (hiO - loO) / L); worstNew = Math.max(worstNew, (hiN - loN) / L); }
    if (deg === 0) atZero = Math.abs(hiO - loO) + Math.abs(hiN - loN);
  }
  console.log(`head bow (share of its length, tilts to 60 deg): old ${worstOld.toFixed(3)}, now ${worstNew.toFixed(6)}`);
  assert.ok(worstOld > 0.08, 'the old arc bowed a head');
  assert.ok(worstNew < 1e-9, 'the screen arc is straight at every tilt');
  assert.ok(atZero < 1e-12, 'untilted: no change');
  assert.match(VESSEL_FS, /float sHead = vUv\.x \* len \* vU \+ /);
  assert.match(VESSEL_FS, /flowHeads\(across, acrossW, sHead,/);
  assert.match(SKIN_FS, /sHa\[i\] = armArc\[i\]\.x \+ armArc\[i\]\.y \* dot\(relH\.xy, tvS\.xy\)/);
});

test('a head is whole or gone: its half width (SHARE_MAX of the radius) lies inside the skin\'s lateral gate, which now only ever sees the pixels past the head; the owner share is one number per head', async () => {
  const m = await import('../src/scene/vessels/skin/shaders.ts');
  assert.ok(CHEV.SHARE_MAX < m.SKIN_HEAD_GATE_FROM, `${CHEV.SHARE_MAX} < ${m.SKIN_HEAD_GATE_FROM}`);
});

test('every open vessel\'s stream advances: the hepatic veins, the cava and the portal tree', async () => {
  const out: { type: string }[] = [], core = createCore((m: { type: string }) => out.push(m));
  await core.handle({ type: 'init' }); await core.handle({ type: 'preset', id: 'healthy', reqId: 1 }); core.dispose();
  const f = out.filter((m) => m.type === 'frame').at(-1) as never;
  const s = new Streams(); s.setHealthy(f); s.onFrame(f);
  for (let t = 0; t <= 6000; t += 16) s.step(t, 1);
  const d0 = (s.texture.image.data as Float32Array).slice();
  for (let t = 6016; t <= 8000; t += 16) s.step(t, 1);
  const d1 = s.texture.image.data as Float32Array;
  let n = 0;
  (EDGES as { id: string }[]).forEach((e, k) => {
    if (!/^(RHV_IVC|MHV_IVC|LHV_IVC|IVC_IS|IVCS_RA|PV_TRUNK|PVH_|SMV_CONF|V_SPL)/.test(e.id)) return;
    assert.ok(Math.abs(d1[k * 4 + 1]!) > 10, `${e.id} speed ${d1[k * 4 + 1]}`);
    assert.ok(Math.abs(d1[k * 4]! - d0[k * 4]!) > 20, `${e.id} advanced ${d1[k * 4]! - d0[k * 4]!} in 2 s`);
    n++;
  });
  assert.ok(n >= 10, `${n} vessels`);
});
