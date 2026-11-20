import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Mohammad, 20 Nov: "slide 10/11 circulation instrument card takes forever to load then flickers". The body re-rendered on every engine frame and handed the curve a state object made fresh each
// time, so its goal and its chart were worked out and drawn again on every frame; and the curve's sweep (the model run through every point) was only started when the slide opened.
const body = readFileSync(new URL('../src/ui/talk/ToolCardBody.tsx', import.meta.url), 'utf8');
const curve = readFileSync(new URL('../src/ui/charts/curve/CurveCard.tsx', import.meta.url), 'utf8');

test('the body follows the engine\'s frames only for the charts of the live model, and hands a chart one state object while the state is the same', () => {
  assert.match(body, /useEngine\(\(s\) => \(FRAMED\.has\(kind\) \? s\.frames : 0\)\)/);
  assert.match(body, /const FRAMED = new Set\(\['fluid', 'stent', 'flows'\]\)/);
  assert.match(body, /const slideState = useMemo\(/);
  assert.doesNotMatch(body, /slide=\{fp \? \{ fp: fp as never/, 'no state object is made inside the render');
});

test('the next slides\' curves and courses are worked out ahead, under the same key the card asks with', () => {
  assert.match(body, /warmCurve\(tl as never/);
  assert.match(curve, /export function warmCurve/);
  assert.match(curve, /kept\(curveKey\(t, id\), \(\) => curveWork\(t, slide, engineRun\(slide\), fpOf\)\)/);
  assert.match(curve, /kept\(key, \(\) => curveWork\(t, slide, run \?\? engineRun\(slide\), fpOf\)\)/, 'the card asks with the same key and the same work');
});
