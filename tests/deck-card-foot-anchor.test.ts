// A phone's words card hangs from the screen's foot (eyes on c70021f, 20 Nov: opening a quick-check answer, the words stood outside the card, the card overshot and then jumped ~65 px).
// Root cause: every card kept its TOP when its height changed, so a card on the foot grew down past the screen's foot at its old place and the plan's new place (a React round trip later)
// jumped it up by the growth. Now the card's place IS its foot: it grows and shrinks at its top, in the frame its words change, and its rows' own glide counts the shift.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8');
const frame = src('../src/ui/cards/CardFrame.tsx'), css = src('../src/ui/deck-ui.css'), check = src('../src/ui/cards/CheckCard.tsx');

test('a words card on a phone or an upright tablet hangs from its foot', () => {
  assert.match(frame, /up = !data && !centredKind\(entry\.id\) && \(lay0 === 'stack' \|\| lay0 === 'tab'\)/);
  assert.match(frame, /data-up=\{up \|\| undefined\}/);
  assert.match(frame, /translate3d\(\$\{rect\.x\}px, \$\{up \? rect\.y \+ rect\.h : rect\.y\}px, 0\)/, 'its place is its foot: the same before and after a growth');
  assert.match(css, /\.dk-pos\[data-up\] > \.dk-card\[data-card\][^{]*\{[^}]*bottom: 0/);
});

test('it is revealed from its foot up and sinks from the top down, the shadow plate scaled from the foot', () => {
  assert.match(frame, /inset\(\$\{next - prev\}px 0 0 0 round/, 'growing: the new top is revealed upward');
  assert.match(frame, /inset\(\$\{d\}px 0 0 0 round/, 'shrinking: clipped from the top');
  assert.match(frame, /transformOrigin: org/);
  assert.match(frame, /shrinkNow\(h\)/, 'a shrink starts in the measuring callback too, like a growth');
  assert.match(frame, /paddingTop = `\$\{d\}px`/, 'the words stand at their final places while the frame sinks');
  assert.match(frame, /removeProperty\('padding-top'\)/);
});

test('the quick check\'s rows count the card\'s shift', () => {
  assert.match(check, /hasAttribute\('data-up'\)/);
  assert.match(check, /\+ g;/);
});
