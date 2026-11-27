// The quick check's answer opens and shuts as one unit: frame, rows and words start in the same frame (Mohammad, 27 Nov: "doesn't transition smoothly between open and close, the text gets bigger faster than the card").
// Root cause: the frame learned of the change only from its ResizeObserver, which since 261e0c78 runs its pass from a timer, so the frame glide began a frame or more after the words were laid out
// (see src/ui/cards/content-resized.ts). Node only: the pure part is run, the wiring is read from source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONTENT_RESIZED, flipOffsets, ANSWER_IN_AT, ANSWER_OUT_BY, tellCardResized } from '../src/ui/cards/content-resized.ts';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const frame = src('src/ui/cards/CardFrame.tsx'), check = src('src/ui/cards/CheckCard.tsx'), css = src('src/ui/styles/app-05-presenter-cards.css'), later = src('src/ui/layout/fit-later.ts');

test('a row\'s way is where it stood less where it stands, nothing guessed; a way of a pixel or less is not played', () => {
  assert.deepEqual(flipOffsets([10, 50, 90], [10, 50, 90]), [0, 0, 0]);
  assert.deepEqual(flipOffsets([10, 50, 90], [10, 50, 140]), [0, 0, -50], 'a row under an answer that opened stood 50 higher');
  assert.deepEqual(flipOffsets([10, 50, 140], [-15, 25, 90]), [25, 25, 50], 'a centred card that shut: every row moves by what the frame lost');
  assert.deepEqual(flipOffsets([10, 50.6], [10, 50]), [0, 0]);
  assert.deepEqual(flipOffsets([], [4, 8]), [0, 0], 'a row that was not there stands still');
});

test('the words come in after the frame\'s edge and go before it sinks, both inside the one glide', () => {
  assert.ok(ANSWER_IN_AT > 0 && ANSWER_IN_AT < 0.6 && ANSWER_OUT_BY > 0 && ANSWER_OUT_BY < 0.6);
});

test('a card\'s content tells it of a change with a bubbling event the frame is listening for', () => {
  const sent: { type: string; bubbles: boolean }[] = [];
  tellCardResized({ dispatchEvent: (e: Event) => { sent.push({ type: e.type, bubbles: e.bubbles }); return true; } } as unknown as Element);
  assert.deepEqual(sent, [{ type: CONTENT_RESIZED, bubbles: true }]);
  tellCardResized(null);
  assert.match(frame, /addEventListener\(CONTENT_RESIZED, built\)/, 'the frame measures when told, in the same task');
  assert.match(frame, /removeEventListener\(CONTENT_RESIZED, built\)/);
});

test('the reason the event exists stays true: the observer\'s own pass is a timer (so a card that grows by design must not wait on it)', () => {
  assert.match(later, /clock\.after\(/);
});

test('every card that grows by design tells its frame before it reads where its parts stand', () => {
  assert.match(frame, /GROWS_BY_DESIGN: ReadonlySet<string> = new Set\(\['check'\]\)/, 'a new card that grows by design adds its own test here');
  const tell = check.indexOf('tellCardResized(root)'), read = check.indexOf('getBoundingClientRect().top', check.indexOf('useLayoutEffect(() => {'));
  assert.ok(tell > 0 && read > tell, 'the frame is at its new height and place first');
  assert.doesNotMatch(check, /data-anchor/, 'the rows no longer guess the frame\'s move (the old g): they read where they stand');
  assert.doesNotMatch(check, /height\.current/);
});

test('the frame, the rows and the words ease together on the one glide', () => {
  assert.match(check, /GLIDE_MS \* ANSWER_OUT_BY/);
  assert.equal([...check.matchAll(/duration: GLIDE_MS\b/g)].length, 3, "the answer coming in, its going (a share of it) and each row");
  assert.doesNotMatch(check, /duration: (?!GLIDE_MS)\d/, 'no other duration');
});

test('an answer is never removed while it can still be read: a shut one stays, out of the layout, until its words have faded', () => {
  assert.match(check, /\(open\.has\(k\) \|\| leaving\.has\(k\)\) &&/);
  assert.match(check, /aria-hidden=/, 'and is hidden from readers while it goes');
  assert.match(css, /\.pz-check li\.leaving \.pzc-a \{[^}]*position: absolute;[^}]*opacity: 1;[^}]*visibility: visible;/, 'it takes no room (the rows below ease up at once) but is drawn');
  assert.match(css, /\.pz-check li \{ position: relative;/, 'it is placed in its own row');
  assert.match(css, /\.pz-check\.shedding \{ overflow: visible; \}/, 'a last answer that shuts is not cut by the shorter list');
});
