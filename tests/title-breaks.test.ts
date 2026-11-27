import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { planTitle, wrapAt, scoreLines, breakCost, tokensOf, lineText, SLACK, WASTE, MAX_LOSS, type Measure } from '../src/ui/cards/title-breaks.ts';
import { TITLE_SELECTOR } from '../src/ui/cards/title-balance.ts';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin } from '../src/decks/registry.ts';

// Mohammad, 26 Nov, Mac, Encephalopathy 11 (capture 2274649a): "When HE persists, / reduce the / stent diameter" - a short middle line and "the" stranded at a line's end.
// Root cause: nothing judged where a title breaks (the browser fills each line; `pretty` only keeps a lone word off the last). One rule now holds every title on every deck and size to
// the width of its best breaks (title-breaks.ts), so the rule is pinned here on the reported title and on every title of every deck at every width.

/** Word widths read off that capture (Source Serif 4 at the Mac's title size, px), a space 11. */
const REPORTED: Record<string, number> = { 'When': 122, 'HE': 70, 'persists,': 225, 'reduce': 180, 'the': 63, 'stent': 140, 'diameter': 197 };
const reported: Measure = (s) => { const w = s.split(' '); return w.reduce((a, x) => a + (REPORTED[x] ?? 0), 0) + 11 * (w.length - 1); };

/** A stand-in for a serif's widths by letter shape: narrow, wide and capital letters, spaces a quarter em. Whatever the font, the rule must hold. */
const SIZE = 56;
const narrow = new Set('iljtfrI.,;:\'’-–() ');
const wide = new Set('mwMW%');
const shaped = (size: number): Measure => (s) => [...s].reduce((a, c) => a + size * (c === ' ' ? 0.25 : narrow.has(c) ? 0.32 : wide.has(c) ? 0.85 : c !== c.toLowerCase() ? 0.66 : 0.5), 0);

const wordsOf = tokensOf;
const textsOf = (t: string, ls: { from: number; to: number }[]) => ls.map((l) => lineText(wordsOf(t), l.from, l.to));
const lastWord = (l: string) => l.split(' ').pop()!;

test('the reported title breaks after the comma and keeps its lines full, no short middle line, nothing stranded', () => {
  const plan = planTitle('When HE persists, reduce the stent diameter', reported, 597)!;
  assert.ok(plan, 'it needs three lines at the Mac card\'s width, so it is planned');
  assert.equal(plan.lines.length, 3, 'never a line more than the browser\'s own wrap needs');
  assert.equal(plan.lines[0], 'When HE persists,', 'the comma is where the phrase ends');
  assert.notEqual(plan.lines[1], 'reduce the', 'the old short middle line');
  for (const l of plan.lines.slice(0, -1)) assert.ok(!/ the$| a$| of$/.test(l), `"${l}" ends on a word that belongs to the next`);
  const widest = Math.max(...plan.lines.map((l) => reported(l)));
  assert.ok(reported(plan.lines[1]!) >= 0.7 * widest, 'the middle line is not short beside the others');
  // and the held width makes the browser's plain wrap set exactly these lines
  const at = wrapAt(wordsOf('When HE persists, reduce the stent diameter'), reported, plan.width);
  assert.deepEqual(textsOf('When HE persists, reduce the stent diameter', at), plan.lines);
});

test('a title that fits one line is left alone; a word wider than the line is not judged', () => {
  assert.equal(planTitle('Where portal blood goes', reported, 2000), null);
  assert.equal(planTitle('Supercalifragilistic stent', () => 500, 100), null);
  assert.equal(planTitle('', reported, 500), null);
});

test('a hyphenated word is two places to break and costs a tear; the plan never tears one it can keep whole', () => {
  assert.deepEqual(tokensOf('Give long-term albumin, a rise').map((t) => t.s), ['Give', 'long-', 'term', 'albumin,', 'a', 'rise']);
  assert.deepEqual(tokensOf('Budd–Chiari syndrome').map((t) => t.s), ['Budd–', 'Chiari', 'syndrome']);
  assert.equal(lineText(tokensOf('Give long-term albumin'), 1, 3), 'long-term');
  const toks = tokensOf('Without a TIPS, the algorithm adds long-term albumin');
  const m = shaped(SIZE), plan = planTitle('Without a TIPS, the algorithm adds long-term albumin', m, 300)!;
  assert.ok(plan.lines.every((l) => !/-$/.test(l)), plan.lines.join(' | '));
  assert.ok(breakCost(toks, 6) > breakCost(toks, 7), 'inside "long-term" costs more than after it');
});

test('a break costs nothing at a comma, a lot where it strands "the" or parts "6" from "mm"', () => {
  const w = tokensOf('When HE persists, reduce the stent diameter to 6 mm');
  assert.ok(breakCost(w, 2) < 0);
  assert.ok(breakCost(w, 4) >= 1);
  assert.ok(breakCost(w, 8) >= 1.5);
  assert.ok(breakCost(w, 5) < breakCost(w, 4));
});

test('a balanced two-line title splits at its natural phrase, not at the last word that fits', () => {
  const t = 'A wider stent diverts more portal blood';
  const m = shaped(SIZE), avail = m(t) * 0.62;
  const plan = planTitle(t, m, avail)!;
  assert.equal(plan.lines.length, 2);
  assert.ok(plan.lines[1]!.includes(' '), `"${plan.lines[1]}" is not a lone word`);
  assert.ok(!/ (the|a|of|and|to|in)$/.test(plan.lines[0]!));
});

test('every title of every deck at every width: the fewest lines, never worse than the browser\'s own wrap, held width reproduces the lines', async () => {
  const titles: string[] = [];
  for (const d of UI.decks) {
    const deck = await loadBuiltin(d.id as string);
    for (const s of (deck as { slides: { title?: string }[] }).slides) if (s.title) titles.push(s.title);
  }
  assert.ok(titles.length > 300, `the corpus is every slide of every talk (${titles.length})`);
  let planned = 0, fillPlan = 0, fillGreedy = 0, better = 0, stranded = 0, strandedBefore = 0;
  for (const size of [40, 48, 56]) for (const avail of [300, 360, 480, 597, 760]) {
    const m = shaped(size);
    for (const t of titles) {
      const words = wordsOf(t), greedy = wrapAt(words, m, avail);
      const plan = planTitle(t, m, avail);
      if (greedy.length < 2 || words.some((x) => m(x.s) > avail)) { assert.equal(plan, null, t); continue; }
      assert.ok(plan, t);
      planned++;
      assert.equal(plan.lines.length, greedy.length, `${t} @${avail}: keeps the fewest lines`);
      assert.ok(plan.width <= avail + 1e-6, `${t}: never wider than its room`);
      const at = wrapAt(words, m, plan.width);
      assert.equal(at.length, greedy.length, `${t} @${avail}: the held width does not add a line`);
      assert.deepEqual(textsOf(t, at), plan.lines, `${t} @${avail}: the held width sets the planned lines`);
      assert.ok(Math.max(...at.map((l) => l.w)) <= plan.width + 1e-6 && SLACK > 0);
      const widest = (ls: { w: number }[]) => Math.max(...ls.map((l) => l.w));
      const greedyCost = scoreLines(words, greedy) + WASTE * (1 - widest(greedy) / avail);
      assert.ok(plan.cost <= greedyCost + 1e-9, `${t} @${avail}: never worse than the browser's wrap`);
      // Mohammad, 27 Nov, iPhone and Mac: a title fills the card's text width; the better breaks never cost more than MAX_LOSS of it
      assert.ok(widest(at) >= widest(greedy) - MAX_LOSS * avail - 1e-6, `${t} @${avail}: keeps the card's width (${widest(at).toFixed(0)} of ${widest(greedy).toFixed(0)})`);
      fillPlan += widest(at) / avail; fillGreedy += widest(greedy) / avail;
      if (plan.cost < greedyCost - 1e-9) better++;
      for (const l of plan.lines.slice(0, -1)) if (/^(the|a|an|of|to|in|and|or|with|for)$/i.test(lastWord(l))) stranded++;
      for (const l of greedy.slice(0, -1)) if (/^(the|a|an|of|to|in|and|or|with|for)$/i.test(words[l.to - 1]!.s)) strandedBefore++;
    }
  }
  assert.ok(planned > 1000 && better > 100, `the rule changes real titles (${better} of ${planned})`);
  assert.ok(fillPlan / planned >= fillGreedy / planned - 0.06, `titles fill the card's width: ${(fillPlan / planned).toFixed(3)} of the room against the browser's ${(fillGreedy / planned).toFixed(3)}`);
  assert.ok(stranded < strandedBefore * 0.8, `a line ends on a stranded word less often (${stranded} against ${strandedBefore})`);
});

test('every title element a card draws is one the rule holds, and every full card pass applies it', () => {
  const cards = new URL('../src/ui/cards/', import.meta.url);
  const names = new Set<string>();
  for (const f of readdirSync(cards)) if (f.endsWith('.tsx')) for (const m of readFileSync(new URL(f, cards), 'utf8').matchAll(/<h[12][^>]*className="(pz-h|pz-dtitle)"/g)) names.add(m[1]!);
  assert.ok(names.has('pz-h') && names.has('pz-dtitle'));
  for (const n of names) assert.ok(TITLE_SELECTOR.split(',').map((x) => x.trim()).includes(`.${n}`), `${n} is covered`);
  const frame = readFileSync(new URL('CardFrame.tsx', cards), 'utf8');
  const at = (x: string) => frame.indexOf(x);
  assert.ok(at('releaseTitles(innerRef.current)') > 0 && at('releaseTitles(innerRef.current)') < at('markLong(innerRef.current,') && at('markLong(innerRef.current,') < at('balanceTitles(innerRef.current)'), 'released, marked long, then balanced, in that order');
  assert.match(frame, /if \(full\) \{\s*(\/\/[^\n]*\n\s*)?releaseTitles/, 'on every full pass, and only a full pass');
});
