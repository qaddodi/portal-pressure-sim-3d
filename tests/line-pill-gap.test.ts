import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLine, gluePieces } from '../src/ui/text/line.ts';

// Encephalopathy 10.2 (capture 572259fd): "lowers the PPG to 9.0 mmHg, <12 mmHg, the variceal reference" wrapped before "<12 mmHg" and the next line began with a blank: the lone space between the two pills had been
// made a non-breaking space (so a pill never starts a line), which the wrap then drew at the start of the line.
const textBetween = (line: string) => {
  const g = gluePieces(parseLine(line));
  const i = g.findIndex((x) => x.p.t === 'cutoff');
  const prev = g[i - 1]!.p;
  return prev.t === 'text' ? prev.text : null;
};
test('the space between two pills stays a plain space (it can end a line and vanish)', () => {
  assert.equal(textBetween('to {ppg}, {<12 mmHg}, the reference'), ' ');
});
test('a space after words and before a pill is still held (a pill never starts a line)', () => {
  assert.equal(textBetween('the PPG falls below {<12 mmHg}.'), 'the PPG falls below ');
});
