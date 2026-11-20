// The Tests' HVPG measurement frames the tip with the deck's own close-up (cath-shot.ts tipCloseShot, read from the route), not a hand-set shot of its own that was two to three times wider
// (Mohammad, 20 Nov: "fix the camera zoom in HVPG measurement, should be better and zoomed in as we measure").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tipCloseShot } from '../src/ui/deck/cath-shot.ts';
import { SHOTS } from '../src/scene/camera/shots.ts';

test('the measurement\'s tip and fill steps (and a blocked vein) take the deck\'s close-up, which is far tighter than the old hvpg shot', () => {
  const src = readFileSync(new URL('../src/ui/tests/ir/run.ts', import.meta.url), 'utf8');
  assert.match(src, /import \{ tipCloseShot \} from '\.\.\/\.\.\/deck\/cath-shot\.ts'/);
  assert.match(src, /name === 'tip' \|\| name === 'fill' \? tipCloseShot\(R\.blocked \? 'ostium' : 'tip'\)/);
  const s = tipCloseShot('tip')!;
  assert.ok(s.half[0] < SHOTS.hvpg.half[0] / 2 && s.half[1] < SHOTS.hvpg.half[1] / 2, `${s.half} against ${SHOTS.hvpg.half}`);
});
