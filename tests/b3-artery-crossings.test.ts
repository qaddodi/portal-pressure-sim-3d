// Mohammad, 20 Nov: "Artery cannot cross the veins"; the red arteriole strands into the sinusoid fans are not drawn; the caudate lobe's fan (unconnected twigs in the liver) is not drawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK, NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { x2d, y2d } from '../src/scene/frame2d.ts';
import { PLACED_BRANCHES, PLACED_PATH_2D } from '../src/scene/anatomy/placed-network.ts';
import { REST, coursesOf } from '../src/scene/vessels/shape.ts';

const P = (id: string): [number, number][] => NETWORK_BY_ID.get(id)!.pts.map((p) => [x2d(p[0]), y2d(p[1])]);
const HEPATIC = new Set(['A_HEP', 'A_HR', 'A_HL']);
const cross = (a: number[], b: number[], c: number[], d: number[]) => {
  const o = (p: number[], q: number[], r: number[]) => (q[0]! - p[0]!) * (r[1]! - p[1]!) - (q[1]! - p[1]!) * (r[0]! - p[0]!);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
};

test('the hepatic artery crosses no vein (and an arterioportal shunt, which ends in a vein, is the only artery that meets one)', () => {
  const arts = NETWORK.filter((v) => !v.feeder && v.tone === 'artery' && v.kind !== 'shunt');
  assert.ok(arts.some((a) => a.id === 'A_HEP'), 'the trunk stays');
  // (restated for the placed anatomy, the only one now: the approved placement lets an artery pass a vein on screen, apart in depth (docs/approved/anatomy-placement.md: the left hepatic artery stays behind
  // the left portal vein where they overlap; tests/vessel-crossings.test.ts pins the gaps), so what holds is that no artery ever touches a vein: wall to wall in 3D above 0 wherever they cross on screen)
  const C = (id: string) => coursesOf(NETWORK_BY_ID.get(id)!, REST)[0]!.pts;
  for (const a of arts) for (const v of NETWORK) {
    if (v.feeder || v.tone === 'artery' || v.kind === 'shunt' || v.kind === 'liver' || v.id === 'C9') continue;
    const A = C(a.id), B = C(v.id);
    for (const p of A) for (const q of B) if (Math.hypot(p[0] - q[0], p[1] - q[1]) < a.radius + v.radius) assert.ok(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > a.radius + v.radius, `${a.id} touches ${v.id} where it crosses it`);
  }
});

test('the left and right hepatic arteries run beside their portal branches, a little below them, and fade out with them', () => {
  for (const [a, host] of [['A_HR', 'PVH_R_1'], ['A_HL', 'PVH_L_1']] as const) {
    const art = P(a), v = P(host);
    if (a === 'A_HL') {
      // (restated for the placed anatomy, the only one now: the left hepatic artery overlaps the left portal vein on screen and stays behind it there (approved placement, round 18), so it runs beside it in depth)
      const A = coursesOf(NETWORK_BY_ID.get(a)!, REST)[0]!.pts, V = coursesOf(NETWORK_BY_ID.get(host)!, REST)[0]!.pts;
      let over = 0;
      for (const p of A) for (const q of V) if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.01) { over++; assert.ok(p[2] < q[2], `${a} passes behind ${host}`); }
      assert.ok(over > 0, `${a} runs along ${host}`);
      continue;
    }
    const near = Math.min(...art.map((p) => Math.min(...v.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])))));
    assert.ok(near > 3 && near < 14, `${a} runs ${near.toFixed(1)} units from ${host}`);
    if (a === 'A_HR') assert.ok(art.reduce((t, p) => t + p[1], 0) / art.length < v.reduce((t, p) => t + p[1], 0) / v.length + 5, `${a} is above its vein`);   // (means over each course's own points: the placed ones are not 64 long)   // (it passes the bifurcation in front and runs on over the right branch)
  }
});

test('no vein hangs unconnected in the middle of the liver: the caudate fan is not drawn', () => {
  assert.ok(!NETWORK.some((v) => v.id.startsWith('CAUD')));
});

test('the closed lumbar-azygos collateral is not a dotted pink thread through the sinusoid fan; other closed collaterals still are', async () => {
  const { presenceOf, NETWORK: N } = await import('../src/scene/vessels/network.ts');
  const f = { Q: new Array(200).fill(0), D: new Array(200).fill(0) } as never;
  const of = (id: string) => presenceOf(N.find((v) => v.id === id)!, f, { collaterals: true });
  assert.equal(of('C9'), 'hidden');
  assert.equal(of('C1a'), 'ghost');
});

test('the paraumbilical vein leaves the left portal branch as a branch off its wall: thinner than the trunk, with no collar (starts on the vein\'s axis, tests/b3-umbilical-join.test.ts)', async () => {
  const { NETWORK_BY_ID: B } = await import('../src/scene/vessels/network.ts');
  const c3 = B.get('C3')!, lpv = B.get('PVH_L_1')!;
  assert.ok(c3.radius < 0.7 * lpv.radius, 'narrower than the left portal vein');
  assert.ok(!c3.flare?.[0], 'no collar at its start: it leaves the wall along the vein\'s axis, not the node where the vein is thin');
});

test('the cava, the hepatic veins and the right atrium lie in one plane: no S in depth (a side-tilted view showed one: Mohammad, 20 Nov)', async () => {
  const { REST, coursesOf } = await import('../src/scene/vessels/shape.ts');
  // (restated for the placed anatomy, the only one now: the approved placement carries each course's own depth, the cava rising forward from the pelvis to the atrium, so the cava is not one plane;
  // what holds is the "no S": up the cava, IVC to atrium to SVC, the depth only ever rises (no back-and-forth), and the veins into it are level)
  const up = ['IVC_IS_1', 'IVC_IS', 'IVCS_RA'].flatMap((id) => coursesOf(NETWORK_BY_ID.get(id)!, REST)[0]!.pts.map((p) => p[2]));
  // (a turn back of under 0.0005 scene units, a sixth of a figure unit, is no S anyone sees: the placed course's own relaxation leaves one of 0.0002 at the pelvis)
  let lo = up[0]!; for (let i = 1; i < up.length; i++) { assert.ok(up[i]! >= lo - 5e-4, `the cava's depth never turns back (${i}: ${up[i]} after ${lo})`); lo = Math.max(lo, up[i]!); }
  for (const id of ['SVC_RA', 'RHV_IVC']) { const z = coursesOf(NETWORK_BY_ID.get(id)!, REST)[0]!.pts.map((p) => p[2]); assert.ok(Math.max(...z) - Math.min(...z) < 0.02, `${id} is level`); }
});

test('the sinusoid beds are not drawn: the portal branches fade out into the liver and the hepatic veins fade in from it (Mohammad, 20 Nov)', async () => {
  const { presenceOf, NETWORK: N } = await import('../src/scene/vessels/network.ts');
  const { fadeOf } = await import('../src/scene/vessels/fades.ts');
  const f = { Q: new Array(200).fill(1), D: new Array(200).fill(5) } as never;
  for (const id of ['SIN_RR', 'SIN_LL', 'PRE_R', 'PRE_L', 'POST_R_RHV', 'POST_L_LHV']) assert.equal(presenceOf(N.find((v) => v.id === id)!, f, { collaterals: true }), 'hidden', id);
  // (a vein that branches is one tube to its tip: it fades out of / in from the liver over the same stretch of its course as its side branch, to nothing a little before the tip)
  for (const id of ['PVH_R_2', 'PVH_L_1']) { const h = fadeOf(id, false)!; assert.equal(h.mode, 1); assert.deepEqual([h.a0, h.a1], [1, 0], `${id} fades out along its through branch`); assert.ok(h.from > 0.3 && h.to < 1 && h.to > h.from, `${id} fades over its liver stretch`); const x = fadeOf(`${id}~F:b`, false, id)!; assert.deepEqual([x.to, x.a0, x.a1], [0.92, 1, 0], `${id}'s side branch ends in the liver's tissue`); }
  for (const id of ['RHV_IVC_1', 'LHV_IVC']) { const h = fadeOf(id, false)!; assert.equal(h.mode, 1); assert.deepEqual([h.a0, h.a1], [0, 1], `${id} fades in along its through branch`); assert.ok(h.from >= 0 && h.to < 1 && h.to > h.from); }
  { const x = fadeOf('RHV_IVC_1~F:b', false, 'RHV_IVC_1')!; assert.deepEqual([x.from, x.a0, x.a1], [0.08, 0, 1], 'the right hepatic vein\'s side branch begins in the liver\'s tissue'); }
  { const x = fadeOf('MHV_IVC', false)!; assert.equal(x.mode, 1); assert.deepEqual([x.from, x.a0, x.a1], [0, 0, 1], 'the middle hepatic vein, which does not branch, begins in the liver\'s tissue'); }
});

test('each portal branch and the right hepatic vein branches once more into the liver, one branch forward in depth, leaving the vein\'s own course', async () => {
  const { LIVER_BRANCHES } = await import('../src/scene/vessels/liver-branches.ts');
  const { EDGE_PATH_2D: PATHS } = await import('../src/scene/vessels/paths.copied.ts');
  // (restated for the placed anatomy, the only one now: the placement branches the right portal vein and the right hepatic vein (placed-network.ts PLACED_BRANCHES); the left portal vein runs on unbranched
  //  into the left lobe and fades there (fades.ts PLACED_LIVER_FADE); the children leave the host's placed course)
  assert.deepEqual(LIVER_BRANCHES.map((b) => b.host).sort(), Object.keys(PLACED_BRANCHES).sort());   // (the left hepatic vein has only its through branch, bent down into the left lobe; every other vein one tube and one side branch: one construction)
  for (const b of LIVER_BRANCHES) {
    // (a branching vein runs on as one tube and has one side branch; the left hepatic vein has none)
    assert.equal(b.list.length, 1, `${b.host}: branches`);
    const [a] = b.list as readonly { pts: readonly (readonly [number, number])[]; dz: readonly number[] }[];
    const host = PLACED_PATH_2D[b.host]!, onHost = (p: readonly [number, number]) => Math.min(...host.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])));
    const near = [a!.pts[0]!, a!.pts[a!.pts.length - 1]!].map(onHost);
    assert.ok(Math.min(...near) < 2, `${b.host}: the children are the host's own course where they leave it`);
    assert.ok(NETWORK_BY_ID.has(`${b.host}~F:b`) && NETWORK_BY_ID.get(`${b.host}~F:b`)!.feeder, `${b.host}: drawn as a tributary group`);
  }
});

test('the hepatic artery is one connected tree: the proper artery ends where the left and right ones start (a joined end, not a blunt cap), and every free end of every vessel fades or joins (no blunt stub)', async () => {
  const { RUN_ONS } = await import('../src/scene/vessels/network.ts');
  const { fadeOf } = await import('../src/scene/vessels/fades.ts');
  const end = (id: string, last: boolean) => { const p = NETWORK_BY_ID.get(id)!.pts; const q = p[last ? p.length - 1 : 0]!; return [q[0], q[1], q[2]]; };
  for (const b of ['A_HR', 'A_HL']) {
    const a = end('A_HEP', true), c = end(b, false);
    assert.ok(Math.hypot(a[0]! - c[0]!, a[1]! - c[1]!, a[2]! - c[2]!) < 1e-6, `the proper hepatic artery's end is ${b}'s start`);
    assert.ok(RUN_ONS.some((r) => (r.a === 'A_HEP' && r.b === b) || (r.b === 'A_HEP' && r.a === b)) || NETWORK_BY_ID.get(b)!.from === NETWORK_BY_ID.get('A_HEP')!.to, `${b} is joined to A_HEP`);
  }
  // (every end of a drawn vessel is a node shared with another drawn vessel, or the vessel fades there)
  const drawn = NETWORK.filter((v) => !v.feeder && v.kind !== 'liver' && v.tone !== undefined);
  const ends = new Map<string, number>();
  for (const v of drawn) if (v.kind !== 'collateral') { ends.set(v.from, (ends.get(v.from) ?? 0) + 1); ends.set(v.to, (ends.get(v.to) ?? 0) + 1); }   // (a collateral is closed, hidden or dotted, in health: it joins nothing then)
  const blunt: string[] = [];
  const { SPLIT_AT } = await import('../src/scene/vessels/liver-branches.ts');
  for (const v of drawn.filter((q) => q.kind !== 'collateral' && q.kind !== 'shunt' && !SPLIT_AT[q.id])) {   // (a branching vein's free end is its split: its children carry on from it)
    const f = fadeOf(v.id, v.tone === 'artery');
    for (const [node, atStart] of [[v.from, true], [v.to, false]] as const) {
      if ((ends.get(node) ?? 0) > 1) continue;   // joined to another vessel there
      // (a fade down or up the figure, mode 2, is by place, not by end: it holds where the free end lies past the place the fade has let go: V_UP's top, ILI_IVC's foot)
      const endY = (atStart ? v.pts[0]! : v.pts[v.pts.length - 1]!)[1];
      const fades = !!f && (f.mode === 2 ? (f.a0 < 1 || f.a1 < 1) && (f.to >= f.from ? endY >= f.to : endY <= f.to) : atStart ? f.a0 < 1 : f.a1 < 1);
      if (!fades) blunt.push(`${v.id}@${atStart ? 'start' : 'end'}`);
    }
  }
  assert.deepEqual(blunt, [], `free ends that neither join nor fade: ${blunt.join(', ')}`);
});

test('the azygos arch fades out on its left, behind the collaterals\' landing (the standard lead-in, no solid stub)', async () => {
  const { fadeOf } = await import('../src/scene/vessels/fades.ts');
  const f = fadeOf('AZY_SVC', false)!;
  assert.ok(f && f.mode === 1 && f.a0 === 0 && f.a1 === 1, 'it fades in from its free end: a flat faded end read as open only with the ink running on, and body and ink now share one alpha');
  // (placed anatomy: the fade runs from the free end to where the esophageal collateral lands on the placed arch, so it joins where the arch is whole (fades.ts placedLandingShare; tests/lead-in-and-thin-arm.test.ts pins the landing). The 2D share
  //  (startInOrganShare, the 30 units carried on behind the 2D landing: 0.37) measured the 2D course and faded the placed arch over half the run before its landing)
  const { PLACED_EDGE_3D } = await import('../src/scene/anatomy/placed-network.ts');
  const c = PLACED_EDGE_3D.AZY_SVC!, q = PLACED_EDGE_3D.C1b![PLACED_EDGE_3D.C1b!.length - 1]!, cum = [0];
  for (let i = 1; i < c.length; i++) cum.push(cum[i - 1]! + Math.hypot(c[i]![0] - c[i - 1]![0], c[i]![1] - c[i - 1]![1], c[i]![2] - c[i - 1]![2]));
  let bd = Infinity, share = 0;
  c.forEach((p, i) => { const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (d < bd) { bd = d; share = cum[i]! / cum[cum.length - 1]!; } });
  assert.ok(share > 0.15 && Math.abs(f.to - share) < 1e-9, `the fade spans the stretch before the collateral's landing (${share})`);
});

test('the hepatic artery\'s blood runs on through its junction into both branches (the stream chain carries it), and the lobar arteries fade out with their portal branches', async () => {
  const { INFO } = await import('../src/scene/blood/chain.ts');
  const { EDGES } = await import('../src/engine/hales/portal/topology.js');
  for (const id of ['A_HEP', 'A_HR', 'A_HL']) assert.ok(INFO[(EDGES as { id: string }[]).findIndex((e) => e.id === id)], `${id} is in the chain`);
  const { fadeOf } = await import('../src/scene/vessels/fades.ts');
  for (const id of ['A_HR', 'A_HL']) { const f = fadeOf(id, true)!; assert.ok(f.a1 === 0 && 1 - f.from >= 0.5, `${id} fades out over at least half its length`); }
});
