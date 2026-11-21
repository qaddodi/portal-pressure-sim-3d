// The talk's title beside the presenter bar stands only where the words' column leaves room, which changes from stop to stop. It was a span put in at full opacity: a pop at 100+ stops of the 21 Nov Mac audit
// (generic-pop span.dk-bar-title). It is always in the page, fades by opacity, and has an entrance animation for its first mount.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the talk title is never put in or taken out of the page at full opacity', () => {
  const tsx = readFileSync('src/ui/deck/PresenterBar.tsx', 'utf8'), css = readFileSync('src/ui/deck-ui.css', 'utf8');
  assert.ok(!/\{place\.title && <span className="dk-bar-title"/.test(tsx), 'the span is not mounted and unmounted with the room');
  assert.match(tsx, /titleAt/, 'it keeps its last place while it fades out');
  assert.match(css, /\.dk-bar-title\s*\{[^}]*transition: opacity/, 'it fades out');
  assert.match(css, /\.dk-bar-title\[data-on\]\s*\{[^}]*animation: dk-title-in/, 'it fades in, first mount included');
});
