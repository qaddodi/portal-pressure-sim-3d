// EVERY SHUNT IS ONE SEALED PATH (Mohammad, 26 Nov: "mesorex shunt is completely broken and the path is not right, the shunt breaks and is not continuous"). The Meso-Rex graft's tube was slid
// 0.12 back in depth while it was
// shown (procedures/layer.ts setRexUnder: the 2D figure's "draw it a tier under the splenic vein", carried into 3D as a move of the whole tube), so it left the junction skins that weld its two
// ends: an open, cut stub
// beside the left portal vein and a gap and a step beside the superior mesenteric vein, seen at any turn. The rules that hold for every shunt (TIPS, DIPS, the portocaval, mesocaval and distal
// splenorenal shunts, the Meso-Rex
// bypass), on the course the figure draws:
//   - its tube is drawn ON its course: no vessel's tube is moved off the course its skins, seams, stents and catheter routes are built on, whatever is shown;
//   - it is one continuous course, and both of its ends lie inside the lumen of the vein it is joined to, at the landmark it is made between, and each end is welded into that vein's skin;
//   - a surgical shunt's sewn end leaves its host end to side, at least SEWN_MIN off the host's axis, and on the screen it clears the vessels at its two nodes past its mouth (no second tube
// lying along its host);
//   - the Meso-Rex bypass runs from the superior mesenteric vein, below the confluence, to the left portal vein's umbilical portion (the Rex recess, its proximal half), in front of the portal trunk.
// Run: node --test tests/shunt-continuity.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EDGES } from '../src/engine/hales/portal/topology.js';
import type { EngineFrame } from '../src/engine/hales/host/protocol.d.ts';
import { forgeFrame } from '../src/engine/force-all.ts';
import { CelScene } from '../src/scene/scene.ts';
import { NETWORK, NETWORK_BY_ID, SHUNT_IDS } from '../src/scene/vessels/network.ts';
import { REST, coursesOf } from '../src/scene/vessels/shape.ts';
import { drawnShare } from '../src/scene/procedures/route3d.ts';
import { PLACED_EDGE_3D, WHOLE_PIECES, SEWN_ENDS, SEWN_MIN, SEWN_HEAD_R, SEWN_FRONT_GAP, SEWN_FRONT_FROM, SEWN_FRONT_TO } from '../src/scene/anatomy/placed-network.ts';
import { Matrix4 } from 'three';

type V = readonly [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: V): number => Math.hypot(a[0], a[1], a[2]);
const nrm = (a: V): V => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** The nearest point of a polyline: distance, the segment's unit direction, and the share along it by length. */
function near(c: readonly V[], p: V): { d: number; t: V; u: number } {
  let best = { d: Infinity, t: [0, 0, 0] as V, s: 0 }, acc = 0;
  for (let i = 1; i < c.length; i++) {
    const a = c[i - 1]!, ab = sub(c[i]!, a), l2 = dot(ab, ab), k = l2 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)) : 0, d = len(sub(p, [a[0] + ab[0] * k, a[1] + ab[1] * k, a[2] + ab[2] * k]));
    if (d < best.d) best = { d, t: nrm(ab), s: acc + k * Math.sqrt(l2) };
    acc += Math.sqrt(l2);
  }
  return { d: best.d, t: best.t, u: acc ? best.s / acc : 0 };
}
const course = (id: string): V[] => coursesOf(NETWORK_BY_ID.get(id)!, REST)[0]!.pts as V[];
const whole = (w: string): V[] => WHOLE_PIECES[w]!.flatMap((id, i) => (i ? PLACED_EDGE_3D[id]!.slice(1) : PLACED_EDGE_3D[id]!)) as V[];

/** Each shunt's two ends: the drawn veins its start and its end open into (the landmarks it is made between, in the engine's flow order: from, to). */
const LANDMARKS: Readonly<Record<string, readonly [readonly string[], readonly string[]]>> = {
  TIPS: [['PVH_R', 'PVH_R_1', 'PVH_R_2'], ['RHV_IVC', 'RHV_IVC_1']],                         // right portal vein to right hepatic vein
  DIPS: [['PV_TRUNK', 'PVH_R', 'PVH_L'], ['IVC_IS_1', 'IVC_IS']],                            // portal bifurcation to the retrohepatic cava
  S_PC: [['PV_TRUNK_1', 'SMV_CONF', 'SV_CONF'], ['IVC_IS_1', 'IVC_IS', 'ILI_IVC_1']],          // portal vein at the confluence to the cava
  S_MC: [['V_INT_1', 'SMV_CONF'], ['ILI_IVC_1', 'ILI_IVC', 'IVC_IS_1']],                      // superior mesenteric vein to the infrarenal cava
  S_DSR: [['V_SPL', 'SV_MID'], ['V_KID_L', 'V_KID_L_1']],                                     // splenic vein to the left renal vein
  REX: [['V_INT_1', 'SMV_CONF'], ['PVH_L_1']],                                                // superior mesenteric vein to the left portal vein (the Rex recess)
};

test('every drawn shunt is in the table, and the table names drawn veins', () => {
  assert.deepEqual([...SHUNT_IDS].sort(), Object.keys(LANDMARKS).sort());
  for (const [id, ends] of Object.entries(LANDMARKS)) for (const hs of ends) for (const h of hs) assert.ok(NETWORK_BY_ID.has(h), `${id}: ${h} is a drawn vein`);
});

test('every shunt is one continuous course, both ends inside the lumen of the vein at its landmark', () => {
  for (const id of SHUNT_IDS) {
    const c = course(id), r = NETWORK_BY_ID.get(id)!.radius;
    for (let i = 1; i < c.length; i++) assert.ok(len(sub(c[i]!, c[i - 1]!)) < r, `${id}: no break in its course at point ${i} (${len(sub(c[i]!, c[i - 1]!)).toFixed(4)})`);
    for (const end of [0, 1] as const) {
      const p = end ? c[c.length - 1]! : c[0]!, hosts = LANDMARKS[id]![end];
      const inside = Math.min(...hosts.map((h) => drawnShare(h, p[0], p[1], p[2])?.share ?? Infinity));
      assert.ok(inside < 0.5, `${id}: its ${end ? 'end' : 'start'} lies inside ${hosts.join(' or ')} (${inside.toFixed(2)} of the radius off the axis)`);
    }
  }
});

test('the Meso-Rex bypass runs from the superior mesenteric vein below the confluence to the left portal vein\'s umbilical portion, in front of the portal trunk', () => {
  const c = course('REX'), a = c[0]!, b = c[c.length - 1]!;
  const conf = PLACED_EDGE_3D.SMV_CONF!, confY = conf[conf.length - 1]![1];
  assert.ok(a[1] < confY - 0.1, `it leaves the SMV below the confluence (${a[1].toFixed(3)} vs ${confY.toFixed(3)})`);
  const lpv = whole('lpv'), at = near(lpv, b);
  assert.ok(at.u <= 0.5, `it enters the left portal vein in its proximal half, the umbilical portion (${at.u.toFixed(2)})`);
  assert.ok(b[1] > a[1] + 0.8, 'it runs up, from the mesenteric root to the liver (flow SMV to the Rex recess)');
  // (the graft is laid in front of the portal trunk and the pancreas: at the trunk's middle height its depth is in front of the trunk's)
  const pv = whole('pv'), mid = pv[Math.floor(pv.length / 2)]!, g = c.reduce((q, p) => (Math.abs(p[1] - mid[1]) < Math.abs(q[1] - mid[1]) ? p : q));
  assert.ok(g[2] > mid[2] + 0.05, `in front of the portal trunk (${g[2].toFixed(3)} vs ${mid[2].toFixed(3)})`);
});

test('a surgical shunt\'s sewn ends leave their hosts end to side, and on the screen it clears its hosts past its mouths', () => {
  for (const id of SEWN_ENDS) {
    const c = course(id), r = NETWORK_BY_ID.get(id)!.radius;
    for (const end of [0, 1] as const) {
      const pts = end ? c.slice().reverse() : c, p = pts[0]!;
      // the host's through axis: the whole vein the landmark piece belongs to
      const piece = LANDMARKS[id]![end].map((h) => ({ h, d: near(PLACED_EDGE_3D[h]! as V[], p).d })).sort((x, y) => x.d - y.d)[0]!.h;
      const w = Object.entries(WHOLE_PIECES).find(([, ps]) => ps.includes(piece))?.[0], axis = w ? whole(w) : (PLACED_EDGE_3D[piece]! as V[]);
      let acc = 0, k = 1; for (; k < pts.length - 1 && acc < SEWN_HEAD_R * r; k++) acc += len(sub(pts[k]!, pts[k - 1]!));
      const ang = (Math.acos(Math.min(1, Math.abs(dot(nrm(sub(pts[k]!, p)), near(axis, p).t)))) * 180) / Math.PI;
      assert.ok(ang >= SEWN_MIN - 1, `${id}: its ${end ? 'end' : 'start'} leaves ${piece} ${ang.toFixed(0)} degrees off its axis (end to side: at least ${SEWN_MIN})`);
      // on the screen (x, y), past SEWN_FRONT_FROM of the two radii from this mouth and up to SEWN_FRONT_TO, its wall clears its host's wall (it is not a second tube along it)
      const hr = NETWORK_BY_ID.get(piece)!.radius, oc = axis.map((q): V => [q[0], q[1], 0]), from = SEWN_FRONT_FROM * (r + hr);
      let s = 0;
      for (let i = 1; i < pts.length; i++) {
        s += len(sub(pts[i]!, pts[i - 1]!));
        if (s < from || s > SEWN_FRONT_TO) continue;
        const gap = near(oc, [pts[i]![0], pts[i]![1], 0]).d - r - hr;
        const where = `${s.toFixed(3)} from its ${end ? 'end' : 'start'}`;
        assert.ok(gap >= SEWN_FRONT_GAP * r - 2e-3, `${id}: ${where} it lies ${gap.toFixed(4)} from ${piece} on the screen, wall to wall (a second tube along its host)`);
      }
    }
  }
});

test('with every shunt shown, each one\'s tube is drawn on its own course (no vessel is moved off it) and both its ends are welded into their veins\' skins', () => {
  const N = (EDGES as unknown[]).length;
  const f: EngineFrame = {
    type: 'frame', changed: true, gen: 1, jump: false, t: 1, day: 0, running: true, speed: 1, clock: 'hemo', pulsing: false, morphing: false, settling: false, phase: 0,
    P: new Float32Array(60), Pf: new Float32Array(60), Q: new Float32Array(N).fill(1), Qf: new Float32Array(N).fill(1), ext: new Float32Array(N), D: new Float32Array(N).fill(5),
    metrics: { hvpg: 5, whvp: 10, fhvp: 5 } as never, events: [], paramsRev: 0,
  };
  const s = new CelScene();
  try {
    s.syncPresence(forgeFrame(f, { collaterals: false, shunts: true }), true);
    const I = new Matrix4();
    for (const v of NETWORK) {
      const o = s.vesselObject(v.id); if (!o) continue;
      o.group.updateWorldMatrix(true, false);
      // (a tube is built on its course in the figure's own frame: its group is never moved, turned or scaled, so its skins, seams, stents and catheter routes stay on it)
      const moved = o.group.position.toArray().map((x) => x.toFixed(3)).join(', ');
      assert.ok(o.group.matrix.equals(I), `${v.id}: its tube is drawn where its course is (it is moved by ${moved})`);
    }
    for (const id of SHUNT_IDS) {
      assert.equal(s.presence.stateOf(id), 'shown', `${id} is shown`);
      assert.deepEqual(s.skins?.endsOf(id), [true, true], `${id}: both ends are welded into a skin (no open, cut end)`);
    }
  } finally { s.dispose(); }
});
