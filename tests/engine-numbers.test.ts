import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { csphFingerprint } from '../scripts/gen-engine-fixture.mjs';
import { EDGE_IDS, EDGE_COUNT, fillVesselData, indexOf, hasVessel } from '../src/engine/vessel-data.ts';
import { EDGES } from '../src/engine/hales/portal/topology.js';

const fixture = JSON.parse(readFileSync('tests/fixtures/csph-fingerprint.json', 'utf8'));

// Numbers are compared with tolerances, not bit for bit: Math functions and float summation order differ across Node/V8 builds. Shown values (one decimal or whole)
// may land on the other side of a rounding step (0.1); everything else must agree to 1e-6 relative.
const SHOWN = (x: number) => Math.abs(x * 10 - Math.round(x * 10)) < 1e-9;
function assertClose(got: unknown, want: unknown, path: string): void {
  if (typeof want === 'number' && typeof got === 'number') {
    const tol = SHOWN(want) ? 0.1 + 1e-9 : Math.max(1e-9, 1e-6 * Math.abs(want));
    assert.ok(Math.abs(got - want) <= tol, `${path}: ${got} differs from ${want} by more than ${tol}`);
  } else if (want && typeof want === 'object' && got && typeof got === 'object') {
    assert.deepEqual(Object.keys(got).sort(), Object.keys(want).sort(), `${path}: keys differ`);
    for (const k of Object.keys(want)) assertClose((got as Record<string, unknown>)[k], (want as Record<string, unknown>)[k], `${path}.${k}`);
  } else assert.deepEqual(got, want, path);
}

test('the slice patient (csph) reads the same numbers through the host as the recorded fingerprint (equal to the 2D app\'s)', async () => {
  const fp = await csphFingerprint();
  assertClose(JSON.parse(JSON.stringify(fp)), fixture, 'fingerprint');
  assert.ok(fp.hvpg >= 10);          // clinically significant: 10 or more
  assert.ok(fp.whvp > fp.fhvp);
});

test('HVPG is the displayed gap of WHVP and FHVP, as the cards will say it', () => {
  assert.equal(fixture.hvpg, Math.round((Math.round(fixture.whvp * 10) / 10 - Math.round(fixture.fhvp * 10) / 10) * 10) / 10);
});

test('vessels are named by topology edge id, and every vessel the slice draws exists', () => {
  assert.equal(EDGE_COUNT, (EDGES as unknown[]).length);
  for (const id of ['PV_TRUNK', 'RHV_IVC', 'IVCS_RA', 'SV_CONF', 'SMV_CONF', 'POST_R_RHV']) assert.ok(hasVessel(id), id);
  assert.equal(EDGE_IDS[indexOf('PV_TRUNK')], 'PV_TRUNK');
  assert.throws(() => indexOf('NOT_A_VESSEL'));
});

test('the data texture holds pressure, flow, width, downstream pressure per vessel, in edge order', () => {
  const nodes = 40;
  const Pf = Float32Array.from({ length: nodes }, (_, i) => i + 0.5);
  const Qf = Float32Array.from({ length: EDGE_COUNT }, (_, i) => i * 0.1);
  const D = Float32Array.from({ length: EDGE_COUNT }, (_, i) => 1 + i * 0.01);
  const out = fillVesselData({ Pf, Qf, D }, new Float32Array(EDGE_COUNT * 4));
  const i = indexOf('PV_TRUNK');
  assert.ok(Math.abs(out[i * 4 + 1]! - i * 0.1) < 1e-4);
  assert.ok(Math.abs(out[i * 4 + 2]! - (1 + i * 0.01)) < 1e-4);
  assert.ok(out[i * 4]! !== out[i * 4 + 3]!, 'upstream and downstream pressures are read from different nodes');
});
