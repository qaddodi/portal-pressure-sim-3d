// Advanced physiology (Settings › Model): the 2D panel's rows, words, ranges and defaults (advanced.generated.ts, written from the 2D source by scripts/gen-advanced.mjs),
// and the engine's numbers after each control is moved, equal to the 2D app's own (tests/fixtures/advanced-2d.json, written by the same script from the 2D engine).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCore } from '../src/engine/host/worker-core.js';
import { defaultParams } from '../src/engine/hales/portal/scenario.js';
import { ADV_ACTS, ADV_CONTROLS, ADV_SECTIONS, advChanged, advGet, advLabel, advSet, normalBand, type AdvSlider } from '../src/ui/settings/advanced.ts';
import { actionLabel } from '../src/ui/action/send.ts';

interface Case { id: string; value: number | boolean; readings: Record<string, number> }
const fx = JSON.parse(readFileSync('tests/fixtures/advanced-2d.json', 'utf8')) as { preset: string; base: Record<string, number>; cases: Case[]; formats: Record<string, [number, string][]> };
const KEYS = Object.keys(fx.base);

/** The generator's own sequence: one engine, the patient loaded once; each case is the patient's settings with one control moved, settled, read. */
async function run(edits: ((p: unknown) => void)[]): Promise<Record<string, number>[]> {
  const got: { type: string; reqId?: number; params?: unknown; result?: Record<string, number> }[] = [];
  const core = createCore((m: never) => got.push(m));
  await core.handle({ type: 'init' });
  await core.handle({ type: 'run', running: false });
  await core.handle({ type: 'preset', id: fx.preset, reqId: 1 });
  const base = got.find((m) => m.type === 'presetLoaded')!.params;
  const out: Record<string, number>[] = [];
  for (const [i, edit] of edits.entries()) {
    const params = structuredClone(base);
    edit(params);
    await core.handle({ type: 'setParams', params, settle: true });
    await core.handle({ type: 'metrics', reqId: 10 + i });
    const r = got.find((m) => m.type === 'metrics' && m.reqId === 10 + i)!.result!;
    out.push(Object.fromEntries(KEYS.map((k) => [k, Math.round(r[k] * 1000) / 1000])));
  }
  core.dispose();
  return out;
}

test('the panel is the 2D one: four sections in its order, its eleven controls, its three buttons', () => {
  assert.deepEqual(ADV_SECTIONS.map((s) => s.title), ['Inflow and vascular tone', 'Hepatic circulation', 'Anatomical variants', 'Simulation']);
  assert.deepEqual(ADV_SECTIONS.flatMap((s) => s.controls), ['splanchnicTone', 'systemicTone', 'habr', 'apShunt', 'grShunt', 'srShunt', 'pulsatile', 'respiration', 'respDepth', 'bleeding', 'detRupture']);
  assert.deepEqual(ADV_SECTIONS.map((s) => s.acts), [false, false, false, true]);
  assert.deepEqual(ADV_ACTS.map((a) => a.label), ['Valsalva', 'Rupture a varix', '− 500 mL']);
  for (const a of ADV_ACTS) assert.ok(actionLabel(a.action), `${a.label} is an action History names`);
  const tone = ADV_CONTROLS.splanchnicTone as AdvSlider;
  assert.deepEqual([tone.min, tone.max, tone.step, tone.def, tone.normal], [0.4, 2.5, 0.01, 1, [0.85, 1.15]]);
});

test('every slider prints what the 2D format prints, across its range', () => {
  for (const [id, samples] of Object.entries(fx.formats)) {
    const c = ADV_CONTROLS[id] as AdvSlider;
    for (const [v, text] of samples) assert.equal(c.format(v), text, `${id} at ${v}`);
  }
});

test('a control reads the default patient as 2D does, and writes one leaf of the settings', () => {
  const p = defaultParams();
  for (const c of Object.values(ADV_CONTROLS)) {
    if (c.type === 'slider') { assert.equal(advGet(c, p), c.def, c.id); assert.equal(advChanged(c, c.def!), false); assert.equal(advChanged(c, c.max), true); }
    const q = structuredClone(p), v = c.type === 'slider' ? c.max : !advGet(c, p);
    advSet(c, q, v);
    assert.equal(advGet(c, q), v, c.id);
    advSet(c, q, advGet(c, p));
    assert.deepEqual(q, { ...p, ...q }, c.id);
  }
  // Gastrorenal shunt present reads "not false": a patient that does not say is on
  const none = defaultParams() as { spontaneous: Record<string, unknown> }; delete none.spontaneous.C5;
  assert.equal(advGet(ADV_CONTROLS.grShunt, none), true);
  assert.equal(advGet(ADV_CONTROLS.srShunt, { spontaneous: {} }), false);
  assert.equal(advLabel(ADV_CONTROLS.pulsatile, true), 'Pulsatile (beat-to-beat) on');
  assert.equal(advLabel(ADV_CONTROLS.habr, 1, true), 'Reset Hepatic arterial buffer');
  assert.equal(normalBand(ADV_CONTROLS.habr as AdvSlider), null);
  assert.match(normalBand(ADV_CONTROLS.splanchnicTone as AdvSlider)!.left, /^calc\(var\(--tw\) \/ 2 \+ \(100% - var\(--tw\)\) \* 0\.21/);
});

test('the engine\'s numbers after each control is moved equal the 2D app\'s', async () => {
  assert.equal(fx.cases.length, 22);
  const got = await run([() => {}, ...fx.cases.map((c) => (p: unknown) => advSet(ADV_CONTROLS[c.id], p, c.value))]);
  assert.deepEqual(got[0], fx.base);
  fx.cases.forEach((c, i) => assert.deepEqual(got[i + 1], c.readings, `${c.id} = ${c.value}`));
  // the control does something: the two ends of the splanchnic tone give different portal pressures
  const [lo, hi] = fx.cases.filter((c) => c.id === 'splanchnicTone');
  assert.notEqual(lo.readings.pv, hi.readings.pv);
});

test('Settings opens the panel as its own page (no "not yet" line), and lists From readings under Model', () => {
  const src = readFileSync('src/ui/settings/SettingsSheet.tsx', 'utf8');
  assert.doesNotMatch(src, /runFeature\('advanced'/);
  assert.match(src, /push\('advanced'\)/);
  assert.match(src, /body: <Advanced \/>/);
  assert.match(src, /onClick=\{openFromReadings\}/);
  const view = readFileSync('src/ui/settings/Advanced.tsx', 'utf8');
  for (const cls of ['p-body chart-body adv-body', 'section chart-sec', 'section-body', 'ctl-top', 'ctl-label', 'ctl-val', 'range-wrap', 'reset-btn', 'toggle-row', 'order-grid', 'order-btn', 'ob-t']) assert.ok(view.includes(cls), `the 2D class ${cls}`);
});
