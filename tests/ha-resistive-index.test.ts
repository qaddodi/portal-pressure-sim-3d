// The hepatic artery's resistive index (25 Nov 2026): the Doppler shows it as a tile (the artery's index in place of Gosling's pulsatility), judged against 0.55 to 0.80, and the dual-supply talk names it.
// The slide's claim is checked against the engine: the buffer-dilated artery of acute portal vein thrombosis reads under the band, a healthy one inside it. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { TWO_INFLOWS } from '../src/decks/rw/copied/two-inflows.ts';
import { HA_RI } from '../src/ui/tests/doppler/model.ts';

const model = readFileSync(new URL('../src/ui/tests/doppler/model.ts', import.meta.url), 'utf8');
const slide = (id: string) => (TWO_INFLOWS.slides as readonly Record<string, any>[]).find((s) => s.id === id)!;

async function ri(step: Record<string, unknown>): Promise<number> {
  let out: any;
  const core = createCore((m: any) => { if (m.type === 'seqStep') out = m; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps: [{ ...step, wave: 'A_HEP' }], reqId: 1 });
  core.dispose();
  const v = out.extra.wave.A_HEP.v as number[], mx = Math.max(...v), mn = Math.min(...v);
  return (mx - Math.max(0, mn)) / mx;
}

test('an artery has the RI tile and no pulsatility tile; no other vessel has an RI tile', () => {
  assert.match(model, /mk\('RI', 'RI', kind === 'artery'\)/);
  assert.match(model, /mk\('Pulsatility', 'Pulsatility', [^)]*kind !== 'artery'\)/);
  assert.deepEqual([...HA_RI], [0.55, 0.8]);
});

test('the engine\'s hepatic artery: healthy inside the usual band, the buffer-dilated artery of acute PVT under it (what the clot slide says)', async () => {
  const healthy = await ri({ preset: 'healthy' }), pvt = await ri({ preset: slide('clot').preset });
  assert.ok(healthy >= HA_RI[0] && healthy <= HA_RI[1], `healthy RI ${healthy}`);
  assert.ok(pvt < HA_RI[0], `acute PVT RI ${pvt}`);
});

test('the dual-supply talk names the index on the slides that show the artery\'s Doppler', () => {
  for (const id of ['dual', 'clot', 'artery', 'cirr']) assert.match(`${slide(id).line} ${slide(id).notes}`, /resistive index/i, id);
  assert.match(slide('clot').line, /resistive index falls below the usual 0\.55 to 0\.80/);
});
