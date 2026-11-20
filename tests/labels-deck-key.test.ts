// The colour key on every slide (Mohammad, 20 Nov: "the 2D version used to show what kind of lens is being used in every slide, with its legend"): a slide whose lens is not pressure shows its lens's key
// (2D presenter.js paintKey), pressure shows it only on a slide with lens buttons, and a table, a chart, the outline and a case card show none. The table's names stand aside under a centred panel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { stopsOf } from '../src/ui/deck/presenter-machine.ts';
import { keyOfSlide, labelsAt } from '../src/scene/labels/deck-link.ts';
import { KEY_LENSES } from '../src/scene/labels/key.ts';
import type { Slide } from '../src/decks/schema.ts';

const slide = (compare?: boolean) => ({ id: 's', controls: compare ? { compare: { name: 'x', opts: [{ label: 'a', how: 'lens', lens: 'velocity' }, { label: 'b', how: 'state' }] } } : undefined }) as unknown as Slide;

test('the key of a slide: its own lens unless it is pressure; pressure only with lens buttons; none on a panel or a case', () => {
  assert.equal(keyOfSlide(slide(), 'velocity', 'teach'), 'velocity');
  assert.equal(keyOfSlide(slide(), 'pressure', 'teach'), null);
  assert.equal(keyOfSlide(slide(), undefined, 'teach'), null);
  assert.equal(keyOfSlide(slide(true), 'pressure', 'teach'), 'pressure');
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
  assert.ok(keyed > 20, `slides with a key (${keyed})`);
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
