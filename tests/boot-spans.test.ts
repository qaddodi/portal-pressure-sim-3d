import assert from 'node:assert/strict';
import { test } from 'node:test';
import { span, spanAsync, firstDraw, spans, resetSpans } from '../src/boot/spans.ts';
import { perfReport } from '../src/ui/perf/report.ts';

test('spans record sync and async work, and a view\'s first draw once', async () => {
  resetSpans();
  assert.equal(span('a', () => 3), 3);
  await spanAsync('b', async () => 4);
  firstDraw('body', () => 1); firstDraw('body', () => 1); firstDraw('lobule', () => 1);
  assert.deepEqual(spans().map((s) => s.name), ['a', 'b', 'first-draw:body', 'first-draw:lobule']);
  await assert.rejects(spanAsync('c', async () => { throw new Error('x'); }));
  assert.equal(spans().at(-1)!.name, 'c', 'a failing span is still recorded');
  const txt = perfReport({ framesDrawn: 1, windowFrames: 1, p50: 1, p95: 1, max: 1, slow: [], awake: true, holds: [] }, { ua: 'u', dpr: 1, size: '1x1', look: 'light', hash: 'h', spans: spans() });
  assert.match(txt, /startup spans[\s\S]*first-draw:body/);
});
