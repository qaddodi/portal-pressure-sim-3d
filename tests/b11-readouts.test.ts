import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/engine/host/worker-core.js';
import type { EngineFrame } from '../src/engine/protocol.ts';
import { tileRows, vitalRows, readoutsSummary, SYSTEMIC } from '../src/ui/tests/readouts-model.ts';
import { TILES } from '../src/ui/tests/copied/dock-tiles.copied.js';

/** A real frame and the patient's parameters, as the app has them (the frame carries its params only on a change; `patient.params` keeps them). */
async function frameFor(preset: string): Promise<{ frame: EngineFrame & { params: unknown } }> {
  const out: Array<{ type: string } & Record<string, unknown>> = [];
  const core = createCore((m: never) => out.push(m));
  await core.handle({ type: 'init' });
  await core.handle({ type: 'run', running: false });
  await core.handle({ type: 'preset', id: preset, reqId: 1 });
  core.dispose();
  const frames = out.filter((m) => m.type === 'frame');
  const loaded = out.find((m) => m.type === 'presetLoaded') as unknown as { params: unknown };
  return { frame: { ...(frames[frames.length - 1] as unknown as EngineFrame), params: loaded.params } };
}

test('the readout tiles are the 2D dock\'s, in its groups and order', () => {
  assert.deepEqual((TILES as Array<{ id: string }>).map((t) => t.id), ['hvpg', 'ppg', 'pv', 'rpp', 'pvflow', 'liver', 'shunt', 'varix', 'ascites', 'spleen']);
});

test('a CSPH patient reads HVPG 11.1 in the red band with the 2D words; the healthy patient reads normal', async () => {
  const { frame } = await frameFor('csph');
  const rows = tileRows(frame.metrics, frame.params).flatMap((g) => g.rows);
  const hvpg = rows.find((r) => r.id === 'hvpg')!;
  assert.equal(hvpg.value, '11.1');
  assert.equal(hvpg.band, 'danger');
  assert.equal(hvpg.word, 'CSPH');
  assert.equal(hvpg.unit, 'mmHg');
  const healthy = await frameFor('healthy');
  const h = tileRows(healthy.frame.metrics, healthy.frame.params).flatMap((g) => g.rows);
  assert.equal(h.find((r) => r.id === 'hvpg')!.band, 'ok');
  assert.equal(readoutsSummary(healthy.frame.metrics, healthy.frame.params), 'All normal');
  assert.match(readoutsSummary(frame.metrics, frame.params), /abnormal$/);
});

test('Budd–Chiari: the HVPG tile says it cannot be measured, as in 2D', async () => {
  const { frame } = await frameFor('budd-chiari');
  const hvpg = tileRows(frame.metrics, frame.params).flatMap((g) => g.rows).find((r) => r.id === 'hvpg')!;
  assert.equal(hvpg.word, 'Not measurable');
  assert.equal(hvpg.band, 'none');
});

test('the systemic rows: five, each with a scale bar and the blood pressure written 120/80 (93)', async () => {
  const { frame } = await frameFor('csph');
  const rows = vitalRows(frame.metrics, false, 0, {});
  assert.equal(rows.length, SYSTEMIC.length);
  const bp = rows.find((r) => r.id === 'map')!;
  assert.match(bp.value, /^\d+\/\d+ \(\d+\)$/);
  for (const r of rows) { assert.ok(r.fill >= 0 && r.fill <= 1); assert.ok(r.word.length > 0); }
});
