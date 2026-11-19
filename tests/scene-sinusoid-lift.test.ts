// The sinusoid view is 2D's own: its fragment shader, its albumin traffic and its palette, copied by scripts/copy-sinusoid.mjs and run on a plane in the scene (atlas look plan WP7).
// These tests hold what node can hold (no GPU here): the copy is current, the shader text is whole and takes every uniform the view writes, the state reaches the uniforms, the
// tissue comes in over the lobule by the camera's distance and is whole to every edge once landed, and the lobule is hidden when it has landed (the cut was drawn over a zoomed lobule).
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { Vector2, Vector3, Vector4 } from 'three';
import { createShared } from '../src/scene/materials/cel.ts';
import { SinusoidView, diveShare, PLANE_HALF, U } from '../src/scene/sinusoid/view.ts';
import { SINUSOID_FS, SINUSOID_PFS, SINUSOID_PVS, SINUSOID_UNIFORMS, SINUSOID_VS } from '../src/scene/sinusoid/gl.copied.ts';
import { UM } from '../src/scene/sinusoid/layout.ts';
import { LOOK_IDS } from '../src/looks/looks.ts';
import { LOBULE_SCALE, SIN_SCALE } from '../src/scene/lobule/frames.ts';
import { SINUSOID_L, sinusoidShot } from '../src/scene/lobule/shots.ts';
import { CelScene } from '../src/scene/scene.ts';
import type { SinusoidTargets } from '../src/scene/lobule/model.ts';

const TWO_D = process.env.PPS_2D_REPO ?? '/home/claude/portal-pressure-simulator';
const targets = (o: Partial<SinusoidTargets> = {}): SinusoidTargets => ({ por: 1, col: 0, bm: 0, mv: 1, act: 0, lum: 1, pinch: 0, v: 1, filt: 1, prot: 1, ...o });
const val = (v: SinusoidView, name: string) => (v.tissue.material as unknown as { uniforms: Record<string, { value: unknown }> }).uniforms[name]!.value;
const num = (v: SinusoidView, name: string) => val(v, name) as number;
const run = (v: SinusoidView, from = 0, ms = 1500) => { for (let t = from; t <= from + ms; t += 16) v.update(t); return from + ms; };

test('the copy is current: scripts/copy-sinusoid.mjs --check against the 2D checkout (skipped without one)', { skip: !existsSync(`${TWO_D}/src/ui/sinusoid-gl.js`) && 'no 2D checkout (set PPS_2D_REPO)' }, () => {
  assert.doesNotThrow(() => execFileSync('node', ['scripts/copy-sinusoid.mjs', '--from', TWO_D, '--check'], { stdio: 'pipe' }));
});

test('the shader text is 2D\'s, whole: tissue, cells, the sprites, with no screen-pixel leftovers and the 3D\'s own vertex stage', () => {
  for (const s of [SINUSOID_VS, SINUSOID_FS, SINUSOID_PVS, SINUSOID_PFS]) assert.ok(s.startsWith('#version 300 es\n'));
  assert.match(SINUSOID_FS, /float x = vUm\.x, y = vUm\.y, a = abs\(y\);/);
  assert.match(SINUSOID_FS, /dFdx\(vUm\.x\)/, 'a device pixel\'s size in micrometres comes from the screen derivatives');
  for (const s of [SINUSOID_FS, SINUSOID_PVS]) { assert.doesNotMatch(s, /\buI0\b|\buI1\b|\buF0\b|\bvP\b/); assert.match(s, /float uPx = 1\.0;/); }
  for (const part of ['vec3 lumen(', 'vec3 disse(', 'vec3 plate(', 'vec4 hsc(', 'vec4 kupffer(', 'float sdEndo(', 'uPass == 1']) assert.ok(SINUSOID_FS.includes(part), part);
  assert.match(SINUSOID_VS, /vUm = vec2\(position\.x, -position\.y\) \/ uU/, 'the plane\'s y runs up, the shader\'s down (its upper Disse is y < 0)');
  assert.ok(SINUSOID_PFS.includes('cAlb'));
});

test('every uniform the view writes is one the shaders take, and every one the shaders take has a value', () => {
  const v = new SinusoidView(createShared());
  v.setVisible(true); v.snapTargets(targets()); run(v);
  const have = (v.tissue.material as unknown as { uniforms: Record<string, { value: unknown }> }).uniforms;
  for (const [name, type] of Object.entries(SINUSOID_UNIFORMS)) {
    assert.ok(name in have, `${name} has a slot`);
    const x = have[name]!.value;
    if (type === 'float' || type === 'int') assert.ok(Number.isFinite(x as number), `${name} is a finite number`);
    else assert.ok(x instanceof (type === 'vec2' ? Vector2 : type === 'vec3' ? Vector3 : Vector4), `${name} is a ${type}`);
  }
  // the colours were filled from the tokens, in every look: none left black (a token that did not resolve), except the page and the nucleus in the dark looks, which are deep by design
  for (const look of LOOK_IDS) {
    const w = new SinusoidView(createShared(), { look });
    w.setVisible(true); w.snapTargets(targets()); w.update(0);
    for (const [c, t] of Object.entries(SINUSOID_UNIFORMS)) if (t === 'vec3' && c.startsWith('c')) assert.ok((val(w, c) as Vector3).length() > 0.02 || (look !== 'light' && look !== 'soft' && ['cNuc', 'cBg', 'cShade', 'cUnder', 'cEndE'].includes(c)), `${look}: ${c} is set`);
  }
});

test('every look has its own colours from the 2D theme tokens (the page, the hepatocytes, the lumen by pressure)', () => {
  const seen = new Set<string>();
  for (const look of LOOK_IDS) {
    const v = new SinusoidView(createShared(), { look });
    v.setVisible(true); v.snapTargets(targets()); run(v, 0, 64);
    const bg = val(v, 'cBg') as Vector3, cell = val(v, 'cCell') as Vector3;
    assert.ok(Number.isFinite(bg.x + bg.y + bg.z + cell.x + cell.y + cell.z));
    seen.add(`${bg.x.toFixed(2)},${bg.y.toFixed(2)},${bg.z.toFixed(2)}`);
    assert.equal(num(v, 'uDark'), look === 'light' || look === 'soft' ? 0 : 1, `${look}: the dark flag`);
  }
  assert.ok(seen.size >= 4, 'the looks differ');
  const v = new SinusoidView(createShared());
  v.setVisible(true); v.snapTargets(targets()); run(v, 0, 64);
  const low = (val(v, 'cLumen') as Vector3).clone();
  v.applyLook('light');
  v.setInk({ lens: 'pressure', look: 'light', model: { P1: 12, P2: 22, P3: 3, P4: 2, lyProt: 0.8 } as never, ref: null, fibSin: 0 });
  run(v, 100, 64);
  assert.ok((val(v, 'cLumen') as Vector3).distanceTo(low) > 0.1, 'the lumen\'s colour follows the sinusoid pressure');
});

test('the model\'s state reaches the shader and eases: sealed pores, collagen, the stellate cell, the squeeze, the lumen\'s width', () => {
  const v = new SinusoidView(createShared());
  v.setVisible(true); v.snapTargets(targets()); run(v);
  assert.equal(num(v, 'uPor'), 1); assert.equal(num(v, 'uCol'), 0); assert.equal(num(v, 'uLum'), UM.lum);
  v.setTargets(targets({ por: 0.1, col: 0.9, bm: 0.9, act: 0.9, pinch: 0.2, lum: 0.78, filt: 4, v: -1 }));
  v.update(2000); v.update(2016);
  assert.ok(num(v, 'uPor') < 1 && num(v, 'uPor') > 0.1, 'it eases, it does not jump');
  run(v, 2032, 5000);
  assert.ok(Math.abs(num(v, 'uPor') - 0.1) < 0.01 && Math.abs(num(v, 'uCol') - 0.9) < 0.01 && Math.abs(num(v, 'uAct') - 0.9) < 0.01);
  assert.ok(Math.abs(num(v, 'uLum') - UM.lum * 0.78) < 0.05 && Math.abs(num(v, 'uPinch') - 0.2) < 0.01);
  assert.equal(num(v, 'uDir'), -1, 'reversed flow runs the streaks the other way');
  assert.ok(num(v, 'uLyF') > 1, 'filtration crowds the lymph');
});

test('the blood runs and the albumin rides in it: the streaks\' clock and the sprites move, and a hidden view asks for nothing', () => {
  const v = new SinusoidView(createShared());
  assert.equal(v.update(0), false, 'hidden: no frames');
  v.setVisible(true); v.snapTargets(targets());
  v.update(0); const f0 = num(v, 'uFlow');
  assert.equal(v.update(16), true, 'frames keep coming while the blood runs');
  run(v, 32, 3000);
  assert.ok(num(v, 'uFlow') > f0 + 10, 'the streaks advance (µm of flow)');
  const n = v.sprites.geometry.drawRange.count;
  assert.ok(n > 20 && n <= 1400, `albumin is drawn (${n})`);
  const ak = v.sprites.geometry.getAttribute('aAK');
  for (let i = 0; i < n; i++) assert.ok(ak.getX(i) > 0 && ak.getX(i) <= 1, 'alpha in (0, 1]');
  // reduced motion: the picture holds still
  const r = new SinusoidView(createShared(), { reduceMotion: true });
  r.setVisible(true); r.snapTargets(targets()); r.update(0); r.update(16);
  const f = num(r, 'uFlow'); r.update(500);
  assert.equal(num(r, 'uFlow'), f);
  assert.equal(r.update(1000), false);
});

test('closed pores turn the albumin back at the wall instead of letting it cross', () => {
  const open = new SinusoidView(createShared()), shut = new SinusoidView(createShared());
  open.setVisible(true); open.snapTargets(targets({ filt: 3 })); shut.setVisible(true); shut.snapTargets(targets({ por: 0, filt: 3 }));
  run(open, 0, 6000); run(shut, 0, 6000);
  const kinds = (v: SinusoidView) => { const a = v.sprites.geometry.getAttribute('aAK'), n = v.sprites.geometry.drawRange.count; let glow = 0; for (let i = 0; i < n; i++) if (a.getY(i) === 2) glow++; return glow; };
  assert.ok(kinds(shut) >= kinds(open), 'a sealed wall shows the flash where albumin meets it');
});

test('the dive: nothing before the lobule\'s own station, the tissue comes in over it by distance, whole once landed; at rest it is whole to every edge', () => {
  const far = 2.5 * LOBULE_SCALE, near = 3 * SIN_SCALE;
  assert.equal(diveShare(far * 2, far, near), 0); assert.equal(diveShare(far, far, near), 0);
  assert.equal(diveShare(near, far, near), 1); assert.equal(diveShare(near / 2, far, near), 1);
  const mid = diveShare(Math.sqrt(far * near), far, near);
  assert.ok(Math.abs(mid - 0.5) < 1e-9, 'geometric, as the camera blends it');
  const v = new SinusoidView(createShared());
  v.setVisible(true); v.snapTargets(targets());
  v.setDive(0.2); v.update(0);
  assert.equal(num(v, 'uAll'), 0, 'not yet');
  v.setDive(0.7); v.update(16);
  assert.ok(num(v, 'uAll') > 0 && num(v, 'uAll') < 1 && num(v, 'uFocus') === 0 && (val(v, 'uDet') as Vector2).x < 1, 'the tissue first, its detail last');
  v.setDive(null); v.update(32);
  assert.equal(num(v, 'uAll'), 1); assert.equal(num(v, 'uFocus'), 1);
  assert.equal((val(v, 'uRev') as Vector4).x, 1); assert.equal((val(v, 'uDet') as Vector2).x, 1);
});

test('the plane reaches far past any frame the camera can hold, and the shot is face on', () => {
  const s = sinusoidShot();
  assert.equal(s.yaw, 0); assert.equal(s.pitch, 0);
  assert.ok(PLANE_HALF > 6 * Math.max(s.half[0] / SIN_SCALE, s.half[1] / SIN_SCALE), 'six frames wide each way');
  assert.ok(Math.abs(U * 97.4 - SINUSOID_L) < 1e-9, 'local units per micrometre');
});

test('names stand on the right places: portal end left, the upper Disse above the lumen, the Kupffer cell on the lower lining', () => {
  const v = new SinusoidView(createShared());
  v.snapTargets(targets());
  const a = (n: string) => v.anchor(n);
  assert.ok(a('in')[0] < a('out')[0] && a('in')[1] === 0);
  assert.ok(a('disse')[1] > a('lumen')[1] && a('hsc')[1] > a('lumen')[1], 'the upper Disse and the stellate cell above the axis');
  assert.ok(a('hep')[1] > a('disse')[1], 'the plate beyond Disse');
  assert.ok(a('kup')[1] < a('lumen')[1] + 1e-9 || a('kup')[1] < 0.5 * UM.lum * U, 'the Kupffer cell low in the lumen');
  assert.ok(a('fen')[1] > 0, 'the fenestrae of the upper lining');
});

test('the cut was drawn over a zoomed lobule: once the camera has landed on the sinusoid the lobule is hidden and the tissue is whole to every edge; flying, the lobule stays under the coming tissue', () => {
  const s = new CelScene();
  s.resize(900, 700);
  s.rig.goTo(sinusoidShot(), { x: 0, y: 0, w: 900, h: 700 }, 0, 0);
  s.setView('sinusoid', 0);
  assert.equal(s.sinus.isVisible, true);
  s.update(0); s.update(16); s.update(32);
  assert.equal(s.lobule.isVisible, false, 'the lobule is hidden once landed');
  assert.equal(s.sinus.diveShareNow, null, 'at rest the tissue is whole, no fade');
  // a view change back to the lobule: both are drawn while the camera flies, the tissue going out by distance
  s.rig.goTo(SinusoidOut, { x: 0, y: 0, w: 900, h: 700 }, 100, 1000);
  s.setView('lobule', 100);
  s.update(200); s.update(216);
  assert.equal(s.lobule.isVisible, true); assert.equal(s.sinus.isVisible, true);
  const g = s.sinus.diveShareNow;
  assert.ok(g != null && g > 0 && g < 1, `flying: the tissue is part way (${g})`);
  s.dispose();
});
const SinusoidOut = { yaw: 0, pitch: 0, r: 2.5 * LOBULE_SCALE, target: sinusoidShot().target, half: [3 * LOBULE_SCALE, 2 * LOBULE_SCALE] as [number, number] };
