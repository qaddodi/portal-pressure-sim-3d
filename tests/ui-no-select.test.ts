// Nothing in the app is selectable (owner, 19 Nov 2026: "text is selectable, should not be"), with no iOS long-press callout and no tap highlight anywhere, except where the reader types.
// The page starts unselectable, so a new UI root inherits that; these tests keep the rules, the document's selectstart (no-page-zoom.ts) and the first paint (index.html) saying the same thing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SELECTABLE } from '../src/ui/shell/no-page-zoom.ts';

const walk = (dir: string, ext: RegExp, out: string[] = []): string[] => {
  for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p, ext, out); else if (ext.test(f)) out.push(p); }
  return out;
};
const css = readFileSync('src/ui/shell/global.css', 'utf8');
const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ sel: m[1].trim().replace(/\s+/g, ' '), body: m[2] }));
const has = (body: string, prop: string, val: string) => new RegExp(`(^|[;\\s])${prop}\\s*:\\s*${val}\\s*(;|$)`).test(body);
const list = (sel: string) => sel.replace(/^:is\(/, '').replace(/\)$/, '').split(',').map((s) => s.trim()).sort();

test('the page is unselectable, with no callout and no tap highlight (one rule on html and body, one on every element)', () => {
  const every = rules.find((r) => r.sel.startsWith('*,') && r.sel.includes('*::before') && r.body.includes('touch-callout'));
  assert.ok(every, 'global.css has a rule on *, *::before, *::after');
  assert.ok(has(every.body, '-webkit-touch-callout', 'none'), 'no iOS long-press callout');
  assert.ok(has(every.body, '-webkit-tap-highlight-color', 'transparent'), 'no tap highlight');
  assert.ok(!every.body.includes('user-select'), 'selection is not turned off on every element (a card could not turn it back on for its words)');
  const page = rules.find((r) => r.sel === 'html, body' && r.body.includes('user-select'));
  assert.ok(page && has(page.body, 'user-select', 'none') && has(page.body, '-webkit-user-select', 'none'), 'user-select none, with the WebKit prefix, on the page');
});

test('only fields the reader types into (and .selectable) may select, and the document\'s selectstart says the same', () => {
  const allow = rules.find((r) => has(r.body, 'user-select', 'text'));
  assert.ok(allow, 'the exception rule exists');
  assert.deepEqual(list(allow.sel), ['.selectable', '[contenteditable=""]', '[contenteditable="true"]', 'input', 'textarea']);
  assert.deepEqual(list(SELECTABLE), list(allow.sel));
});

test('no other stylesheet turns selection on (outside the exception)', () => {
  for (const f of walk('src', /\.css$/)) {
    const text = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of text.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const on = /(?:-webkit-)?user-select\s*:\s*(text|auto|all|contain)/.exec(m[2]);
      if (!on) continue;
      const sel = m[1].trim().replace(/\s+/g, ' ');
>>>>>>> dd09c4f5 (Keep card text non-selectable for now (owner's 19 Nov rule); the rest of F14 stays)
    }
    assert.ok(!/-webkit-touch-callout\s*:\s*default/.test(text) || f.endsWith('global.css') || f.includes('/styles/'), `${f} turns the callout back on`);
  }
});

test('no script turns selection on, and the first paint has the rule before the stylesheet loads', () => {
  for (const f of walk('src', /\.(ts|tsx)$/)) {
    const text = readFileSync(f, 'utf8');
    assert.ok(!/userSelect\s*=\s*['"](text|auto|all)/.test(text) && !/userSelect\s*:\s*['"](text|auto|all)/.test(text), `${f} sets userSelect on`);
  }
  const html = readFileSync('index.html', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const first = [...html.matchAll(/([^{}<>]+)\{([^}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
  const page = first.find((r) => r.sel === 'html, body' && r.body.includes('user-select'));
  assert.ok(page && has(page.body, 'user-select', 'none'), 'index.html makes the page unselectable from the first paint');
  assert.ok(first.some((r) => r.sel === '*' && has(r.body, '-webkit-touch-callout', 'none') && !r.body.includes('user-select')), 'and the callout off on every element, without turning selection off on every element');
});

test('the rule is loaded by the shell', () => {
  const shell = readFileSync('src/ui/shell/Shell.tsx', 'utf8') + readFileSync('src/main.tsx', 'utf8') + readFileSync('src/App.tsx', 'utf8');
  assert.match(shell, /global\.css/);
});
