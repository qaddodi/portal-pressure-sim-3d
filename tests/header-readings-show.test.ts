// An instrument card's readings stand in its header (2D: `.pz-dh > .pz-hr`, TilesCard TilesHead). 2D's rules that show them name the header as the data card's DIRECT child
// (`.pz-data.has-tool > .pz-dh > .pz-hr`); here the card's words sit one box deeper (`.pz-data > .dk-in > .pz-dh`, cards/CardFrame.tsx), so none matched and `.pz-hr { display: none }` stood for every
// card: no instrument card showed its readings (owner, 27 Nov: the sinusoidal pressure beside the ladder on Presinusoidal portal hypertension 3 was not on screen).
// Root cause: a lifted 2D rule that names the header by `>` is one box short. deck-ui.css carries the twin of each, with `.dk-in` between; this pins that every such rule has one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../src/ui/${p}`, import.meta.url), 'utf8');
const lifted = read('styles/app-11-deck-visuals.css'), mine = read('deck-ui.css');

/** Every selector of the lifted rules that places the header's readings by the header being the card's direct child. */
const selectors = lifted.split('\n').map((l) => /^(.*?) \{/.exec(l)?.[1]).filter((s): s is string => !!s && s.includes('> .pz-dh') && s.includes('.pz-hr') && s.includes('.pz-data'));

test('the lifted rules that show an instrument card\'s header readings are found (the rule is not vacuous)', () => {
  assert.ok(selectors.length >= 4, `found ${selectors.length}`);
  assert.ok(selectors.some((s) => s.includes('.pz-hr:not([data-n="0"])') && !s.includes(':has(')));
});

test('each has a twin in deck-ui.css with the card\'s inner box between the card and its header', () => {
  for (const s of selectors) {
    const twin = s.replace('> .pz-dh', '> .dk-in > .pz-dh');
    assert.ok(mine.includes(`${twin} {`), `no twin for: ${s}`);
  }
});

test('the readings are displayed by the twin (a flex row), and `.pz-hr` is hidden only while it has none', () => {
  assert.match(mine, /\.pz \.pz-data\.has-tool > \.dk-in > \.pz-dh > \.pz-hr:not\(\[data-n="0"\]\) \{\s*display: flex;/);
  assert.match(lifted, /^\.pz-hr \{ display: none; \}/m);
});
