// One app-wide focus-ring rule (owner, 27 Nov: "why randomly when I open menus I see the blue outline on input text or buttons?").
// Root cause: a text field always matches :focus-visible whatever put the caret there, so a menu that opens from a tap and focuses its Search showed a ring on the bare field
// (.sh-root :focus-visible outranked .um-q's outline: 0) AND the wrapper's own :focus-within ring: two rings, no keyboard involved. A key pressed before the tap left the browser's
// "keyboard" guess on for the focus a menu moves into itself, so buttons got the ring too. The rule now: a ring only while the last input was a navigating key (html[data-kbd]),
// one ring per control. Node only.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { installReturnFocus, keyIsNavigation } from '../src/ui/shell/return-focus.ts';
import { parseCss, splitSel, stylesheets } from './css-parse.ts';

const el = (localName: string, type?: string) => ({ localName, type, tabIndex: 0, getAttribute: () => null, blur() {} }) as any;

function rig(active: any = null) {
  const ls: Record<string, ((e: any) => void)[]> = {};
  const target = () => ({ addEventListener: (t: string, f: any) => { (ls[t] ??= []).push(f); }, removeEventListener: () => {} });
  const attrs = new Set<string>();
  const doc: any = { ...target(), activeElement: active, hidden: false, documentElement: { toggleAttribute: (n: string, f?: boolean) => { (f ?? !attrs.has(n)) ? attrs.add(n) : attrs.delete(n); return attrs.has(n); } } };
  installReturnFocus(doc, target() as any);
  return { attrs, fire: (t: string, e: any = {}) => { for (const f of ls[t] ?? []) f(e); } };
}

test('which keys are keyboard navigation: any key but a modifier, and in a text field only the keys that leave it', () => {
  const body = el('body'), q = el('input', 'search');
  assert.ok(keyIsNavigation('Tab', body) && keyIsNavigation('/', body) && keyIsNavigation('a', body) && keyIsNavigation('ArrowDown', body), 'a key over the page is the keyboard');
  assert.ok(!keyIsNavigation('Meta', body) && !keyIsNavigation('Shift', q));
  assert.ok(!keyIsNavigation('a', q) && !keyIsNavigation('Backspace', q) && !keyIsNavigation('Enter', q) && !keyIsNavigation('ArrowLeft', q), 'typing in a field is not a walk');
  assert.ok(keyIsNavigation('Tab', q) && keyIsNavigation('ArrowDown', q), 'leaving the field by key is');
});

test('data-kbd follows the last input: a tap or click takes it off, a navigating key puts it on, typing in a field leaves it', () => {
  const q = el('input', 'search'), r = rig(q);
  assert.ok(!r.attrs.has('data-kbd'), 'a page nobody has pressed a key on has no ring');
  r.fire('keydown', { key: 'Tab', target: el('button') });
  assert.ok(r.attrs.has('data-kbd'));
  r.fire('pointerdown');   // (tapping the pill: the menu then opens and focuses its Search: no ring)
  assert.ok(!r.attrs.has('data-kbd'));
  r.fire('keydown', { key: 'a', target: q }); r.fire('keydown', { key: 'Backspace', target: q });
  assert.ok(!r.attrs.has('data-kbd'), 'typing into a field a click focused draws no ring');
  r.fire('keydown', { key: '/', target: el('body') });   // (the "/" shortcut is the keyboard: the menu opens with its one ring)
  assert.ok(r.attrs.has('data-kbd'));
});

const css = new URL('../src/ui/shell/focus-ring.css', import.meta.url);
const ring = readFileSync(css, 'utf8');
const rules = parseCss('focus-ring.css', ring);
const gated = (sel: string) => rules.some((r) => splitSel(r.sel).some((s) => s === `html:not([data-kbd]) ${sel}`));

test('no keyboard, no ring: one !important gate covers every outline, the pseudo-element ones too', () => {
  const gate = rules.find((r) => r.decls.some((d) => d.prop === 'outline' && d.value === 'none' && d.important));
  assert.ok(gate, 'the gate declares outline: none !important');
  const sels = splitSel(gate!.sel);
  for (const s of ['html:not([data-kbd]) :focus', 'html:not([data-kbd]) :focus-visible', 'html:not([data-kbd]) :focus-visible::before', 'html:not([data-kbd]) :focus-visible::after']) assert.ok(sels.includes(s), s);
});

test('it is imported after every other stylesheet, so no later sheet can compete with it', () => {
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const imports = [...main.matchAll(/^import '([^']+\.css)'/gm)].map((m) => m[1]!);
  assert.equal(imports.at(-1), './ui/shell/focus-ring.css');
});

test('a ring that is not an outline (a wrapper\'s :focus-within, a switch) is put back to its resting paint with no keyboard; a new one must be gated here too', () => {
  const NOT_RINGS = new Set<string>([
    // the slider thumb's ring is drawn by the browser's own :focus-visible, which does not match a range input on a click or tap
    'input[type=range]:focus-visible::-webkit-slider-thumb', 'input[type=range]:focus-visible::-moz-range-thumb',
    // a hidden bar that shows itself, and a handle that widens, for the keyboard: no ring, and a pointer reaches neither
    '.sheet-grab:focus-visible', '.workspace-divider:focus-visible span', '.instrument-workspace.side .workspace-divider:focus-visible span',
    // a hover-like row tint, not a ring
    '.dk-jump-list button:focus-visible', '.menu-credit:focus-visible', '.pzj-list button:focus-visible',
    // zoom pill reveals itself on focus within; not a ring
    '.zoom-pill:focus-within .ib:not(:disabled)',
  ]);
  const bad: string[] = [];
  for (const [file, text] of stylesheets()) {
    if (file.endsWith('focus-ring.css')) continue;
    for (const r of parseCss(file, text)) {
      if (!r.decls.some((d) => /^(box-shadow|border-color)$/.test(d.prop) || (d.prop === 'outline' && !/^(none|0)\b/.test(d.value)))) continue;
      for (const s of splitSel(r.sel)) {
        if (!/:focus-within/.test(s) && !(/:focus-visible/.test(s) && r.decls.some((d) => d.prop === 'box-shadow'))) continue;
        const bare = s.replace(/^html\[data-returned\]\s+/, '');
        if (NOT_RINGS.has(bare) || gated(bare)) continue;
        bad.push(`${file}: ${s}`);
      }
    }
  }
  assert.deepEqual(bad, [], 'ungated rings: add `html:not([data-kbd]) <selector>` to focus-ring.css (or list it as no ring, with the reason)');
});

test('one ring per control: the menu\'s Search box keeps its wrapper\'s ring and the bare field inside it draws none', () => {
  assert.ok(rules.some((r) => r.sel === '.um-search .um-q:focus-visible' && r.decls.some((d) => d.prop === 'outline' && d.value === 'none')));
  assert.ok(gated('.um-search:focus-within'));
});
