// Mohammad, 24 Nov: chevrons flicker at joins. A head leaving one vessel must land on the next at the SAME phase, so a handoff in a skin shows one chevron, not two. The chain (blood/chain.ts) gives every
// linked vessel a place along its root's stream, se = A + B s, with A made so the child's entry equals the parent's exit (blood.copied.js: sA = pA + pB * sj - B * s0). This pins it for every link of the real network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EDGES } from '../src/engine/hales/portal/topology.js';
import { INFO, StreamChain } from '../src/scene/blood/chain.ts';
import { flowLenAt } from '../src/scene/circuit/mates.ts';
import type { Streams } from '../src/scene/blood/streams.ts';

const ids = (EDGES as { id: string }[]).map((e) => e.id);
const still = (v: number) => ({ stream: () => ({ D: 0, vd: 0, vSlow: v, sgn: 1 }), flowOf: () => 5, moving: true }) as unknown as Streams;

test('at every link, the child\'s place along the root stream at its entry equals the parent\'s at its exit (phase continuous across the join)', () => {
  const c = new StreamChain();
  const drawn = (id: string) => INFO.some((i) => i?.id === id);
  for (let t = 0; t < 4000; t += 16) c.step(t, still(3), drawn);
  const d = c.texture.image.data as Float32Array;
  const NE = ids.length;
  // a vessel's place along its root's stream at its own arc s: through its link (root + 1, A, B), or its own arc where it has none
  const se = (k: number, s: number): number => (d[k * 4 + 3]! > 0.999 ? d[k * 4 + 1]! + d[k * 4 + 2]! * s : s);
  let linked = 0, worst = 0;
  for (let k = 0; k < NE; k++) {
    if (!(c.weightOf(k) > 0.999)) continue;
    const p = c.parentOf(k), ci = INFO[k], pi = INFO[p];
    assert.ok(ci && pi, ids[k]);
    const sj = flowLenAt(pi!.id, pi!.len, 0);   // (every stream runs forward here: it leaves its parent at the parent's far end and enters at the child's start, 0)
    const root = d[k * 4]! - 1, proot = d[p * 4 + 3]! > 0.999 ? d[p * 4]! - 1 : p;
    assert.equal(root, proot, `${ids[k]} and its parent ${ids[p]} read one root`);
    worst = Math.max(worst, Math.abs(se(k, 0) - se(p, sj)));
    linked++;
  }
  assert.ok(linked > 10, `${linked} links`);
  assert.ok(worst < 1e-3, `largest phase gap at a join: ${worst}`);
});
