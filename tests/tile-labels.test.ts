import test from 'node:test';
import assert from 'node:assert/strict';
import { fitLabels } from '../src/ui/cards/tile-labels.ts';

const box = (left: number, w = 14) => ({ left, right: left + w, width: w });
test('two scale numbers too close drop only the later one, the rest stay (Stiffness 4: the LSM gauge showed none)', () => {
  const f = fitLabels({ left: 0, right: 350 }, [box(100), box(110), box(300)]);
  assert.deepEqual(f.map((x) => x.off), [false, true, false]);
});
test('numbers with room all stay, and an end number leans in', () => {
  const f = fitLabels({ left: 10, right: 100 }, [box(5), box(50), box(95)]);
  assert.deepEqual(f.map((x) => [x.lean, x.off]), [['lo', false], [null, false], ['hi', false]]);
});
