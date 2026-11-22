// Two rules of the figure's words (Circuit, iPhone play-test 22 Nov 2026): a leader never crosses a vessel ("Middle hepatic vein" hung from a diagonal across the sinusoid ovals),
// and no word stands under the © line (it sat over "Splenic vein 9.0"). Both live once: the solver's leader rule, and the credit's claim every caption layer reads as a blocker.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { solve, type Item } from '../src/scene/labels/solver.ts';
import { creditClaim, CREDIT_PAD } from '../src/scene/labels/credit-claim.ts';
import { crosses, segsCross, type Box } from '../src/scene/labels/geometry.ts';
import { hits } from '../src/scene/labels/geometry.ts';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const view: Box = { x0: 0, y0: 0, x1: 600, y1: 500 };

// the dot (300, 300): the west, east and south are cards, so the one open side is north, behind four vessels
const pocket: Box[] = [{ x0: 0, y0: 0, x1: 270, y1: 500 }, { x0: 330, y0: 0, x1: 600, y1: 500 }, { x0: 270, y0: 330, x1: 330, y1: 500 }];
const lines: [number, number, number, number][] = [[200, 290, 400, 290], [200, 282, 400, 282], [200, 274, 400, 274], [200, 266, 400, 266]];
const it = (extra: Partial<Item> = {}): Item => ({ id: 'MHV', ax: 300, ay: 300, au: 0.5, forms: [{ text: 'MHV', w: 40, h: 20 }], pri: 1, dirs: ['N'] as never, minLead: 40, vw: 3, ...extra });

test('a leader never crosses a vessel: with the only open spot behind vessels the name is left out, a name that must stand takes it as the last resort', () => {
  const free = solve({ items: [it()], view, blockers: pocket, lines });
  assert.equal(free.placed.length, 1, 'with no rule it stands north across the lines');
  assert.ok(free.placed[0]!.leader);
  const kept = solve({ items: [it()], view, blockers: pocket, lines, leaderLineCost: 10 });
  assert.equal(kept.placed.length, 0, 'with the rule a leader across the vessels is not drawn');
  assert.deepEqual(kept.dropped, ['MHV']);
  const must = solve({ items: [it({ must: true })], view, blockers: pocket, lines, leaderLineCost: 10 });
  assert.equal(must.placed.length, 1, 'a must name is never left off for it');
});

test('every leader the solver places crosses no vessel line (the open sides)', () => {
  const open = solve({ items: [it({ dirs: ['N', 'E', 'W', 'S'] as never })], view, blockers: [], lines, leaderLineCost: 10 });
  assert.equal(open.placed.length, 1);
  const p = open.placed[0]!, x = 300 + p.dx, y = 300 + p.dy;
  if (p.leader) {
    const near = [Math.max(x, Math.min(300, x + p.w)), Math.max(y, Math.min(300, y + p.h))] as const;
    const seg: [number, number, number, number] = [300, 300, near[0], near[1]];
    const from: [number, number, number, number] = [seg[0] + (seg[2] - seg[0]) * (7 / Math.hypot(seg[2] - seg[0], seg[3] - seg[1])), seg[1] + (seg[3] - seg[1]) * (7 / Math.hypot(seg[2] - seg[0], seg[3] - seg[1])), seg[2], seg[3]];
    for (const l of lines) assert.ok(!segsCross(from, l), 'the leader crosses a vessel');
  }
  void crosses;
});

test('the credit is a wall: its box (padded) is claimed while it shows, and cleared when it hides', () => {
  let n = 0;
  const off = creditClaim.subscribe(() => { n++; });
  creditClaim.set({ x: 24, y: 700, w: 220, h: 17 });
  assert.deepEqual(creditClaim.boxes, [{ x0: 24 - CREDIT_PAD, y0: 700 - CREDIT_PAD, x1: 24 + 220 + CREDIT_PAD, y1: 700 + 17 + CREDIT_PAD }]);
  creditClaim.set({ x: 24, y: 700, w: 220, h: 17 });
  assert.equal(n, 1, 'an unchanged claim tells nobody');
  // a name that would stand over it stands elsewhere
  const wall = creditClaim.boxes[0]!;
  const near: Item = { id: 'SPV', ax: 130, ay: 690, au: 0.5, forms: [{ text: 'Splenic vein 9.0', w: 120, h: 20 }], pri: 1, vw: 4 };
  const out = solve({ items: [near], view: { x0: 0, y0: 0, x1: 600, y1: 800 }, blockers: [...creditClaim.boxes] });
  for (const p of out.placed) assert.ok(!hits({ x0: 130 + p.dx, y0: 690 + p.dy, x1: 130 + p.dx + p.w, y1: 690 + p.dy + p.h }, wall), 'the name stands under the credit');
  creditClaim.set(null);
  assert.deepEqual(creditClaim.boxes, []);
  assert.equal(n, 2);
  off();
});

test('the credit writes its claim and every caption layer reads it as a blocker', () => {
  const credit = src('src/ui/shell/Credit.tsx');
  assert.equal((credit.match(/creditClaim\.set\(\{/g) ?? []).length, 2, 'the foot spot and the hunted spot each claim their box');
  assert.match(credit, /creditClaim\.set\(null\)/, 'a hidden credit claims nothing');
  assert.match(src('src/scene/circuit/CircuitCaptions.tsx'), /calloutClaims\.boxes, \.\.\.creditClaim\.boxes/, 'the Circuit');
  assert.match(src('src/scene/circuit/CircuitCaptions.tsx'), /creditClaim\.subscribe/, 'and places again when the credit moves');
  assert.match(src('src/scene/labels/LabelLayer.tsx'), /scopeClaims\.boxes, \.\.\.creditClaim\.boxes/, 'the Anatomy');
  assert.match(src('src/scene/lobule/LobuleCaptions.tsx'), /creditClaim\.boxes/, 'the Lobule');
});
