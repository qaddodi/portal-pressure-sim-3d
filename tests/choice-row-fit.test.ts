// Plan 43 Part B: a row of choices is one line per button, never cut, never oversized. Node only: the widths are Inter's advances (charts/measure.ts, copied from 2D), the sizes 2D's CSS clamps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tightFit, zoomFloor, rowSplit, rowStep, MIN_AB_ZOOM, AB_FLOOR_PX } from '../src/ui/cards/ab-short.ts';
import { measure } from '../src/ui/charts/measure.ts';
import { lazyDecks, loadBuiltin } from '../src/decks/registry.ts';
import { layoutOf, cardWidth, padding, pzh, clamp } from '../src/ui/layout/rules2d.ts';

test('tightFit takes a floor in px, and never reports a fit under it', () => {
  assert.deepEqual(tightFit(500, 500), { zoom: 1, fits: true });
  assert.deepEqual(tightFit(1200, 600), { zoom: MIN_AB_ZOOM, fits: false }, 'the default floor is the old 0.8');
  const f = zoomFloor(16.6);
  assert.ok(Math.abs(f - AB_FLOOR_PX / 16.6) < 1e-9 && f < MIN_AB_ZOOM, `a 16.6 px label may go down to 12 px (${f})`);
  assert.equal(zoomFloor(14), MIN_AB_ZOOM, 'a 14 px label keeps 0.8 (11 px of 14, the phone\'s row)');
  const fit = tightFit(500, 392, f);
  assert.equal(fit.fits, true);
  assert.ok(500 * fit.zoom <= 392 && fit.zoom >= f);
  assert.equal(tightFit(900, 392, f).fits, false, 'too wide even at the floor: two rows');
});

test('two balanced rows: ceil(n / 2) over floor(n / 2)', () => {
  assert.deepEqual(rowSplit(6), [3, 3]);
  assert.deepEqual(rowSplit(5), [3, 2]);
  assert.deepEqual(rowSplit(2), [1, 1]);
  assert.deepEqual(rowSplit(1), [1, 0]);
});

test('the decision table never ends on a nowrap row that overflows', () => {
  const base = { compactable: true, compactFits: false, roomW: 392, floor: zoomFloor(16.6) };
  assert.equal(rowStep({ ...base, fullFits: true, contentW: 300 }).step, 'full');
  assert.equal(rowStep({ ...base, fullFits: false, compactFits: true, contentW: 300 }).step, 'compact');
  assert.equal(rowStep({ ...base, fullFits: false, contentW: 420 }).step, 'tight');
  assert.equal(rowStep({ ...base, fullFits: false, contentW: 800 }).step, 'two');
  for (let w = 300; w <= 1000; w += 10) {
    const r = rowStep({ ...base, fullFits: false, contentW: w });
    if (r.step === 'tight') assert.ok(w * r.zoom <= base.roomW + 1, `${w}: scaled to ${w * r.zoom}`);
  }
});

test('the code wires it: one line per button, the row fits before it shows and only on a width change', () => {
  const ts = readFileSync('src/ui/cards/ab-short.ts', 'utf8');
  assert.match(ts, /setAttribute\('data-two'/);
  assert.doesNotMatch(ts, /const \{ zoom \} = tightFit\(/, 'the `fits` answer is never ignored');
  const css = readFileSync('src/ui/css3d-over-2d.css', 'utf8') + readFileSync('src/ui/deck-ui.css', 'utf8');
  assert.match(css, /\.pz-abb \{ white-space: nowrap; \}/);
  assert.match(css, /\.pz-ab\[data-two\] \{ display: grid;/);
  assert.match(css, /\.pz:not\(\.stack\):not\(\.low\) \.pz-text \.pz-abb \{ min-height: 0;/);
  const sc = readFileSync('src/ui/cards/SlideControls.tsx', 'utf8');
  assert.equal(sc.match(/fitChoiceRow\(/g)?.length, 1, 'one call site: the measure pass and the width observer share it');
});

// ---- the width gate ----
const SCREENS = [
  { n: 'iPad side', w: 1180, h: 820 }, { n: 'iPad 11"', w: 1194, h: 834 }, { n: 'iPad 13"', w: 1366, h: 1024 }, { n: 'Mac', w: 1440, h: 900 }, { n: 'Mac small', w: 1280, h: 720 }, { n: '1024', w: 1024, h: 768 },
];
const lab = (w: number, h: number) => clamp(2.022 * pzh(w, h), 14, 24.5), body = (w: number, h: number) => clamp(2.311 * pzh(w, h), 17, 28);
type Row = { deck: string; slide: string; labels: string[]; shorts: (string | undefined)[] };
async function rows(): Promise<Row[]> {
  const out: Row[] = [];
  for (const d of lazyDecks()) {
    const deck = await loadBuiltin(d.id);
    for (const s of deck?.slides ?? []) {
      const c = (s as { controls?: { compare?: { opts: { label: string; short?: string }[] } } }).controls?.compare;
      if (c && c.opts.length > 1) out.push({ deck: d.id, slide: s.id, labels: c.opts.map((o) => o.label), shorts: c.opts.map((o) => o.short) });
    }
  }
  return out;
}
/** The row's width at a step, as CSS makes it: each button's label at 600, its padding and border, the gaps, the row's own padding and border. */
const widthOf = (labels: string[], fs: number, padEm: number, gap: number) => labels.reduce((a, l) => a + measure(l, fs, 600) + 2 * padEm * fs + 2, 0) + gap * (labels.length - 1) + 12;

test('every compare row of every deck stands inside its card at its chosen step on every wide and short screen', async () => {
  const all = await rows();
  assert.ok(all.length > 20, `the decks have compare rows (${all.length})`);
  let two = 0, tight = 0, oldOver = 0;
  for (const sc of SCREENS) {
    const layout = layoutOf(sc.w, sc.h), col = cardWidth(sc.w, sc.h, layout) - 2 * padding(sc.w, sc.h, layout);
    const fs = Math.min(lab(sc.w, sc.h), body(sc.w, sc.h) * 0.82);
    for (const r of all) {
      const shorts = r.labels.map((l, i) => r.shorts[i] ?? l), compactable = r.shorts.some(Boolean);
      const full = widthOf(r.labels, fs, 0.8, 6), compact = widthOf(shorts, fs, 0.8, 6), tightW = widthOf(shorts, fs, 0.45, 4);
      const pick = rowStep({ fullFits: full * 1.03 <= col, compactable, compactFits: compact * 1.03 <= col, contentW: tightW * 1.03, roomW: col, floor: zoomFloor(fs) });
      const at = `${sc.n} ${r.deck}/${r.slide}`;
      if (pick.step === 'full') assert.ok(full * 1.03 <= col, at);
      else if (pick.step === 'compact') assert.ok(compact * 1.03 <= col, at);
      else if (pick.step === 'tight') { tight++; assert.ok(tightW * 1.03 * pick.zoom <= col + 1, `${at}: ${tightW} x ${pick.zoom} in ${col}`); }
      else {
        two++;
        const [a] = rowSplit(shorts.length), rowA = widthOf(shorts.slice(0, a), fs, 0.8, 6), rowB = widthOf(shorts.slice(a), fs, 0.8, 6);
        assert.ok(Math.max(rowA, rowB) * 1.03 <= col, `${at}: two rows ${rowA}, ${rowB} in ${col}`);
      }
      // what the port did before: tight at 0.8, nowrap, whatever the answer
      const oldFs = lab(sc.w, sc.h), oldCompact = widthOf(shorts, oldFs, 1.05, 6), oldTight = widthOf(shorts, oldFs, 0.45, 4);
      if (oldCompact > col && oldTight * MIN_AB_ZOOM > col + 1) oldOver++;
    }
  }
  assert.ok(oldOver > 0, 'the old 0.8 floor with a nowrap row overflowed on some screen (the site row: cut at both edges)');
  console.log(`# ${all.length} rows x ${SCREENS.length} screens: ${tight} tight, ${two} in two rows; the old rule overflowed ${oldOver}`);
});
