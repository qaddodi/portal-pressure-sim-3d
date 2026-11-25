// The embolized spleen's dead lower part is bounded by the plate's stroke and the organ's own outline, never by a straight upright cut inside the organ (capture f23a4c59, Gastric varices 11, Embolized: a dark
// rectangle with a flat top and an upright left side on the spleen's right third). The stroke is 2D's, drawn across 2D's spleen (x 990 to 1120); the approved placement's spleen stands at 2D x 934 to 1018, so the stroke
// must be stretched across the spleen that stands (vertex-paint.ts infarctX). Runs on the real spleen of public/anatomy/organs.bin.
(globalThis as { location?: unknown }).location = { search: '', pathname: '/', hostname: 'localhost' };
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ORGAN_MESHES, setOrganData, organsReady } from '../src/scene/organs/meshes.ts';
import { x2d, y2d } from '../src/scene/frame2d.ts';
import { infarctAt, infarctX } from '../src/scene/organs/vertex-paint.ts';

test('the dead part of the spleen reaches the organ\'s left side as it does its right; no upright cut inside the organ; about half to two thirds of it', async () => {
  const b = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
  setOrganData(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); await organsReady;
  const p = ORGAN_MESHES.spleen!().getAttribute('position');
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < p.count; i++) { xs.push(x2d(p.getX(i))); ys.push(y2d(p.getY(i))); }
  const x0 = Math.min(...xs), x1 = Math.max(...xs), top = Math.min(...ys), foot = Math.max(...ys);
  const dead = (i: number) => infarctAt(infarctX(x0, x1, xs[i]!), ys[i]!).dead;
  // the low part of the organ (the last quarter of its height): every vertex is dead, left to right
  const low = xs.map((_, i) => i).filter((i) => ys[i]! > foot - 0.25 * (foot - top));
  assert.ok(low.length > 100);
  assert.ok(low.every((i) => dead(i) > 0.99), 'the foot of the spleen is dead from its left outline to its right');
  // the first fifth of the width, just under the stroke, is dead too (the upright cut stood at a third of the width)
  const left = xs.map((_, i) => i).filter((i) => xs[i]! < x0 + 0.2 * (x1 - x0) && ys[i]! > 395);
  assert.ok(left.length > 20 && left.every((i) => dead(i) > 0.99), 'the left fifth under the stroke is dead');
  // the upper part (above every height the stroke has) is alive
  const upper = xs.map((_, i) => i).filter((i) => ys[i]! < 322);
  assert.ok(upper.every((i) => dead(i) === 0), 'above the stroke the spleen is alive');
  const share = xs.filter((_, i) => dead(i) > 0.5).length / xs.length;
  assert.ok(share > 0.4 && share < 0.75, `the dead share ${share.toFixed(2)}`);
});
