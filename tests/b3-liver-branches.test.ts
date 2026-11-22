// The second-level branches in the liver (liver-branches.ts): they start and end inside the liver's outline, and siblings never cross each other or another vein.
// (Mohammad, 20 Nov: "the hepatic veins are branching outside the liver and into each other"; the middle hepatic vein does not branch.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { organsReady, setOrganData, ORGAN_MESHES } from '../src/scene/organs/meshes.ts';
import { x2d, y2d } from '../src/scene/frame2d.ts';
import { LIVER_BRANCHES, LIVER_BRANCH_HOSTS, SPLIT_AT } from '../src/scene/vessels/liver-branches.ts';
import { EDGE_PATH_2D } from '../src/scene/vessels/paths.copied.ts';

type P = readonly [number, number];

async function liverMask(): Promise<(x: number, y: number) => boolean> {
  const b = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
  setOrganData(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); await organsReady; await new Promise((r) => setTimeout(r, 0));
  const g = ORGAN_MESHES.liver!(), pos = g.getAttribute('position'), idx = g.index!;
  const T: number[][] = [];
  for (let t = 0; t < idx.count; t += 3) { const q = [0, 1, 2].map((k) => idx.getX(t + k)); T.push(q.flatMap((i) => [x2d(pos.getX(i)), y2d(pos.getY(i))])); }
  return (px, py) => T.some(([ax, ay, bx, by, cx, cy]) => {
    const d = (bx! - ax!) * (cy! - ay!) - (by! - ay!) * (cx! - ax!);
    if (!d) return false;
    const u = ((px - ax!) * (cy! - ay!) - (py - ay!) * (cx! - ax!)) / d, v = ((bx! - ax!) * (py - ay!) - (by! - ay!) * (px - ax!)) / d;
    return u >= 0 && v >= 0 && u + v <= 1;
  });
}
const dist = (a: readonly P[], b: readonly P[]): number => { let m = 1e9; for (const p of a) for (const q of b) m = Math.min(m, Math.hypot(p[0] - q[0], p[1] - q[1])); return m; };

test('the middle hepatic vein does not branch; the left and right do', () => {
  assert.deepEqual([...LIVER_BRANCH_HOSTS.in], ['RHV_IVC_1', 'LHV_IVC']);
  assert.ok(!LIVER_BRANCHES.some((b) => b.host === 'MHV_IVC'));
});

test('every hepatic vein branch lies wholly inside the liver\'s outline, and splits well inside it', async () => {
  const inLiver = await liverMask();
  for (const set of LIVER_BRANCHES.filter((b) => (LIVER_BRANCH_HOSTS.in as readonly string[]).includes(b.host) || (LIVER_BRANCH_HOSTS.out as readonly string[]).includes(b.host))) {
    for (const [i, c] of set.list.entries()) {
      const bad = c.pts.filter((p) => !inLiver(p[0], p[1]));
      assert.equal(bad.length, 0, `${set.host} child ${i}: ${bad.length} points outside the liver, first ${bad[0]}`);
    }
  }
});

test('siblings spread apart, and no branch comes near another hepatic vein or another vein\'s branches', () => {
  for (const set of LIVER_BRANCHES) {
    if (set.list.length < 2) continue;
    const [a, b] = set.list.map((c) => c.pts);
    const n = a!.length, endGap = Math.hypot(a![n - 1]![0] - b![n - 1]![0], a![n - 1]![1] - b![n - 1]![1]), startGap = Math.hypot(a![0]![0] - b![0]![0], a![0]![1] - b![0]![1]);
    assert.ok(Math.max(endGap, startGap) > 12, `${set.host}: the two children spread (${Math.max(endGap, startGap).toFixed(1)})`);
  }
  const others = ['RHV_IVC_1', 'MHV_IVC', 'LHV_IVC', 'RHV_IVC'];
  for (const set of LIVER_BRANCHES.filter((b) => (LIVER_BRANCH_HOSTS.in as readonly string[]).includes(b.host))) {
    for (const o of others.filter((id) => id !== set.host)) {
      for (const c of set.list) assert.ok(dist(c.pts, EDGE_PATH_2D[o]!) > 10, `${set.host}'s branch passes ${o}`);
    }
    for (const t of LIVER_BRANCHES.filter((b) => b.host !== set.host)) for (const c of set.list) for (const d of t.list) assert.ok(dist(c.pts, d.pts) > 10, `${set.host}'s branch meets ${t.host}'s`);
  }
});

test('the left hepatic vein is one tube that bends down into the left lobe, never up toward the capsule; its tip narrows gently and every branch narrows to about half', async () => {
  const { treeOf, TIP } = await import('../src/scene/vessels/liver-branches.ts');
  const t = treeOf('LHV_IVC')!, host = EDGE_PATH_2D.LHV_IVC!, hostStart = host[0]!;
  assert.equal(t.side, null, 'the left hepatic vein has no second branch');
  const tip = t.through[0]!;   // (flow order: the tip is where the vein begins)
  assert.ok(tip[1] > hostStart[1] - 2, `its tip is at y ${tip[1].toFixed(0)}, not above the vein's start (${hostStart[1]})`);
  assert.ok(!LIVER_BRANCHES.some((b) => b.host === 'LHV_IVC'), 'no separate branch tube on it');
  const { NETWORK_BY_ID } = await import('../src/scene/vessels/network.ts');
  const { coursesOf, REST } = await import('../src/scene/vessels/shape.ts');
  for (const id of Object.keys(SPLIT_AT)) {
    const c = coursesOf(NETWORK_BY_ID.get(id)!, REST)[0]!, end = (LIVER_BRANCH_HOSTS.out as readonly string[]).includes(id) ? 1 : 0;
    assert.equal(c.taper![end], TIP, `${id} narrows to ${TIP} at its tip`);
    assert.equal(c.taperSpan![end], 1, `${id} narrows over its whole length`);
  }
  for (const set of LIVER_BRANCHES) {
    const v = NETWORK_BY_ID.get(`${set.host}~F:b`)!;
    for (const [i, c] of coursesOf(v, REST).entries()) {
      assert.ok(c.taper, `${set.host} branch ${i} has a taper`);
      const tipK = (LIVER_BRANCH_HOSTS.in as readonly string[]).includes(set.host) ? c.taper![0] : c.taper![1];
      assert.ok(tipK >= 0.4 && tipK <= 1.3, `${set.host} branch ${i} narrows gently (${tipK})`);
    }
    assert.ok(v.lensSpan && v.lensSpan[1] > v.lensSpan[0], `${set.host}'s branch wears the stretch of the vein's colour it leaves`);
  }
});

test('a vein that branches is ONE tube from its root to its tip; its side branch starts on that tube, as wide as it is there, on its centreline and depth, with no cap', async () => {
  const { NETWORK_BY_ID } = await import('../src/scene/vessels/network.ts');
  const { coursesOf, REST } = await import('../src/scene/vessels/shape.ts');
  const { treeOf } = await import('../src/scene/vessels/liver-branches.ts');
  for (const set of LIVER_BRANCHES.filter((b) => SPLIT_AT[b.host] != null)) {
    const host = NETWORK_BY_ID.get(set.host)!, hostC = coursesOf(host, REST)[0]!, kid = coursesOf(NETWORK_BY_ID.get(`${set.host}~F:b`)!, REST)[0]!;
    const isIn = (LIVER_BRANCH_HOSTS.in as readonly string[]).includes(set.host), t = treeOf(set.host)!;
    const at = isIn ? kid.pts[kid.pts.length - 1]! : kid.pts[0]!;
    // (the branch's start is a point of the vein's own tube, in the plane: it starts a little behind the vein, whose wall covers its start)
    let near = 1e9, nearI = 0; hostC.pts.forEach((p, i) => { const d = Math.hypot(at[0] - p[0], at[1] - p[1]); if (d < near) { near = d; nearI = i; } });
    assert.ok(near < 0.01, `${set.host}: the branch starts on the vein's own centreline (${near.toFixed(4)})`);
    assert.ok(at[2] <= hostC.pts[nearI]![2] && hostC.pts[nearI]![2] - at[2] < 0.03, `${set.host}: it starts just behind the vein, so the vein's wall covers it`);
    assert.ok(nearI > 0.1 * hostC.pts.length && nearI < 0.9 * hostC.pts.length, `${set.host}: it leaves the vein part-way along, at point ${nearI}`);
    assert.ok(kid.capless?.[isIn ? 1 : 0], `${set.host}: no cap where the branch starts`);
    assert.ok(t.q > 0.1 && t.q < 0.9);
    const u = nearI / (hostC.pts.length - 1), here = hostC.radius * (1 + (0.5 - 1) * (isIn ? 1 - (1 - u) * 0 : 0) * 0);
    assert.ok(here > 0, 'radius');
  }
});

test('with smooth joins on, a vein that branches has no cap and no funnel at its tip, and the side branch leaves as wide as the vein is there', async () => {
  const { setSmoothJoins } = await import('../src/scene/vessels/join-mode.ts');
  const { NETWORK_BY_ID } = await import('../src/scene/vessels/network.ts');
  const { coursesOf, REST } = await import('../src/scene/vessels/shape.ts');
  setSmoothJoins(true);
  try {
    for (const id of Object.keys(SPLIT_AT)) {
      const c = coursesOf(NETWORK_BY_ID.get(id)!, REST)[0]!, end = (LIVER_BRANCH_HOSTS.out as readonly string[]).includes(id) ? 1 : 0;
      assert.equal(c.capless?.[end] ?? false, false, `${id}: a round tip`);
      assert.ok(!c.point?.[end], `${id}: not drawn to a point at its tip`);
      const kv = NETWORK_BY_ID.get(`${id}~F:b`), k = kv ? coursesOf(kv, REST)[0] : undefined;
      if (k) {
        // (the radius the vein has at the split, by the tube's own taper rule, equals the branch's start radius)
        const { factorSpan } = await import('../src/scene/vessels/tubes.ts');
        const { treeOf } = await import('../src/scene/vessels/liver-branches.ts');
        const q = treeOf(id)!.q, u = end === 1 ? q : 1 - q;
        const f = factorSpan([c.taper![0]!, c.taper![1]!], [c.taperSpan![0]!, c.taperSpan![1]!], u);
        assert.ok(Math.abs(k.radius - c.radius * f) / (c.radius * f) < 0.06, `${id}: the branch starts ${k.radius.toFixed(4)}, the vein is ${(c.radius * f).toFixed(4)} there`);
      }
    }
  } finally { setSmoothJoins(false); }
});

test('the umbilical vein is one vessel: no tributaries are drawn on it', () => {
  assert.ok(!LIVER_BRANCHES.some((b) => b.host === 'C3'), 'no branch set on C3');
});

test('a vein that branches runs on as one tube inside the liver\'s outline, past its old end, and its side branch leaves it to one side', async () => {
  const inLiver = await liverMask();
  const { treeOf } = await import('../src/scene/vessels/liver-branches.ts');
  for (const id of Object.keys(SPLIT_AT)) {
    const t = treeOf(id)!, isIn = (LIVER_BRANCH_HOSTS.in as readonly string[]).includes(id);
    const tipHalf = isIn ? t.through.slice(0, Math.round((1 - t.q) * t.through.length)) : t.through.slice(Math.round(t.q * t.through.length));
    const bad = tipHalf.filter((p) => !inLiver(p[0], p[1]));
    assert.equal(bad.length, 0, `${id}: ${bad.length} points of its liver stretch outside the liver, first ${bad[0]}`);
    if (t.side) {
      const e = isIn ? 0 : t.through.length - 1, f = isIn ? 0 : t.side.pts.length - 1;
      assert.ok(Math.hypot(t.through[e]![0] - t.side.pts[f]![0], t.through[e]![1] - t.side.pts[f]![1]) > 12, `${id}: the two tips are apart`);
    }
  }
});

test('a side branch stays behind its vein for as long as the two overlap and never dives at the camera (so no outline or darker fill is drawn across the vein at a fork)', async () => {
  const { LIVER_BRANCHES, tuckedDepth, SIDE_SLOPE } = await import('../src/scene/vessels/liver-branches.ts');
  const { len3 } = await import('../src/scene/frame2d.ts');
  assert.ok(tuckedDepth(0, 0.1) < 0 && tuckedDepth(3, 0.1) < 0, 'behind while on the vein');
  assert.ok(tuckedDepth(12, 0.1) < 0.002, 'behind or level with the vein by the time it has cleared it (two radii out)');
  assert.ok(tuckedDepth(1e4, 0.1) < 0.0801 && tuckedDepth(1e4, 0.1) > 0.079, 'it comes forward to its own depth and does not pass it');
  let prev = -1;
  for (let w = 0; w < 60; w += 0.5) {
    const z = tuckedDepth(w, 0.1); assert.ok(z >= prev - 1e-12, 'never goes back');
    if (w > 0) assert.ok((z - prev) / len3(0.5) <= SIDE_SLOPE + 1e-9, `no steeper than SIDE_SLOPE at ${w}`);
    prev = z;
  }
  for (const b of LIVER_BRANCHES) {
    const item = b.list[0]! as { dz: readonly number[]; pts: readonly (readonly [number, number])[] };
    assert.ok(item.dz.length === item.pts.length && item.dz.every(Number.isFinite), b.host);
  }
});

test('no vessel dives at the camera: along every course, depth changes by no more than about 50 degrees of run (root cause of the dark patch laid over the vein at the portal forks and the umbilical vein: a steep tube is shaded by its normals, and its whole width went to the shade tone)', async () => {
  const { NETWORK } = await import('../src/scene/vessels/network.ts');
  const { REST, coursesOf, DEPTH_SLOPE_CAP } = await import('../src/scene/vessels/shape.ts');
  const { setSmoothJoins } = await import('../src/scene/vessels/join-mode.ts');
  for (const on of [true, false]) {
    setSmoothJoins(on);
    for (const v of NETWORK) {
      if (!v.plan) continue;
      for (const c of coursesOf(v, REST)) for (let i = 1; i < c.pts.length; i++) {
        const dxy = Math.hypot(c.pts[i]![0] - c.pts[i - 1]![0], c.pts[i]![1] - c.pts[i - 1]![1]), dz = Math.abs(c.pts[i]![2] - c.pts[i - 1]![2]);
        if (dxy < 1e-5) continue;
        assert.ok(dz / dxy <= DEPTH_SLOPE_CAP * 1.01 + 0.05 || v.plan.kind === 'coil', `${v.id} (smooth joins ${on}) dives at point ${i}: slope ${(dz / dxy).toFixed(2)}`);
      }
    }
  }
  setSmoothJoins(true);
});

test('the two tubes of a fork know each other: every vertex carries its distance from the other tube\'s axis and the other\'s radius, so the outline is the union\'s (no line across the branch\'s mouth, none where the branch\'s own outline has not begun)', async () => {
  const { SIDE_BRANCHES, forkMateOf, neighbourAttr } = await import('../src/scene/vessels/neighbour.ts');
  const { VESSEL_FS, VESSEL_VS } = await import('../src/scene/vessels/shaders.ts');
  const { NETWORK_BY_ID: B } = await import('../src/scene/vessels/network.ts');
  const { REST, coursesOf } = await import('../src/scene/vessels/shape.ts');
  assert.deepEqual([...SIDE_BRANCHES.keys()].sort(), ['PVH_L_1', 'PVH_R_2', 'RHV_IVC_1']);
  for (const [host, kids] of SIDE_BRANCHES) for (const k of kids) {
    assert.equal(forkMateOf(host), k); assert.equal(forkMateOf(k), host);
    const rad = (id: string): number => coursesOf(B.get(id)!, REST)[0]!.radius;
    for (const id of [host, k]) {
      const c = coursesOf(B.get(id)!, REST)[0]!, flat = c.pts.flatMap((p) => [p[0], p[1], p[2]]);
      const a = neighbourAttr(id, flat)!;
      assert.equal(a.length, c.pts.length * 2, `${id}: two numbers a vertex`);
      let inside = 0, outside = 0;
      for (let i = 0; i < c.pts.length; i++) { const lat = Math.abs(a[i * 2]!), r = a[i * 2 + 1]!; if (r > 0) { if (lat < r) inside++; else outside++; } }
      assert.ok(inside > 0 && outside > 0, `${id}: part of its axis lies in its mate's lumen and part outside it (${inside} in, ${outside} out)`);
    }
    // the branch's start lies on the vein's axis; the vein's axis there lies inside the branch's lumen
    const kc = coursesOf(B.get(k)!, REST)[0]!, join = (B.get(k)!.plan as unknown as { list: { join: 0 | 1 }[] }).list[0]!.join;
    const p = kc.pts[join === 0 ? 0 : kc.pts.length - 1]!, a = neighbourAttr(k, [p[0], p[1], p[2]])!;
    assert.ok(Math.abs(a[0]!) < 0.2 * rad(host), `${k}: its join stands on the vein's axis`);
  }
  assert.equal(forkMateOf('PV_TRUNK'), null);
  assert.match(VESSEL_VS, /attribute vec2 nbr;/);
  assert.match(VESSEL_FS, /nbrK = smoothstep\(-0\.5, 0\.5, \(vNbr\.y - abs\(vNbr\.x\)\)/);
  assert.match(VESSEL_FS, /inkT \*= 1\.0 - nbrK;/);
  assert.match(VESSEL_FS, /if \(nbrK > 0\.5 && dLat > rDevAx \+ 0\.5\) DROP\(\d+\);/);
  assert.match(VESSEL_FS, /celTubeToneArt\(base, mix\(sT, 1\.0, nbrT\)/);
});

test('the bed that continues a vein which branches wears no fork collar (root cause of the fat bulb on the left portal vein in the Circuit: the cut stopped counting the pair as a run-on, so the bed was dressed as a branch on a wall, and the Circuit draws the beds)', async () => {
  const { NETWORK_BY_ID: B } = await import('../src/scene/vessels/network.ts');
  for (const id of ['PRE_L', 'PRE_R', 'POST_R_RHV', 'POST_L_LHV']) { const v = B.get(id); if (v) assert.ok(!v.flare?.[0] && !v.flare?.[1], `${id} has no collar`); }
});

test('flow marks hold back inside the vessel a tube leaves: the shader multiplies the chevrons and the streaks by the buried share', async () => {
  const { VESSEL_FS } = await import('../src/scene/vessels/shaders.ts');
  assert.match(VESSEL_FS, /float markK\(float d0, float d1\)/);
  assert.match(VESSEL_FS, /flowDust\([^;]*\) \* markK\(/, 'the dust');
  assert.match(VESSEL_FS, /flowHeads\([^;]*markK\(/, 'the heads (the buried share rides in as endK)');
});

test('a hepatic vein opens into the cava with a clean edge: it is cut away exactly where it lies inside the cava\'s lumen, and only a piece that ENDS on the cava does it (root cause of the round end inside the IVC, and of the broken outline at the join of the right hepatic vein\'s two pieces in the Circuit: the rule was keyed by the vein\'s name)', async () => {
  const { opensIntoCava } = await import('../src/scene/vessels/fades.ts');
  const { cavaMateOf, neighbourAttr } = await import('../src/scene/vessels/neighbour.ts');
  const { NETWORK_BY_ID: B } = await import('../src/scene/vessels/network.ts');
  const { REST, coursesOf } = await import('../src/scene/vessels/shape.ts');
  const { VESSEL_FS } = await import('../src/scene/vessels/shaders.ts');
  for (const id of ['RHV_IVC', 'MHV_IVC', 'LHV_IVC', 'LRV_IVC']) assert.equal(opensIntoCava(id), true, `${id} opens into the cava`);
  for (const id of ['RHV_IVC_1', 'PVH_R_2', 'IVC_IS']) assert.equal(opensIntoCava(id), false, `${id} does not`);
  assert.equal(cavaMateOf('RHV_IVC_1'), null);
  assert.equal(cavaMateOf('MHV_IVC'), 'IVC_IS');
  assert.equal(cavaMateOf('LRV_IVC'), 'IVC_IS_1', 'a renal vein meets the cava below the hepatic veins');
  // the vein's last vertices lie inside the cava's lumen (distance to its axis under its radius), its first ones outside
  for (const id of ['RHV_IVC', 'MHV_IVC', 'LHV_IVC']) {
    const c = coursesOf(B.get(id)!, REST)[0]!, flat = new Float32Array(c.pts.length * 3);
    c.pts.forEach((p, i) => { flat[3 * i] = p[0]; flat[3 * i + 1] = p[1]; flat[3 * i + 2] = p[2]; });
    const a = neighbourAttr(id, flat)!, n = c.pts.length;
    assert.ok(a, `${id} knows the cava`);
    const inside = (i: number): boolean => a[2 * i + 1]! > 0 && Math.abs(a[2 * i]!) < a[2 * i + 1]!;
    assert.ok(!inside(0) && inside(n - 1), `${id}: starts outside the cava, ends inside it`);
  }
  assert.match(VESSEL_FS, /uniform float cavaCut;/);
  assert.match(VESSEL_FS, /if \(cavA < 0\.004\) DROP\(\d+\);/);
  assert.match(VESSEL_FS, /gl_FragColor = vec4\(c, fadeHere \* cavA\);/);
});

test('a side branch starts as wide as it is where it leaves its vein (a half-width start made a step on the vein\'s outline where the branch\'s own begins: eyes, v8 of 5b59c0a)', async () => {
  const { NETWORK_BY_ID: B } = await import('../src/scene/vessels/network.ts');
  const { REST, coursesOf } = await import('../src/scene/vessels/shape.ts');
  const { radiusAtU } = await import('../src/scene/vessels/tubes.ts');
  const { JOIN_K } = await import('../src/scene/vessels/liver-branches.ts');
  assert.equal(JOIN_K, 1);
  for (const id of ['PVH_R_2~F:b', 'PVH_L_1~F:b', 'RHV_IVC_1~F:b']) {
    const v = B.get(id)!, c = coursesOf(v, REST)[0]!, join = (v.plan as unknown as { list: { join: 0 | 1 }[] }).list[0]!.join;
    let L = 0; for (let i = 1; i < c.pts.length; i++) L += Math.hypot(c.pts[i]![0] - c.pts[i - 1]![0], c.pts[i]![1] - c.pts[i - 1]![1], c.pts[i]![2] - c.pts[i - 1]![2]);
    const at = (u: number): number => radiusAtU(c, join === 0 ? u : 1 - u, L);
    assert.ok(at(0) >= 0.9 * at(0.14), `${id}: ${at(0).toFixed(4)} at the join against ${at(0.14).toFixed(4)} further on`);
  }
});

test('a vein that opens into the cava takes the cava\'s colour as it nears the wall and is gone at it (colours blend at every vessel-into-vessel junction, owner 19 Nov)', async () => {
  const { VESSEL_FS, VESSEL_VS } = await import('../src/scene/vessels/shaders.ts');
  const { CelScene } = await import('../src/scene/scene.ts');
  const { indexOf } = await import('../src/engine/vessel-data.ts');
  const { NETWORK_BY_ID: B } = await import('../src/scene/vessels/network.ts');
  assert.match(VESSEL_FS, /vec4 lensOfAt\(float lensIx, float u,/);
  assert.match(VESSEL_FS, /base = mix\(base, mix\(mix\(color, la2\.rgb, la2\.a\), mix\(color, lb2\.rgb, lb2\.a\), lensMix\), wB\);/);
  assert.match(VESSEL_FS, /fadeHere = mix\(vFade, cavaA, wA\);/, 'the vein comes to the cava\'s opacity at the wall, by its distance from the wall (Mohammad, 20 Nov: both have the same fade at the point of junction)');
  assert.match(VESSEL_FS, /float wA = smoothstep\(-2\.5 \* vNbr\.y, 0\.0, cd\)/, 'over 2.5 cava radii, by the pixel\'s own distance: never by a share of the vein\'s length');
  assert.match(VESSEL_FS, /cavA = mix\(1\.0 - smoothstep\(-0\.5, 0\.5, cdPx\), 1\.0, circT\);/, 'and is cut along the wall\'s line, a pixel wide');
  assert.doesNotMatch(VESSEL_FS, /smoothstep\(-0\.8 \* vNbr\.y, 0\.0, cd\)/, 'no dissolve over the last stretch before the wall (a gap, Mohammad 20 Nov)');
  const s = new CelScene();
  try {
    const ref = (id: string) => (s.vesselObject(id)!.toon.uniforms as unknown as { cavaRef: { value: { x: number; y: number } } }).cavaRef.value;
    for (const id of ['RHV_IVC', 'MHV_IVC', 'LHV_IVC']) { const r = ref(id); assert.equal(r.x, indexOf(B.get('IVC_IS')!.lensId), id); assert.equal(r.y, 1, `${id} joins at the cava's end`); }
    const r = ref('LRV_IVC'); assert.equal(r.x, indexOf(B.get('IVC_IS_1')!.lensId)); assert.equal(r.y, 0);
  } finally { s.dispose(); }
});
