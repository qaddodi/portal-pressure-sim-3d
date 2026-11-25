// THE WELD'S SHADE IS THE DRAWN SURFACE'S (Mohammad, 24 Nov, iPhone, placed anatomy: the portal fork read as a blob, darker patches coming in from both sides of the crotch; the hepatic veins' mouths on the cava heavy with shade).
// The shade's normal (skin/shaders.ts, its twin here) must be the surface's own: the mesh's normal over the rows from a seam where the mesh blends the tube's normal into the union's (so the shade runs on from the tube with no step), the
// union's gradient at the surface's own blend after that. Judged on every junction skin the placed figure builds: across each weld the shade turns no faster than the surface it lies on, and no vertex is shaded darker than the surface
// itself is at the same angle to the light. Run: PPS_ANATOMY=placed node --test tests/skin-weld-shade.test.ts (with the switch off it checks the hand-over rows only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { PLACED } from '../src/scene/anatomy/source.ts';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { SkinSet, capsuleOf } from '../src/scene/vessels/skin/skin-set.ts';
import { sdUnionGrad, skinKOf } from '../src/scene/vessels/skin/sdf.ts';
import { SKIN_SHADE_K, SKIN_TUBE_ROWS, skinTubeKeep, tubeShareOf } from '../src/scene/vessels/skin/exact-normal.ts';
import { NORMAL_BLEND_ROWS } from '../src/scene/vessels/skin/mesh.ts';
import { CEL_LIGHT_UNIT as L } from '../src/scene/cel-glsl.ts';

type V3 = [number, number, number];
const nz = (v: ArrayLike<number>): V3 => { const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1; return [v[0]! / l, v[1]! / l, v[2]! / l]; };
const deg = (a: V3, b: V3): number => (Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180) / Math.PI;
const lit = (n: V3): number => n[0] * L[0] + n[1] * L[1] + n[2] * L[2];
/** Sub-steps along an edge, and how much faster than the surface's own normal the shade may turn over one of them (degrees). */
const STEPS = 8, TURN_OVER = 1;
/** How much darker (n.L) than both the surface and the tube's normal run on into the skin the shade may be at a vertex. */
const DARKER = 0.02;

test('the shade keeps the mesh normal over exactly the rows the mesh blends the tube\'s normal over', () => {
  assert.equal(SKIN_TUBE_ROWS, NORMAL_BLEND_ROWS);
  // a strip of two rings and a row past them: 1 on the ring, a half one row in, nothing two rows in
  const share = tubeShareOf([0, 1, 2, 2, 1, 3, 2, 3, 4], [[0, 1]], 5);
  assert.deepEqual([...share], [1, 1, 0.5, 0.5, 0]);
});

test('across every weld the shade is the drawn surface\'s: it turns no faster than the surface, and no vertex is darker than the surface at the same angle to the light', { skip: !PLACED && 'placed anatomy only (PPS_ANATOMY=placed)' }, () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  try {
    const set = new SkinSet({
      vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
      make: (mesh) => ({ mesh, object: new Group(), setArm() {}, setArc() {}, setPres() {}, setArmCopy() {}, setTransparent() {}, dispose() {} }) as never,
      add: (o: Object3D) => new Group().add(o), remove: () => {}, warn: () => {},
    });
    set.build(2);
    const skins = set.bake().skins;
    assert.ok(skins.length >= 12, `${skins.length} skins`);
    const g = new Float64Array(3), bad: string[] = [];
    for (const s of skins) {
      const m = s.mesh, j = s.plan.junction, caps = s.axes.map(capsuleOf), k = skinKOf(j.arms), kS = k * SKIN_SHADE_K;
      const P = m.position, N = m.normal, W = m.weight, W2 = m.weight2, V = P.length / 3, tube = tubeShareOf(m.index, m.seamVerts, V);
      const wTop = (v: number): number => Math.max(W[4 * v]!, W[4 * v + 1]!, W[4 * v + 2]!, W[4 * v + 3]!, W2[2 * v]!, W2[2 * v + 1]!);
      // at a point: the drawn surface's normal (the union's gradient at the surface's own blend k), the mesh's (lerped: the tube's run on into the skin), and the shade's, the shader's sum
      const at = (p: V3, nv: V3, tb: number, wt: number): { surf: V3; mesh: V3; shade: V3 } => {
        sdUnionGrad(caps, k, p[0], p[1], p[2], g); const gk = nz(g);
        sdUnionGrad(caps, kS, p[0], p[1], p[2], g); const gs = nz(g);
        const keep = skinTubeKeep(tb, wt);
        return { surf: gk, mesh: nv, shade: nz([gs[0] + (nv[0] - gs[0]) * keep, gs[1] + (nv[1] - gs[1]) * keep, gs[2] + (nv[2] - gs[2]) * keep]) };
      };
      let worstTurn = 0, worstDark = 0;
      for (let v = 0; v < V; v++) {
        const r = at([P[3 * v]!, P[3 * v + 1]!, P[3 * v + 2]!], nz([N[3 * v]!, N[3 * v + 1]!, N[3 * v + 2]!]), tube[v]!, wTop(v));
        worstDark = Math.max(worstDark, Math.min(lit(r.surf), lit(r.mesh)) - lit(r.shade));   // (never darker than both the surface and the tube's normal run on)
      }
      // across the weld: every edge between two of the rows by a seam, walked in STEPS
      for (let t = 0; t < m.index.length; t += 3) for (let e = 0; e < 3; e++) {
        const a = m.index[t + e]!, b = m.index[t + ((e + 1) % 3)]!;
        if (tube[a] === tube[b] || Math.max(tube[a]!, tube[b]!) === 0) continue;
        let prev: { surf: V3; mesh: V3; shade: V3 } | null = null;
        for (let q = 0; q <= STEPS; q++) {
          const u = q / STEPS, mix = (X: ArrayLike<number>, i: number): number => X[3 * a + i]! + (X[3 * b + i]! - X[3 * a + i]!) * u;
          const tbNow = tube[a]! + (tube[b]! - tube[a]!) * u, r = at([mix(P, 0), mix(P, 1), mix(P, 2)], nz([mix(N, 0), mix(N, 1), mix(N, 2)]), tbNow, wTop(a) + (wTop(b) - wTop(a)) * u);
          if (prev) worstTurn = Math.max(worstTurn, deg(prev.shade, r.shade) - Math.max(deg(prev.surf, r.surf), deg(prev.mesh, r.mesh)));
          prev = r;
        }
      }
      if (worstTurn > TURN_OVER || worstDark > DARKER) bad.push(`${j.node}: the shade turns ${worstTurn.toFixed(2)} degrees a step faster than the surface across a weld, and is ${worstDark.toFixed(3)} darker (n.L) than it`);
    }
    assert.deepEqual(bad, [], 'every weld shaded as the surface it lies on');
  } finally { scene.dispose(); setSmoothJoins(was); }
});

// THE CONFLUENCE'S INK IS THE OUTLINE OF THE UNION (Mohammad, 24 Nov: the hepatic veins heavy with dark ink where they meet the cava). The middle and left hepatic veins came down onto the cava from in front (sloping 0.27 and 0.23 away from
// the viewer), so each ran over the cava's front wall for radii before it opened. Its rim stood 1.6 k in front of the cava, and the depth hold-out drew its silhouette across the cava's lumen: 1.1 % of IVCS was drawn as line only, against
// 0.1 % in today's flat figure. Two fixes. The hepatic veins now arrive in the cava's plane (anatomy/placed-network.ts joinEnd `flat`). Away from the seams the hold-out starts at 3 k (skin/shaders.ts SKIN_HOLD_FREE_FROM_K), while on a seam
// it keeps 1 k, so the tube's line runs on (tests/skin-agreement.test.ts). Judged here by the fragment stage's twin (tests/skin-live-lib.ts) at a phone's screen, from the front and turned, with every arm there.
// The portal fork the same (Mohammad, 24 Nov: "shadows from both sides make it look spherical"): laid straight to its gap, the DIPS left PVH 10 degrees from the left portal vein on the screen and 3.2 k behind it, and the left portal vein's
// rim was drawn across the DIPS's lumen, 3.2 % of PVH as line only. It now leads out between the two portal branches first (anatomy/placed-network.ts DIPS_LEAD): 0.02 % at most.
const BOUNDED: ReadonlySet<string> = new Set(['IVCS', 'PVH']);
test('no junction skin of the placed figure inks more of its own lumen than the seam\'s ramp alone would, and the hepatic confluence and the portal fork stay under 0.5 %', { skip: !PLACED && 'placed anatomy only (PPS_ANATOMY=placed)' }, async () => {
  const { gateSkins } = await import('./skin-gate-lib.ts');
  const { closeCamera, rasterLive } = await import('./skin-live-lib.ts');
  const SCREEN = { w: 393, h: 852, dpr: 2, pxPerUnit: 500 } as const;
  const g = gateSkins();
  try {
    let judged = 0, fewer = 0;
    for (const s of g.skins) {
      const arms = s.mesh.junction.arms, cs = { swell: arms.map(() => 1), keep: arms.map(() => true) };
      for (const yaw of [0, 0.3]) {
        const cam = closeCamera(g.scene, SCREEN.w, SCREEN.h, s.mesh.junction.J, SCREEN.pxPerUnit, { yaw });
        const st = rasterLive(s, cam, SCREEN.w, SCREEN.h, SCREEN.dpr, cs), seamOnly = rasterLive(s, cam, SCREEN.w, SCREEN.h, SCREEN.dpr, cs, { ramp: [1, 2] });
        const share = st.inkOnly / Math.max(1, st.lumenRef);
        assert.ok(st.inkOnly <= seamOnly.inkOnly + 2, `${s.node} (turned ${yaw}): ${st.inkOnly} pixels drawn as line, ${seamOnly.inkOnly} with the seam's ramp everywhere`);
        if (st.inkOnly < seamOnly.inkOnly) fewer++;
        if (BOUNDED.has(s.node)) assert.ok(share < 0.005, `${s.node} (turned ${yaw}): ${(100 * share).toFixed(2)} % of its lumen is drawn as line`);
        judged++;
      }
    }
    assert.ok(judged >= 40, `${judged} skin views judged`);
    assert.ok(fewer >= 5, `the free skin's ramp takes ink away somewhere (${fewer} views)`);
  } finally { g.done(); }
});
