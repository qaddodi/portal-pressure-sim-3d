// The sinusoid's lumen is 2D's: pressure colour, a light line and a dark line at the walls, lanes of streaks at the blood's speed, a slow sheen (sinusoid-gl.js lumen(); the constants
// are sinusoid-view.js palette(): uShim .5 / uStreak .85 on a light look, .3 / .3 on a dark one, uDark 0 / 1). Node holds what it can: every look gets those uniforms, the flow position
// advances with time at 24 µm/s times the flow, and the shader's lumen still carries every ingredient of that look.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createShared } from '../src/scene/materials/cel.ts';
import { SinusoidView } from '../src/scene/sinusoid/view.ts';
import { SINUSOID_FS } from '../src/scene/sinusoid/gl.copied.ts';
import { LOOKS, LOOK_IDS } from '../src/looks/looks.ts';

const uni = (v: SinusoidView) => (v.tissue.material as unknown as { uniforms: Record<string, { value: unknown }> }).uniforms;
const num = (v: SinusoidView, k: string) => uni(v)[k]!.value as number;
const rgb = (v: SinusoidView, k: string) => (uni(v)[k]!.value as { toArray(): number[] }).toArray();
const run = (v: SinusoidView, from: number, ms: number) => { for (let t = from; t <= from + ms; t += 16) v.update(t); return from + ms; };

test('every look writes 2D\'s shimmer, streak and dark constants, and a lumen that is not the page', () => {
  for (const look of LOOK_IDS) {
    const v = new SinusoidView(createShared(), { look }); v.setVisible(true); run(v, 0, 400);
    const dark = LOOKS[look].scheme === 'dark';
    assert.equal(num(v, 'uShim'), dark ? 0.3 : 0.5, `${look} uShim`);
    assert.equal(num(v, 'uStreak'), dark ? 0.3 : 0.85, `${look} uStreak`);
    assert.equal(num(v, 'uDark'), dark ? 1 : 0, `${look} uDark`);
    const l = rgb(v, 'cLumen'), bg = rgb(v, 'cBg');
    assert.ok(Math.hypot(l[0]! - bg[0]!, l[1]! - bg[1]!, l[2]! - bg[2]!) > 0.1, `${look}: the lumen reads against the page`);
  }
});

test('the blood runs: the streaks\' position advances 24 µm/s times the flow, whatever the look, and stands still only with Reduce Motion', () => {
  for (const look of LOOK_IDS) {
    const v = new SinusoidView(createShared(), { look }); v.setVisible(true);
    const t = run(v, 0, 200), f0 = num(v, 'uFlow'); run(v, t, 1000);
    assert.ok(num(v, 'uFlow') - f0 > 18, `${look}: moves about 24 µm in a second at flow 1 (${num(v, 'uFlow') - f0})`);
  }
  const r = new SinusoidView(createShared(), { reduceMotion: true }); r.setVisible(true); run(r, 0, 500);
  assert.equal(num(r, 'uFlow'), 0);
});

test('the lumen keeps every one of 2D\'s ingredients: the wall lines, the lanes of streaks, the sheen and the glints, each scaled by uShim', () => {
  const lumen = SINUSOID_FS.slice(SINUSOID_FS.indexOf('vec3 lumen('), SINUSOID_FS.indexOf('// ── The space of Disse'));
  for (const part of ['line(y + hw - 0.5, 0.16)', 'line(y - hw + 0.5, 0.16)', 'const float NL = 9.0', 'uFlow * prof', 'uFlow * (0.55 + 0.45 * rr)', 'uShim / 0.5 * live', 'uShim * 0.6']) assert.ok(lumen.includes(part), part);
});
