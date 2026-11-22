// Plan 27b, judged in node: the real controller on Healthy with the portal vein picked, the readings ticking and the orbit dragged as a hand does it.
// While the picture turns a label keeps its spot unless that spot became illegal; a crossing never shows two equal copies; no spot goes A, B, A within a crossing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replay, HANDS, SCREENS } from './helpers-label-replay.ts';

for (const screen of Object.keys(SCREENS) as (keyof typeof SCREENS)[]) for (const [name, h] of Object.entries(HANDS)) {
  test(`${screen} / ${name}: no flip-back, no two strong copies, and a label moves while turning only when its spot became illegal`, () => {
    const r = replay(screen, h.hand, h.ms);
    assert.deepEqual(r.flipBacks, []);
    assert.deepEqual([...r.bothFrames], []);
    for (const c of r.crossings) if (c.moving && !c.words) assert.ok(c.why, `${c.id} moved ${c.from} -> ${c.to} while the picture turned although its spot was still legal`);
  });
}
