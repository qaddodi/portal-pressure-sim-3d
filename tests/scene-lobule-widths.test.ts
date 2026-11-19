// The lobule's vessel widths are the 2D app's (visual review, 19 Nov: the sinusoids were 1.5 to 1.9 times wider than 2D's, the cords of cells between them slivers). The numbers are read from the
// pinned 2D file's own text, so a change in 2D's radiusAt (or a copy that drifts) fails here; the shading's three tones and line are held in scene-lobule-shading.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pinned2D } from './two-d-pin.ts';
import { buildLobule, RS0, SIN_NARROW } from '../src/scene/lobule/geometry.ts';
import { AN_K, DISC_R, IN_R, LT_R, RS_N, TW_R, inletRadius, sinRadius, twigR } from '../src/scene/lobule/widths.ts';
import { flareAt, sinK } from '../src/scene/lobule/from2d/lobule-mouths.generated.js';
import { LobuleView } from '../src/scene/lobule/view.ts';
import { createShared } from '../src/scene/materials/cel.ts';
import { LOBULE_R } from '../src/scene/lobule/shots.ts';

const two = pinned2D('src/ui/lobule-zoom-field.js');
const skip = two.skip || false;
const field = () => readFileSync(`${two.repo}/src/ui/lobule-zoom-field.js`, 'utf8');
const zoom = () => readFileSync(`${two.repo}/src/ui/lobule-zoom.js`, 'utf8');

test('a healthy sinusoid is 2D\'s: rs0 = 0.0085 of the lobule radius, drawn at SIN_NARROW (0.75) of it, widening 1 to 1.3 toward the vein', () => {
  assert.equal(RS0, 0.0085);
  assert.equal(SIN_NARROW, 0.75);
  assert.equal(buildLobule().rs0, 0.0085);
  assert.ok(Math.abs(RS_N - 0.0085 * 0.75) < 1e-12);
  assert.ok(Math.abs(sinRadius('s0', 1) - RS_N) < 1e-4, 'portal end: the plain width');
  assert.ok(Math.abs(sinRadius('s1', 0.07) - RS_N * 1.3) < 1e-9, 'at the vein: 1.3 times');
  assert.ok(sinRadius('s2', 0.07) > sinRadius('s1', 0.07), 'a generation-2 sinusoid opens like a trumpet into the vein');
  assert.ok(Math.abs(sinRadius('an', 0.5) - RS_N * 0.68) < 1e-12);
  // and never the old 0.0095 R (1.5 times 2D's at the portal end)
  assert.ok(sinRadius('s0', 1) * LOBULE_R < 0.0095 * LOBULE_R * 0.7);
});

test('the view draws them: the first ring of the first sinusoid is 2D\'s radius there, not a fixed wider tube', () => {
  const v = new LobuleView(createShared());
  const pos = v.parts.s0.toonMesh.geometry.getAttribute('position');
  const c = v.net.courses.find((x) => x.kind === 's0')!;
  // ring 0 has radial + 1 = 8 vertices (the last repeats the first): the circle's radius is the distance of a vertex from the mean of the seven
  let mx = 0, my = 0, mz = 0;
  for (let j = 0; j < 7; j++) { mx += pos.getX(j) / 7; my += pos.getY(j) / 7; mz += pos.getZ(j) / 7; }
  const r = Math.hypot(pos.getX(0) - mx, pos.getY(0) - my, pos.getZ(0) - mz);
  assert.ok(Math.abs(r - sinRadius('s0', c.rho[0]!) * LOBULE_R) < 1e-6, `radius ${r} against 2D's ${sinRadius('s0', c.rho[0]!) * LOBULE_R}`);
  assert.ok(r < 0.0065 * LOBULE_R, 'about 0.0064 R at the portal end (it was 0.0095 R)');
});

test('the end-on vessels, inlets, twig and lymphatic are 2D\'s radii', () => {
  assert.deepEqual({ ...DISC_R }, { pv: 0.042, cv: 0.07, ha: 0.0115, bd: 0.0145, lv: 0.016 });
  assert.deepEqual([...IN_R], [0.015, 0.009]);
  assert.equal(LT_R, 0.0075);
  assert.equal(AN_K, 0.68);
  assert.deepEqual({ ...TW_R }, { base: 0.0026, leave: 0.62, join: 0.55 });
  assert.ok(Math.abs(inletRadius(0, 40, 0) - 0.015 * flareAt(-0.042, 0.015)) < 1e-12);
  assert.ok(inletRadius(39, 40, 0.5) < 0.0091, 'a long way out the inlet has tapered to 0.009');
  assert.ok(twigR(0, RS_N) > twigR(0.5, RS_N) && twigR(1, RS_N) > twigR(0.5, RS_N), 'the twig leaves wide, thins to its thread and opens into its sinusoid');
});

test('the numbers equal the pinned 2D file\'s text', { skip }, () => {
  const f = field(), z = zoom();
  assert.match(z, /const rs0 = clamp\(R \* 0\.0085, 1\.7, 3\)/);
  assert.match(f, /g\.rs0 \* SIN_NARROW \/ m\.sin \*\* 0\.12/);
  assert.match(f, /case 's0': case 's1': return rs \* sinK\(t\.rho\[i\]\)/);
  assert.match(f, /case 'an': return rs \* 0\.68/);
  assert.match(f, /case 'pv': return R \* 0\.042 \//);
  assert.match(f, /case 'cv': return R \* \(0\.07 \+ 0\.05 \* m\.congU\)/);
  assert.match(f, /case 'ha': return Math\.max\(1\.6, R \* 0\.0115 \*/);
  assert.match(f, /case 'bd': return Math\.max\(1\.6, R \* 0\.0145\)/);
  assert.match(f, /lerp\(R \* 0\.015, R \* 0\.009, i \/ \(N - 1\)\)/);
  assert.match(f, /case 'lt': return Math\.max\(1\.5, R \* 0\.0075 \*/);
  assert.match(f, /case 'lv': return R \* 0\.016 \*/);
  assert.match(f, /const b = Math\.max\(0\.8, R \* 0\.0026 \*/);
  assert.match(f, /0\.62 \* Math\.max\(1\.6, R \* 0\.0115/);
  assert.match(f, /0\.55 \* rs \* 1\.0/);
  assert.equal(sinK(1), 1); assert.ok(Math.abs(sinK(0.07) - 1.3) < 1e-9);
});
