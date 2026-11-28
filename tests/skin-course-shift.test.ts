// A junction's welded skin must not sit on a knife edge: a small shift of a growing arm's drawn course (a third of its radius, midway along it) may not cost the skin an arm.
// The cause it pins (SMV, 28 Nov): the sampled surface (skin/sheet.ts) cuts away the half-cylinder beyond each seam plane; when an arm bends, that cylinder reaches a thin web of the field beside it and leaves a SMALL stray hole
// 1.6 radii from the seam, which the old rule (a loop more than 2 radii from every seam is a hole) did not take for one: "4 seam loops for 3 arms", and SMV lost S_MC and REX. A stray hole is now any small loop no seam owns (sheet-caps.ts).
// The rule, for every node: the arms its skin carries at rest it still carries when any growing arm's course is moved by `SHIFT_R` of its radius, in several directions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { SkinObject } from '../src/scene/vessels/skin/skin-object.ts';
import { findSkinJunctions } from '../src/scene/vessels/skin/inventory.ts';
import { strayLoops } from '../src/scene/vessels/skin/sheet-caps.ts';

/** How far (a share of the arm's radius) the course is moved at its middle, and the directions tried: in the figure's plane at four angles, and in depth both ways. */
const SHIFT_R = 0.3;
const DIRECTIONS: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const DEPTH: readonly number[] = [1, -1];
/** The nodes under test: every node of the inventory with a growing arm, less the ones whose skins other threads are still mending (their own tests name them). */
/** The node walked in every direction (the one this rule was found on: SMV's S_MC and REX). */
const FULL = 'SMV';
const SKIP = new Set(['IVCI', 'IVC_P', 'IVC_M', 'LPV_U', 'LPV_X']);

type Plan = { kind: 'coil'; base: readonly (readonly [number, number])[]; z?: readonly number[] } & Record<string, unknown>;

/** A smooth push of the course's middle: zero at both ends (the junction does not move), full over the middle two thirds. */
const bump = (i: number, n: number): number => Math.min(1, 2 * Math.sin((Math.PI * i) / (n - 1)));

/** Runs `fn` with the vessel's drawn course shifted, then puts it back. `dir` is in the plan's plane (2D units); `dz` in depth, both shares of the vessel's radius. */
function shifted<T>(id: string, dir: readonly [number, number], dz: number, fn: () => T): T {
  const v = NETWORK_BY_ID.get(id)!, plan = v.plan as unknown as Plan, was = plan.base, wasZ = plan.z, n = was.length;
  // the plan's units per scene unit: the first step of the course in both
  const scene = Math.hypot(v.pts[1]![0] - v.pts[0]![0], v.pts[1]![1] - v.pts[0]![1]), flat = Math.hypot(was[1]![0] - was[0]![0], was[1]![1] - was[0]![1]), perScene = flat / scene;
  const amp = SHIFT_R * v.radius;
  try {
    plan.base = was.map((p, i) => [p[0] + dir[0] * amp * perScene * bump(i, n), p[1] + dir[1] * amp * perScene * bump(i, n)] as const);
    if (wasZ && dz) plan.z = wasZ.map((z, i) => z + dz * amp * bump(i, n));
    return fn();
  } finally { plan.base = was; if (wasZ) plan.z = wasZ; }
}

function build(node: string): { nodes: string[]; dropped: string[]; fellBack: string[]; warnings: string[] } {
  const scene = scenes.get('scene')!, warnings: string[] = [];
  const set = new SkinSet({
    vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
    make: (mesh, axes, arms) => new SkinObject(mesh, arms[0]!, axes, arms),
    add: (o: Object3D) => new Group().add(o), remove: () => {}, warn: (m) => warnings.push(m),
  });
  set.build(2, new Set([node]));
  return { nodes: [...set.nodes].sort(), dropped: [...set.dropped].sort(), fellBack: [...set.fellBack].sort(), warnings };
}
const scenes = new Map<string, CelScene>();

test('a small shift of a growing arm\'s course costs no junction skin an arm it had at rest', () => {
  setSmoothJoins(true);
  scenes.set('scene', new CelScene({ joins: 'old' }));
  const nodes = findSkinJunctions().filter((j) => !SKIP.has(j.node) && j.arms.some((a) => a.grow));
  assert.ok(nodes.length >= 10, 'the inventory has the nodes with growing arms');
  const failures: string[] = [];
  for (const j of nodes) {
    const rest = build(j.node);
    for (const [gi, g] of j.arms.filter((a) => a.grow).entries()) {
      // (a vessel without a plan to shift: nothing to move)
      if (!NETWORK_BY_ID.get(g.vesselId)?.plan) continue;
      // every direction for the named node; elsewhere an opposite pair in the plane, turning with the arm (the whole walk would be four minutes)
      const planeTries = (j.node === FULL ? DIRECTIONS.map((_, k) => k) : [gi % 4, (gi + 2) % 4]).map((k): [string, readonly [number, number], number] => [`plane ${k * 90} deg`, DIRECTIONS[k]!, 0]);
      const tries = [...planeTries, ...(j.node === FULL ? DEPTH.map((s): [string, readonly [number, number], number] => [`depth ${s > 0 ? '+' : '-'}`, [0, 0], s]) : [])];
      for (const [name, dir, dz] of tries) {
        const got = shifted(g.vesselId, dir, dz, () => build(j.node));
        const lost = got.dropped.filter((d) => !rest.dropped.includes(d)), gone = rest.nodes.filter((n) => !got.nodes.includes(n));
        if (lost.length || gone.length || got.fellBack.length > rest.fellBack.length || got.warnings.length > rest.warnings.length) failures.push(`${j.node}: ${g.vesselId} moved ${SHIFT_R} radii (${name}) loses ${[...lost, ...gone].join(', ') || 'a skin to the old join'}`);
      }
    }
  }
  assert.deepEqual(failures, [], 'every skin survives the shift');
});

test('stray holes of the sampled surface: a small loop no seam owns is capped, even within two radii of a seam; a seam loop is never taken for one', () => {
  // two seams (centres 0 and 1 on x, radius 0.1); loops are rings of 8 points in the plane z = 0
  const pos: number[] = [], ring = (cx: number, cy: number, r: number): number[] => { const l: number[] = []; for (let q = 0; q < 8; q++) { l.push(pos.length / 3); pos.push(cx + r * Math.cos((q * Math.PI) / 4), cy + r * Math.sin((q * Math.PI) / 4), 0); } return l; };
  const seamA = ring(0, 0, 0.1), seamB = ring(1, 0, 0.1), nearHole = ring(0.16, 0, 0.02), farHole = ring(0.5, 0.5, 0.02), wide = ring(0.19, 0, 0.1);
  const cen = [[0, 0, 0], [1, 0, 0]] as const, rad = [0.1, 0.1];
  const stray = strayLoops([seamA, seamB, nearHole, farHole], pos, cen, rad);
  assert.deepEqual(stray, [nearHole, farHole], 'a hole 1.6 radii from a seam (the SMV case) and one far from every seam are both stray');
  assert.deepEqual(strayLoops([seamA, seamB], pos, cen, rad), [], 'the seams of the arms are never holes');
  // a loop as wide as a seam that no arm owns is a failure to report (the planner refuses), never silently capped as a hole
  assert.deepEqual(strayLoops([seamA, seamB, wide], pos, cen, rad).filter((l) => l === wide), [], 'a wide loop between the seams is not a small hole');
});
