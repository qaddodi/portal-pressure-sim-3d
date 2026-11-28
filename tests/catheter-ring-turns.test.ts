// The HVPG catheter (and every catheter on a route) turns smoothly from one ring to the next (owner, 28 Nov 2026: "the HVPG catheter kinks at the joint, should be smooth, no acute angles").
// Root cause: `limitBend` measured a bend over a window of about 6.7 shaft radii (bendWindow: a third of the least radius, never under three samples), and the tube is drawn in rings only about ONE shaft
// radius apart, so a turn of 33 degrees between two rings (a radius of 3 shaft radii) read as 12 radii and passed (tests/device-bends.test.ts walks the same coarse window). route3d.ts now measures over
// BEND_WINDOW_RC shaft radii, the ring gap. This test bounds the angle between consecutive ring chords itself, for every route, at rest and with the hepatic veins drawn narrower than built.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { setOrganData } from '../src/scene/organs/meshes.ts';
import { route3d } from '../src/scene/procedures/route3d.ts';
import { ROUTE_KINDS } from '../src/scene/procedures/route.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { indexOf } from '../src/engine/vessel-data.ts';

const file = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
setOrganData(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);

/** The most the shaft may turn between two rings (degrees), as proc-catheter.ts lays them (a ring every 2.4 route units, about one shaft radius): the HVPG catheter, and every other route. */
const HVPG_MAX = 16, ANY_MAX = 26;

/** The turn between consecutive ring chords along the way the shaft is drawn, as the catheter builds its rings. */
function ringTurns(kind: string, hepaticD: number | null): { worst: number; at: number; of: number } {
  const r3 = route3d(kind)!, r = r3.route;
  const D = new Array<number>(200).fill(NaN);
  if (hepaticD != null) for (const id of r.ids) { const v = NETWORK_BY_ID.get(id)!; D[indexOf(v.lensId)] = /RHV|HV|PVH|SIN/.test(id) ? hepaticD : v.baseD; }
  r3.setLive(hepaticD == null ? null : D);
  const nS = Math.max(24, Math.ceil(r.total / 2.4)), P: Vector3[] = [];
  for (let i = 0; i < nS; i++) P.push(r3.point((r.total * i) / (nS - 1), new Vector3()));
  let worst = 0, at = 0;
  for (let i = 1; i < nS - 1; i++) {
    const th = (P[i]!.clone().sub(P[i - 1]!).angleTo(P[i + 1]!.clone().sub(P[i]!)) * 180) / Math.PI;
    if (th > worst) { worst = th; at = i; }
  }
  return { worst, at, of: nS };
}

for (const hepaticD of [null, 8, 5, 3]) {
  test(`no catheter turns sharply between two rings (${hepaticD == null ? 'veins as built' : `hepatic veins at ${hepaticD} mm`})`, () => {
    for (const kind of ROUTE_KINDS) {
      const t = ringTurns(kind, hepaticD), max = kind === 'hvpg' ? HVPG_MAX : ANY_MAX;
      assert.ok(t.worst <= max, `the ${kind} catheter turns ${t.worst.toFixed(1)} degrees between rings ${t.at} and ${t.at + 1} of ${t.of}; the most is ${max}`);
    }
  });
}

test('the cava and the hepatic vein both narrowed (a collapsed cava) leave no elbow in the HVPG catheter either', () => {
  const r3 = route3d('hvpg')!;
  r3.setLive(new Array<number>(200).fill(5));
  const r = r3.route, nS = Math.max(24, Math.ceil(r.total / 2.4)), P: Vector3[] = [];
  for (let i = 0; i < nS; i++) P.push(r3.point((r.total * i) / (nS - 1), new Vector3()));
  let worst = 0;
  for (let i = 1; i < nS - 1; i++) worst = Math.max(worst, (P[i]!.clone().sub(P[i - 1]!).angleTo(P[i + 1]!.clone().sub(P[i]!)) * 180) / Math.PI);
  assert.ok(worst <= 45, `turns ${worst.toFixed(1)} degrees between two rings`);
});
