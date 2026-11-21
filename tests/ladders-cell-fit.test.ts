import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chartScale } from '../src/ui/charts/profile/model.ts';

// Mohammad, 20 Nov (The biggest pressure drop shows where the resistance is, 11/14): each of the six mini-charts overflowed its cell into the next (axes, labels and the HVPG / PPG pills over the neighbours, the right column cut at
// the card's edge) with a big blank under each. Root cause: 2D draws each cell's chart once at the instrument's own width (--lad-w, one card width) and scales it down as one piece to the cell (presenter-question.js fitChart:
// --lad-k, --lad-s on .pz-cc); the port had the stylesheet and chartScale but never the step that sets them, so k stayed 1.
test('a chart scaled to its cell is never wider than the cell, and its words never come under 12 px on the screen', () => {
  for (let W = 120; W <= 800; W += 7) for (const w0 of [380, 520, 584, 640]) for (const f0 of [12, 13.5, 15]) {
    const { k, s } = chartScale(W, w0, f0);
    assert.ok(k <= 1 + 1e-9, `k ${k} never enlarges`);
    assert.ok(W >= w0 || w0 * k <= W + 1e-6, `cell ${W}, chart ${w0}: scaled width ${w0 * k}`);
    assert.ok(s >= 1 - 1e-9, 's never shrinks the type');
    assert.ok(f0 * s * k >= 12.02 - 1e-6, `type on screen ${f0 * s * k} at cell ${W}`);
  }
  assert.deepEqual(chartScale(600, 584, 13), { k: 1, s: 1 }, 'a cell as wide as the chart leaves it whole');
  const six = chartScale(475, 584, 12.5);
  assert.ok(six.k < 1 && Math.abs(584 * six.k - 475) < 1e-6, 'the six ladders: scaled to the cell\'s width');
});

test('every cell sets --lad-k and --lad-s on its holder from its own measure, and the chart measures its unscaled box (so it is not shrunk twice)', () => {
  const card = readFileSync('src/ui/charts/ladder/LaddersCard.tsx', 'utf8');
  assert.match(card, /export function fitLadderChart/);
  assert.match(card, /setProperty\('--lad-k', ks\)/);
  assert.match(card, /setProperty\('--lad-s', ss\)/);
  assert.match(card, /new ResizeObserver\(fit\)/, 'again when the cell\'s width changes (a resize, the zoom, a new card width)');
  assert.match(card, /<LadderChart r=\{r\}/, 'every cell of the grid goes through it');
  assert.match(card, /cell=\{\{ lad \}\}/, 'a larger type is drawn again at that type');
  const fit = readFileSync('src/ui/charts/fit.ts', 'utf8');
  assert.match(fit, /classList\?\.contains\('pz-cc'\)/);
  assert.match(fit, /--lad-k/);
});

// Mohammad, 21 Nov (iPhone, 11/14): the HVPG / PPG pills ran out of the card on the rows with a long site and cause. Root cause: the fit pass strips the cause's size and the 'under' class, then set them back through React state;
// when a second pass (the observer fires after the first one's own layout change) came out the same, the state did not change, React did not render, and the stripped size and class stayed stripped. 2D (presenter-question.js fitRow) writes both to the DOM at the end of every pass.
test('the first row\'s fit writes the size and the under class to the DOM on every pass, never through state', () => {
  const card = readFileSync('src/ui/charts/ladder/LaddersCard.tsx', 'utf8');
  const head = card.slice(card.indexOf('function CellHead'), card.indexOf('A wide screen'));
  assert.match(head, /tt\.style\.fontSize = /);
  assert.match(head, /row\.classList\.toggle\('under', f\.under\)/);
  assert.doesNotMatch(head, /useState|setFit/, 'a stripped class or size would stay stripped when the state came out the same');
  assert.doesNotMatch(head, /className=\{`pz-cell-k\$\{/, 'the class is the pass\'s, not React\'s');
});

// Mohammad, 21 Nov (iPhone, 11/14): the card showed only its header for seconds before the six rows came. Root cause: the grid worked the whole deck out again in a worker of its own (rw/numbers.ts deckFingerprints) for numbers the talk
// already holds (decks/hp/calc.ts useStates, which every other card of the slide reads). It reads those, so only the few patients no slide shows are run.
test('the ladders read the deck\'s states from the talk, not a second run of the whole deck', async () => {
  const { useStates } = await import('../src/decks/hp/calc.ts');
  const { deckStates } = await import('../src/ui/charts/ladder/data.ts');
  useStates.setState({ results: { 'talk-x': [{ fp: { a: 1 } }, { fp: { a: 2 } }] as never } });
  let ran = 0;
  const fps = await deckStates({ id: 'talk-x', slides: [] } as never, (async () => { ran++; return []; }) as never);
  assert.equal(ran, 0, 'no second run of the deck');
  assert.deepEqual(fps.map((f) => f.a), [1, 1, 2], 'entry 0 the outline (the first slide\'s), then slide i at i + 1');
  const card = readFileSync('src/ui/charts/ladder/LaddersCard.tsx', 'utf8');
  assert.match(card, /ensureStates\(deck as never\)/, 'it waits for the talk\'s own states');
});
