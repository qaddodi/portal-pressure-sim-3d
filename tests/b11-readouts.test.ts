import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/engine/host/worker-core.js';
import { readFileSync } from 'node:fs';
import type { EngineFrame } from '../src/engine/protocol.ts';
import { tileRows, vitalRows, readoutsSummary, SYSTEMIC } from '../src/ui/tests/readouts-model.ts';
import { TILES } from '../src/ui/tests/copied/dock-tiles.copied.js';
import { createShownState } from '../src/ui/tests/readouts/copied/display-state.copied.js';
import { ReadoutsLive, type LiveDeps, type FeedCtx } from '../src/ui/tests/readouts/live.ts';
import { odoPlan } from '../src/ui/tests/readouts/odo.ts';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

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
  for (const c of ['metric', 'rp-vital', 'hidden-val', 'k-l', 'k-s', 'v-bp', 'v-map', 'rb-fill', 'rb-tick', 'status', 'cmp', 'unmeas', 'rp-group', 'rp-cap', 'rp-tiles']) assert.ok(src.includes(c), `.${c}`);
  assert.ok(!/rp-tile\b|rp-bar|rp-fill/.test(src), 'none of the old own classes');
  assert.ok(readFileSync(new URL('../src/ui/tests/readouts/live.ts', import.meta.url), 'utf8').includes("'flash2'"), 'the flash that alternates its two names');
});

// ── the tiles' numbers between the model's frames (readouts/live.ts, 2D readouts-pane.js update) ──
/** A live set of tiles with the clock by hand: `step(ms)` advances time and runs the one callback the shown state asked the clock for. */
function rig(reduce = false) {
  let t = 0;
  const asked: Array<(t: number) => void> = [];
  const shown = (createShownState as unknown as (o: object) => ReturnType<typeof createShownState>)({ ask: (cb: (t: number) => void) => { asked.push(cb); return asked.length; }, now: () => t });
  const deps: LiveDeps = { shown: shown as never, reduce: () => reduce, later: () => 1, unlater: () => {} };
  const live = new ReadoutsLive(deps);
  live.setNow(() => t); shown.on(() => live.follow()); live.mount();
  const ctx = (o: Partial<FeedCtx> = {}): FeedCtx => ({ running: false, hidden: null, then: null, params: null, now: t, ...o });
  return { live, shown, ctx, now: () => t, at(ms: number) { t = ms; }, step(ms: number) { t += ms; asked.shift()?.(t); } };
}
const withHvpg = (m: Record<string, unknown>, v: number) => ({ ...m, hvpg: v, whvp: v + 3, fhvp: 3 });

test('the live tiles take a first frame as the 2D tile prints it: number, word, band, bar, and the blood pressure in two pieces', async () => {
  const { frame } = await frameFor('csph');
  const r = rig();
  r.live.feed(frame.metrics, r.ctx({ params: frame.params }));
  const hv = r.live.get('hvpg');
  assert.equal(hv.text, '11.1'); assert.equal(hv.sev, 'danger'); assert.equal(hv.word, 'CSPH'); assert.equal(hv.hiddenVal, false);
  assert.match(r.live.get('map').pre, /^\d+\/\d+$/);
  assert.match(r.live.get('hr').aria, /^Heart rate: /);
  const bc = await frameFor('budd-chiari'), r2 = rig();
  r2.live.feed(bc.frame.metrics, r2.ctx({ params: bc.frame.params }));
  const nm = r2.live.get('hvpg');
  assert.equal(nm.word, 'Not measurable'); assert.equal(nm.text, '—'); assert.equal(nm.hiddenVal, true); assert.equal(nm.unmeas, false);
});

test('a paused edit rolls its changed digits (the odometer) and the band waits for the number to land; the colour and word change then, with the flash', async () => {
  const { frame } = await frameFor('healthy');
  const r = rig();
  const m = frame.metrics as Record<string, unknown>;
  r.at(0); r.live.feed(withHvpg(m, 4.6), r.ctx({ now: 0 }));
  assert.equal(r.live.get('hvpg').sev, 'ok');
  r.at(100); r.live.feed(withHvpg(m, 5.4), r.ctx({ now: 100 }));
  const o = r.live.get('hvpg');
  assert.equal(o.text, '5.4');
  assert.ok(o.roll, 'the number rolls');
  assert.equal(o.sev, 'ok', 'the band holds its old colour while the number rolls');
  assert.equal(o.flash, '');
  r.at(700); r.live.refresh({ now: 700 });
  const landed = r.live.get('hvpg');
  assert.equal(landed.sev, 'caution'); assert.equal(landed.flash, 'flash'); assert.equal(landed.word, 'Mild');
  assert.equal(landed.bandFade, true, 'the number fades out and back under its new colour');
});

test('Reduce Motion: a number lands at once with its band and word, no roll', async () => {
  const { frame } = await frameFor('healthy');
  const r = rig(true), m = frame.metrics as Record<string, unknown>;
  r.live.feed(withHvpg(m, 4.6), r.ctx({ now: 0 }));
  r.live.feed(withHvpg(m, 5.4), r.ctx({ now: 100 }));
  const o = r.live.get('hvpg');
  assert.equal(o.roll, null); assert.equal(o.sev, 'caution'); assert.equal(o.text, '5.4');
});

test('a running model: the 1.2 s mean steadies the number and the shown state glides it, landing on the mean', async () => {
  const { frame } = await frameFor('healthy');
  const r = rig(), m = frame.metrics as Record<string, unknown>;
  r.live.feed(withHvpg(m, 5), r.ctx({ running: true, now: 0 }));
  r.at(600); r.live.feed(withHvpg(m, 5.6), r.ctx({ running: true, now: 600 }));
  assert.ok(r.shown.isMoving('rp:hvpg'), 'a step the mean eases glides');
  assert.equal(r.live.get('hvpg').roll, null, 'a glide is followed, never rolled');
  for (let i = 0; i < 40; i++) r.step(100);
  assert.equal(r.live.get('hvpg').text, '5.3', 'half way from 5.0 to 5.6, 0.6 s into the 1.2 s mean');
  assert.equal(r.shown.isMoving('rp:hvpg'), false);
});

test('a trend arrow marks a change held over five seconds, larger than 3 % of the scale', async () => {
  const { frame } = await frameFor('healthy');
  const r = rig(), m = frame.metrics as Record<string, unknown>;
  for (let i = 0; i < 12; i++) { r.at(i * 600); r.live.feed(withHvpg(m, 3 + i * 0.5), r.ctx({ now: i * 600 })); }
  assert.equal(r.live.get('hvpg').trend, 'up');
  assert.match(r.live.get('hvpg').aria, /, rising$/);
});

test('a pinned moment: the tile says its change from then (live.ts takes the 2D rule)', async () => {
  const csph = await frameFor('csph'), healthy = await frameFor('healthy');
  const r = rig();
  r.live.feed(csph.frame.metrics, r.ctx({ params: csph.frame.params, then: healthy.frame.metrics as never }));
  assert.match(r.live.get('hvpg').cmp!.text, /^\+\d+\.\d vs then$/);
});

test('the odometer plans a column for each digit that changes, climbing when the value rose, and none for a number whose shape changes', () => {
  assert.deepEqual(odoPlan('11.1', '12.1', true), [{ t: '1' }, { s: ['1', '2'], n: 1, up: true, end: '2' }, { t: '.1' }]);
  const down = odoPlan('9.9', '9.4', false)!;
  assert.deepEqual(down[1], { s: ['4', '5', '6', '7', '8', '9'], n: 5, up: false, end: '4' });
  assert.equal(odoPlan('9.9', '10.1', true), null);
  assert.equal(odoPlan('5.0', '5.0', true), null);
});

// ── Work backward from readings: the flow itself is src/ui/readings (tests/from-readings.test.ts); this pane only holds its door ──
test('the Readouts pane holds the From-readings door and opens the shared flow', () => {
  const pane = readFileSync(new URL('../src/ui/tests/ReadoutsPane.tsx', import.meta.url), 'utf8');
  for (const w of ['Have a patient’s numbers?', 'Work backward from readings', 'rp-fr', 'rp-fr-btn', 'rp-fr-ic', "../readings/FromReadings.tsx"]) assert.ok(pane.includes(w), w);
});

test('the copy script is current against the 2D checkout, where there is one', () => {
  const twoD = process.env.PPS_2D_REPO ?? '/home/claude/portal-pressure-simulator';
  if (!existsSync(`${twoD}/src/ui/display-state.js`)) return;
  const r = spawnSync('node', ['scripts/copy-b11-readouts.mjs', '--from', twoD, '--check'], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('the pane draws numbers by the roll and the shown state, not by its own per-frame writes: no raw frame requests, the bar by transform', () => {
  for (const f of ['ReadoutsPane.tsx', 'readouts/live.ts', 'readouts/runtime.ts', 'readouts/odo.ts']) {
    const src = readFileSync(new URL(`../src/ui/tests/${f}`, import.meta.url), 'utf8');
    assert.ok(!/requestAnimationFrame/.test(src), f);
  }
  const live = readFileSync(new URL('../src/ui/tests/readouts/live.ts', import.meta.url), 'utf8');
  assert.ok(live.includes('style.translate') && live.includes('style.scale') && !live.includes("setProperty('--fl'"));
});
