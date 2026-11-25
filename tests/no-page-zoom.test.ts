// The browser's page zoom never fires: the viewport says so, the body allows no double-tap zoom, and the document cancels Safari's pinch events, a two-finger touchmove and Ctrl + wheel.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { installNoPageZoom } from '../src/ui/shell/no-page-zoom.ts';

test('the viewport forbids scaling, the body takes no double-tap zoom, the canvas takes no touch gesture', () => {
  const html = readFileSync('index.html', 'utf8');
  assert.match(html, /name="viewport"[^>]*maximum-scale=1[^>]*user-scalable=no/);
  assert.match(readFileSync('src/ui/shell/global.css', 'utf8'), /touch-action: manipulation/);
  assert.match(readFileSync('src/scene/Stage.tsx', 'utf8'), /touchAction: 'none'/);
  assert.match(readFileSync('src/main.tsx', 'utf8'), /installNoPageZoom\(\)/);
});

test('the document cancels pinch gestures, two-finger moves and Ctrl + wheel, and lets everything else through', () => {
  const calls: Record<string, ((e: any) => void)[]> = {};
  const doc = { addEventListener: (t: string, f: (e: any) => void) => { (calls[t] ??= []).push(f); }, removeEventListener: (t: string, f: (e: any) => void) => { calls[t] = (calls[t] ?? []).filter((x) => x !== f); } } as unknown as Document;
  const off = installNoPageZoom(doc);
  const fire = (t: string, e: Record<string, unknown>) => { let stopped = false; for (const f of calls[t] ?? []) f({ cancelable: true, preventDefault: () => { stopped = true; }, ...e }); return stopped; };
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) assert.ok(fire(t, {}), t);
  assert.ok(fire('touchmove', { touches: [1, 2] }), 'two fingers');
  assert.ok(!fire('touchmove', { touches: [1] }), 'one finger scrolls and drags');
  assert.ok(fire('wheel', { ctrlKey: true }), 'a trackpad pinch');
  assert.ok(!fire('wheel', { ctrlKey: false }), 'a plain scroll');
  const sel = (target: unknown) => fire('selectstart', { target });
  const plain = { closest: () => null }, field = { closest: () => ({}) };
  assert.ok(sel(plain), 'a label or card never starts a selection'); assert.ok(!sel(field), 'a field still may');
  off();
  assert.equal((calls.wheel ?? []).length, 0);
});
