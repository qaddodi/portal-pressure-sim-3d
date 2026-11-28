// THE PORTOCAVAL SHUNT'S SIZE AND ITS JOIN TO THE CAVA (Mohammad, 28 Nov: "Portocaval shunt is not smoothly connected to cava, seems big compared to vessel connected from").
// ROOT CAUSE, measured on the tubes: (1) the engine gives S_PC 14 mm and the portal trunk it leaves 12 mm, and the 2D width rule drew it 0.0290 against the trunk's 0.0259 (1.12 times); (2) its cava end is a sink end (not
// narrowed), and the end-to-side heel flare (+24 %) was not capped at the host like every generated end's, so the heel stood 0.0336 against the cava's 0.0270 (1.25 times): a bulge wider than the vein it is sewn into.
// FIX: a shunt is DRAWN no wider than the vein it leaves (engine/shunt-source.ts: the diameter the vessel texture and the clots read, so the tube's live swell is 0.89), and the portocaval row's cava end carries `capped` (the flare stops at the host's width).
// (The tube is still BUILT at 14 mm's width: building it at the trunk's moved the part of the portal skin that stands for the divided vein, so its seam ring lay 0.16 R inside the splenic vein's lumen, tests/skin-no-end-in-lumen.test.ts. S_PC is only ever drawn with the engine's diameters, so the swell is always on.)
// Pinned for EVERY shunt: its width against the vein it leaves, and its sewn ends' widest stretch against the host. The shunts the complaint did not name keep their measured ratios as a ceiling (they may not get worse; the
// ones over 1 are listed in the push report for him, not changed here).
// Node only. Run: node --test tests/shunt-size-join.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK_BY_ID, SHUNT_ORIGIN } from '../src/scene/vessels/network.ts';
import { widthSwell } from '../src/scene/vessels/live-width.ts';
import { REST, coursesOf, tubularOf } from '../src/scene/vessels/shape.ts';
import { buildTubes } from '../src/scene/vessels/tubes.ts';
import { shuntEnds } from '../src/scene/vessels/shunt-ends.ts';
import { EDGES } from '../src/engine/hales/portal/topology.js';
import { drawnShuntD, cappedShuntIds } from '../src/engine/shunt-source.ts';
import { EDGE_COUNT, EDGE_IDS, fillVesselData, indexOf } from '../src/engine/vessel-data.ts';

/** The engine's rest diameters of the vein each shunt leaves and of the shunt, mm (topology.js), and the swell a shunt is drawn at (the texture's diameter against the one it was built at). */
const dNow = (id: string): number => EDGES.find((e: { id: string }) => e.id === id)!.d as number;
const swellOf = (id: string): number => { const v = NETWORK_BY_ID.get(id)!; return widthSwell(v.widthKind, v.baseD, drawnShuntD(id, dNow(id), (e) => dNow(e))); };
/** The widest the tube stands in each end's last 30 % of its length, as drawn live (the built width times the shunt's swell), in scene units. */
function endPeaks(id: string): [number, number] {
  const v = NETWORK_BY_ID.get(id)!, c = coursesOf(v, REST)[0]!;
  const g = buildTubes([c], tubularOf(v, 32), v.radius), run = g.runs[0]!, a = g.geometry.getAttribute('rk'), ring = run.radial + 1, n = run.tubular;
  const m: [number, number] = [0, 0];
  for (let k = 0; k <= n; k++) { const r = a.getX(run.tubeStart + k * ring) * v.radius * swellOf(id); if (k < n * 0.3) m[0] = Math.max(m[0], r); if (k > n * 0.7) m[1] = Math.max(m[1], r); }
  return m;
}
/** The ceilings on peak / host radius at each end of every shunt: 1 (the host's own width) at the far end of a stent's body is allowed to the 4 % the sewn cap leaves. */
const END_CEIL: Record<string, readonly [number, number]> = { S_PC: [1.001, 1.04], S_MC: [1.001, 1.04], S_DSR: [1.001, 1.04], REX: [1.001, 1.04], TIPS: [1.01, 1.01], DIPS: [1, 1] };

test('every surgical shunt is drawn at 1x its origin vein\'s width or less (Mohammad, 28 Nov), with the engine\'s own rest diameters', () => {
  assert.deepEqual(Object.keys(SHUNT_ORIGIN).sort(), ['REX', 'S_DSR', 'S_MC', 'S_PC'], 'every surgical shunt has an origin vein');
  assert.deepEqual(cappedShuntIds().sort(), ['REX', 'S_DSR', 'S_MC', 'S_PC']);
  for (const [id, from] of Object.entries(SHUNT_ORIGIN)) {
    const v = NETWORK_BY_ID.get(id)!, o = NETWORK_BY_ID.get(from)!;
    const drawn = v.radius * swellOf(id), origin = o.radius * widthSwell(o.widthKind, o.baseD, dNow(o.lensId));
    assert.ok(drawn <= origin * 1.001, `${id} is drawn ${(drawn / origin).toFixed(3)} times ${from}`);
  }
});

test('every shunt\'s sewn ends stand no wider than the host\'s width (to its ceiling), the portocaval heel no wider than the cava', () => {
  for (const id of Object.keys(END_CEIL)) {
    const e = shuntEnds(id), pk = endPeaks(id);
    for (const i of [0, 1] as const) {
      const end = e?.[i];
      if (!end) continue;
      assert.ok(pk[i] / end.hostR <= END_CEIL[id]![i]! + 1e-9, `${id} end ${i}: ${(pk[i] / end.hostR).toFixed(3)} of the host's width`);
    }
  }
  const pc = shuntEnds('S_PC')![1]!;
  assert.equal(pc.capped, true, 'the portocaval cava end carries the cap');
  assert.ok(endPeaks('S_PC')[1] <= pc.hostR * 1.04 + 1e-9, 'the heel is at most the cava\'s width plus 4 %');
});

test('the drawn width: a shunt reads the smaller of its own and its source vein\'s engine diameter, in the texture and for the clots', () => {
    const dOf = (m: Record<string, number>) => (e: string) => m[e];
  assert.equal(drawnShuntD('S_PC', 14, dOf({ PV_TRUNK_1: 12 })), 12);
  assert.equal(drawnShuntD('S_PC', 14, dOf({ PV_TRUNK_1: 16 })), 14, 'a wider trunk leaves the shunt as it is');
  assert.equal(drawnShuntD('S_PC', 14, dOf({})), 14);
  assert.equal(drawnShuntD('TIPS', 8, dOf({ PV_TRUNK_1: 3 })), 8, 'a vessel with no rule keeps its diameter');
  const f = { Pf: new Float32Array(64), Qf: new Float32Array(EDGE_COUNT), D: new Float32Array(EDGE_COUNT) };
  for (const e of EDGES as { id: string; d?: number }[]) f.D[indexOf(e.id)] = e.d ?? 0;
  const out = fillVesselData(f as never, new Float32Array(EDGE_COUNT * 4));
  assert.equal(out[indexOf('S_PC') * 4 + 2], 12, 'the texture draws S_PC at the trunk\'s width');
  assert.equal(out[indexOf('S_MC') * 4 + 2], 6, 'the mesocaval shunt is drawn at the mesenteric vein\'s drawn calibre (6 mm\'s)');
  assert.equal(out[indexOf('PV_TRUNK') * 4 + 2], 12, 'the source itself is untouched');
  assert.ok(EDGE_IDS.includes('S_PC'));
});
