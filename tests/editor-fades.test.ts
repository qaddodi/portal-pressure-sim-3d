import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setOverridesForTest } from '../src/editor/store.ts';
import { EMPTY } from '../src/editor/types.ts';
import { EDGES } from '../src/engine/hales/portal/topology.js';
import { fadeOf } from '../src/scene/vessels/fades.ts';
import { x3 } from '../src/scene/frame2d.ts';

const edges = EDGES as { id: string; from: string; to: string; kind: string }[];
const lineOf = (id: string): readonly number[] | undefined => fadeOf(id, false)?.line;

test('fade lines stand where the edited nodes and organs are: a moved junction and a carried liver move the lines, unedited they are the reference', () => {
  setOverridesForTest(EMPTY);
  const withLine = edges.filter((e) => lineOf(e.id));
  assert.ok(withLine.length > 3);
  const before = new Map(withLine.map((e) => [e.id, [...lineOf(e.id)!]]));
  // a liver bed (the sinusoid fades run node to node) goes with the liver
  setOverridesForTest({ version: 1, organs: { liver: { move: [0.1, 0, 0] } } });
  const beds = withLine.filter((e) => e.kind === 'liver');
  assert.ok(beds.length);
  for (const e of beds) { const a = lineOf(e.id)!, b = before.get(e.id)!; assert.ok(Math.abs(a[0]! - b[0]! - 0.1) < 0.01 && Math.abs(a[2]! - b[2]! - 0.1) < 0.01, `${e.id} bed fade line`); }
  // a vein that fades into its host (the line across it) goes with its sinking end when that node moves
  const sink = withLine.find((e) => e.kind !== 'liver' && e.id !== 'C9')!;
  setOverridesForTest({ version: 1, nodes: { [sink.to]: { dx: 30, dy: 0 } } });
  const moved = lineOf(sink.id)!, ref = before.get(sink.id)!;
  assert.ok(Math.abs(moved[0]! - ref[0]! - (x3(30) - x3(0))) < 0.01, `${sink.id}: ${moved[0]} against ${ref[0]}`);
  setOverridesForTest(EMPTY);
  for (const e of withLine) assert.deepEqual([...lineOf(e.id)!], before.get(e.id));
});
