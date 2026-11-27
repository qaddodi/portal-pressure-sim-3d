// The flow marks are off while a procedure is on the figure (Mohammad, 20 Nov: "chevrons off while we measure, in fact off while we do procedures"): one gate, for every procedure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markGoal } from '../src/scene/blood/marks.ts';

test('a quiet figure carries no chevrons, whatever the Blood menu says', () => {
  for (const o of [{ chevrons: true, keyChevrons: false, presenting: false }, { chevrons: true, keyChevrons: true, presenting: true }]) {
    assert.equal(markGoal({ ...o, quiet: false }, true, true), 1);
    assert.equal(markGoal({ ...o, quiet: true }, true, true), 0);
  }
});
