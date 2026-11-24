import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setOverridesForTest } from '../src/editor/store.ts';
import { EMPTY } from '../src/editor/types.ts';
import { EDGES } from '../src/engine/hales/portal/topology.js';
import { NODE_ORGAN } from '../src/scene/vessels/organ-follow.ts';

type Net = typeof import('../src/scene/vessels/network.ts');
const load = (q: string): Promise<Net> => import(new URL('../src/scene/vessels/network.ts?' + q, import.meta.url).href) as Promise<Net>;
const edges = EDGES as { id: string; from: string; to: string; kind: string }[];

test('vessels in or on an edited organ follow it; the rest stay; unedited organs change nothing', async () => {
  setOverridesForTest(EMPTY);
  const ref = await load('organs-ref');
  // (courseOf builds lazily on the shared start rules: take the reference courses before the edit is set)
  const base = new Map(ref.MAPPED.map((v) => [v.id, ref.courseOf(v.id)] as const));
  setOverridesForTest({ version: 1, organs: { liver: { move: [0.1, 0, 0] }, spleen: { move: [0, 0.08, 0] } } });
  const mod = await load('organs-edited');
  const end = (m: Net, id: string, which: 0 | 1): readonly number[] => { const c = m.courseOf(id); return which ? c[c.length - 1]! : c[0]!; };
  const d = (id: string, which: 0 | 1): number[] => { const a = end(mod, id, which), c = base.get(id)!, b = which ? c[c.length - 1]! : c[0]!; return [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!]; };
  const mapped = new Set(ref.MAPPED.map((v) => v.id));
  // a bed inside the liver goes whole
  const bed = edges.find((e) => e.kind === 'liver' && mapped.has(e.id))!;
  assert.ok(Math.abs(d(bed.id, 0)[0]! - 0.1) < 1e-3 && Math.abs(d(bed.id, 1)[0]! - 0.1) < 1e-3, `bed ${bed.id}`);
  // a hepatic vein starts in the liver (follows) and ends at the cava (stays)
  const rhv = edges.find((e) => NODE_ORGAN[e.from] === 'liver' && !NODE_ORGAN[e.to] && e.kind === 'vein' && mapped.has(e.id))!;
  assert.ok(Math.abs(d(rhv.id, 0)[0]! - 0.1) < 0.01, `${rhv.id} start ${JSON.stringify(d(rhv.id, 0))} ${rhv.from}`);
  assert.ok(Math.hypot(...(d(rhv.id, 1) as [number, number, number])) < 1e-6, `${rhv.id} end stays`);
  // the splenic hilum follows the spleen
  const spl = edges.find((e) => (e.from === 'SPL' || e.to === 'SPL') && mapped.has(e.id))!;
  assert.ok(Math.abs(d(spl.id, spl.from === 'SPL' ? 0 : 1)[1]!) > 0.05, `${spl.id} at the hilum ${JSON.stringify(d(spl.id, 0))} ${JSON.stringify(d(spl.id, 1))} ${spl.from}>${spl.to}`);
  // a vessel far from both organs is untouched, byte for byte
  const far = ref.MAPPED.find((v) => !NODE_ORGAN[v.from] && !NODE_ORGAN[v.to] && v.kind !== 'liver')!;
  assert.equal(JSON.stringify(mod.courseOf(far.id)), JSON.stringify(base.get(far.id)));
  setOverridesForTest(EMPTY);
});
