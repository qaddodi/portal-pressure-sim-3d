import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import type { EngineFrame } from '../src/engine/hales/host/protocol.d.ts';
import { rateText, abView, dialFrame, riseTxt, slideTxt, RATE_ARROW, WORDS, albuminText, albuminTip } from '../src/ui/tests/abdomen/model.ts';
import { paletteOf } from '../src/ui/charts/palette.ts';
import { pinned2D } from './two-d-pin.ts';

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
  assert.equal(v.grade, 'Ascites'); assert.ok(!/Grade/.test(v.grade + v.gradeTip), 'a gauge gives the volume, never a clinical grade');
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

test('every label this pane writes is in the 2D source word for word (checked when the 2D checkout is at hand)', { skip: pinned2D('src/ui/instruments.js').skip }, () => {
  const src = readFileSync(`${pinned2D('src/ui/instruments.js').repo}/src/ui/instruments.js`, 'utf8');
  const skip = new Set(['unit']);
  for (const [k, val] of Object.entries(WORDS)) {
    if (skip.has(k)) continue;
    for (const s of Array.isArray(val) ? val : [val]) assert.ok(src.includes(s), `${k}: "${s}" is not in instruments.js`);
  }
});

test('an emptied belly that is refilling says so: the balance is never a bare number under "None, 0.0 L"', () => {
  assert.equal(rateText(2100, false), 'Refilling 2,100\u00a0mL/day');
  assert.equal(rateText(2100, true), '2,100 mL/day');
  assert.equal(rateText(-300, false), '300 mL/day');
  assert.equal(rateText(0, false), 'Steady');
  assert.equal(rateText(null, false), '');
});

// The dial's readout never overlaps itself (iPhone, 21 Nov: "19 mmHg is overlapping"): the unit stood at a fixed place while its size grows when the dial is drawn small, so it rode up into the digits.
test('the dial\'s number, unit, word, key and the 12 and 20 marks keep clear of each other at every size and reading', () => {
  type T = { k: string; s: string; x: number; y: number; size: number; key?: string };
  for (const w of [50, 56, 60, 66, 70, 76, 90, 110]) for (const iap of [3, 12, 19, 20, 24, 30]) {
    const f = dialFrame(iap, iap, w, Math.round((w * 128) / 76), paletteOf('light'));
    const ts = f.shapes.filter((s) => s.k === 'text') as unknown as T[];
    const box = (t: T) => { const hw = 0.5 * t.s.length * 0.58 * t.size, hh = 0.36 * t.size; return { l: t.x - hw, r: t.x + hw, t: t.y - hh, b: t.y + hh, n: t.key! }; };
    const bs = ts.map(box);
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i]!, b = bs[j]!;
      assert.ok(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t, `w ${w}, IAP ${iap}: ${a.n} overlaps ${b.n}`);
    }
    const n = bs.find((b) => b.n === 'n')!, u = bs.find((b) => b.n === 'unit')!;
    assert.ok(u.t - n.b >= 1.5, `w ${w}: a clear gap under the digits (${(u.t - n.b).toFixed(1)} px)`);
  }
});

test('a slide\'s paracentesis says the litres removed and the albumin: 6 to 8 g per liter over 5 L, optional under it', async () => {
  const { tapWords } = await import('../src/ui/tests/abdomen/model.ts');
  assert.deepEqual(tapWords(0), { removed: '0.0 L removed', dose: 'Albumin optional under 5 L' });
  assert.equal(tapWords(5).dose, 'Albumin optional under 5 L');
  assert.deepEqual(tapWords(5.9), { removed: '5.9 L removed', dose: 'Albumin 35 to 47 g (6 to 8 g per liter)' });
  assert.equal(tapWords(6).dose, 'Albumin 36 to 48 g (6 to 8 g per liter)');
});
