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
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { widthSwell } from '../src/scene/vessels/live-width.ts';
import { REST, coursesOf, tubularOf } from '../src/scene/vessels/shape.ts';
import { buildTubes } from '../src/scene/vessels/tubes.ts';
import { shuntEnds } from '../src/scene/vessels/shunt-ends.ts';
import { EDGES } from '../src/engine/hales/portal/topology.js';
import { drawnShuntD, SHUNT_SOURCE } from '../src/engine/shunt-source.ts';
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
/** The measured ceilings (peak / host radius at an end, tube radius / source vein radius) of the shunts the complaint did not name: the ratio they had on 28 Nov, never more. */
const END_CEIL: Record<string, readonly [number, number]> = { S_PC: [1, 1.04], S_MC: [1.25, 1.01], S_DSR: [1.1, 1.25], REX: [1.25, 1.01], TIPS: [1.01, 1.01], DIPS: [1, 1] };
const SIZE_CEIL: Record<string, number> = { S_PC: 1, S_MC: 1.45, S_DSR: 1.1, REX: 1.24 };
/** The vein each surgical shunt leaves (the widest vein at its from-node). */
const SOURCE_VEIN: Record<string, string> = { S_PC: 'PV_TRUNK_1', S_MC: 'SMV_CONF', S_DSR: 'SV_MID', REX: 'SMV_CONF' };

test('every surgical shunt is drawn no wider than ITS ceiling against the vein it leaves; the portocaval shunt no wider than the portal trunk', () => {
  for (const id of Object.keys(SIZE_CEIL)) {
    const v = NETWORK_BY_ID.get(id)!, src = NETWORK_BY_ID.get(SOURCE_VEIN[id]!)!;
    const drawn = v.radius * swellOf(id);
    assert.ok(drawn / src.radius <= SIZE_CEIL[id]! + 1e-9, `${id} is drawn ${(drawn / src.radius).toFixed(3)} times ${src.id}`);
  }
  const pc = NETWORK_BY_ID.get('S_PC')!;
  assert.ok(pc.radius * swellOf('S_PC') <= NETWORK_BY_ID.get('PV_TRUNK_1')!.radius * swellOf('PV_TRUNK_1') + 1e-6, 'S_PC against the portal trunk (it was drawn 1.12 times as wide)');
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
  assert.deepEqual(Object.keys(SHUNT_SOURCE), ['S_PC']);
  const dOf = (m: Record<string, number>) => (e: string) => m[e];
  assert.equal(drawnShuntD('S_PC', 14, dOf({ PV_TRUNK: 12 })), 12);
  assert.equal(drawnShuntD('S_PC', 14, dOf({ PV_TRUNK: 16 })), 14);
  assert.equal(drawnShuntD('S_PC', 14, dOf({})), 14);
  assert.equal(drawnShuntD('S_MC', 10, dOf({ PV_TRUNK: 3 })), 10, 'a shunt with no source row keeps its diameter');
  const f = { Pf: new Float32Array(64), Qf: new Float32Array(EDGE_COUNT), D: new Float32Array(EDGE_COUNT) };
  f.D[indexOf('S_PC')] = 14; f.D[indexOf('PV_TRUNK')] = 12; f.D[indexOf('S_MC')] = 10;
  const out = fillVesselData(f as never, new Float32Array(EDGE_COUNT * 4));
  assert.equal(out[indexOf('S_PC') * 4 + 2], 12, 'the texture draws S_PC at the trunk\'s width');
  assert.equal(out[indexOf('S_MC') * 4 + 2], 10);
  assert.equal(out[indexOf('PV_TRUNK') * 4 + 2], 12, 'the source itself is untouched');
  assert.ok(EDGE_IDS.includes('S_PC'));
});
