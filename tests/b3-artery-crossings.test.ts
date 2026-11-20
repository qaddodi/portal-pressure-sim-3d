// Mohammad, 20 Nov: "Artery cannot cross the veins"; the red arteriole strands into the sinusoid fans are not drawn; the caudate lobe's fan (unconnected twigs in the liver) is not drawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK, NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { x2d, y2d } from '../src/scene/frame2d.ts';

const P = (id: string): [number, number][] => NETWORK_BY_ID.get(id)!.pts.map((p) => [x2d(p[0]), y2d(p[1])]);
const HEPATIC = new Set(['A_HEP', 'A_HR', 'A_HL']);
const cross = (a: number[], b: number[], c: number[], d: number[]) => {
  const o = (p: number[], q: number[], r: number[]) => (q[0]! - p[0]!) * (r[1]! - p[1]!) - (q[1]! - p[1]!) * (r[0]! - p[0]!);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
};

test('the hepatic artery crosses no vein (and an arterioportal shunt, which ends in a vein, is the only artery that meets one)', () => {
  const arts = NETWORK.filter((v) => !v.feeder && v.tone === 'artery' && v.kind !== 'shunt');
  assert.ok(arts.some((a) => a.id === 'A_HEP'), 'the trunk stays');
  for (const a of arts) {
    const pa = P(a.id);
    for (const v of NETWORK) {
      if (v.feeder || v.tone === 'artery' || v.kind === 'shunt' || v.kind === 'liver' || v.id === 'C9') continue;   // (the hidden sinusoid beds; C9, the lumbar collateral behind everything, only when it is open)
      const pv = P(v.id);
      // (the one place the 2D plan makes an artery pass a vein: the hilum, where the hepatic artery, anterior to the portal vein and the cava, passes in front of the cava and behind the portal veins, checked below)
      const hilum = HEPATIC.has(a.id) && (v.id === 'PVH_L' || v.id === 'PVH_R' || v.id === 'PV_TRUNK' || v.tier === 'back');
      for (let i = 1; i < pa.length; i++) for (let j = 1; j < pv.length; j++) {
        const x = cross(pa[i - 1]!, pa[i]!, pv[j - 1]!, pv[j]!);
        if (!hilum) assert.ok(!x, `${a.id} crosses ${v.id}`);
        else if (x && v.tier === 'back') assert.ok(a.pts[i]![2] > v.pts[j]![2] + 0.008, `${a.id} passes ${v.id} (the cava) at the hilum in front of it`);
        else if (x) assert.ok(a.pts[i]![2] < v.pts[j]![2] - 0.008, `${a.id} passes ${v.id} at the hilum behind it`);
      }
    }
  }
});

test('the left and right hepatic arteries run beside their portal branches, a little below them, and fade out with them', () => {
  for (const [a, host] of [['A_HR', 'PVH_R_1'], ['A_HL', 'PVH_L_1']] as const) {
    const art = P(a), v = P(host);
    assert.equal(art.length, 64);
    const near = Math.min(...art.map((p) => Math.min(...v.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])))));
    assert.ok(near > 3 && near < 14, `${a} runs ${near.toFixed(1)} units from ${host}`);
    if (a === 'A_HR') assert.ok(art.reduce((t, p) => t + p[1], 0) / 64 < v.reduce((t, p) => t + p[1], 0) / 64 + 5, `${a} is above its vein`);   // (it passes the bifurcation in front and runs on over the right branch)
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
  const { TIER_Z } = await import('../src/scene/frame2d.ts');
  const { ORGAN_Z } = await import('../src/scene/organs/z.ts');
  const { NODE_RISE } = await import('../src/scene/vessels/smooth-joins.ts');
  for (const id of ['IVC_IS_1', 'IVC_IS', 'IVCS_RA', 'SVC_RA', 'RHV_IVC', 'LRV_IVC']) {
    const z = coursesOf(NETWORK_BY_ID.get(id)!, REST)[0]!.pts.map((p) => p[2]);
    assert.ok(Math.max(...z) - Math.min(...z) < 0.02, `${id} is level`);
    assert.ok(Math.abs(z[0]! - TIER_Z.back) < 0.02, `${id} is on the cava's plane`);
  }
  assert.equal(NODE_RISE.get('RA')!.z, TIER_Z.back, 'the cava enters the atrium level');
  assert.ok(Math.abs(ORGAN_Z['heart-ra']! + 0.11 - TIER_Z.back) < 1e-9, 'the atrium (mesh centre 0.11) is centred on the same plane');
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
  assert.deepEqual(LIVER_BRANCHES.map((b) => b.host).sort(), ['PVH_L_1', 'PVH_R_2', 'RHV_IVC_1']);   // (the left hepatic vein has only its through branch, bent down into the left lobe; every other vein one tube and one side branch: one construction)
  for (const b of LIVER_BRANCHES) {
    // (a branching vein runs on as one tube and has one side branch; the left hepatic vein has none)
    assert.equal(b.list.length, 1, `${b.host}: branches`);
    const [a] = b.list as readonly { pts: readonly (readonly [number, number])[]; dz: readonly number[] }[];
    const host = PATHS[b.host]!, onHost = (p: readonly [number, number]) => Math.min(...host.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])));
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
      const fades = !!f && (atStart ? f.a0 < 1 : f.a1 < 1);
      if (!fades) blunt.push(`${v.id}@${atStart ? 'start' : 'end'}`);
    }
  }
  assert.deepEqual(blunt, [], `free ends that neither join nor fade: ${blunt.join(', ')}`);
});

test('the azygos arch fades in from its free left end (no blunt hook over the right atrium)', async () => {
  const { fadeOf } = await import('../src/scene/vessels/fades.ts');
  const f = fadeOf('AZY_SVC', false)!;
  assert.ok(f && f.mode === 1 && f.a0 === 0 && f.a1 === 1, 'fades in from its free left end');
  // (the esophageal collateral meets the arch at its 2D start: the arch is carried on to the left and fades in over that stretch alone, so the collateral joins where it is solid)
  const { startInOrganShare } = await import('../src/scene/vessels/starts.ts');
  const { EDGE_PATH_2D } = await import('../src/scene/vessels/paths.copied.ts');
  const share = startInOrganShare('AZY_SVC', EDGE_PATH_2D.AZY_SVC!);
  assert.ok(share > 0.15 && Math.abs(f.to - share) < 1e-9, `faded in over the carried-on stretch (${share}) and solid where the collateral meets it`);
});

test('the hepatic artery\'s blood runs on through its junction into both branches (the stream chain carries it), and the lobar arteries fade out with their portal branches', async () => {
  const { INFO } = await import('../src/scene/blood/chain.ts');
  const { EDGES } = await import('../src/engine/hales/portal/topology.js');
  for (const id of ['A_HEP', 'A_HR', 'A_HL']) assert.ok(INFO[(EDGES as { id: string }[]).findIndex((e) => e.id === id)], `${id} is in the chain`);
  const { fadeOf } = await import('../src/scene/vessels/fades.ts');
  for (const id of ['A_HR', 'A_HL']) { const f = fadeOf(id, true)!; assert.ok(f.a1 === 0 && 1 - f.from >= 0.5, `${id} fades out over at least half its length`); }
});
