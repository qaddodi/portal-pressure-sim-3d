// One calm cue for every wait the viewer did not expect (splash plan A7, 22 Nov), and a pane whose code has not arrived never opens empty and then pops (A4). Node only: a small fake document.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sceneSource } from './helpers/scene-source.ts';

interface FakeEl { tag: string; className: string; children: FakeEl[]; text: string; attrs: Record<string, string>; removed: boolean; classList: { add(c: string): void; remove(c: string): void; has(c: string): boolean }; append(...n: FakeEl[]): void; setAttribute(k: string, v: string): void; remove(): void; textContent: string }
const mk = (tag: string): FakeEl => {
  const el: FakeEl = { tag, className: '', children: [], text: '', attrs: {}, removed: false,
    classList: { add: (c) => { if (!el.className.split(' ').includes(c)) el.className += ` ${c}`; }, remove: (c) => { el.className = el.className.split(' ').filter((x) => x !== c).join(' '); }, has: (c) => el.className.split(' ').includes(c) },
    append: (...n) => { el.children.push(...n); }, setAttribute: (k, v) => { el.attrs[k] = v; }, remove: () => { el.removed = true; }, get textContent() { return el.text; }, set textContent(v: string) { el.text = v; } };
  return el;
};
const body = mk('body');
(globalThis as { document?: unknown }).document = { createElement: mk, body };
const { waitCue, cueWords, CUE_AFTER_MS } = await import('../src/ui/shell/wait-cue.ts');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('a wait shorter than the delay shows nothing at all', async () => {
  const done = waitCue('the lobule', { after: 60 });
  await wait(20); done(); await wait(100);
  assert.equal(body.children.length, 0, 'no flash for a short wait');
});

test('a wait that passes the delay shows 2D\'s spinner and words, over the figure (fixed, not a blank), eases in, and eases out when it ends', async () => {
  const done = waitCue('the sinusoid', { after: 30 });
  await wait(120);
  const cue = body.children[0]!;
  assert.ok(cue, 'shown'); assert.equal(cue.attrs.role, 'status');
  assert.equal(cue.children[1]!.text, cueWords('the sinusoid')); assert.match(cue.children[1]!.text, /^Preparing the sinusoid/);
  assert.equal(cue.children[0]!.tag, 'i', 'the spinner');
  assert.ok(cue.classList.has('on'), 'brought up a task after it was added, so its fade is seen');
  done(); assert.ok(!cue.classList.has('on'), 'fading out');
  await wait(400); assert.equal(cue.removed, true, 'then gone');
  done();   // (twice is harmless)
});

test('a cue inside a host sits in the host; the default wait is 300 ms', async () => {
  assert.equal(CUE_AFTER_MS, 300);
  const host = mk('div'); const done = waitCue('this part', { host: host as never, after: 20 });
  await wait(80); assert.equal(host.children.length, 1); assert.match(host.children[0]!.className, /in-host/); done();
});

test('every held path calls the one helper: a held dive (scene.ts), a pane whose code has not arrived (LazyBoundary); the cue\'s CSS is calm and over the figure, not a blank', () => {
  assert.match(sceneSource(), /\n  hold\([\s\S]{0,200}\): void \{[\s\S]{0,300}waitCue\(/, 'the dive held for its parts');
  assert.match(sceneSource(), /this\.hold\(\{ shot, room, ms, ease \}\)/);
  assert.equal((sceneSource().match(/this\.heldDive = /g) ?? []).length, 1, 'the held dive is set or cleared in one place only: the helper');
  const lazy = readFileSync('src/ui/shell/LazyBoundary.tsx', 'utf8');
  assert.match(lazy, /waitCue\('this part', \{ host: ref\.current, after: 400 \}\)/);
  const css = readFileSync('src/ui/shell/shell.css', 'utf8');
  assert.match(css, /\.sh-waitcue \{[^}]*opacity: 0;[^}]*transition: opacity var\(--d-small\)/);
  assert.doesNotMatch(css.slice(css.indexOf('.sh-waitcue {'), css.indexOf('.sh-lazyhold')), /backdrop-filter/, 'no blur over the moving figure');
});

test('A4: a lazy part shows a quiet placeholder at its pane\'s height and fades in when it lands, with no wrapper element (the panes\' CSS selects `.dock-pane > .instrument-view`)', () => {
  const lazy = readFileSync('src/ui/shell/LazyBoundary.tsx', 'utf8');
  assert.doesNotMatch(lazy, /<Suspense fallback=\{null\}/, 'no more an empty pane that pops');
  assert.match(lazy, /<Hold height=\{this\.props\.height\}/); assert.match(lazy, /<Arrive late=\{this\.isLate\} \/>/);
  assert.match(lazy, /part\.animate\(\[\{ opacity: 0 \}, \{ opacity: 1 \}\], \{ duration: fadeMs\(D_SMALL\), easing: EASE_ARRIVE \}\)/);
  assert.doesNotMatch(lazy, /sh-lazyin/);
  for (const [f, n] of [['src/ui/tests/TestsLayer.tsx', 4], ['src/ui/tests/trace/PressureTab.tsx', 1], ['src/ui/talk/ToolCardBody.tsx', 1]] as const) {
    const src = readFileSync(f, 'utf8');
    assert.equal(src.split('<LazyBoundary height={p.plot}>').length - 1, n, `${f}: each pane tells the boundary its height`);
  }
});
