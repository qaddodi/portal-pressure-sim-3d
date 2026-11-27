// The pressure monitor's axis numbers (owner W19, 27 Nov: "centre the tick labels on the 2D monitor"; review F-D5: 20.3 read as about 17 because each number stood above its line, between two lines).
// One monitor draws every measurement (HVPG, EUS-PPG, PPG, TIPS), so the rule is held where it is drawn: each axis number is centred on its gridline (middle baseline, the line's own y) and the line
// begins after the number, never through it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hvpgFrame } from '../src/ui/tests/ir/hvpg.ts';
import { T, newWave } from '../src/ui/tests/copied/hvpg-clock.copied.js';
import type { RectShape, TextShape } from '../src/ui/charts/scene.ts';

const AXIS = /^(0|5|10|15|20|25|30|35|40)$/;
test('every axis number stands on its own gridline, centred, and the line starts after it', () => {
  let ticks = 0;
  for (const v of [{ fhvp: 5.2, whvp: 16.3, hvpg: 11.1 }, { fhvp: 4, whvp: 9, hvpg: 5 }, { fhvp: 6.6, whvp: 29, hvpg: 22.4 }]) {
    for (const [w, h] of [[320, 200], [420, 230], [640, 300]] as const) {
      for (const t of [T.sum, T.sum + 3000]) {
        const f = hvpgFrame({}, { ph: 'run', t, v, blocked: false, running: false, wave: newWave() }, w, h, 'x');
        const nums = f.shapes.filter((s): s is TextShape => s.k === 'text' && AXIS.test(s.s) && s.anchor !== 'middle' && s.anchor !== 'end' && s.x < 20);
        const lines = f.shapes.filter((s): s is RectShape => s.k === 'rect' && s.h === 1 && s.w > 40);
        assert.ok(nums.length >= 2, `${w}x${h}: ${nums.length} axis numbers found`);
        for (const n of nums) {
          ticks++;
          assert.equal(n.baseline, 'middle', `${n.s}: centred on its line, not above it`);
          const own = lines.filter((l) => Math.abs(l.y + 0.5 - n.y) <= 1);
          assert.ok(own.length === 1, `${w}x${h} "${n.s}": ${own.length} gridlines at its height`);
          assert.ok(own[0]!.x > n.x, `${w}x${h} "${n.s}": its line begins after the number (${own[0]!.x} vs ${n.x})`);
        }
      }
    }
  }
  assert.ok(ticks > 40, `${ticks} axis numbers judged`);
});
