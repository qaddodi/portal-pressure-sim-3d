// The scope's way down the oesophagus has no kinks (owner, 25 Nov 2026: "the top of the esophagus is kinked ... when the scope drops it takes ungodly kinks and turns in the beginning. Should be smooth"). Cause: eso-axis.ts
// read the mesh's ragged top fringe (rows 2.03+, a sliver of one wall) as the tube's middle, so the sideways shift stepped 0.025 in one row and the way turned 8 and 15 degrees within 0.004. The test walks both of the
// scope's ways (the echoendoscope's and the glue slide's) in scene units, shift and depth included, and bounds the turn per step and the curvature, over the whole way and over the upper oesophagus on its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { organsReady, setOrganData } from '../src/scene/organs/meshes.ts';
import { scopeWay, glueScopeWay, scopeZ, wayShift } from '../src/scene/devices/probes/scope.ts';
import { x3, y3 } from '../src/scene/frame2d.ts';

const file = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
setOrganData(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);

/** The most the way may turn between one sample and the next (degrees; samples are 0.004 apart) and the tightest bend radius it may have (scene units; the old way turned 15 degrees in one step, radius 0.015). */
const MAX_TURN_DEG = 2.5, MIN_RADIUS = 0.09;
/** The whole way is allowed a little more below the oesophagus: the cardia and the stomach turn for real (the 2D way's own Gaussian-eased bend, unchanged), which the upper oesophagus never does. */
const MAX_TURN_ALL = 3, MIN_RADIUS_ALL = 0.09;
const UPPER_Y = 1.45;   // (the upper oesophagus: from the lead-in down to here, above the cardia's own bend)

for (const [name, way] of [['the echoendoscope\'s way', () => scopeWay()], ['the glue slide\'s way', () => glueScopeWay()]] as const) {
  test(`${name} has no kink: bounded turn and curvature, whole way and upper oesophagus`, async () => {
    await organsReady;
    const w = way(), P = w.pts.map((p) => { const y = y3(p[1]), x = x3(p[0]) + wayShift(y); return [x, y, scopeZ(x, y)] as const; });
    let worstTurn = 0, worstUp = 0, minR = Infinity, minRUp = Infinity;
    for (let i = 1; i < P.length - 1; i++) {
      const a = P[i - 1]!, b = P[i]!, c = P[i + 1]!, u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
      const lu = Math.hypot(u[0]!, u[1]!, u[2]!), lv = Math.hypot(v[0]!, v[1]!, v[2]!);
      const turn = Math.acos(Math.min(1, (u[0]! * v[0]! + u[1]! * v[1]! + u[2]! * v[2]!) / (lu * lv)));
      const r = turn > 1e-9 ? (0.5 * (lu + lv)) / turn : Infinity;
      worstTurn = Math.max(worstTurn, turn * 180 / Math.PI); minR = Math.min(minR, r);
      if (b[1] >= UPPER_Y) { worstUp = Math.max(worstUp, turn * 180 / Math.PI); minRUp = Math.min(minRUp, r); }
    }
    assert.ok(worstTurn <= MAX_TURN_ALL, `largest turn between samples ${worstTurn.toFixed(2)} deg (limit ${MAX_TURN_ALL})`);
    assert.ok(worstUp <= MAX_TURN_DEG && minRUp >= MIN_RADIUS, `upper oesophagus: largest turn ${worstUp.toFixed(2)} deg, tightest radius ${minRUp.toFixed(3)}`);
    assert.ok(minR >= MIN_RADIUS_ALL, `tightest bend radius ${minR.toFixed(3)} (upper ${minRUp.toFixed(3)}), limit ${MIN_RADIUS_ALL} (upper ${MIN_RADIUS})`);
  });
}

test('the sideways shift has no step: it changes by less than 0.0015 per 0.005 of height everywhere', async () => {
  await organsReady;
  let worst = 0;
  for (let y = 2.5; y > 0.95; y -= 0.005) worst = Math.max(worst, Math.abs(wayShift(y) - wayShift(y - 0.005)));
  assert.ok(worst < 0.0015, `largest shift per 0.005 of height ${worst.toFixed(5)}`);
});

test('the scope stays in the middle of the drawn oesophagus at its top: within a fifth of the tube\'s width of the slice\'s middle, and the tube\'s own edges run straight there', async () => {
  await organsReady;
  const { ORGAN_MESHES } = await import('../src/scene/organs/meshes.ts');
  const pos = ORGAN_MESHES.stomach!().getAttribute('position').array, w = scopeWay();
  const edge = (y: number): [number, number] => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < pos.length; i += 3) if (Math.abs(pos[i + 1]! - y) < 0.006) { lo = Math.min(lo, pos[i]!); hi = Math.max(hi, pos[i]!); } return [lo, hi]; };
  let worstOff = 0, worstEdge = 0, prev: [number, number] | null = null;
  for (const p of w.pts) {
    const y = y3(p[1]); if (y > 2.02 || y < 1.7) continue;
    const [lo, hi] = edge(y), x = x3(p[0]) + wayShift(y);
    worstOff = Math.max(worstOff, Math.abs(x - (lo + hi) / 2) / (hi - lo));
    if (prev) worstEdge = Math.max(worstEdge, Math.abs(lo - prev[0]), Math.abs(hi - prev[1]));
    prev = [lo, hi];
  }
  assert.ok(worstOff < 0.2, `the scope is ${(worstOff * 100).toFixed(0)} % of the tube's width off its middle`);
  assert.ok(worstEdge < 0.002, `the tube's edge moves ${worstEdge.toFixed(4)} between samples`);
});
