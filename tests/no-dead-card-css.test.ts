import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The old in-card settings panel, its chips and the dot row are gone from every card.
// Settings are the shell's menu now (src/ui/settings), so none of these classes may come back.
const FILES = ['src/ui/deck-ui.css', 'src/ui/a11y/reduced.css'];

test('dead card classes (.dk-panel, .dk-chip, .dk-chips, .dk-dots) are not styled', () => {
  for (const f of FILES) {
    const css = readFileSync(f, 'utf8');
    assert.doesNotMatch(css, /\.dk-(panel|chips?|dots)\b/, f);
  }
});
