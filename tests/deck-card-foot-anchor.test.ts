// A phone's words card hangs from the screen's foot (eyes on c70021f, 20 Nov: opening a quick-check answer, the words stood outside the card, the card overshot and then jumped ~65 px).
// Root cause: every card kept its TOP when its height changed, so a card on the foot grew down past the screen's foot at its old place and the plan's new place (a React round trip later)
// jumped it up by the growth. Now the card's place IS its foot: it grows and shrinks at its top, in the frame its words change, and its rows' own glide counts the shift.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8');
const frame = src('../src/ui/cards/CardFrame.tsx'), css = src('../src/ui/deck-ui.css'), check = src('../src/ui/cards/CheckCard.tsx');

test('a words card on a phone or an upright tablet hangs from its foot', () => {
  assert.match(frame, /centredKind\(entry\.id\) \? 'mid' : !data && \(lay0 === 'stack' \|\| lay0 === 'tab'\) \? 'foot' : 'top'/);
  assert.match(frame, /data-anchor=\{anchor !== 'top' \? anchor : undefined\}/);
  assert.match(frame, /anchor === 'foot' \? rect\.y \+ rect\.h : anchor === 'mid' \? rect\.y \+ rect\.h \/ 2 : rect\.y/, 'its place is its foot (or its middle): the same before and after a growth');
  assert.match(css, /\.dk-pos\[data-anchor="foot"\] > \.dk-card\[data-card\] \{ top: auto; bottom: 0; \}/);
  assert.match(css, /data-anchor="mid"\] > \.dk-card\[data-card\] \{ bottom: auto; \}/);
  assert.ok(css.indexOf('.dk-pos[data-anchor] > .dk-card[data-card]') > css.indexOf('.deck-ui.pz .dk-card[data-card].pz-shade'), 'after the 2D reset rules it must beat');
});

test('it is revealed from its foot up and sinks from the top down, the shadow plate scaled from the foot', () => {
  assert.match(frame, /inset\(\$\{g\}px 0 0 0 round/, 'growing: the new top is revealed upward');
  assert.match(frame, /inset\(\$\{g \/ 2\}px 0 \$\{g \/ 2\}px 0 round/, 'a centred card is revealed from its middle');
  assert.match(frame, /inset\(\$\{d\}px 0 0 0 round/, 'shrinking: clipped from the top');
  assert.match(frame, /transformOrigin: org/);
  assert.match(frame, /shrinkNow\(h\)/, 'a shrink starts in the measuring callback too, like a growth');
  assert.match(frame, /translateY\(\$\{a === 'foot' \? d : d \/ 2\}px\)/, 'the words stand at their final places while the frame sinks');
  assert.match(frame, /innerRef\.current\?\.style\.removeProperty\('transform'\)/);
});

test('the quick check\'s rows count the card\'s shift', () => {
  assert.match(check, /getAttribute\('data-anchor'\)/);
  assert.match(check, /\+ g;/);
});
