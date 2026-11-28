// Mohammad, 24 Nov: a teaching or instrument card comes in at its final size and never changes size after landing. Two causes found at the root, pinned here (node only);
// the in-app audit's `card-grew-live` finding (box-lock.ts) watches every slide for any other, and tests/card-box-sequences.test.ts drives the lock itself.
//   1. The Ascites 13 lines (litres removed, albumin dose) were mounted with the first litre, so the instrument card grew by their height. They stand from the slide's first frame and hold the room of the longest words.
//   2. The procedure row (ProcRow) stood only once procs-link wrote its slide into the store, which can be after the card was measured and let in; it now stands from the slide's own plan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tapWords, TAP_RESERVE } from '../src/ui/tests/abdomen/model.ts';

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('the paracentesis lines are in the figure before any litre goes, and hold the longest words they can take', () => {
  const pane = read('src/ui/tests/abdomen/AbdomenPane.tsx');
  assert.doesNotMatch(pane, /tapping && peak\.current > 0/, 'the lines wait for the first litre: the card grows when they come');
  assert.match(pane, /const tap = host\.slide && tapping \? tapWords\(removed\) : null/);
  assert.match(pane, /TAP_RESERVE\.map/);
  // every reading the lines can show is no longer than the reserved ones
  const widest = (k: 'removed' | 'dose') => Math.max(...TAP_RESERVE.map((r) => r[k].length));
  for (let L = 0; L <= 20; L += 0.1) { const w = tapWords(L); assert.ok(w.removed.length <= widest('removed') && w.dose.length <= widest('dose'), `${L} L`); }
  const css = read('src/ui/css3d-over-2d.css');
  assert.match(css, /\.ab-tap > \* \{ grid-area: 1 \/ 1;/);
  assert.match(css, /\.ab-tap-hold \{ visibility: hidden;/);
});

test('the procedure row stands from the slide\'s own plan, never only from the store procs-link writes after the card is in', () => {
  const row = read('src/ui/cards/ProcRow.tsx');
  assert.doesNotMatch(row, /!procPlanOf\(cs\) \|\| !mine\) return null/);
  assert.match(row, /if \(!cs \|\| !plan\) return null/);
  assert.match(row, /stepsOfPlan\(plan\)/);
});

test('a card is let in only on a height measured with the fonts in, and the fonts arriving re-measure it (a fallback-font measure grew the card after it landed)', () => {
  const layer = read('src/ui/cards/CardLayer.tsx'), frame = read('src/ui/cards/CardFrame.tsx');
  assert.match(layer, /const sig = sigRef\.current, f = fontsLoaded\(\)/);
  assert.match(layer, /\?\.f !== false/, 'the gate (`measured`) must require a measure taken with the fonts in');
  assert.match(frame, /document\.fonts\.ready\.then\(\(\) => \{ if \(alive\) report\(!now\.current\.live\)/);
});

test('a kept data card keeps the box it landed with when only the slide beside it changes (no clip glide across slides)', async () => {
  const { boxOf, BOX_START } = await import('../src/ui/cards/box-lock.ts');
  const frame = read('src/ui/cards/CardFrame.tsx');
  // the lock's key is the card's own step, not the signature that starts with the words' key
  assert.match(frame, /const stepKey = data \? \(remeasure \?\? ''\)\.slice\(\(remeasure \?\? ''\)\.indexOf\('\|'\) \+ 1\)/);
  assert.match(frame, /const lockKey = `\$\{entry\.key\}\|\$\{Math\.round\(rect\.w\)\}\|\$\{stepKey\}`/);
  assert.match(frame, /report\(true, !sameStep\)/);
  // the same step, a new slide: the measure is an observer's, so a shorter one stands on the landed box and nothing is reported (no glide)
  const K = 'ladder|390|1|0||';
  let s = boxOf(BOX_START, { t: 'measure', key: K, h: 320, fresh: true, shown: false }).state;
  s = boxOf(s, { t: 'show', key: K }).state;
  for (const h of [280, 300, 320]) { const o = boxOf(s, { t: 'measure', key: K, h, fresh: false, shown: true }); assert.equal(o.report, false, `${h}`); assert.equal(o.state.h, 320); }
  // a step of its own (a new key) is judged afresh
  assert.equal(boxOf(s, { t: 'measure', key: 'ladder|390|2|1||', h: 240, fresh: true, shown: true }).report, true);
});

test('a kept card whose new slide needs a taller box is replaced by a fresh card at its final size, never grown', () => {
  const frame = read('src/ui/cards/CardFrame.tsx'), layer = read('src/ui/cards/CardLayer.tsx');
  assert.match(frame, /if \(out\.grew > 1 && onOutgrown && !now\.current\.out\) \{ onOutgrown\(entry\.key\); return; \}/);
  assert.ok(frame.indexOf('onOutgrown(entry.key)') < frame.indexOf('box.current = out.state;'), 'the lock keeps what it landed with');
  assert.match(layer, /const dataKey = rekeys\[baseKey\] \? `\$\{baseKey\}~\$\{rekeys\[baseKey\]\}` : baseKey/);
  // (the words' card too, but not a card that stands alone: a fresh card of the same words would be the same height)
  assert.match(layer, /onOutgrown=\{alone \? undefined : outgrown\}/);
  assert.match(layer, /keptByMove\(deck\.id, stops, pos, .*view\?\.data \? baseKey : null/);
});

test('a card is let in only once its measured height has stood still, so a late row or readout cannot grow it on screen', () => {
  const layer = read('src/ui/cards/CardLayer.tsx');
  assert.match(layer, /SETTLE_MS = 120, GIVE_UP_CARDS_MS = 8000/);
  assert.match(layer, /t: clock\.nowReal\(\) \}/, 'the time of the last change of each measure (real time: tests/card-readiness-real-time.test.ts)');
  assert.match(layer, /&& settleLeft <= 0\)/, 'the gate (`measured`) waits for it');
  assert.match(layer, /clock\.afterReal\(\(\) => setLate\(pagesKey\), GIVE_UP_CARDS_MS\)/, 'the give-up leaves room for it');
});

test('the instrument panes render their final content on the first paint (audit 24 Nov: the Doppler report, the slide options, the lazy panes)', () => {
  const dop = read('src/ui/tests/doppler/DopplerPane.tsx');
  assert.match(dop, /useState<Report \| null>\(\(\) => \{ if \(latest\.frame\) m\.ingest\(latest\.frame\); return m\.report\(\); \}\)/, 'the report is the first render\'s, not an effect\'s');
  const body = read('src/ui/talk/ToolCardBody.tsx');
  assert.match(body, /useLayoutEffect\(\(\) => \{\s*\n\s*if \(plan\.doppler\)/, 'the slide\'s options are set before the first paint');
  assert.match(body, /useLayoutEffect\(\(\) => \{ setSlidePin\(fp\); \}, \[fp\]\)/);
  const load = read('src/ui/talk/tool-card-load.ts');
  for (const pane of ['DopplerPane', 'FibroPane', 'EndoPane']) assert.match(load, new RegExp(`import\\('\\.\\./tests/\\w+/${pane}\\.tsx'\\)`), `${pane} is read in with the charts`);
});

test('the Endo readings column and the beat card\'s status word stand from the first render', () => {
  const endo = read('src/ui/tests/endo/EndoPane.tsx');
  assert.doesNotMatch(endo, /\{r && \(\s*\n\s*<dl className="endo-read">/, 'the readings wait for the model: the card grows when they come');
  assert.match(endo, /const rd: NonNullable<ReturnType<typeof readingsOf>> = r \?\? \{/);
  assert.match(read('src/ui/css3d-over-2d.css'), /\[data-kind="beats"\] \.pt-sev \{ min-height: 1\.3em; \}/);
});

test('the tiles\' rows (word, delta) are computed from the slide\'s data in the first render, and their fit is judged before paint and again when the fonts arrive', () => {
  const t = read('src/ui/cards/TilesCard.tsx');
  assert.match(t, /const merged = useMemo\(\(\) => mergeStates\(deckId, liveResults_\)/, 'the baked states are in the first render');
  assert.match(t, /<span className="pzt-r">\{t\.word\}<\/span>\s*\n\s*<span className="pzt-d">\{t\.delta\}<\/span>/, 'both rows are always the tile\'s own words, no blank row reserved');
  assert.match(t, /fit\(\);\s*\n\s*\/\/[^\n]*\n\s*let alive = true;\s*\n\s*if \(typeof document !== 'undefined' && document\.fonts && document\.fonts\.status !== 'loaded'\) void document\.fonts\.ready\.then\(\(\) => \{ if \(alive\) fit\(\); \}\)/);
});

test('the settle wait is declared before the gate that reads it (a use before its declaration is a ReferenceError at render: no card shows at all, 24 Nov)', () => {
  const layer = read('src/ui/cards/CardLayer.tsx');
  const decl = layer.indexOf('const settleLeft ='), use = layer.indexOf('const measured =');
  assert.ok(decl > 0 && use > 0 && decl < use, 'settleLeft must be declared above `measured`');
  // and a card is admitted whatever the fonts and the settle say once the give-up passes
  assert.match(layer, /\(measured \|\| \(late === pagesKey && !paneWaits\)\)/);
  assert.match(layer, /clock\.afterReal\(\(\) => setLate\(pagesKey\), GIVE_UP_CARDS_MS\)/);
});

test('a control row of the action card is one column by specificity, whichever stylesheet loads last (a lone slider filled half the card)', () => {
  const css = read('src/ui/action/action.css');
  assert.match(css, /\n\.ac-card \.ac-cs \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(read('src/ui/styles/app-03-layouts.css'), /\.ac-cs \{ display: grid; grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/, 'the lifted 2D rule that the specific one outranks');
});

test('the reveal is a readiness gate, not a clock: a card comes in when the fonts, the charts, the slide\'s numbers and the height are all ready, and the time only guards a failed piece', () => {
  const layer = read('src/ui/cards/CardLayer.tsx');
  const gate = layer.slice(layer.indexOf('const measured ='), layer.indexOf('const [late, setLate]'));
  for (const ready of [/\.f !== false/, /\.open \?\? 0\) === 0/, /settleLeft <= 0/, /\.n\.h > 0|n\.h > 0/]) assert.match(gate, ready);
  assert.match(layer, /const go = fonts && !growing && \(numbers \|\| gaveUp === numbersKey\) && \(measured \|\| \(late === pagesKey && !paneWaits\)\)/);
  assert.match(layer, /GIVE_UP_CARDS_MS = 8000/);
});

test('a pane\'s wait is real time and longer than the cards\' own (Stiffness 2: the audit\'s 20x clock cut 8 s to a third of a second and the card came in at the placeholder\'s height)', () => {
  const layer = readFileSync(new URL('../src/ui/cards/CardLayer.tsx', import.meta.url), 'utf8');
  assert.match(layer, /PANE_GIVE_UP_MS = 25000/);
  assert.match(layer, /clock\.afterReal\(\(\) => setPaneLate\(pagesKey\), PANE_GIVE_UP_MS\)/);
  assert.match(layer, /\(panesIn \|\| paneLate === pagesKey\)/);
  assert.doesNotMatch(layer, /\(panesIn \|\| late === pagesKey\)/);
  // while a pane's wait runs the cards' own give-up may not let the card in at the placeholder's height: only the pane's own (real, 25 s) give-up may
  assert.match(layer, /const paneWaits = paneUsed && paneLate !== pagesKey/);
});

test('a lazy part that is still its placeholder counts as open, and drawing it tells the card to measure (Stiffness 2 landed at 196 px with 338 px of pane)', () => {
  assert.match(read('src/ui/cards/card-want.ts'), /\.sh-lazyhold/);
  assert.match(read('src/ui/shell/LazyBoundary.tsx'), /dispatchEvent\(new CustomEvent\('pz-chart-built', \{ bubbles: true \}\)\)/);
});
