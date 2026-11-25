// The Anatomy to Lobule dive (Mohammad, 20 Nov 2026): inside the liver, hex lobules tile the whole screen from afar; the blurred neighbours resolve; then the lobule in focus fades in until the
// landing, and the reverse on the way out. The field's breadth is a function of the camera's distance against the lobule's framing, so the way in and out are one picture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIELD_HALF, LOBULE_FIELD_FS, fieldWide } from '../src/scene/lobule/field.ts';
import { DIVE_OUT } from '../src/scene/scene.ts';
import { LOBULE_SCALE } from '../src/scene/lobule/frames.ts';
import { LOBULE_R } from '../src/scene/lobule/shots.ts';
import { sceneSource } from './helpers/scene-source.ts';

test('the field reaches every edge from afar and narrows onto the lobule as the camera lands, monotonically, the same both ways', () => {
  const rest = 0.01;
  assert.equal(fieldWide(rest, rest), 0, 'at the lobule\'s framing: 2D\'s own fade into the page');
  assert.equal(fieldWide(rest * 0.5, rest), 0, 'zoomed in: the same');
  assert.equal(fieldWide(rest * 10, rest), 1, 'from afar: lobules to every edge');
  assert.equal(fieldWide(Infinity, rest), 0, 'outside a dive: nothing');
  let prev = -1;
  for (let k = 1; k <= 4; k += 0.05) { const w = fieldWide(rest * k, rest); assert.ok(w >= prev - 1e-12, 'never jumps back'); prev = w; }
  assert.ok(fieldWide(rest * 1.2, rest) < 0.05 && fieldWide(rest * 1.2, rest) > 0, 'eases in, no step at the start');
});

test('the field is big enough to cover the screen from where the body begins to dissolve, and covers it whole (no fade, no small-lobule cut) while wide', () => {
  // the visible half height at DIVE_OUT (a 45 degree lens at most): the field's half side must reach past it, with the widest screen's aspect
  const halfH = DIVE_OUT * Math.tan((45 / 2) * Math.PI / 180), worldHalf = FIELD_HALF * LOBULE_R * LOBULE_SCALE;
  assert.ok(worldHalf > halfH * 2.2, `field ${worldHalf.toFixed(3)} against the screen's ${(halfH * 2.2).toFixed(3)}`);
  assert.match(LOBULE_FIELD_FS, /float a = mix\(\(1\.0 - fadeAt\(d, r0, r1\)\) \* smoothstep\(0\.05, 0\.25, rd\), 1\.0, wide\) \* ready;/);
});

test('the scene drives the field\'s breadth from the camera\'s distance, and the 3D lobule\'s detail comes in as the field narrows onto it', () => {
  const scene = sceneSource();
  assert.match(scene, /this\.lobule\.field\.setWide\(fieldWide\(d, this\.lobuleRest\(\)\)\)/);
  const l3 = readFileSync(new URL('../src/scene/micro3d/lobule3d.ts', import.meta.url), 'utf8');
  assert.match(l3, /const come = lobuleStays\(f\.field\.wideNow, body\);/);
});
