import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';

function css(dir: URL, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) { const u = new URL(n + (statSync(new URL(n, dir)).isDirectory() ? '/' : ''), dir); if (n.endsWith('/')) continue; statSync(u).isDirectory() ? css(u, out) : n.endsWith('.css') && !u.pathname.includes('/css2d/') && out.push(u.pathname); }
  return out;
}

test('our element resets never outweigh the lifted 2D one-class rules (the top-bar buttons lost padding, border and font to `.sh-root button`)', () => {
  const bad: string[] = [];
  for (const f of css(new URL('../src/', import.meta.url))) {
    const text = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of text.matchAll(/(^|\})\s*([^{}@]+)\{([^{}]*)\}/g)) {
      const sel = m[2]!.trim(), body = m[3]!;
      // a reset: a rule on the bare `button` element under a root that sets padding, border, background or font
      if (/^\.(sh-root|app)\s+button\s*$/.test(sel) && /(^|;)\s*(padding|border|background|font|color)\s*:/.test(body)) bad.push(`${f}: ${sel}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('shell.css keeps its two button resets at zero weight', () => {
  const s = readFileSync(new URL('../src/ui/shell/shell.css', import.meta.url), 'utf8');
  assert.match(s, /^:where\(\.sh-root button\) \{ font: inherit;/m);
  // the border/background/padding reset stops at #app: 2D resets none of them there (.sheet-grab is the browser's padding 1px 6px, 2px border, cursor default)
  assert.match(s, /^:where\(\.sh-root button:not\(#app button\)\) \{ border: 0; background: transparent; padding: 0; \}/m);
});

test('the shell font stack is 2D\'s --font-ui whole (Inter Fallback, Roboto, Helvetica, Arial included)', () => {
  const stack = (t: string) => /--(?:font-)?ui:\s*([^;]+);/.exec(t)![1]!.trim();
  assert.equal(stack(readFileSync(new URL('../src/ui/shell/global.css', import.meta.url), 'utf8')), stack(readFileSync(new URL('../src/ui/css2d/tokens.css', import.meta.url), 'utf8')));
});
