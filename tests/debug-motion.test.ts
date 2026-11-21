// The motion rules, each with a series that must fire and one that must not (frames of 16 ms; a sample is { t, c, L, K, W }).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flash, stuckMid, labelSlide, labelDimAlpha, cardPop, cardSizeSnap, cardEmpty, cameraStraight, judgeMotion, type Sample } from '../src/ui/debug/watch/motion-rules.ts';
import { runRules } from '../src/ui/debug/core/rules.copied.js';
import '../src/ui/debug/selfcheck/plugins.ts';
import { labelRows } from '../src/ui/debug/watch/sources.ts';

const frames = (n: number, f: (i: number) => Partial<Sample>): Sample[] => Array.from({ length: n }, (_, i) => ({ t: i * 16, c: [1, 100, 100], ...f(i) }));
const card = (a: number, h = 300, w = 358) => [['teach', 16, 400, w, h, a]];
const label = (x: number, y: number, a: number) => [['Portal vein', x, y, 80, 18, a]] as unknown as number[][];

test('flash: shown, gone and back within a quarter second', () => {
  const s = frames(40, (i) => ({ K: card(i >= 10 && i < 14 ? 0 : 1) }));
  assert.equal(flash({ samples: s }).length, 1);
  assert.equal(flash({ samples: frames(40, () => ({ K: card(1) })) }).length, 0);
  assert.equal(flash({ samples: frames(40, (i) => ({ K: card(i < 20 ? 1 : 0) })) }).length, 0, 'going out once is not a flash');
});

test('stuck-mid: a card or label held part way through a fade; a label at the dim alpha is at rest', () => {
  const long = (a: number, f: 'K' | 'L') => frames(150, () => ({ [f]: f === 'K' ? card(a) : label(10, 10, a) }));
  assert.equal(stuckMid({ samples: long(0.5, 'K') }).length, 1);
  assert.equal(stuckMid({ samples: long(0.65, 'L') }).length, 0, 'DIM_ALPHA is rest');
  assert.equal(stuckMid({ samples: long(1, 'K') }).length, 0);
  assert.equal(labelDimAlpha({ samples: long(0.5, 'L') }).length, 1);
  assert.equal(labelDimAlpha({ samples: long(0.65, 'L') }).length, 0);
});

test('label-slide: a label moves along instead of fading; the camera moving it is not a slide', () => {
  const slide = frames(30, (i) => ({ L: label(10 + i * 2, 50, 1) }));
  assert.equal(labelSlide({ samples: slide }).length, 1);
  assert.equal(labelSlide({ samples: frames(30, (i) => ({ L: label(10 + i * 2, 50, 1), c: [1, 100 + i * 5, 100] })) }).length, 0, 'the camera moved with it');
  assert.equal(labelSlide({ samples: frames(30, (i) => ({ L: label(i < 15 ? 10 : 200, 50, 1) })) }).length, 1, 'a jump');
  assert.equal(labelSlide({ samples: frames(30, () => ({ L: label(10, 50, 1) })) }).length, 0);
});

test('card-pop: gone to shown in one frame; a fade of ten frames is fine; a stalled page is not judged', () => {
  assert.equal(cardPop({ samples: frames(30, (i) => ({ K: card(i < 10 ? 0 : 1) })) }).length, 1);
  assert.equal(cardPop({ samples: frames(30, (i) => ({ K: card(Math.min(1, Math.max(0, (i - 5) / 10))) })) }).length, 0);
  const stalled = frames(30, (i) => ({ K: card(i < 10 ? 0 : 1) })); stalled.slice(10).forEach((s) => { s.t += 500; });
  assert.equal(cardPop({ samples: stalled }).length, 0);
});

test('card-size-snap: a height that steps at once; a glide does not', () => {
  assert.equal(cardSizeSnap({ samples: frames(30, (i) => ({ K: card(1, i < 15 ? 300 : 360) })) }).length, 1);
  assert.equal(cardSizeSnap({ samples: frames(30, (i) => ({ K: card(1, 300 + Math.min(60, i * 4)) })) }).length, 0);
});

test('card-empty: shown with no words for three frames and 100 ms', () => {
  assert.equal(cardEmpty({ samples: frames(20, () => ({ K: card(1), W: [0] })) }).length, 1);
  assert.equal(cardEmpty({ samples: frames(20, () => ({ K: card(1), W: [1] })) }).length, 0);
  assert.equal(cardEmpty({ samples: frames(20, (i) => ({ K: card(1), W: [i < 2 ? 0 : 1] })) }).length, 0, 'a frame or two while the words land');
});

test('camera-straight: one move after a view change goes one way; a stop part way or a turn back is named', () => {
  const run = (p: (i: number) => number) => ({ samples: frames(90, (i) => ({ c: [1, 100 + 300 * p(i), 100] })), events: [{ k: 'view', t: 0, to: 'lobule' }] });
  const ease = (a: number, b: number, i: number) => { const t = Math.min(1, Math.max(0, (i - a) / (b - a))); return t * t * (3 - 2 * t); };
  assert.equal(cameraStraight(run((i) => ease(0, 40, i))).length, 0);
  // half way in 20 frames, held for 10 frames (160 ms), then on to the end
  const stop = cameraStraight(run((i) => (i < 20 ? 0.5 * ease(0, 20, i) : i < 30 ? 0.5 : 0.5 + 0.5 * ease(30, 55, i))));
  assert.ok(stop.some((f) => /stops part way/.test(f.where)), JSON.stringify(stop));
  // forward to 0.6, back to 0.5, then on
  const back = cameraStraight(run((i) => (i < 20 ? 0.6 * ease(0, 20, i) : i < 26 ? 0.6 - 0.1 * ((i - 20) / 6) : 0.5 + 0.5 * ease(26, 55, i))));
  assert.ok(back.some((f) => /turns back/.test(f.where)), JSON.stringify(back));
});

test('the motion rules run through the registry as the "motion" family and a throwing rule is a finding', () => {
  const hist = Object.assign(frames(40, (i) => ({ K: card(i >= 10 && i < 14 ? 0 : 1) })), { events: [] });
  const found = runRules(null, { history: hist, families: 'motion' });
  assert.ok(found.some((f: { rule: string }) => f.rule === 'flash'));
  assert.deepEqual(runRules(null, { history: [], families: 'motion' }), []);
  assert.ok(judgeMotion({ samples: null as never }).filter((f) => /threw/.test(f.where)).length >= 6, 'a rule that throws is a finding, not silence');
});

test('a label crossing to a new spot is one label cross-fading: one row per name, seen as much as the two pictures together, no flash, no vanish, no jump', () => {
  // the label's own picture (opacity m, at the new spot) and the one it is leaving (the ghost, 1 - m, at the old): m runs 0 to 1 over 15 frames, 240 ms
  const run = frames(40, (i) => {
    const u = Math.min(1, Math.max(0, (i - 10) / 15)), m = u * u * u * (u * (6 * u - 15) + 10), on = i >= 10 && i < 25;
    return { L: labelRows([
      { name: 'IVC', x: on || i >= 25 ? 300 : 40, y: 50, w: 40, h: 18, alpha: i < 10 ? 1 : on ? m : 1, ghost: false },
      { name: 'IVC', x: 40, y: 50, w: 40, h: 18, alpha: on ? 1 - m : 0, ghost: true },
    ]) as unknown as number[][] };
  });
  assert.equal(run[0]!.L!.length, 1, 'one row for the name');
  assert.equal(run[15]!.L![0]!.length, 7);
  assert.equal(run[15]!.L![0]![6], 1, 'flagged crossing while the old picture is drawn');
  assert.ok(run.every((s) => (s.L![0]![5] as number) >= 0.7), 'never seen as less than the two together');
  assert.equal(flash({ samples: run }).length, 0);
  assert.equal(labelSlide({ samples: run }).length, 0, 'moving by a cross-fade is what a label should do');
  // the same move with no crossing (the label taken at once) is a jump
  assert.equal(labelSlide({ samples: frames(30, (i) => ({ L: labelRows([{ name: 'IVC', x: i < 15 ? 40 : 300, y: 50, w: 40, h: 18, alpha: 1, ghost: false }]) as unknown as number[][] })) }).length, 1);
});
