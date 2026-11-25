// The browser's page zoom never fires: the viewport says so, the body allows no double-tap zoom, and the document cancels Safari's pinch events, a two-finger touchmove and Ctrl + wheel.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { installNoPageZoom, FIGURE, SELECTABLE, NOT_SELECTABLE } from '../src/ui/shell/no-page-zoom.ts';

test('the viewport allows scaling (WCAG 1.4.4), the body takes no double-tap zoom, the figure and its canvas take every touch themselves', () => {
  const html = readFileSync('index.html', 'utf8');
  const viewport = (/<meta name="viewport" content="([^"]*)"/.exec(html) ?? [])[1] ?? '';
  const parts = viewport.split(',').map((x) => x.trim().split('=')[0]);
  assert.ok(parts.includes('width') && parts.includes('initial-scale'), 'a viewport that fits the device');
  assert.ok(!parts.includes('maximum-scale') && !parts.includes('user-scalable'), `the viewport must not forbid zooming in: ${viewport}`);
  const css = readFileSync('src/ui/shell/global.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = (sel: string) => [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((m) => m[1].trim() === sel).map((m) => m[2]).join(';');
  assert.ok(/touch-action:\s*manipulation/.test(rule('body') + rule('html, body') + css.slice(css.indexOf('body {'), css.indexOf('#root'))), 'the body takes no double-tap zoom');
  assert.ok(/touch-action:\s*none/.test(rule('.stage-root canvas')), 'the canvas itself takes no browser gesture (double-tap-and-slide zoom, hold-then-drag tilt, no magnifier)');
  assert.ok(readFileSync('src/scene/Stage.tsx', 'utf8').includes("touchAction: 'none'"), 'and so does its stage');
  assert.ok(readFileSync('src/main.tsx', 'utf8').includes('installNoPageZoom()'));
});

test('on the figure the document cancels pinch gestures, two-finger moves and Ctrl + wheel; on a card, a sheet or the bars it lets the page zoom', () => {
  const calls: Record<string, ((e: any) => void)[]> = {};
  const doc = { addEventListener: (t: string, f: (e: any) => void) => { (calls[t] ??= []).push(f); }, removeEventListener: (t: string, f: (e: any) => void) => { calls[t] = (calls[t] ?? []).filter((x) => x !== f); } } as unknown as Document;
  const off = installNoPageZoom(doc);
  const fire = (t: string, e: Record<string, unknown>) => { let stopped = false; for (const f of calls[t] ?? []) f({ cancelable: true, preventDefault: () => { stopped = true; }, ...e }); return stopped; };
  const el = (...on: string[]) => ({ closest: (sel: string) => (sel.split(',').map((x) => x.trim()).some((x) => on.includes(x)) ? {} : null) });
  const figure = el(FIGURE), card = el('.treat-card'), bar = el();
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) { assert.ok(fire(t, { target: figure }), `${t} on the figure`); assert.ok(!fire(t, { target: card }), `${t} on a card is the page's`); }
  assert.ok(fire('touchmove', { touches: [1, 2], target: figure }), 'two fingers on the figure');
  assert.ok(!fire('touchmove', { touches: [1, 2], target: card }), 'two fingers on a card zoom the page');
  assert.ok(!fire('touchmove', { touches: [1], target: figure }), 'one finger scrolls and drags');
  assert.ok(fire('wheel', { ctrlKey: true, target: figure }), 'a trackpad pinch on the figure');
  assert.ok(!fire('wheel', { ctrlKey: true, target: bar }), 'a trackpad pinch elsewhere is the browser zoom');
  assert.ok(!fire('wheel', { ctrlKey: false, target: figure }), 'a plain scroll');
  const sel = (target: unknown) => fire('selectstart', { target });
  const only = (on: string) => ({ closest: (q: string) => (q === SELECTABLE ? (on === 'card' || on === 'control' ? {} : null) : q === NOT_SELECTABLE ? (on === 'control' ? {} : null) : null) });
  assert.ok(sel(only('plain')), 'a label on the figure or a bar never starts a selection');
  assert.ok(!sel(only('card')), 'the words of a card may be selected');
  assert.ok(sel(only('control')), 'a button or a head inside a card may not');
  off();
  assert.equal((calls.wheel ?? []).length, 0);
});
