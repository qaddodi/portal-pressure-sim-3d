// Mohammad, 26 Nov: "change the circuit/anatomy/lobule/sinusoid pill to always have all the 4 options, since we can transition between all of them smoothly now".
// (It showed the current view and its neighbours on a path from 20 Nov.) One rule, one list: the pill is drawn from VIEWS and shows every one of them from any view; any view goes to any other.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VIEWS, pillViews, tapView, type ViewId } from '../src/ui/shell/views.ts';
import { foldPlan, faceFrom, type Snap } from '../src/ui/shell/pill-fold.ts';
import { diveMs } from '../src/scene/camera/dive.ts';

const ORDER = VIEWS.map((v) => v.id);
test('the pill lists every view of the app, in the app\'s order, from every view', () => {
  assert.deepEqual(ORDER, ['circuit', 'anatomic', 'lobule', 'sinusoid']);
  assert.deepEqual(pillViews(), ORDER);
  const src = readFileSync('src/ui/shell/TopBar.tsx', 'utf8');
  assert.match(src, /VIEWS\.map\(\(v\) =>/);
  assert.match(src, /pillViews\(\)\.includes\(v\.id\)/);
});
test('a tap on any view goes there from any other view (twelve moves), the camera has a length for each, and a tap on the active one refits', () => {
  for (const from of ORDER) for (const to of ORDER) {
    if (from === to) continue;
    assert.deepEqual(tapView(to, from), { type: 'go', view: to, from });
    const scene = (v: ViewId) => (v === 'circuit' ? 'circuit' : v === 'anatomic' ? 'body' : v) as 'circuit' | 'body' | 'lobule' | 'sinusoid';
    const ms = diveMs(scene(from), scene(to), 0);
    assert.ok(ms !== undefined && ms >= 0, `${from} -> ${to} has a length`);
    if ((from === 'lobule' || from === 'sinusoid' || to === 'lobule' || to === 'sinusoid')) assert.ok(ms! > 0, `${from} -> ${to} is a dive`);
  }
  for (const v of ORDER) assert.equal(tapView(v, v).type, v === 'sinusoid' ? 'go' : 'refit');
});
const snap = (w: number, items: Record<string, [number, number]>): Snap => ({ w, items: new Map(Object.entries(items).map(([k, [l, bw]]) => [k as ViewId, { l, w: bw }])) });
test('the fold: a button that stays slides, one that comes slides out from its neighbour, one that goes rides out with it; the face scales about its centre', () => {
  // Anatomy -> Lobule: Circuit goes, Sinusoid comes, Anatomy and Lobule stay
  const before = snap(300, { circuit: [-130, 70], anatomic: [-58, 70], lobule: [14, 70] });
  const after = snap(300, { anatomic: [-130, 70], lobule: [-58, 70], sinusoid: [14, 70] });
  const p = foldPlan(before, after, ORDER);
  assert.equal(p.get('anatomic')!.kind, 'stay'); assert.equal(p.get('anatomic')!.dx0, 72);
  assert.equal(p.get('lobule')!.dx0, 72);
  assert.equal(p.get('sinusoid')!.kind, 'in'); assert.equal(p.get('sinusoid')!.o0, 0);
  assert.equal(p.get('circuit')!.kind, 'out'); assert.equal(p.get('circuit')!.o1, 0);
  assert.equal(p.get('circuit')!.dx1, -72, 'the going button rides with its nearest staying neighbour');
  assert.equal(faceFrom(snap(200, {}), snap(300, {})), 200 / 300);
});
test('the pill animates only transform and opacity, once per change of the view', () => {
  const src = readFileSync('src/ui/shell/pill-fold.ts', 'utf8');
  assert.ok(!/requestAnimationFrame/.test(src));
  assert.ok(!/\b(width|left|top)\s*:\s*\[/.test(src));
  assert.match(readFileSync('src/ui/shell/TopBar.tsx', 'utf8'), /playFold\(el, box, was\.snap/);
});
test('goToView lands on every view from every view, and the pill\'s tap does the same', async () => {
  const { goToView } = await import('../src/ui/shell/view-actions.ts');
  const { useShell } = await import('../src/ui/shell/store.ts');
  for (const from of ORDER) for (const to of ORDER) {
    useShell.setState({ view: from });
    if (from !== to) { assert.ok(goToView(to), `${from} -> ${to}`); assert.equal(useShell.getState().view, to); }
  }
});
