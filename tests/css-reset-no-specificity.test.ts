// A card's button reset must carry no specificity (20 Nov 2026, play-test): `.t-card :where(button:not(...)) { font: inherit }` is (0,1,0), the same as 2D's `.tr-chip { font: 500 12px … }`, and it comes later,
// so it beat 2D's rule: a chip read 14 px / 400 for 2D's 12 px / 500, a fold head 14 / 400 for 13.5 / 600. The same pattern stood on the Action card (`.ac-card button`, (0,1,1), beating every class rule 2D has
// for a button there). Both are zero-specificity now, so 2D's own class rules for a button win whatever their order. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';

function* css(dir: URL): Generator<{ path: string; text: string }> {
  for (const n of readdirSync(dir)) {
    const u = new URL(n + (statSync(new URL(n, dir)).isDirectory() ? '/' : ''), dir);
    if (statSync(u).isDirectory()) yield* css(u);
    else if (n.endsWith('.css')) yield { path: u.pathname, text: readFileSync(u, 'utf8') };
  }
}

test('no stylesheet resets a card\'s buttons with a selector that outranks a single class (font: inherit, color: inherit)', () => {
  const bad: string[] = [];
  for (const { path, text } of css(new URL('../src/ui/', import.meta.url))) {
    if (path.includes('/styles/')) continue;   // (2D's own sheets are copied as they are)
    for (const m of text.matchAll(/^([^{}\n]+)\{([^{}]*)\}/gm)) {
      const sel = m[1]!.trim(), body = m[2]!;
      if (!/(^|;|\s)(font|color): inherit/.test(body) || !/cursor: pointer/.test(body)) continue;   // the reset shape: font, colour and cursor together
      if (/^:where\(/.test(sel)) continue;
      if (/\b(button|input|select)\b/.test(sel)) bad.push(`${path.split('/src/')[1]}: ${sel}`);
    }
  }
  assert.deepEqual(bad, [], 'wrap the whole selector in :where(...)');
});

test('the Tests card and the Action card resets are the zero-specificity ones', () => {
  assert.match(readFileSync(new URL('../src/ui/tests/tests.css', import.meta.url), 'utf8'), /^:where\(\.t-card button:not\(/m);
  assert.match(readFileSync(new URL('../src/ui/action/action.css', import.meta.url), 'utf8'), /^:where\(\.ac-card button\) \{ font: inherit/m);
});
