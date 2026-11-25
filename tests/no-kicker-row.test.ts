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

// Capture 2b947e48, Gastric varices 7: the level tab ("SINUSOIDAL", top left) and the page count ("2 OF 2", top left) printed over each other. The count moves to the top right (the name tab's place, which is hidden
// while the level tab shows) wherever the level tab is on screen, in every deck: the rule is on the shared card, and the level tab is written before the count so the sibling selector reaches it.
test('the page count never stands where the level tab does', () => {
  const src = readFileSync('src/ui/cards/TeachingCard.tsx', 'utf8');
  assert.ok(src.indexOf('className="pz-sitetab"') < src.indexOf('className="pz-pageno"'), 'the level tab comes before the count in the markup');
  const css = readFileSync('src/ui/deck-ui.css', 'utf8');
  assert.match(css, /\.pz-sitetab:not\(\[data-rail\]\) ~ \.pz-pageno, \.pz-shade\.stack \.pz-sitetab\[data-rail\] ~ \.pz-pageno \{ left: auto; right: var\(--pz-cp\); \}/);
  // where the level tab shows, the name tab is hidden (so the right edge is free for the count)
  assert.match(css, /\.pz-tabname:has\(~ \.pz-sitetab:not\(\[data-rail\]\)\) \{ display: none; \}/);
  assert.match(css, /\.pz-shade\.stack \.pz-tabname:has\(~ \.pz-sitetab\[data-rail\]\) \{ display: none; \}/);
});

// Capture af88a9c2, Sites and causes 13 (iPad upright): "No ascites" ran past the table's edge. The small-size rule for the cell lost to `td.num`'s body size on specificity; it now carries `.num`.
test('the "No ascites" cell rule stands above the number cells\' size', () => {
  const css = readFileSync('src/ui/css3d-over-2d.css', 'utf8');
  assert.match(css, /\.pz-table td\.num\.none \{ font-size: 12px; white-space: nowrap;/);
  assert.ok(!/\n\s*\.pz-table td\.none \{ font-size: 12px/.test(css), 'no weaker copy of the rule');
});
