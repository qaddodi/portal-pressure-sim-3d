import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evRunFor, startEvRun, evRunPending, leaveEvRun } from '../src/ui/charts/evgraph/live.ts';
import { EVENT_S } from '../src/ui/charts/evgraph/model.ts';
import { pipeline } from './capture-source.ts';

// Capture 52ef8e63, Gastric varices 8: the picture was taken at +1 s with the PPG still on its way to 19.4 (the card's words say 19.4, the chart ended at 17.6). The head's hold lets go each time the head catches the newest
// reading, so the capture saw a still page between two readings. The run itself says whether it is over.
const spec = { lines: ['ppg', 'fvx'] } as never;
const frame = (t: number) => ({ t, metrics: { ascites: { volume: 0 }, varix: { d: 5 }, gastricVarix: { d: 8 }, spleen: { length: 12, platelets: 100 }, vitals: {} }, P: null, Q: null, D: null }) as never;
test('a procedure run is pending from its start until its last second, whatever the head is doing', () => {
  const tap: { fn: ((f: never) => void) | null } = { fn: null };
  const src = { now: () => frame(100), on: (fn: (f: never) => void) => { tap.fn = fn; return () => { tap.fn = null; }; }, run: () => {} };
  evRunFor('k', spec);
  assert.equal(evRunPending(), false, 'before the change there is nothing to wait for');
  startEvRun('k', spec, null, null, src);
  assert.equal(evRunPending(), true, 'started, no reading yet');
  for (const t of [0.2, 5, 12]) { tap.fn?.(frame(100 + t)); assert.equal(evRunPending(), true, `at +${t} s`); }
  tap.fn?.(frame(100 + EVENT_S + 0.1));
  assert.equal(evRunPending(), false, 'the graph\'s seconds have run');
  leaveEvRun('k');
});
test('the capture counts a pending run as the graph still drawing', () => {
  const src = pipeline();
  assert.match(src, /holds\.includes\('chart:evgraph'\) \|\| evRunPending\(\)\) return 'the procedure graph/);
});
