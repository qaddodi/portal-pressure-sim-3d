// Nothing in the app is selectable (owner, 19 Nov 2026: "text is selectable, should not be"): no text selection, no iOS long-press callout, no tap highlight,
// anywhere, except where the reader types. One rule on `*` gives every UI root that, so a new root inherits it; these tests keep it that way.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (dir: string, ext: RegExp, out: string[] = []): string[] => {
  for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p, ext, out); else if (ext.test(f)) out.push(p); }
  return out;
};
const css = readFileSync('src/ui/shell/global.css', 'utf8');
const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ sel: m[1].trim().replace(/\s+/g, ' '), body: m[2] }));
const has = (body: string, prop: string, val: string) => new RegExp(`(^|[;\\s])${prop}\\s*:\\s*${val}\\s*(;|$)`).test(body);

test('every element is unselectable, with no callout and no tap highlight (one rule on *)', () => {
  const star = rules.find((r) => r.sel.startsWith('*,') && r.sel.includes('*::before') && r.body.includes('user-select'));
  assert.ok(star, 'global.css has a rule on *, *::before, *::after');
  assert.ok(has(star.body, 'user-select', 'none') && has(star.body, '-webkit-user-select', 'none'), 'user-select none, with the WebKit prefix');
  assert.ok(has(star.body, '-webkit-touch-callout', 'none'), 'no iOS long-press callout');
  assert.ok(has(star.body, '-webkit-tap-highlight-color', 'transparent'), 'no tap highlight');
});

test('only fields the reader types into (and .selectable) may select', () => {
  const allow = rules.find((r) => has(r.body, 'user-select', 'text'));
  assert.ok(allow, 'the exception rule exists');
  const sels = allow.sel.split(',').map((s) => s.trim()).sort();
  assert.deepEqual(sels, ['.selectable', '[contenteditable=""]', '[contenteditable="true"]', 'input', 'textarea']);
});

test('no stylesheet in the app turns selection back on (outside the exception)', () => {
  for (const f of walk('src', /\.css$/)) {
    const text = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of text.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const on = /(?:-webkit-)?user-select\s*:\s*(text|auto|all|contain)/.exec(m[2]);
      if (!on) continue;
      const sel = m[1].trim().replace(/\s+/g, ' ');
      assert.ok((f.endsWith('global.css') || f.includes('/styles/')) && sel.includes('contenteditable'), `${f}: "${sel}" turns selection on`);   // (the lifted 2D stylesheets turn it on for contenteditable only)
    }
    assert.ok(!/-webkit-touch-callout\s*:\s*default/.test(text) || f.endsWith('global.css') || f.includes('/styles/'), `${f} turns the callout back on`);
  }
});

test('no script turns selection on, and the first paint has the rule before the stylesheet loads', () => {
  for (const f of walk('src', /\.(ts|tsx)$/)) {
    const text = readFileSync(f, 'utf8');
    assert.ok(!/userSelect\s*=\s*['"](text|auto|all)/.test(text) && !/userSelect\s*:\s*['"](text|auto|all)/.test(text), `${f} sets userSelect on`);
  }
  const html = readFileSync('index.html', 'utf8');
  assert.match(html, /\*\s*\{[^}]*user-select:\s*none[^}]*-webkit-touch-callout:\s*none/);
});

test('the rule is loaded by the shell', () => {
  const shell = readFileSync('src/ui/shell/Shell.tsx', 'utf8') + readFileSync('src/main.tsx', 'utf8') + readFileSync('src/App.tsx', 'utf8');
  assert.match(shell, /global\.css/);
});
