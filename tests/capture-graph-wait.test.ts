import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { settleLimitMs, GRAPH_WAIT_MS } from '../src/ui/capture/capture-model.ts';

// Capture 2b947e48, Gastric varices 7: a live procedure was shot with its run still going ("Left renal vein 1.0" untucked, "LRV 0.9" tucked a moment later).
test('the capture waits long for a procedure graph and normally for everything else', () => {
  assert.equal(settleLimitMs('the procedure graph is still drawing to its end', 12000), GRAPH_WAIT_MS);
  assert.equal(settleLimitMs('the procedure graph is still drawing to its end', 14000), GRAPH_WAIT_MS);
  assert.equal(settleLimitMs('the camera is moving', 12000), 12000);
  assert.equal(settleLimitMs('', 14000), 14000);
});
test('every shot, the tucked one too, waits through the same still wait', () => {
  const src = readFileSync('src/ui/debug/audit/capture-all.ts', 'utf8');
  assert.match(src, /const limitNow = \(\) => real\(settleLimitMs\(why, base\)\)/);
  assert.match(src, /setDocked\(true\);[^\n]*\n\s*await stillPage\(real, false, !!ui\.skip\);\n\s*(?:const ok2 = )?await shoot\(views\[1\]!\)/);
});
