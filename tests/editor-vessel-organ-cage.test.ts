import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CatmullRomCurve3, TubeGeometry, Vector3 } from 'three';
import { setOverridesForTest } from '../src/editor/store.ts';
import { EMPTY, type Overrides } from '../src/editor/types.ts';
import { EDGES } from '../src/engine/hales/portal/topology.js';
import { NODE_ORGAN } from '../src/scene/vessels/organ-follow.ts';
import { endVesselPreview, previewRigCount, previewVesselEdits, setVesselPreviewHost } from '../src/scene/vessels/edit-preview.ts';

type Net = typeof import('../src/scene/vessels/network.ts');
const load = (q: string): Promise<Net> => import(new URL('../src/scene/vessels/network.ts?' + q, import.meta.url).href) as Promise<Net>;
const edges = EDGES as { id: string; from: string; to: string; kind: string }[];

test('a caged liver and a gridded liver carry the vessels in them: a bed and a hepatic vein end follow the cage and the grid', async () => {
  setOverridesForTest(EMPTY);
  const ref = await load('cage-ref'), mapped = new Set(ref.MAPPED.map((v) => v.id));
  const base = new Map(ref.MAPPED.map((v) => [v.id, ref.courseOf(v.id)] as const));
  const bed = edges.find((e) => e.kind === 'liver' && mapped.has(e.id))!, rhv = edges.find((e) => NODE_ORGAN[e.from] === 'liver' && !NODE_ORGAN[e.to] && e.kind === 'vein' && mapped.has(e.id))!;
  const cage: Overrides = { version: 1, organs: { liver: { cage: { n: [2, 2, 2], d: Array.from({ length: 8 }, () => [0.05, 0, 0] as const) } } } };
  const grid: Overrides = { version: 1, organs: { liver: { grid: { n: [4, 4, 4], lo: [-3, -3, -3], hi: [3, 3, 3], d: Array.from({ length: 64 * 3 }, (_, i) => (i % 3 === 0 ? 0.03 : 0)) } } } };
  for (const [name, o, want] of [['cage', cage, 0.05], ['grid', grid, 0.03]] as const) {
    setOverridesForTest(o);
    const mod = await load(`${name}-edited`);
    const at = (id: string, k: 0 | 1): number => { const c = mod.courseOf(id), b = base.get(id)!; return (k ? c[c.length - 1]![0]! - b[b.length - 1]![0]! : c[0]![0]! - b[0]![0]!); };
    assert.ok(Math.abs(at(bed.id, 0) - want) < 0.01 && Math.abs(at(bed.id, 1) - want) < 0.01, `${name}: bed ${bed.id} moved ${at(bed.id, 0)}`);
    assert.ok(Math.abs(at(rhv.id, 0) - want) < 0.015, `${name}: ${rhv.id} start moved ${at(rhv.id, 0)}`);
  }
  setOverridesForTest(EMPTY);
});

test('live organ drag: the vessels in the organ follow through the preview, and a release puts the buffers back', async () => {
  setOverridesForTest(EMPTY);
  const net = await load('live-organ'), mapped = net.MAPPED;
  const bed = mapped.find((v) => v.kind === 'liver')!;
  const geo = new TubeGeometry(new CatmullRomCurve3(bed.pts.map((p) => new Vector3(p[0], p[1], p[2]))), 60, 0.003, 8, false);
  const rest = (geo.getAttribute('position').array as Float32Array).slice();
  setVesselPreviewHost(() => ({ tubes: new Map([[bed.id, geo]]), skins: [] }));
  previewVesselEdits({ version: 1, organs: { liver: { move: [0.1, 0, 0] } } });
  assert.ok(previewRigCount() >= 1);
  const pos = geo.getAttribute('position').array as Float32Array;
  let sum = 0;
  for (let i = 0; i < pos.length; i += 3) sum += pos[i]! - rest[i]!;
  assert.ok(Math.abs(sum / (pos.length / 3) - 0.1) < 0.01, `mean shift ${sum / (pos.length / 3)}`);
  endVesselPreview();
  assert.deepEqual([...(geo.getAttribute('position').array as Float32Array)], [...rest]);
  setVesselPreviewHost(null);
});
