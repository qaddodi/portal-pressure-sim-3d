import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 2D's teaching card (presenter-question.js) is its title, equation, line, caveat and cite: no kicker row above the title. Only a card split into pages says which page it is.
test('the teaching card has no kicker row unless it is split into pages', () => {
  const src = readFileSync('src/ui/cards/TeachingCard.tsx', 'utf8');
  assert.ok(!src.includes('{slide.kicker}'), 'the slide\'s section name is not printed above its title');
  assert.ok(/pages > 1 \? <><span className="pz-pageno"/.test(src), 'a page count shows only when the card has more than one page');
  assert.ok(!/<div className="pz-kick" data-site="none">/.test(src), 'the page count has no row of its own: it sits in the name tab\'s band (24 Nov, option 2)');
  const css = readFileSync('src/ui/deck-ui.css', 'utf8');
  assert.match(css, /\.pz-pageno \{ position: absolute; top: 0;/, 'the page count is out of the flow');
});
