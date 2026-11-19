// The copied 2D modules answer exactly what the 2D app's own do (tests/fixtures/b4-2d.json, written by scripts/copy-b4-data.mjs from the 2D source).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { liverField, liverShrink, liverSurface } from '../src/scene/disease/copied/liver-morph.js';
import { fluidLevel, fluidTarget, poolFade } from '../src/scene/disease/copied/fluid-step.js';
import { easeTo, fluidSpring } from '../src/scene/disease/copied/organ-ease.js';
import { clotRadius, clotSide, clotSpan, hashSeed } from '../src/scene/disease/copied/clot-shape.js';
import { cavGrow, cavOffset } from '../src/scene/disease/copied/cavernoma-strand.js';
import { varixSize } from '../src/scene/disease/copied/varix-look.js';
import { varixBead } from '../src/scene/disease/copied/varix-bead.js';
import { CAV_CHANNELS, LENS_GREY } from '../src/scene/disease/copied/anatomy-b4.ts';

const fx = JSON.parse(readFileSync(new URL('./fixtures/b4-2d.json', import.meta.url), 'utf8'));
const near = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`);

test('the liver: shrink, surface and the displacement field are the 2D figure\'s', () => {
  for (const [c, g, v] of fx.liverShrink) near(liverShrink(c, g), v, `liverShrink(${c}, ${g})`);
  for (const [c, gloss, nod] of fx.liverSurface) { const s = liverSurface(c); near(s.gloss, gloss, `gloss ${c}`); near(s.nod, nod, `nod ${c}`); }
  for (const [x, y, c, ox, oy] of fx.liverField) { const p = liverField(x, y, c); near(p[0]!, ox, `field x ${x},${y},${c}`); near(p[1]!, oy, `field y ${x},${y},${c}`); }
});

test('the ascites pool: level, ripple, floor, fade and the step the drawn volume moves in', () => {
  for (const [v, h, amp, floor, fade] of fx.fluidLevel) { const l = fluidLevel(v); near(l.h, h, `h ${v}`); near(l.amp, amp, `amp ${v}`); near(l.floor, floor, `floor ${v}`); near(poolFade(v), fade, `fade ${v}`); }
  for (const [d, v, want] of fx.fluidTarget) assert.equal(fluidTarget(d, v), want);
  assert.equal(fluidLevel(100).h > 0, true);
  assert.equal(poolFade(150), 0, 'no pool while the belly reads None');
});

test('the eases: exponential 0.4 s and the critically damped spring', () => {
  for (const [v, t, dt, want] of fx.easeTo) near(easeTo(v, t, dt), want, 'easeTo');
  for (const [s, vel, t, dt, shown, v2] of fx.fluidSpring) { const r = fluidSpring(s, vel, t, dt); near(r.shown, shown, 'spring shown'); near(r.vel, v2, 'spring vel'); }
});

test('clots: radius, span and the wall they lie on, per vein', () => {
  for (const [id, v, f, want] of fx.clotRadius) near(clotRadius(v, 12, f, hashSeed(id)), want, `clotRadius ${id} ${v} ${f}`);
  for (const [v, u0, u1] of fx.clotSpan) { const s = clotSpan(v); near(s.u0, u0, 'u0'); near(s.u1, u1, 'u1'); }
  for (const [id, side] of fx.clotSide) assert.equal(clotSide(hashSeed(id)), side, id);
});

test('the cavernoma grows in channel by channel, and each channel winds as the 2D figure draws it', () => {
  for (const [r, want] of fx.cavGrow) near(cavGrow(r, 0.22), want, `cavGrow ${r}`);
  for (const [i, row] of fx.cavOffset) [30, 50, 80, 100, 130].forEach((u, k) => near(cavOffset(CAV_CHANNELS.C8![i]!, u, 150), row[k], `cavOffset ${i} ${u}`));
});

test('the varices: size and bead follow the model\'s diameter', () => {
  for (const [site, d, want] of fx.varixSize) near(varixSize(site, d ?? NaN), want, `varixSize ${site} ${d}`);
  for (const [d, want] of fx.varixBead) near(varixBead(d), want, `varixBead ${d}`);
  assert.deepEqual(LENS_GREY, fx.grey);
});
