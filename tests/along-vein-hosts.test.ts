// J14 (review of 27 Nov): an artery that runs beside veins which have no 2D path at all is a mistake to name, not "nothing to draw" in silence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alongVein } from '../src/scene/vessels/starts.ts';
import { piecesOf } from '../src/scene/anatomy/whole-pieces.ts';

test('an artery beside hosts that have no 2D path throws, naming it; with their paths it is drawn', () => {
  assert.throws(() => alongVein('A_HR', {}), /along-vein A_HR: none of its hosts/);
  // (the 2D figure's own course for the right portal vein's pieces: any line stands in here)
  const paths: Record<string, [number, number][]> = {};
  for (const h of piecesOf('PVH_R')) paths[h] = [[0, 0], [10, 0], [20, 5]];
  paths.A_HR = [[20, 5], [30, 20]];
  paths.A_HEP = [[0, 0], [2, 0], [4, 0], [6, 0], [8, 0], [10, 0], [12, 0], [14, 0], [16, 0], [18, 0]];
  paths.PRE_R = [[20, 5], [30, 20], [40, 30]];
  const out = alongVein('A_HR', paths);
  assert.ok(out && out.length > 2, 'drawn when a host has a path');
});
