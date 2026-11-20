// Mohammad, 20 Nov: the view pill changes with where we are. Anatomy: Circuit and Lobule. Lobule: Anatomy and Sinusoid. Sinusoid: Lobule only. Circuit: Anatomy only.
// One rule (the views are a path, the pill shows the current view and its neighbours), and the change eases (pill-fold.ts), never pops.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VIEW_PATH, neighbours, pillHidden, type ViewId } from '../src/ui/shell/views.ts';
import { foldPlan, faceFrom, type Snap } from '../src/ui/shell/pill-fold.ts';

const shown = (cur: ViewId) => VIEW_PATH.filter((v) => !pillHidden(v, cur));
test('the pill shows the current view and its neighbours on the path', () => {
  assert.deepEqual(shown('anatomic'), ['circuit', 'anatomic', 'lobule']);
  assert.deepEqual(shown('lobule'), ['anatomic', 'lobule', 'sinusoid']);
  assert.deepEqual(shown('sinusoid'), ['lobule', 'sinusoid']);
  assert.deepEqual(shown('circuit'), ['circuit', 'anatomic']);
  for (const v of VIEW_PATH) assert.ok(shown(v).includes(v), `${v} is always shown (the selected one)`);
  assert.deepEqual(neighbours('circuit'), ['anatomic']);
});
const snap = (w: number, items: Record<string, [number, number]>): Snap => ({ w, items: new Map(Object.entries(items).map(([k, [l, bw]]) => [k as ViewId, { l, w: bw }])) });
test('the fold: a button that stays slides, one that comes slides out from its neighbour, one that goes rides out with it; the face scales about its centre', () => {
  // Anatomy -> Lobule: Circuit goes, Sinusoid comes, Anatomy and Lobule stay
  const before = snap(300, { circuit: [-130, 70], anatomic: [-58, 70], lobule: [14, 70] });
  const after = snap(300, { anatomic: [-130, 70], lobule: [-58, 70], sinusoid: [14, 70] });
  const p = foldPlan(before, after, VIEW_PATH);
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
