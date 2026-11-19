import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/engine/host/worker-core.js';
import { readFileSync } from 'node:fs';
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

test('a pinned moment: each tile says its change from then in place of its word (2D readouts-pane.js), "same as then" inside half a digit', async () => {
  const csph = await frameFor('csph'), healthy = await frameFor('healthy');
  const rows = tileRows(csph.frame.metrics, csph.frame.params, null, healthy.frame.metrics).flatMap((g) => g.rows);
  const hv = rows.find((r) => r.id === 'hvpg')!;
  assert.equal(hv.cmp?.dir, 'up');
  assert.match(hv.cmp!.text, /^\+\d+\.\d vs then$/);
  const same = tileRows(csph.frame.metrics, csph.frame.params, null, csph.frame.metrics).flatMap((g) => g.rows).find((r) => r.id === 'hvpg')!;
  assert.deepEqual(same.cmp, { text: 'same as then', dir: 'same' });
  assert.equal(tileRows(csph.frame.metrics, csph.frame.params).flatMap((g) => g.rows).find((r) => r.id === 'hvpg')!.cmp, undefined, 'nothing pinned, no change line');
});

test('the tile is the 2D tile (tile-el.js): its unit and the unit\'s small extra apart, the blood pressure in three pieces', async () => {
  const { frame } = await frameFor('csph');
  const rows = tileRows(frame.metrics, frame.params).flatMap((g) => g.rows);
  const varix = rows.find((r) => r.id === 'varix')!;
  assert.equal(varix.u, '%'); assert.equal(varix.ux, ' of rupture threshold');
  const bp = vitalRows(frame.metrics, false, 0, {}).find((r) => r.id === 'map')!;
  assert.match(bp.bp!.pre, /^\d+\/\d+$/); assert.match(bp.bp!.mean, /^\d+$/);
});

test('the pane writes the 2D tile markup, so the lifted sheet (tests-card.css) styles it: .metric with .k .v .val .unit .tr .rb .rb-fill .rb-tick .s .status .cmp', () => {
  const src = readFileSync(new URL('../src/ui/tests/ReadoutsPane.tsx', import.meta.url), 'utf8');
  for (const c of ['metric', 'rp-vital', 'hidden-val', 'k-l', 'k-s', 'v-bp', 'v-map', 'rb-fill', 'rb-tick', 'status', 'cmp', 'unmeas', 'flash2', 'rp-group', 'rp-cap', 'rp-tiles']) assert.ok(src.includes(c), `.${c}`);
  assert.ok(!/rp-tile\b|rp-bar|rp-fill/.test(src), 'none of the old own classes');
});
