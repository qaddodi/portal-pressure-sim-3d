import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 2D's teaching card (presenter-question.js) is its title, equation, line, caveat and cite: no kicker row above the title. Only a card split into pages says which page it is.
test('the teaching card has no kicker row unless it is split into pages', () => {
  const src = readFileSync('src/ui/cards/TeachingCard.tsx', 'utf8');
  assert.ok(!src.includes('{slide.kicker}'), 'the slide\'s section name is not printed above its title');
  assert.ok(/pages > 1 \? <div className="pz-kick"/.test(src), 'a page count shows only when the card has more than one page');
});
