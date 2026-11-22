// THE BAKE REMEMBERS WHICH RUNG OF THE REMESH LADDER EACH JUNCTION NEEDED (plan owner, 22 Nov: a rung that folds costs its whole remesh to find out, half the net bake). The same build starts on the rung that took, and the mesh is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNetMesh } from '../src/scene/vessels/net/mesh.ts';
import { fixtures } from './net-lib.ts';
// @ts-expect-error (a plain .mjs script)
import { sourceHash, readLadderFile } from '../scripts/net-ladder.mjs';

test('a build that starts on the remembered rung gives the same mesh as the full ladder', () => {
  let climbed = 0;
  for (const fx of fixtures()) {
    const ladder = new Map<string, number>(), cold = buildNetMesh(fx.skel, undefined, { maps: true, ladder }), warm = buildNetMesh(fx.skel, undefined, { maps: true, ladder });
    for (const v of ladder.values()) if (v > 0) climbed++;
    assert.deepEqual(Array.from(warm.mesh.index), Array.from(cold.mesh.index), `${fx.name}: the triangles`);
    assert.deepEqual(Array.from(warm.mesh.position), Array.from(cold.mesh.position), `${fx.name}: the vertices`);
  }
  assert.ok(climbed > 0, 'a fixture climbs the ladder (the test would otherwise prove nothing)');
});

test('the remembered rungs are keyed by the build: another skeleton or another start has its own key', () => {
  const [fx] = fixtures(), a = new Map<string, number>(), b = new Map<string, number>();
  buildNetMesh(fx!.skel, undefined, { ladder: a }); buildNetMesh(fx!.skel, undefined, { ladder: b });
  assert.deepEqual([...a], [...b], 'the same build, the same keys');
  const other = fixtures().find((f) => f.name !== fx!.name)!, c = new Map<string, number>();
  buildNetMesh(other.skel, undefined, { ladder: c });
  assert.ok(![...c.keys()].some((k) => a.has(k)), 'a different skeleton shares no key');
});

test('scripts/net-ladder.json is for the mesher as it stands (run `node scripts/bake-skins.mjs --net --force` and commit it after changing net/junction/)', () => {
  assert.equal(readLadderFile().code, sourceHash());
});
