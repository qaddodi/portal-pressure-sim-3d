// Integration review I4 (22 Nov): a runner that gives the camera back during a talk hands it to the slide (scene-link re-sends the slide's framing), not to free play's 'play' shot.
// scene-link keeps the shot it last sent, so a 'play' move behind its back stayed until the next slide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rel = readFileSync(new URL('../src/ui/tests/cam-release.ts', import.meta.url), 'utf8');
const link = readFileSync(new URL('../src/ui/deck/scene-link.ts', import.meta.url), 'utf8');

test('releaseCamera asks the talk first, and only then goes to free play', () => {
  const fn = rel.slice(rel.indexOf('export function releaseCamera'));
  assert.ok(fn.indexOf('reframeSlide()') > 0 && fn.indexOf('reframeSlide()') < fn.indexOf("goTo('play'"), 'the slide gets the camera back before free play is asked');
});
test('scene-link forgets its cached shot on a reframe and unhooks when the talk ends', () => {
  assert.match(link, /reframe = \(\) => \{ shot = null; sync\(\); \}/);
  assert.match(link, /return \(\) => \{ leaveSplit\(\); reframe = null;/);
});
