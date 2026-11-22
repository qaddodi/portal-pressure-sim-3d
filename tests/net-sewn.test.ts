// SEWN ENDS (plan owner, 22 Nov): every arm that is not a permanent vessel is sewn into its host as 2D draws it (sideEndScale narrows the end inside the host, flareScale flares the heel), sized from the host's LIVE lumen, in the one mesh and the one shader.
// Held here, node only: the table on the real skeleton, the shader's text against 2D's own constants, the oracle's collar against 2D's functions, and the node check the ruling asks for: at C3, C9 and DIPS the buried end's outline does not stand past its host's wall.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skeleton } from '../src/scene/vessels/net/skeleton.ts';
import { sewnEnds, topoEnd, SEWN_CAPPED, SEWN_FLARE, SEWN_INSIDE, SEWN_SINK } from '../src/scene/vessels/net/sewn.ts';
import { NET_SEWN_FS, NET_SEWN_VS, NET_VS, NET_GLOBALS, sewnPointIds } from '../src/scene/vessels/net/shaders.ts';
import { FLARE_K, FLARE_SPAN, SIDE_END_MIN, flareScale, sideEndScale } from '../src/scene/vessels/fork-joins.copied.js';
import { EDGE_LAYOUT } from '../src/scene/vessels/net/edge-state.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { isPermanent } from '../src/scene/vessels/skin/inventory.ts';
import { liveBones, liveStates, sewnCollar } from './net-oracle.ts';

const sk = skeleton(), sw = sewnEnds(sk), baseOf = (id: string): string => id.split('#')[0]!;
const permanent = (ei: number): boolean => { const v = NETWORK_BY_ID.get(baseOf(sk.edges[ei]!.id)); return !!v && isPermanent(v); };

test('the table: only non-permanent edges have sewn ends, each end\'s host is a permanent edge\'s bone at that very node', () => {
  let ends = 0;
  sw.forEach((pair, ei) => {
    if (permanent(ei)) { assert.deepEqual(pair, [null, null], `${sk.edges[ei]!.id} is permanent`); return; }
    pair.forEach((e, end) => {
      if (!e) return;
      ends++;
      const he = sk.bones[e.host]!.edge, node = end === 0 ? sk.edges[ei]!.from : sk.edges[ei]!.to, name = topoEnd(sk, ei, end as 0 | 1);
      assert.ok(permanent(he), `${sk.edges[ei]!.id} end ${end}: host ${sk.edges[he]!.id} is not permanent`);
      // (a sewn end is a free node of its own: its host meets it at the drawn network's node of that name; a wall start (DIPS, REX) lies on its host's node)
      assert.ok(sk.edges[he]!.from === node || sk.edges[he]!.to === node || (name !== null && [0, 1].some((x) => topoEnd(sk, he, x as 0 | 1) === name)), `${sk.edges[ei]!.id} end ${end}: host ${sk.edges[he]!.id} does not meet it at ${node}`);
    });
  });
  const named = (id: string): [boolean, boolean] => { const ei = sk.edges.findIndex((e) => e.id === id); return [!!sw[ei]![0], !!sw[ei]![1]]; };
  assert.deepEqual(named('C3'), [true, true]); assert.deepEqual(named('C9'), [true, true]); assert.deepEqual(named('DIPS'), [true, true]);
  assert.ok(ends >= 20, `${ends} sewn ends`);
  const s_pc = sw[sk.edges.findIndex((e) => e.id === 'S_PC')]![1]!;
  assert.ok(s_pc.flags & SEWN_SINK && s_pc.flags & SEWN_INSIDE && s_pc.flags & SEWN_FLARE && !(s_pc.flags & SEWN_CAPPED), 'the portocaval shunt\'s own row: inside, a sink, flared, not capped');
});

test('the shader\'s collar is 2D\'s: the constants and the three rules in the text, the host\'s lumen from sewnTex, one pass that writes it', () => {
  const f = (n: number): string => (Number.isInteger(n) ? n.toFixed(1) : String(n));
  assert.ok(NET_VS.includes(`${f(SIDE_END_MIN)} + (1.0 - ${f(SIDE_END_MIN)}) * t * t * (3.0 - 2.0 * t)`), 'sideEndScale\'s floor');
  assert.ok(NET_VS.includes(`1.0 + ${f(FLARE_K)} * t * t * (3.0 - 2.0 * t)`) && NET_VS.includes(`(${f(FLARE_SPAN)} * hostR)`), 'flareScale');
  assert.match(NET_VS, /swell \*= sewnCollar\(u, mix\(len, lenMap, circShare\), rest \* swell \* presence, row\);/);
  assert.ok(EDGE_LAYOUT.has('sewn') && NET_GLOBALS.sewnTex === 'sampler2D' && NET_GLOBALS.sewnRows === 'float');
  assert.match(NET_SEWN_VS, /netBone\(int\(hb \+ 0\.5\), true\)/, 'the host\'s lumen by the same radius rule');
  assert.match(NET_SEWN_VS, /float hb = end == 0 \? sewn\.x : sewn\.y;/);
  assert.ok(NET_SEWN_FS.includes('vHostLumen') && NET_SEWN_VS.split('float circWidthOf(').length === 2, 'one radius function');
  assert.deepEqual(Array.from(sewnPointIds(3)), [0, 1, 2, 3, 4, 5]);
});

test('the oracle\'s collar equals 2D\'s functions: narrowed and flared as the flags say, the flare capped at the host for a generated end', () => {
  const ends = { flare: { host: 0, flags: SEWN_INSIDE | SEWN_FLARE | SEWN_CAPPED }, sink: { host: 0, flags: SEWN_INSIDE | SEWN_SINK | SEWN_FLARE }, none: { host: 0, flags: 0 } };
  const R = 0.02, lumen = 0.012, arc = 1;
  for (const u of [0, 0.01, 0.02, 0.04, 0.08, 0.2, 0.5]) {
    const d = u * arc;
    const k = sewnCollar([ends.sink, null], u, arc, lumen, [R, 0]);
    assert.ok(Math.abs(k - (flareScale(d, R) as number)) < 1e-12, 'a sink flares and is not narrowed further');
    const g = sewnCollar([ends.flare, null], u, arc, lumen, [R, 0]);
    assert.ok(Math.abs(g - Math.min((sideEndScale(d, R) as number) * (flareScale(d, R) as number), Math.max(sideEndScale(d, R) as number, R / lumen))) < 1e-12, 'narrowed inside, flare cut at the host');
    assert.equal(sewnCollar([ends.none, null], u, arc, lumen, [R, 0]), 1);
  }
  assert.ok(Math.abs(sewnCollar([{ host: 0, flags: SEWN_INSIDE }, null], 0, 1, 0.01, [0.02, 0]) - SIDE_END_MIN) < 1e-12, 'the end itself is SIDE_END_MIN');
});

// the real hosts' lowest swell over the 20 presets (net-arm-ranges.md): a host that narrows takes the collar with it
const HOST_LOW: Record<string, number> = { PVH_L_1: 0.99, EPI_ILI: 1.0, IVC_IS: 0.72, AZY_SVC: 1.0, PVH_R: 0.99, IVC_IS_1: 0.72 };
test('node check: the sewn end of C3, C9 and DIPS lies inside its host (the end ring and its outline stand within the host\'s wall), at rest and at the host\'s lowest real swell; the collar is a collar (never wider than the arm or its host)', () => {
  const base = liveStates(sk)[0]![1];
  for (const id of ['C3', 'C9', 'DIPS']) {
    const ei = sk.edges.findIndex((e) => e.id === id), e = sk.edges[ei]!;
    sw[ei]!.forEach((end, which) => {
      if (!end) return;
      const hostEdge = sk.bones[end.host]!.edge, hostName = baseOf(sk.edges[hostEdge]!.id);
      for (const hs of [1, HOST_LOW[hostName] ?? 1]) {
        const st = { ...base, edges: base.edges.map((x, i) => (i === hostEdge ? { ...x, swell: hs } : x)), sewn: sw };
        const bones = liveBones(sk, st), plain = liveBones(sk, { ...st, sewn: undefined });
        const endBone = e.bones[0] + (which === 0 ? 0 : e.bones[1] - 1), hostL: number = bones[end.host]!.lumen, ink: number = 0.15 * hostL;   // (the figure's line is a fraction of a thin vessel's radius)
        assert.ok(bones[endBone]!.lumen + ink <= hostL + 1e-12, `${id} end ${which} @ host swell ${hs}: end ring ${bones[endBone]!.lumen.toFixed(4)} + ink ${ink.toFixed(4)} stands past the host's wall (${hostL.toFixed(4)})`);
        for (let k = 0; k < 4; k++) {   // (the collar's reach: the bones nearest this end)
          const bi = which === 0 ? e.bones[0] + k : e.bones[0] + e.bones[1] - 1 - k;
          assert.ok(bones[bi]!.lumen <= Math.max(plain[bi]!.lumen, hostL) + 1e-12, `${id} end ${which} bone ${k}: wider than its arm and its host`);
        }
      }
    });
  }
});
