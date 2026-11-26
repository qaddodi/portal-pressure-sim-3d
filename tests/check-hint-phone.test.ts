// A phone's quick check keeps its tap hint (capture 36b7deac, slide 14: the answer rows had no hint at all and read as plain text). Root cause: the 2D rule `.pz.stack .pzc-hint { display: none }`
// took the hint away on every stacked layout. It is a chevron now: the hint's own box is sized from the caption size (never from its own em, which is 0 while its words are hidden),
// the question row keeps a column for it, and the revealed answer starts where the question's words do.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const css = readFileSync(new URL('../src/ui/styles/app-05-presenter-cards.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (sel: string): string => { const m = new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css); assert.ok(m, `a rule for ${sel}`); return m![1]!; };

test('on a phone the quick check keeps a tap hint, drawn as a chevron with a real size', () => {
  const hint = rule('.pz.stack .pzc-hint');
  assert.doesNotMatch(hint, /display:\s*none/, 'the hint is not taken away');
  assert.match(hint, /font-size:\s*0/, 'its words are hidden (the chevron is its mark)');
  // (a width in em would be 0 beside a font-size of 0)
  assert.doesNotMatch(hint, /(width|height):\s*[\d.]+em/, 'sized from the caption size, not from its own em');
  assert.match(hint, /width:\s*calc\([\d.]+ \* var\(--s-cap\)\)/);
  assert.match(rule('.pz.stack .pzc-hint::before'), /border-width:\s*0 2px 2px 0/, 'the chevron');
  assert.match(rule('.pz.stack .pzc-q'), /grid-template-columns:\s*1\.8em minmax\(0, 1fr\) auto/, 'the row keeps a column for it');
});

test('the revealed answer starts where the question\'s words do', () => {
  assert.match(rule('.pz.stack .pzc-a > p'), /padding-left:\s*calc\(1\.8em \+ \.8em \+ \.2em\)/);
});
