import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import type { CopiedSlide } from '../src/decks/hp/types.ts';
import { figurePlan } from '../src/ui/deck/figure-plan.ts';
import { figureCalls } from '../src/ui/deck/figure-calls.ts';
import { anchorPoint, placeStep, stepLeader, stepMidOf, STEP_DIRS, STEP_LEAD_GAP, placeCards, type CardIn } from '../src/scene/labels/figure-cards.ts';
import { loadAgDeck } from '../src/decks/ag/index.ts';

// Circulation 3 (Mohammad, 20 Nov): "1" sat on the superior mesenteric vein and "2" floated in the liver away from the sinusoids it numbers. 2D stands a number beside its point (NE first,
// then NW, SE, SW, N, S, E, W) a gap off the vessel, on a leader to a dot on it, and a group's number between its vessels with a leader to each (stage-label-solve.js, `fans`).
const VIEW = { x0: 0, y0: 0, x1: 1000, y1: 800 };
const it = (over: Partial<CardIn> = {}): CardIn => ({ id: 'step:1', x: 500, y: 400, w: 24, h: 24, near: 10, ...over });

test('a step\'s number stands off its point by its gap, up and to the right first (2D\'s order), never on the vessel', () => {
  const o = placeStep(it(), VIEW, [], []);
  const cx = (o.box.x0 + o.box.x1) / 2, cy = (o.box.y0 + o.box.y1) / 2, dist = Math.hypot(cx - 500, cy - 400);
  assert.ok(o.ok);
  assert.ok(Math.abs(dist - (12 + 10)) < 1e-6, 'the circle\'s edge is `near` px from the point');
  assert.ok(cx > 500 && cy < 400, 'NE first');
  assert.deepEqual(STEP_DIRS.map(([x, y]) => [Math.sign(x), Math.sign(y)]), [[1, -1], [-1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [1, 0], [-1, 0]]);
});

test('a blocked or out-of-view direction gives way to the next one', () => {
  const ne = placeStep(it(), VIEW, [], []).box;
  const o = placeStep(it(), VIEW, [ne], []);
  assert.ok(o.box.x1 <= 500 + 1 && o.ok, 'NE blocked: NW');
  const edge = placeStep(it({ x: 990, y: 5 }), VIEW, [], []);
  assert.ok(edge.ok && edge.box.x1 <= 1000 && edge.box.y0 >= 0, 'at the corner the number stays in view');
  const clear = placeStep(it({ id: 'step:2' }), VIEW, [], [ne]);
  assert.ok(!(clear.box.x0 < ne.x1 && clear.box.x1 > ne.x0 && clear.box.y0 < ne.y1 && clear.box.y1 > ne.y0), 'the numbers do not cover one another');
});

test('placeCards gives a step the near gap and leaves the other cards\' rule alone', () => {
  const out = placeCards([it(), { id: 'mark', x: 200, y: 300, w: 80, h: 24 }], VIEW, []);
  assert.equal(out[0]!.dir, 'none');
  assert.equal(out[1]!.dir, 'bottom', 'a mark still stands above its point, on its pointer');
});

test('a leader runs from the circle\'s edge to the point; none where the point is inside the circle', () => {
  const l = stepLeader({ cx: 100, cy: 100, r: 12 }, { x: 130, y: 100 })!;
  assert.deepEqual(l.map(Math.round), [112, 100, 130, 100]);
  assert.equal(stepLeader({ cx: 100, cy: 100, r: 12 }, { x: 105, y: 100 }), null);
  assert.ok(STEP_LEAD_GAP >= 10);
});

test('a vein that fades in from its start is numbered at the middle of its solid stretch, not at its faint middle (2D arcMid)', () => {
  assert.ok(stepMidOf('V_SPL') > 0.8 && stepMidOf('V_SPL') < 0.85);
  assert.ok(stepMidOf('V_INT') > 0.8);
  assert.equal(stepMidOf('LGV_CONF'), 0.5);
  assert.equal(stepMidOf('V_PORTAL_NOT_FADED'), 0.5);
  const a = anchorPoint({ edge: 'V_INT' }, new Vector3(), undefined, stepMidOf('V_INT')), b = anchorPoint({ edge: 'V_INT' }, new Vector3());
  assert.ok(a && b && a.distanceTo(b) > 0.01, 'the number is not where the faint middle was');
});

test('circulation slide 3: step 2 is a group: a number between its sinusoids with a leader to each', async () => {
  const deck = await loadAgDeck('circulation') as unknown as { slides: CopiedSlide[] };
  const s = deck.slides.find((x) => (x as unknown as { steps?: boolean }).steps)!;
  const steps = figureCalls(figurePlan(s), {}).cards.filter((c) => c.kind === 'step');
  assert.equal(steps.length, 2);
  assert.ok('edge' in steps[0]!.anchor || 'edges' in steps[0]!.anchor);
  assert.ok('edges' in steps[1]!.anchor && steps[1]!.anchor.edges.length === 2, 'the group\'s number takes both vessels');
  const p = anchorPoint(steps[1]!.anchor, new Vector3());
  assert.ok(p, 'and a point between them');
});

test('the layer draws the leader (dot and line) with the number and places it with placeStep', () => {
  const src = readFileSync(new URL('../src/scene/labels/figure-cards.ts', import.meta.url), 'utf8'), css = readFileSync(new URL('../src/scene/labels/labels.css', import.meta.url), 'utf8');
  assert.match(src, /near: this\.stepNear\(c\)/);
  assert.match(src, /if \(c\.kind === 'step'\) this\.paintLead\(r, box, r\.a, sz\.w\)/);
  assert.match(src, /stepMidOf\(c\.anchor\.edge\)/);
  assert.match(css, /\.cl-lead-line/);
  assert.match(css, /\.cl-lead-dot/);
});
