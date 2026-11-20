// A crossing is not a join (Mohammad, 20 Nov: "the SMV is on TOP of the renal vein so the outline should show... not join"): where two vessels that do not connect overlap on the screen, the nearer one is drawn whole,
// its full outline across the other, because every tube is one opaque depth-tested draw with its own outline and no stencil bit is shared; the join burial (END_R) is only for the declared mates of smooth joins.
// The depth test can only tell them apart if they are not at the same depth where they cross: a pair whose centrelines come closer in z than a quarter of their radii is reported.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK } from '../src/scene/vessels/network.ts';
import { SMOOTH } from '../src/scene/vessels/smooth-joins.ts';
import { CelScene } from '../src/scene/scene.ts';
import { VESSEL_FS, VESSEL_VS } from '../src/scene/vessels/shaders.ts';

const named = (id: string) => NETWORK.find((v) => v.id === id)!;
const connected = (a: (typeof NETWORK)[number], b: (typeof NETWORK)[number]) =>
  a.host === b.host || a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to || SMOOTH.get(a.id)?.mate.includes(b.id) === true || SMOOTH.get(b.id)?.mate.includes(a.id) === true;

/** The closest the two centrelines come in depth where they overlap on the screen (null: they do not overlap). */
function crossing(a: (typeof NETWORK)[number], b: (typeof NETWORK)[number]): { gap: number; need: number } | null {
  const reach = a.radius + b.radius;
  let best: number | null = null;
  for (let i = 0; i < a.pts.length - 1; i++) {
    for (let t = 0; t < 1; t += 0.25) {
      const p = [0, 1, 2].map((k) => a.pts[i]![k]! + (a.pts[i + 1]![k]! - a.pts[i]![k]!) * t);
      for (let j = 0; j < b.pts.length - 1; j++) {
        const q0 = b.pts[j]!, q1 = b.pts[j + 1]!, dx = q1[0]! - q0[0]!, dy = q1[1]! - q0[1]!, L2 = dx * dx + dy * dy || 1;
        const u = Math.min(1, Math.max(0, ((p[0]! - q0[0]!) * dx + (p[1]! - q0[1]!) * dy) / L2));
        if (Math.hypot(p[0]! - (q0[0]! + dx * u), p[1]! - (q0[1]! + dy * u)) >= reach) continue;
        const gap = Math.abs(p[2]! - (q0[2]! + (q1[2]! - q0[2]!) * u));
        if (best === null || gap < best) best = gap;
      }
    }
  }
  return best === null ? null : { gap: best, need: 0.25 * reach };
}

test('no two tubes share anything that would merge a crossing: one opaque depth-tested draw each, no stencil, and the end burial reads only the declared mates', () => {
  const s = new CelScene();
  for (const o of s.vessels) {
    const m = o.toonMesh.material as import('three').ShaderMaterial;
    assert.ok(!m.stencilWrite && m.depthTest !== false && m.depthWrite, `${o.edge!.id}: depth-tested and written, no stencil`);
  }
  s.dispose();
  assert.match(VESSEL_VS, /float endU = min\(mate0\.x >= 0\.0 \? uv\.x : 1e9, mate1\.x >= 0\.0 \? 1\.0 - uv\.x : 1e9\)/, 'the burial reads the mates only');
  assert.match(VESSEL_FS, /float endR = min\(mate0\.x >= 0\.0 \? vUv\.x : 1e9, mate1\.x >= 0\.0 \? 1\.0 - vUv\.x : 1e9\)/);
});

test('where vessels that do not connect cross on the screen, their centrelines are apart in depth (a quarter of their radii at least), so the nearer one\'s whole outline wins the depth test: the SMV over the renal vein above all', () => {
  const smv = NETWORK.filter((v) => v.id.startsWith('SMV') || v.host === 'SMV' || v.id === 'V_INT');
  const renal = NETWORK.filter((v) => v.id === 'V_KID_L' || v.id === 'V_KID_L_1' || v.id === 'LRV_IVC');
  assert.ok(smv.length > 0 && renal.length > 0, 'the vessels are found');
  const problems: string[] = [];
  let crossings = 0;
  for (let i = 0; i < NETWORK.length; i++) {
    for (let j = i + 1; j < NETWORK.length; j++) {
      const a = NETWORK[i]!, b = NETWORK[j]!;
      if (a.feeder || b.feeder || connected(a, b)) continue;
      const c = crossing(a, b);
      if (!c) continue;
      crossings++;
      if (c.gap < c.need) problems.push(`${a.id} x ${b.id}: ${c.gap.toFixed(3)} apart in z, needs ${c.need.toFixed(3)}`);
    }
  }
  assert.ok(crossings > 5, `${crossings} crossings`);
  assert.deepEqual(problems, [], `pairs too close in depth to separate: ${problems.join('; ')}`);
  void named;
});
