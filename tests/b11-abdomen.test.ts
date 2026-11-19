import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createCore } from '../src/engine/host/worker-core.js';
import type { EngineFrame } from '../src/engine/protocol.ts';
import { abView, dialFrame, riseTxt, slideTxt, RATE_ARROW, WORDS, albuminText, albuminTip } from '../src/ui/tests/abdomen/model.ts';
import { paletteOf } from '../src/ui/charts/palette.ts';

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
const words = (f: { shapes: readonly { k: string; s?: string }[] }) => f.shapes.filter((s) => s.k === 'text').map((s) => s.s);

test('a decompensated patient has ascites to tap: the litres, its grade, SAAG as serum − fluid albumin, the pressure band', async () => {
  const { frame } = await frameFor('cirr-decomp');
  const v = abView(frame.metrics, frame.params, 300)!;
  assert.ok(v.tapped && v.fluid, 'there is fluid');
  assert.match(v.grade, /^Grade [123]$/);
  assert.match(v.trend, /mL a day · (steady|building up|resolving)$/);
  const [saag, prot, alb] = [v.saag, v.protein, v.albumin];
  assert.ok(+saag >= 1.1, `SAAG ${saag} g/dL is portal`);
  assert.ok(+prot < 3 && +alb < 2);
  assert.match(v.tipSaag!, /^SAAG \d\.\d − \d\.\d = \d\.\d g\/dL\. SAAG ≥1\.1 g\/dL indicates portal hypertension\.$/);
  assert.equal(v.rate, '300 mL/day'); assert.equal(v.rateDir, 'up');
  assert.ok(v.fill > 0.15 && v.fill <= 0.85, `the belly fills to ${v.fill}`);
});

test('a healthy patient has no fluid: dashes in the tiles, the empty belly, the Drain button off', async () => {
  const { frame } = await frameFor('healthy');
  const v = abView(frame.metrics, frame.params, null)!;
  assert.equal(v.tapped, false); assert.equal(v.fill, 0);
  assert.deepEqual([v.saag, v.protein, v.albumin], ['—', '—', '—']);
  assert.equal(v.tipSaag, null); assert.equal(v.rate, '');
  assert.equal(v.iapSev, 'ok');
  assert.equal(abView(null, null, null), null);
});

test('the dial is a frame (the knob and arcs, in every look); the belly is 2D\'s own element, its fluid and the pressure bar written as 2D writes them', async () => {
  const { frame } = await frameFor('cirr-decomp');
  const v = abView(frame.metrics, frame.params, 300)!;
  for (const look of ['light', 'soft', 'dark', 'navy', 'black'] as const) {
    const pal = paletteOf(look);
    const d = dialFrame(v.iap, v.iap, 95, 160, pal);
    assert.ok(words(d).includes(String(Math.round(v.iap))) && words(d).includes('IAP') && words(d).includes('mmHg'));
    assert.ok(d.shapes.some((s) => (s as { key?: string }).key === 'band-ok'));
  }
  const high = dialFrame(24, 24, 60, 128, paletteOf('light'));
  assert.ok(high.shapes.some((s) => (s as { key?: string }).key === 'live-danger'), 'above 20 the red arc is lit');
  assert.ok(!dialFrame(5, 5, 60, 128, paletteOf('light')).shapes.some((s) => (s as { key?: string }).key === 'live-caution'));
  // 2D instruments.js riseTxt and slideTxt: the fluid risen by whole percents, the bar slid in by tenths
  assert.equal(riseTxt(0), '0px 100%'); assert.equal(riseTxt(0.85), '0px 15%'); assert.equal(riseTxt(v.fill), `0px ${100 - Math.round(v.fill * 100)}%`);
  assert.equal(slideTxt(0), '-100% 0px'); assert.equal(slideTxt(0.4), '-60% 0px'); assert.equal(slideTxt(2), '0% 0px');
  assert.deepEqual(RATE_ARROW, { up: '▲', down: '▼', steady: '' });
});

test('albumin: optional up to 5 L, advised above it unless given, 8 g a litre', () => {
  assert.equal(albuminText(5, false), 'Optional'); assert.equal(albuminText(6, false), 'Advised'); assert.equal(albuminText(6, true), '48 g');
  assert.match(albuminTip(7, true), /^For >5 L, give albumin \(56 g, 8 g per liter/);
});

test('every label this pane writes is in the 2D source word for word (checked when the 2D checkout is at hand)', { skip: !existsSync(process.env.PPS_2D_REPO ?? '/workspace/portal-pressure-simulator/src/ui/instruments.js') && 'no 2D checkout' }, () => {
  const src = readFileSync(`${process.env.PPS_2D_REPO ?? '/workspace/portal-pressure-simulator'}/src/ui/instruments.js`, 'utf8');
  const skip = new Set(['unit']);
  for (const [k, val] of Object.entries(WORDS)) {
    if (skip.has(k)) continue;
    for (const s of Array.isArray(val) ? val : [val]) assert.ok(src.includes(s), `${k}: "${s}" is not in instruments.js`);
  }
});
