import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csphFingerprint } from '../scripts/gen-engine-fixture.mjs';
import { flowParts, flowsInputOf, wholeShares, barOrder, smallMove, sameShares, portalSplit } from '../src/ui/charts/flows/parts.ts';
import { routeLayout, inflowGeo, inflowLabels, inflowSpans, routeGeo } from '../src/ui/charts/flows/layout.ts';
import { flowsFrame, MAX_PILL_ROWS } from '../src/ui/charts/flows/frame.ts';
import { compatible } from '../src/ui/charts/morph.ts';
import { measure } from '../src/ui/charts/measure.ts';
import { ctxOf, eachLook, judge } from './charts-helpers.ts';
import { backdropOf } from '../src/ui/charts/legible.ts';
import { contrast } from '../src/ui/charts/colour.ts';
import { paletteOf } from '../src/ui/charts/palette.ts';
import type { TextShape } from '../src/ui/charts/scene.ts';

const fp = async (id: string) => flowsInputOf(await csphFingerprint(id))!;

test('whole shares keep their sum', () => {
  assert.deepEqual(wholeShares([1, 1, 1], 100), [34, 33, 33]);
  assert.equal(wholeShares([0.2, 5, 11], 83).reduce((a, b) => a + b, 0), 83);
  assert.deepEqual(wholeShares([0, 0], 10), [0, 0]);
});

test('a healthy liver takes all the portal blood; the shunt of a cirrhotic patient adds up to the shunt tile, and the parts sum to 100', async () => {
  const h = flowParts(await fp('healthy'))!;
  assert.deepEqual(h.map((p) => [p.id, p.pct]), [['liver', 100]]);
  for (const id of ['csph', 'cirr-decomp', 'cirr-decomp-tips', 'cirr-hepatofugal', 'gastric-varix']) {
    const input = await fp(id);
    const parts = flowParts(input)!;
    assert.equal(parts.reduce((s, p) => s + p.pct, 0), 100, id);
    assert.equal(parts.find((p) => p.id === 'liver')?.pct ?? 0, portalSplit(input.shunt).liver, id);
    assert.ok(parts.filter((p) => p.id !== 'liver' && p.id !== 'other').length <= 4, `${id}: at most four routes by name`);
    const bar = barOrder(parts);
    if (portalSplit(input.shunt).liver > 0) assert.equal(bar[0]!.id, 'liver'); else assert.ok(!bar.some((p) => p.id === 'liver'), 'a liver that takes none is not on the bar');
    for (let i = 2; i < bar.length - (bar.at(-1)!.id === 'other' ? 1 : 0); i++) assert.ok(bar[i - 1]!.pct >= bar[i]!.pct, `${id}: routes largest first`);
  }
});

test('a TIPS patient has a TIPS part, and the stent never carries more than the trunk gives it', async () => {
  const parts = flowParts(await fp('cirr-decomp-tips'))!;
  assert.ok(parts.some((p) => p.id === 'tips' && p.pct > 0), JSON.stringify(parts));
});

test('the inflow splits into portal and arterial blood', async () => {
  const parts = flowParts(await fp('csph'), 'inflow')!;
  assert.deepEqual(parts.map((p) => p.id), ['portal', 'artery']);
  assert.equal(parts[0]!.pct + parts[1]!.pct, 100);
});

test('a wobble of one percent is held, a real move is not; equal splits read equal in any order', () => {
  const a = [{ id: 'liver', name: 'Liver', tone: 'x', pct: 80 }, { id: 'var', name: 'Varices', tone: 'y', pct: 20 }];
  const b = [{ id: 'liver', name: 'Liver', tone: 'x', pct: 79 }, { id: 'var', name: 'Varices', tone: 'y', pct: 21 }];
  const c = [{ id: 'liver', name: 'Liver', tone: 'x', pct: 70 }, { id: 'var', name: 'Varices', tone: 'y', pct: 30 }];
  assert.equal(smallMove(a, b), true);
  assert.equal(smallMove(a, c), false);
  assert.equal(sameShares(a, [...a].reverse()), true);
});

test('the layout puts each name where it fits: on the segment, or under the bar on a leader (name and percent, never a percent alone); never more rows than the card allows', async () => {
  const parts = flowParts(await fp('cirr-decomp'))!;
  for (const w of [260, 330, 430]) {
    const g = routeGeo(13), hh = g.pillsT + MAX_PILL_ROWS * g.ph + (MAX_PILL_ROWS - 1) * g.pg;
    const lay = routeLayout(parts, w, hh, 13, measure, null, null);
    assert.ok(lay.ok && lay.rows <= MAX_PILL_ROWS, `${w}: ${lay.rows} rows`);
    assert.equal(lay.parts.reduce((s, p) => s + p.pct, 0), 100);
    lay.spans.forEach((s, i) => {
      const room = s.b - s.a - 2 * lay.geo.g;
      assert.ok(lay.tiers[i] === 0 || lay.tiers[i] === 3, 'a part has its name on it or under it, never a percent alone');
      if (lay.tiers[i] === 0) assert.ok(measure(s.name!, 13, 500) <= room + 1e-6 && measure(`${s.pct}%`, 13, 600) <= room + 1e-6);
      if (lay.tiers[i] === 3) assert.ok(lay.pills.some((p) => p.id === s.id), `${s.id} is named under the bar`);
    });
    for (const p of lay.pills) {
      assert.ok(p.cx - p.w / 2 >= -1e-6 && p.cx + p.w / 2 <= w + 1e-6, `a name is inside the card at ${w}`);
      const s = lay.spans.find((q) => q.id === p.id)!;
      assert.ok(p.lx >= p.cx - p.w / 2 - 1e-6 && p.lx <= p.cx + p.w / 2 + 1e-6 && p.lx >= s.a && p.lx <= s.b, 'its leader leaves its own part and lands under its own words');
    }
  }
});

test('the inflow labels never overlap the Healthy line and stay inside the card', async () => {
  const parts = flowParts(await fp('csph'), 'inflow')!;
  const spans = inflowSpans(barOrder(parts, 'inflow'), 300), geo = inflowGeo(13);
  const labs = inflowLabels(spans, 300, geo, measure, null, null);
  for (const l of labs) assert.ok(l.tier >= 0 && l.tier <= 4 && l.cx >= 0 && l.cx <= 300);
});

/** Words on the bar (25 Nov, "fix the fonts"): solid ink with NO halo (the dark halo smeared into a glow on the bar), white or near-black by what reads better on that segment, the weights of the type
 *  scale (name 500, percent 600), and every word readable on what it stands on (the card, or the segment over the card). */
function crispWords(f: Parameters<typeof legibleOf>[0], look: Parameters<typeof paletteOf>[0], at: string) {
  const surface = paletteOf(look).tok('surface');
  f.shapes.forEach((s, i) => {
    if (s.k !== 'text' || !s.s.trim() || (s.alpha ?? 1) === 0) return;
    const t = s as TextShape, bg = backdropOf(f.shapes, i, t.x, t.y - t.size * 0.3, surface)!;
    assert.ok(contrast(t.color, bg) >= 4.3, `${at}: "${t.s}" reads ${contrast(t.color, bg).toFixed(2)}:1 on what it stands on`);
    assert.ok(t.weight === 500 || t.weight === 600, `${at}: "${t.s}" weight ${t.weight}`);
    if (bg.some((v, j) => j < 3 && Math.abs(v - surface[j]!) > 1e-6)) assert.equal(t.halo, undefined, `${at}: "${t.s}" is on the bar: no halo`);
  });
}
const legibleOf = (f: import('../src/ui/charts/scene.ts').Frame) => f;

test('the frames: sound in every look, and the same chart in two states pairs up so it glides (not dissolves)', async () => {
  const a = flowParts(await fp('cirr-decomp'))!, b = flowParts(await fp('cirr-hepatofugal'))!, h = flowParts(await fp('healthy'))!;
  eachLook((look) => {
    for (const [w, d] of [[300, 'phone-portrait'], [330, 'desktop'], [330, 'phone-landscape']] as const) {
      const c = ctxOf(look, w, d);
      const f1 = flowsFrame({ of: 'portal', parts: a, healthy: h, tiers: null }, c), f2 = flowsFrame({ of: 'portal', parts: b, healthy: h, tiers: f1.tiers }, c);
      for (const f of [f1.frame, f2.frame]) { judge(f, look, { onCard: false }); crispWords(f, look, `${look} ${w}`); }
      assert.ok(compatible(f1.frame, f2.frame), `${look} ${w}: two states of the bar must pair up`);
      assert.ok(f1.frame.label.includes('Liver'));
    }
  });
  const inflow = flowParts(await fp('csph'), 'inflow')!, inflow2 = flowParts(await fp('cirr-decomp'), 'inflow')!, hi = flowParts(await fp('healthy'), 'inflow')!;
  eachLook((look) => {
    const c = ctxOf(look, 330);
    const f1 = flowsFrame({ of: 'inflow', parts: inflow, healthy: hi, tiers: null }, c), f2 = flowsFrame({ of: 'inflow', parts: inflow2, healthy: hi, tiers: f1.tiers }, c);
    for (const f of [f1.frame, f2.frame]) { judge(f, look, { onCard: false }); crispWords(f, look, `${look} inflow`); }
    assert.ok(compatible(f1.frame, f2.frame));
  });
});

test('a data card title that wraps breaks in two even lines, on the one header every data card uses (25 Nov)', async () => {
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync('src/ui/deck-ui.css', 'utf8'), /\.pz-dh > span:first-child \{ text-wrap: balance; \}/);
});
