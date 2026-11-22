// WP3, open gap 2 of the review, and the ruling on it ("Rulings on WP3"): vessels of ONE network that cross without meeting share one merged mesh and one draw. The depth buffer orders opaque ones and most fades are discard-based, so only a crossing where BOTH vessels
// can be translucent at that place matters; those pairs (`secondDrawPairs`) go into a second draw of their network, drawn after the first. No sorting, no depth peel. WP4 reads the list. Measured on the real skeleton (net/skeleton.ts), centrelines only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skeleton } from '../src/scene/vessels/net/skeleton.ts';
import { buildNetMesh, networksOf } from '../src/scene/vessels/net/mesh.ts';
import { NETWORK } from '../src/scene/vessels/network.ts';
import { fadeOf } from '../src/scene/vessels/fades.ts';

const baseId = (id: string): string => id.split('#')[0]!;
/** Pairs of vessels of one network whose centrelines come closer than the sum of their radii in `pose` without meeting (pieces of one vessel, cut where a shunt joins it, are one vessel and never a crossing). */
export function crossings(pose: 0 | 1): { net: number; a: string; b: string; tones: string; gap: number }[] {
  const sk = skeleton(), out: { net: number; a: string; b: string; tones: string; gap: number }[] = [];
  const meets = (a: number, b: number): boolean => sk.nodes.some((n) => n.edges.some((e) => e.edge === a) && n.edges.some((e) => e.edge === b));
  networksOf(sk).forEach((net, ni) => {
    for (let i = 0; i < net.length; i++) for (let j = i + 1; j < net.length; j++) {
      if (meets(net[i]!, net[j]!)) continue;
      const a = sk.edges[net[i]!]!, b = sk.edges[net[j]!]!, [fa, ca] = a.bones, [fb, cb] = b.bones;
      if (baseId(a.id) === baseId(b.id)) continue;
      let best = Infinity;
      for (let p = 0; p < ca; p++) for (let q = 0; q < cb; q++) {
        const A = sk.bones[fa + p]!, B = sk.bones[fb + q]!;
        best = Math.min(best, Math.hypot(A.pos[pose][0] - B.pos[pose][0], A.pos[pose][1] - B.pos[pose][1], A.pos[pose][2] - B.pos[pose][2]) / (A.r[pose] + B.r[pose]));
      }
      if (best < 1) out.push({ net: ni, a: a.id, b: b.id, tones: `${a.tone}/${b.tone}`, gap: best });
    }
  });
  return out;
}

/** Can this vessel be translucent anywhere in `pose`, in any look, slide or state? A tip or join fade whose alpha drops below 1 (the body), the artery's map fade or a fade the Circuit keeps (the map), or a presence that comes and goes (a shunt, a collateral, a feeder fan, the REX shunt's growth).
 *  An opaque vessel is ordered by the depth buffer, and most fades are discard-based, so only a pair where BOTH sides can blend at that place needs the second draw. */
export function canBlend(id: string, pose: 0 | 1): boolean {
  const v = NETWORK.find((x) => x.id === baseId(id));
  if (!v) return false;
  if (v.kind === 'shunt' || v.kind === 'collateral' || v.kind === 'feeder') return true;   // presence: nothing is created at run time, a vessel that closes eases out
  const f = fadeOf(v.id, v.tone === 'artery', v.feeder?.host);
  if (!f) return false;
  if (pose === 0) return Math.min(f.a0, f.a1) < 1;
  return f.mapFade !== undefined || (f.keep && Math.min(f.a0, f.a1) < 1);
}

/** The pairs that go into the second draw of their network (drawn after the first): crossings where both sides can blend. Nothing is sorted, there is no depth peel. */
export function secondDrawPairs(): { pose: 0 | 1; a: string; b: string }[] {
  const out: { pose: 0 | 1; a: string; b: string }[] = [];
  for (const pose of [0, 1] as const) for (const c of crossings(pose)) if (canBlend(c.a, pose) && canBlend(c.b, pose)) out.push({ pose, a: c.a, b: c.b });
  return out;
}

test('crossing vessels of one network, counted per pose (body 22, map 70 today; 8 and 17 of them with both sides able to blend: the 17 are collateral and shunt pairs the 2D lines cross themselves, tests/net-skeleton.test.ts pins that none is added): none may be added unseen', () => {
  assert.ok(crossings(0).length <= 22, `${crossings(0).length} crossings in the body pose`);
  assert.ok(crossings(1).length <= 70, `${crossings(1).length} crossings in the map pose`);
  const both = (pose: 0 | 1): number => crossings(pose).filter((c) => canBlend(c.a, pose) && canBlend(c.b, pose)).length;
  assert.ok(both(0) <= 8 && both(1) <= 17, `${both(0)} body, ${both(1)} map pairs where both sides can blend`);
  assert.equal(secondDrawPairs().length, both(0) + both(1));
});

test('a crossing is a pair of different vessels in one network', () => {
  for (const pose of [0, 1] as const) for (const c of crossings(pose)) assert.notEqual(baseId(c.a), baseId(c.b));
});

test('the real skeleton meshes as one surface per network', { todo: 'WP2: the portal confluence is a merged region of 7 arms (the most is 6; the ruling says raise it to 8)' }, () => {
  buildNetMesh(skeleton());
});

test('the second draw exists: the pairs where both sides can blend are drawn after the rest of their network', { todo: 'not built: the network object is WP4 (the list is secondDrawPairs: 8 body and 30 map pairs today)' }, () => {
  assert.fail('no second draw yet');
});
