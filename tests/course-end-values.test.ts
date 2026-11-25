import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courseFrame, endText } from '../src/ui/charts/curve/course-frame.ts';
import { COURSE_TOOL, courseSeriesSpecimen } from '../src/ui/charts/curve/specimens.ts';
import { ctxOf, judge } from './charts-helpers.ts';
import type { TextShape } from '../src/ui/charts/scene.ts';

// Landmark 12, capture 52ef8e63: the two lines ended in dots with no number. With the names in the key row each end prints its value, never outside the plot.
test('a course whose names are in the key row prints each line\'s end value', () => {
  const ser = courseSeriesSpecimen()!;
  for (const w of [330, 430, 520]) {
    const { frame, G } = courseFrame({ tool: COURSE_TOOL, ser }, ctxOf('dark', w));
    const words = frame.shapes.filter((s): s is TextShape => s.k === 'text').map((s) => s.s);
    if (!G.keyRow) continue;
    for (const q of ser.tails as { name: string; pts: number[][] }[]) assert.ok(words.includes(endText(q.pts.at(-1)![1]!, ser.unit as string)), `${w}: ${q.name} end value`);
    judge(frame, 'dark', { slack: 6, onCard: false });
  }
  assert.equal(endText(0.02, 'L'), '0 L');
  assert.equal(endText(6.84, 'L'), '6.8 L');
});

// Capture 52ef8e63: the "before" word (Tense ascites) sat on the first stroke of the line. It finds a clear place (n = 0) at every width.
test('the before word stands clear of the lines', () => {
  const ser = courseSeriesSpecimen()!;
  for (const w of [330, 430, 520, 700]) {
    const { labels } = courseFrame({ tool: COURSE_TOOL, ser }, ctxOf('dark', w));
    if (labels?.before) assert.equal(labels.before.n, 0, `${w}: before word lands on something`);
  }
});
