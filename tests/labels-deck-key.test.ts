// The colour key on every slide (Mohammad, 20 Nov: "the 2D version used to show what kind of lens is being used in every slide, with its legend"): a slide whose lens is not pressure shows its lens's key
// (2D presenter.js paintKey), pressure shows it only on a slide with lens buttons, and a table, a chart, the outline and a case card show none. The table's names stand aside under a centred panel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { stopsOf, viewAt, lastSlideShot } from '../src/ui/deck/presenter-machine.ts';
import { keyOfSlide, keyAtStop, cardKeyAt, labelsAt } from '../src/scene/labels/deck-link.ts';
import { KEY_LENSES, keyPlace, keyModel, lensColours } from '../src/scene/labels/key.ts';
import { LENS_IDS } from '../src/scene/lenses/model.ts';
import { LOOK_IDS } from '../src/looks/looks.ts';
import type { Slide } from '../src/decks/schema.ts';

const slide = (compare?: boolean) => ({ id: 's', controls: compare ? { compare: { name: 'x', opts: [{ label: 'a', how: 'lens', lens: 'velocity' }, { label: 'b', how: 'state' }] } } : undefined }) as unknown as Slide;

test('the key of a slide: its own lens unless it is pressure; pressure only with lens buttons; none on a panel or a case', () => {
  assert.equal(keyOfSlide(slide(), 'velocity', 'teach'), 'velocity');
  // (the figure's rule, not the controls': Pressure colours the figure too, so a slide with no lens buttons and no profile still shows it: capture 2274649a, Encephalopathy 11 pink and purple with no key)
  assert.equal(keyOfSlide(slide(), 'pressure', 'teach'), 'pressure');
  assert.equal(keyOfSlide(slide(), undefined, 'teach'), 'pressure', 'a slide that names no lens wears the default one, and says so');
  assert.equal(keyOfSlide(slide(true), 'pressure', 'teach'), 'pressure');
  assert.equal(keyOfSlide(slide(), 'pressure', 'visual'), null, 'a centred panel stands over the figure');
  assert.equal(keyOfSlide(slide(), 'pressure', 'title'), null);
  assert.equal(keyOfSlide(slide(), 'system', 'teach', 'lobule'), 'pressure', 'the key names the lens the view draws: the Lobule has no System, it shows Pressure');
  assert.equal(keyOfSlide(slide(), 'system', 'teach', 'body'), 'system');
  assert.equal(keyOfSlide(slide(), 'neutral', 'teach', 'body'), null, 'Anatomy keeps the vessels\' own tones: nothing to key');
  assert.equal(keyOfSlide(slide(), 'velocity', 'visual'), null);
  assert.equal(keyOfSlide(slide(), 'velocity', 'case'), null);
  assert.equal(keyOfSlide(slide(), 'velocity', 'check'), null);
  assert.equal(keyOfSlide(null, 'velocity', 'teach'), null);
  assert.equal(keyOfSlide(slide(), 'neutral', 'teach'), null, 'a lens with no key shows none');
});

test('in the decks: slides on another lens show their key, every key is a lens the figure key knows, and a table slide asks the names to stand aside', async () => {
  let keyed = 0, panels = 0;
  for (const { id } of UI.decks) {
    const d = (await loadBuiltin(id))!;
    const stops = stopsOf(d);
    stops.forEach((st, i) => {
      const l = labelsAt(stops, { stop: i, beat: st.kind === 'slide' && (st.slide.vignette || st.slide.question) ? 1 : 0 }, id);
      if (l.key) { keyed++; assert.ok(KEY_LENSES.includes(l.key), `${id}/${i}: ${l.key}`); }
      if (l.panel) panels++;
      if (st.kind === 'slide' && st.slide.table) assert.ok(l.panel, `${id}/${st.slide.id}: a table is a centred panel, the figure's names stand aside`);
    });
  }
  assert.ok(keyed > 10, `slides with a floating key (${keyed})`);
  assert.ok(panels > 20, `panels (${panels})`);
});

test('the layer watches the key AND its hidden twin, and the controller never docks by the drawn size', async () => {
  const { readFileSync } = await import('node:fs');
  const layer = readFileSync(new URL('../src/scene/labels/LabelLayer.tsx', import.meta.url), 'utf8');
  const ctl = readFileSync(new URL('../src/scene/labels/controller.ts', import.meta.url), 'utf8');
  assert.match(layer, /keyLayer\.current\?\.querySelectorAll\('\.lb-key'\)/, 'the twin sits in the probe, outside the key wrap: the observer looks through the layer');
  assert.match(layer, /keyMo\.observe\(h, \{ childList: true \}\)/);
  assert.doesNotMatch(ctl, /keyNatural \?\? this\.keySize/, 'no fall-back to the drawn size');
});

test('the key stands over the cards (its own layer), under the chrome, and a key too long for the pill\'s row never stands over the card\'s words', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../src/scene/labels/labels.css', import.meta.url), 'utf8');
  const layer = readFileSync(new URL('../src/scene/labels/LabelLayer.tsx', import.meta.url), 'utf8');
  assert.match(css, /\.lb-key-layer \{ z-index: calc\(var\(--z-cards, 10\) \+ 1\)/, 'above the cards (z 10), below the chrome (20)');
  assert.match(layer, /className="lb-layer lb-key-layer"/);
  // eyes on 943be61: the key was in the layer under the cards (z 5 against 10), so it was "there" in the DOM and never seen
  const { dockKey } = await import('../src/scene/labels/key-dock.ts');
  const { planLayout } = await import('../src/ui/layout/plan.ts');
  const vp = { w: 390, h: 844, safe: { top: 47, right: 0, bottom: 34, left: 0 } };
  const words = planLayout(vp, [{ id: 'teach' as const, slot: 'words' as const, h: 300 }], 'words').cards.find((c) => c.slot === 'words')!.rect;
  const d = dockKey({ vp, words, natural: { w: 340, h: 22 } });
  assert.equal(d.at, 'above-pill');
  assert.ok(d.box.y1 <= words.y - 6, 'above the card, clear of its name tab');
});

test('the key stands where it reads best and only where it is needed (Mohammad, 22 Nov): a stream lens in its data card, a ramp in the story card\'s foot, on every slide that colours the figure', async () => {
  assert.equal(keyPlace('origin'), 'card'); assert.equal(keyPlace('firstpass'), 'card');
  assert.equal(keyPlace('drop'), 'dock'); assert.equal(keyPlace('pressure'), 'dock'); assert.equal(keyPlace('velocity'), 'dock');
  let cards = 0, runs = 0, withFigure = 0;
  for (const { id } of UI.decks) {
    const stops = stopsOf((await loadBuiltin(id))!);
    stops.forEach((st, i) => {
      const beat = st.kind === 'slide' && (st.slide.vignette || st.slide.question) ? 1 : 0;
      const l = labelsAt(stops, { stop: i, beat }, id), k = keyAtStop(stops, i, beat), c = cardKeyAt(stops, i);
      assert.ok(!(l.key && c), `${id}/${i}: one key, not two`);
      if (c) { cards++; assert.equal(c, k); assert.equal(keyPlace(c), 'card'); }
      if (l.key) assert.equal(keyPlace(l.key), 'dock');
      if (k) { runs++; const before = i > 0 ? keyAtStop(stops, i - 1) : null; assert.notEqual(before, undefined); }
      // every slide with a figure behind its words shows its key, run or not, pressure included (Mohammad, 26 Nov, captures 36b7deac and 2274649a: "every slide that colours the figure"; the figure is always in some lens)
      if (st.kind === 'slide' && (beat === 0 || !st.slide.vignette)) {
        const v = viewAt(stops, { stop: i, beat }, lastSlideShot(stops));
        if (v.words !== 'visual' && v.words !== 'case' && v.words !== 'title' && v.words !== 'check' && !st.slide.visual && !st.slide.table) {
          withFigure++;
          assert.ok(k, `${id}/${i}: the figure is drawn in ${v.scene?.lens ?? 'pressure'}, so its key shows`);
        }
      }
    });
  }
  assert.ok(withFigure > 100, `slides with a figure behind them (${withFigure})`);
  assert.ok(cards >= 3, `stream-lens keys in data cards (${cards})`);
  assert.ok(runs > 0);
});

test('a slide that opens on a case card shows its lens key once the card has gone, and the card itself shows none (capture 36b7deac, Sites and causes 4 to 9)', async () => {
  const stops = stopsOf((await loadBuiltin('sites'))!);
  let seen = 0;
  stops.forEach((st, i) => {
    if (st.kind !== 'slide' || !st.slide.vignette || (st.slide.scene?.lens ?? 'pressure') === 'pressure') return;
    seen++;
    assert.equal(labelsAt(stops, { stop: i, beat: 0 }, 'sites').key, null, `${st.slide.id}: no key behind the case card`);
    const k = keyAtStop(stops, i, 1);
    assert.ok(k, `${st.slide.id}: the key stands after the case card`);
    assert.equal(k, st.slide.scene?.lens);
  });
  assert.ok(seen >= 6, `case slides on a lens (${seen})`);
});

test('the general rule: every lens that colours the figure has a key, in every look (capture 2274649a: Since coloured Causes treated 3 with no key)', () => {
  const coloured = LENS_IDS.filter((l) => lensColours(l));
  assert.ok(coloured.length >= 11);
  for (const l of coloured) {
    assert.ok(KEY_LENSES.includes(l), `${l} colours the figure, so it has a key`);
    for (const look of LOOK_IDS) { const m = keyModel(l, look); assert.ok(m && (m.scale || m.swatches), `${l} ${look}`); }
  }
  assert.ok(!lensColours('neutral'));
});
