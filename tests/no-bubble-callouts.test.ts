// No speech bubble, no blur inside a ring, anywhere (Mohammad, 22 and 23 Nov: "NO speech-bubble callouts ever", "This resistance callout has a circle that blurs what's inside it!!!", "Disgusting callout").
// Root cause of the bubbles that came back on 0091fcc4 ("nothing pops" turned three `display: none` rules into `opacity: 0`): `fade()` (cath-dom.ts) writes an INLINE opacity on a card's glass and rim every
// time the card shows, and an inline style beats any stylesheet rule, so a part hidden by CSS comes back at full strength. A part a card does not wear must be removed from it (cardParts), never hidden.
// The blur inside the ring was deliberate code (a `cl-glass lz-co-focus` element), removed now.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cardParts, isWordsOnly, type FigCard } from '../src/scene/labels/figure-cards.ts';
import { figurePlan } from '../src/ui/deck/figure-plan.ts';
import { figureCalls } from '../src/ui/deck/figure-calls.ts';
import { RW_LOADERS } from '../src/decks/rw/copied/index.ts';
import { AG_IDS, loadAgDeck } from '../src/decks/ag/index.ts';
import { HP_IDS, loadHpDeck } from '../src/decks/hp/index.ts';

type Slide = Parameters<typeof figurePlan>[0];
/** Every slide of every built-in copied deck (the three batches' decks differ a little in type, not in what the plan reads). */
const allSlides = async (): Promise<{ deck: string; slide: Slide }[]> => (await decks()).flatMap((d) => ((d.slides ?? []) as Slide[]).map((slide) => ({ deck: d.id, slide })));
const decks = async (): Promise<{ id: string; slides?: readonly unknown[] }[]> => [
  ...(await Promise.all(Object.values(RW_LOADERS).map((l) => l()))),
  ...(await Promise.all(AG_IDS.map((id) => loadAgDeck(id)))),
  ...(await Promise.all(HP_IDS.map((id) => loadHpDeck(id)))),
];
const cssFiles = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? cssFiles(p) : p.endsWith('.css') ? [p] : []; });

test('every card of every slide of every deck wears the parts its kind should: a mark has neither glass nor rim, a step no rim', async () => {
  let marks = 0, steps = 0, lobule = 0;
  for (const { deck, slide } of await allSlides()) {
    const cards: FigCard[] = figureCalls(figurePlan(slide)).cards;
    for (const c of cards) {
      const p = cardParts(c);
      if (c.kind === 'mark') { marks++; if ('lobule' in c.anchor) lobule++; assert.deepEqual(p, { glass: false, ring: false }, `${deck}/${slide.id} ${c.id}: a mark is only its words`); assert.ok(isWordsOnly(c)); }
      if (c.kind === 'step') { steps++; assert.equal(p.ring, false, `${deck}/${slide.id} ${c.id}: a step has no dark rim`); assert.equal(p.glass, true, 'its disc is its glass'); }
    }
  }
  assert.ok(marks > 20 && steps >= 5 && lobule >= 10, `the decks give marks, steps and the lobule's callouts to judge (${marks}, ${steps}, ${lobule})`);
});

test('the glass of a card is shaped only for a card that wears one', () => {
  const src = readFileSync('src/scene/labels/figure-cards.ts', 'utf8');
  const paint = src.split('private paintCard')[1]!.split('\n  /** A slide\'s ring')[0]!;
  const lines = paint.split('\n').filter((l) => l.includes('pillGlass(') || l.includes('shape(r.card'));
  assert.ok(lines.length >= 2);
  for (const l of lines) assert.match(l, /parts\.glass|\(g\)|if \(g\)/, `reached only through cardParts(c).glass: ${l.trim()}`);
  assert.match(src, /const parts = cardParts\(spec\);\s*if \(!parts\.glass\) card\.glass\.remove\(\);\s*if \(!parts\.ring\) card\.ring\.remove\(\);/, 'make() removes the parts a card does not wear');
});

test('no stylesheet hides a card part with opacity: 0 (fade() owns their inline opacity, so such a rule is dead and its part comes back)', () => {
  const hide = /\.cl-(?:glass|ring|k|n|u)\b[^{}]*\{([^}]*)\}/g;
  const bad: string[] = [];
  for (const f of cssFiles('src')) {
    const css = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(hide)) if (/(^|[;\s])opacity\s*:\s*0\s*(!important)?\s*(;|$)/.test(m[1]!)) bad.push(`${f}: ${m[0].split('{')[0]!.trim()}`);
  }
  assert.deepEqual(bad, []);
});

test('a ring is clear inside: no glass element but the card\'s own, and no blur, backdrop filter or filter on any .lz-co rule', () => {
  const fc = readFileSync('src/scene/labels/figure-cards.ts', 'utf8');
  assert.doesNotMatch(fc, /className = 'cl-glass/, 'figure-cards.ts builds no glass of its own');
  assert.doesNotMatch(fc, /lz-co-focus/);
  const bad: string[] = [];
  for (const f of cssFiles('src')) {
    const css = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]*\.lz-co[^{}]*)\{([^}]*)\}/g)) if (/--glass-blur|(^|[;\s])(-webkit-)?(backdrop-)?filter\s*:/.test(m[2]!)) bad.push(`${f}: ${m[1]!.trim()}`);
  }
  assert.deepEqual(bad, []);
});
