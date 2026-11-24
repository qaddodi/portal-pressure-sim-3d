// Coming back to the app never shows a focus ring the keyboard did not ask for (24 Nov: the patient pill and the menu's Search wore the blue ring after leaving the window and returning).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drawsRing, installReturnFocus, isTextEntry, returnPlan } from '../src/ui/shell/return-focus.ts';

const el = (localName: string, extra: Record<string, unknown> = {}) => ({ localName, type: undefined as string | undefined, tabIndex: 0, getAttribute: (n: string) => (n === 'tabindex' && extra.tabindex !== undefined ? String(extra.tabindex) : null), blur() { this.blurred = true; }, blurred: false, ...extra }) as any;

function rig(active: any) {
  const ls: Record<string, ((e: any) => void)[]> = {};
  const target = () => ({ addEventListener: (t: string, f: any) => { (ls[t] ??= []).push(f); }, removeEventListener: (t: string, f: any) => { ls[t] = (ls[t] ?? []).filter((x) => x !== f); } });
  const attrs = new Set<string>();
  const doc: any = { ...target(), activeElement: active, hidden: false, documentElement: { toggleAttribute: (n: string, f?: boolean) => { (f ?? !attrs.has(n)) ? attrs.add(n) : attrs.delete(n); return attrs.has(n); } } };
  const win: any = target();
  const off = installReturnFocus(doc, win);
  // the doc and the window keep their own listeners; one table here is enough because the event names differ except visibilitychange (doc only)
  const fire = (t: string, e: any = {}) => { for (const f of ls[t] ?? []) f(e); };
  return { doc, fire, attrs, off, ls };
}

test('what keeps a ring: text fields keep their caret, tabindex -1 containers keep the keys, controls let go', () => {
  assert.ok(isTextEntry(el('input', { type: 'search' })) && isTextEntry(el('textarea')) && !isTextEntry(el('input', { type: 'range' })));
  assert.ok(drawsRing(el('button')) && drawsRing(el('input', { type: 'range' })) && drawsRing(el('div', { tabindex: 0 })));
  assert.ok(!drawsRing(el('div', { tabindex: -1 })), 'the talk root and the figure are focused only so keys reach them');
  assert.ok(!drawsRing(el('body')) && !drawsRing(null));
  assert.equal(returnPlan('pointer', el('button')), 'blur');
  assert.equal(returnPlan('pointer', el('input', { type: 'search' })), 'hide');
  assert.equal(returnPlan('pointer', el('div', { tabindex: -1 })), 'keep');
  assert.equal(returnPlan('keyboard', el('button')), 'keep', 'a real Tab walk keeps its ring');
});

test('leaving the window after a click: the pill lets go of focus and no ring is flagged', () => {
  const pill = el('button'), r = rig(pill);
  r.fire('pointerdown');
  r.fire('blur');
  assert.equal(pill.blurred, true);
  r.fire('focus');
  assert.ok(r.attrs.has('data-returned'), 'the stylesheet hides any ring that is left');
  r.fire('keydown', { key: 'Tab' });
  assert.ok(!r.attrs.has('data-returned'), 'the keyboard brings rings back');
  r.off();
  assert.equal((r.ls.blur ?? []).length + (r.ls.focus ?? []).length + (r.ls.pointerdown ?? []).length, 0);
});

test('a text field keeps focus on return (typing carries on) with its ring hidden; hiding the tab, not only the window, counts', () => {
  const q = el('input', { type: 'search' }), r = rig(q);
  r.fire('pointerdown');
  r.doc.hidden = true; r.fire('visibilitychange');
  assert.equal(q.blurred, false);
  r.doc.hidden = false; r.fire('visibilitychange');
  assert.ok(r.attrs.has('data-returned'));
});

test('after real keyboard use nothing changes; a modifier alone (Cmd+Tab) is not keyboard use', () => {
  const b = el('button'), r = rig(b);
  r.fire('keydown', { key: 'ArrowRight' });
  r.fire('blur'); r.fire('focus');
  assert.equal(b.blurred, false);
  assert.ok(!r.attrs.has('data-returned'));
  const c = el('button'), s = rig(c);
  s.fire('pointerdown'); s.fire('keydown', { key: 'Meta' });
  s.fire('blur');
  assert.equal(c.blurred, true);
});
