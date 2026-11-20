// Mohammad, 20 Nov (Mac, screenshot): switching Anatomy -> Lobule drew "Sinusoid", faded, OUTSIDE the pill's right edge. Root cause: a coming or going button only faded by its own opacity while it rode with its
// neighbour, so while the face (the glass) had not yet grown to it, its word was drawn past the capsule. 2D's pill-motion.js shows such a word only while the face covers it (coverFade); the 3D fold now does too,
// for every coming or going button, in every direction (Circuit and Anatomy folding into the sinusoid view and back out, Sinusoid coming and going with the lobule).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { foldPlan, coverFade, type Snap } from '../src/ui/shell/pill-fold.ts';
import type { ViewId } from '../src/ui/shell/views.ts';

const ORDER: ViewId[] = ['circuit', 'anatomic', 'lobule', 'sinusoid'];
const W: Record<string, number> = { circuit: 70, anatomic: 80, lobule: 66, sinusoid: 86 }, GAP = 2, PAD = 6, PADX = 14;
const lay = (keys: ViewId[]): Snap & { half: number } => {
  const inner = keys.reduce((s, k) => s + W[k]!, 0) + GAP * (keys.length - 1);
  let x = -inner / 2; const items = new Map<ViewId, { l: number; w: number; pl: number; pr: number }>();
  for (const k of keys) { items.set(k, { l: x, w: W[k]!, pl: PADX, pr: PADX }); x += W[k]! + GAP; }
  return { w: inner + 2 * PAD, items, inset: 3, half: (inner + 2 * PAD) / 2 };
};
const ease = (u: number) => u;   // (keyframe offsets are taken in the eased progress; the face and the words move linearly in it)

function check(from: ViewId[], to: ViewId[]) {
  const before = lay(from), after = lay(to), plan = foldPlan(before, after, ORDER);
  for (const [id, m] of plan) {
    if (m.kind === 'stay') continue;
    const was = m.kind === 'out', box = (was ? before : after).items.get(id)!;
    const frames = coverFade({ l: box.l, r: box.l + box.w, pl: box.pl, pr: box.pr, dx0: m.dx0, dx1: m.dx1, o0: m.o0, o1: m.o1, e0: before.w / 2, e1: after.w / 2, inset: after.inset });
    assert.ok(frames.length >= 17);
    assert.equal(frames[0]!.offset, 0); assert.equal(frames.at(-1)!.offset, 1);
    // between two keyframes the opacity is a straight line: sample it finely and look at where the word is drawn then
    for (let i = 0; i < frames.length - 1; i++) for (let t = 0; t <= 1; t += 0.1) {
      const a = frames[i]!, b = frames[i + 1]!, u = a.offset + (b.offset - a.offset) * t, o = a.opacity + (b.opacity - a.opacity) * t;
      const half = (before.w + (after.w - before.w) * ease(u)) / 2 - (after.inset ?? 0), dx = m.dx0 + (m.dx1 - m.dx0) * ease(u);
      const wl = box.l + box.pl + dx, wr = box.l + box.w - box.pr + dx;
      if (wl < -half - 1e-6 || wr > half + 1e-6) assert.ok(o < 1e-6, `${from}->${to} ${id}: word outside the face at ${u.toFixed(2)} drawn at ${o.toFixed(3)}`);
    }
    const rest = was ? frames[0]! : frames.at(-1)!;
    assert.equal(rest.opacity, was ? m.o0 : m.o1, `${id} at rest is at its full fade`);
    assert.equal((was ? frames.at(-1)! : frames[0]!).opacity, 0, `${id} is unseen where it is not`);
  }
}
test('a coming or going word is drawn only while the face covers it, in every fold the view path has', () => {
  const sets: ViewId[][] = [['circuit', 'anatomic'], ['circuit', 'anatomic', 'lobule'], ['anatomic', 'lobule', 'sinusoid'], ['lobule', 'sinusoid']];
  for (const a of sets) for (const b of sets) if (a !== b) check(a, b);
});
test('the screenshot case: Anatomy -> Lobule, "Sinusoid" starts outside the capsule and is invisible there', () => {
  const before = lay(['circuit', 'anatomic', 'lobule']), after = lay(['anatomic', 'lobule', 'sinusoid']), plan = foldPlan(before, after, ORDER), m = plan.get('sinusoid')!;
  assert.equal(m.kind, 'in');
  const at = after.items.get('sinusoid')!;
  const f = coverFade({ l: at.l, r: at.l + at.w, pl: at.pl, pr: at.pr, dx0: m.dx0, dx1: 0, o0: 0, o1: 1, e0: before.w / 2, e1: after.w / 2, inset: after.inset });
  assert.ok(at.l + at.pl! + m.dx0 > before.half, 'at the start its word is past the face\'s edge');
  assert.equal(f[0]!.opacity, 0); assert.equal(f[1]!.opacity, 0, 'and stays unseen until the face reaches it');
  assert.equal(f.at(-1)!.opacity, 1);
});
test('the fold uses it for coming and going buttons, with no clip-path', () => {
  const src = readFileSync('src/ui/shell/pill-fold.ts', 'utf8');
  assert.equal((src.match(/coverFade\(\{ l:/g) ?? []).length, 2, 'the coming button and the going ghost');
  assert.ok(!/clip-path|clipPath/.test(src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '')), 'a clip-path would repaint the row');
});
