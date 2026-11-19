import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRIALS } from '../src/ui/charts/trial/trials.generated.ts';
import { forestLayout, armsLayout, ratiosOf, ratioText, fmtRatio, ratesText, forestWords, FOREST_SCALE, KINDS, NO_RATIO } from '../src/ui/charts/forest/model.ts';
import { forestFrame, armsFrame } from '../src/ui/charts/forest/frame.ts';
import { measure } from '../src/ui/charts/measure.ts';
import { ctxOf, eachLook, judge } from './charts-helpers.ts';

const all = Object.values(TRIALS);

test('a ratio prints with two decimals, or three where the paper gave three; ratios are never pooled across kinds', () => {
  assert.equal(fmtRatio(0.51), '0.51');
  assert.equal(fmtRatio(0.192), '0.192');
  assert.equal(fmtRatio(1), '1.00');
  const r = ratiosOf(all.find((t) => ratiosOf(t).length)!)[0]!;
  assert.match(ratioText(r), /^(HR|OR|RR) \d\.\d{2,3} \(\d\.\d{2,3}–\d\.\d{2,3}\)$/);
  const L = forestLayout(all, 330, 13, measure);
  const heads = L.texts.filter((t) => t.look === 'forest.grp').map((t) => t.t);
  assert.deepEqual(heads, KINDS.filter((k) => all.some((t) => ratiosOf(t)[0]?.kind === k)).map((k) => ({ HR: 'Hazard ratio (HR)', OR: 'Odds ratio (OR)', RR: 'Relative risk (RR)' })[k]));
});

test('every trial is on the plot once (its primary ratio) or listed with its rates; the interval sits inside the scale or ends in an arrowhead', () => {
  const L = forestLayout(all, 330, 13, measure);
  const names = new Set(L.texts.filter((t) => t.look === 'forest.nm' || t.look === 'forest.nm.dim').map((t) => t.t));
  for (const t of all) assert.ok(names.has(t.short ?? t.name), `${t.id} is not on the plot`);
  assert.equal(L.hits.length, all.length);
  assert.equal(L.texts.some((t) => t.t === NO_RATIO), all.some((t) => !ratiosOf(t).length));
  const withRatio = all.filter((t) => ratiosOf(t).length);
  assert.equal(L.rects.filter((r) => r.look === 'forest.mk' || r.look === 'forest.mk.dim').length, withRatio.length);
  for (const l of L.lines.filter((l) => l.look.startsWith('forest.ci'))) for (const x of [l.x1, l.x2]) assert.ok(x >= -1 && x <= 331, `a line ends at ${x}`);
  assert.ok(FOREST_SCALE[0] < 1 && FOREST_SCALE[1] > 1);
});

test('the trials that fit come first in their group, the others dim after them; the picked row is marked and its detail is written', () => {
  const ids = all.filter((t) => ratiosOf(t).length).slice(0, 6).map((t) => t.id);
  const hl = new Set(ids.slice(3, 5));
  const L = forestLayout(ids.map((i) => TRIALS[i]!), 330, 13, measure, { highlight: hl, selected: ids[3] });
  const lit = L.texts.filter((t) => t.look === 'forest.nm').length;
  assert.equal(lit, 2);
  assert.ok(L.rects.some((r) => r.look === 'forest.sel'));
  assert.ok(L.texts.some((t) => t.look === 'forest.dt' && t.t.startsWith(TRIALS[ids[3]!]!.short ?? TRIALS[ids[3]!]!.name)));
  assert.ok(ratesText(TRIALS[ids[3]!]).includes('%'));
});

test('every look and width: the plot and the arms are sound, a list highlight works as a Set, and the words say what is drawn', () => {
  const ids = all.map((t) => t.id);
  eachLook((look) => {
    for (const [w, d] of [[300, 'phone-portrait'], [330, 'desktop'], [430, 'tablet-portrait'], [330, 'phone-landscape']] as const) {
      const c = ctxOf(look, w, d);
      judge(forestFrame(all, c).frame, look);
      judge(forestFrame(all, c, { highlight: ids.slice(0, 4), selected: ids[2], notes: { [ids[2]!]: 'Open the trial for its arms.' } }).frame, look);
      for (const id of ids.slice(0, 6)) judge(armsFrame(TRIALS[id]!, c), look);
    }
  });
  assert.ok(forestWords(all).includes(ratioText(ratiosOf(all.find((t) => ratiosOf(t).length)!)[0]!)));
  assert.equal(forestLayout([], 330, 13, measure).texts.length, 0);
});

test('an arm bar is as wide as its share and its percent stands inside the bar only where it fits', () => {
  const t = all.find((x) => x.arms.length >= 2)!;
  const L = armsLayout(t, 330, 13, measure);
  const bars = L.rects.filter((r) => r.look === 'forest.bar');
  t.arms.forEach((a, i) => assert.ok(Math.abs(bars[i]!.w - Math.max(2, (330 * a.rate) / 100)) < 1e-6));
  for (const [i, a] of t.arms.entries()) {
    const p = L.texts.find((x) => x.look === 'forest.pct' && x.t === `${a.rate}%`)!;
    assert.ok(p.anchor === 'end' ? bars[i]!.w > 40 : true, `${a.rate}%`);
  }
});
