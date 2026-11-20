// The space of Disse is a thin, faint line beside each sinusoid, as 2D's (visual review at 390 x 844, 20 Nov: "thick olive ladder bars instead of a thin faint line"). Held here: its width at phone zoom (a rim of at most
// 1.5 px beyond the sinusoid), that it never leaves its sinusoid (no rung across the cords), that it carries no outline, light or mark (the cel ink's 2 px floor would turn a hairline into a bar), and that its colour is 2D's teal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pinned2D } from './two-d-pin.ts';
import { FOV } from '../src/scene/camera/shots.ts';
import { effectiveDistance } from '../src/scene/camera/room.ts';
import { LOBULE_SCALE } from '../src/scene/lobule/frames.ts';
import { LOBULE_R, lobuleShot } from '../src/scene/lobule/shots.ts';
import { buildLobule } from '../src/scene/lobule/geometry.ts';
import { disseRadius, sinRadius } from '../src/scene/lobule/widths.ts';
import { DISSE_COLOURS, disseColour, lymphTint } from '../src/scene/lobule/disse.ts';
import { LobuleView } from '../src/scene/lobule/view.ts';
import { createShared } from '../src/scene/materials/cel.ts';
import { lobuleRoom } from '../src/ui/shell/room.ts';
import type { LobuleModel } from '../src/scene/lobule/model.ts';
import type { CelObject } from '../src/scene/materials/cel.ts';

const two = pinned2D('src/ui/lobule-zoom-field.js');
const net = buildLobule();
const model = (o: Partial<LobuleModel> = {}): LobuleModel => ({
  zone: { pre: 1, sin: 1, post: 1 }, Qs: { pre: 18, sin: 9, post: 18 }, Q0: { pre: 18, sin: 9, post: 18 }, oxy: [0.85, 0.85, 0.75], P1: 11, P2: 8, P3: 5, P4: 4, flow: 1, portal: 1, art: 1, rev: { pre: false, sin: false, post: false },
  lymph: 0.9, lymph0: 0.9, lyProt: 0.87, sigma: 0.15, iap: 5, alb: 4, s: 0, cong: 0, fibSin: 0, fibPre: 0, fibPost: 0, congU: 0, shuntU: 0, septU: 0, act: 0, ...o,
});
const settle = (v: LobuleView, from = 0, ms = 1500) => { for (let t = from; t <= from + ms; t += 16) v.update(t); return from + ms; };
const disseOf = (v: LobuleView): CelObject => (v as unknown as { o: { ly: CelObject } }).o.ly;

/** CSS px to one lobule radius when the lobule is fitted into the free room of a W x H phone (the camera's own distance, as scene-lobule-fit-2d.test.ts). */
function pxPerR(W: number, H: number, cam: 'lobule' | 'lobule:sinusoid' = 'lobule'): number {
  const room = lobuleRoom({ w: W, h: H, safe: { top: 47, right: 0, bottom: 34, left: 0 } }, { topSafe: 47 + 44, cmpH: 0, pzT: 0, pzB: 0, pzL: 0, pzR: 0, botOcc: 34 + 150, presenting: false });
  const D = effectiveDistance(lobuleShot(cam), room, H, W);
  return LOBULE_R * LOBULE_SCALE * (H / (2 * Math.tan((FOV * Math.PI) / 360)) / D);
}

/** The drawn half width of every ring of the sleeve's tube, in lobule radii, with the course it belongs to (read from the geometry the view uploads). */
function rings(v: LobuleView): { rho: number; sib: number; r: number }[] {
  const o = disseOf(v), pos = o.toonMesh.geometry.getAttribute('position'), ly = net.courses.filter((c) => c.kind === 'ly'), out: { rho: number; sib: number; r: number }[] = [];
  let at = 0;
  for (const c of ly) for (let i = 0; i < c.pts.length; i++) {
    let mx = 0, my = 0, mz = 0;
    for (let j = 0; j < 8; j++) { mx += pos.getX(at + j) / 8; my += pos.getY(at + j) / 8; mz += pos.getZ(at + j) / 8; }
    let r = 0;
    for (let j = 0; j < 8; j++) r = Math.max(r, Math.hypot(pos.getX(at + j) - mx, pos.getY(at + j) - my));   // (in plane: the tube's depth is squashed)
    out.push({ rho: c.rho[i]!, sib: c.sib!, r: r / LOBULE_R });
    at += 9;   // (radial + 1 vertices a ring)
  }
  return out;
}

test('at 390 x 844 the sleeve is a hairline beside its sinusoid: a rim of at most 1.5 px each side, 5 px across, 3 px of rim even at the sinusoid zoom', () => {
  const v = new LobuleView(createShared());
  v.setVisible(true); v.snapModel(model({ lyProt: 0.43 })); settle(v);   // (a sealed, cirrhotic lining: the widest the sleeve is drawn)
  const k = pxPerR(390, 844), k2 = pxPerR(390, 844, 'lobule:sinusoid'), infl = (disseOf(v).toon.uniforms.inflate.value as number) / LOBULE_R;
  assert.ok(k > 150 && k < 260, `the fitted lobule's radius on a phone is ${k.toFixed(0)} px`);
  assert.ok(k2 > 1.8 * k, 'the sinusoid station is about twice that');
  let widest = 0, rimMax = 0;
  for (const g of rings(v)) {
    const half = g.r + infl, sin = sinRadius('s0', g.rho);
    widest = Math.max(widest, 2 * half * k); rimMax = Math.max(rimMax, (half - sin) * k);
    assert.ok(Math.abs(g.r - disseRadius(g.rho)) < 1e-6, 'drawn at 2D\'s radius, not a wider one');
  }
  assert.ok(rimMax <= 1.5, `rim ${rimMax.toFixed(2)} px beyond the sinusoid at the phone fit`);
  assert.ok(widest <= 5.2, `the sleeve is ${widest.toFixed(2)} px across at the phone fit`);
  assert.ok(rimMax * (k2 / k) <= 3, 'and no more than 3 px at the sinusoid station');
});

test('no rung: every sleeve stays on its own sinusoid (within 0.05 R of it all along), one per sinusoid, none between two', () => {
  const ly = net.courses.filter((c) => c.kind === 'ly'), byId = new Map(net.courses.map((c) => [c.id, c]));
  const sin = net.courses.filter((c) => c.kind === 's0' || c.kind === 's1' || c.kind === 's2');
  assert.equal(ly.length, sin.length);
  assert.deepEqual([...new Set(ly.map((c) => c.sib))].sort((a, b) => a! - b!), sin.map((c) => c.id).sort((a, b) => a - b), 'one sleeve beside each sinusoid, none beside a cross-link');
  for (const c of ly) {
    const s = byId.get(c.sib!)!;
    for (let i = 0; i < c.pts.length; i++) {
      let near = Infinity, nearOther = Infinity;
      for (const o of sin) for (const q of o.pts) { const d = Math.hypot(c.pts[i]![0] - q[0], c.pts[i]![1] - q[1]); if (o === s) near = Math.min(near, d); else nearOther = Math.min(nearOther, d); }
      assert.ok(near < 0.05, `course ${c.id} sample ${i} strays ${near.toFixed(3)} R from its sinusoid`);
      if (near > 0.01) assert.ok(near <= nearOther, `course ${c.id} sample ${i} lies nearer another sinusoid than its own`);
    }
    // no step across the plate: neighbouring samples are one stretch of the course apart
    for (let i = 1; i < c.pts.length; i++) assert.ok(Math.hypot(c.pts[i]![0] - c.pts[i - 1]![0], c.pts[i]![1] - c.pts[i - 1]![1]) < 0.06, `course ${c.id} jumps at ${i}`);
  }
});

test('the sleeve carries no outline, no light and no marks, whatever the look, device or state (the cel line\'s 2 px floor would make a bar of it)', () => {
  const v = new LobuleView(createShared());
  v.setVisible(true); v.snapModel(model()); settle(v);
  for (const look of ['light', 'dark', 'navy', 'black'] as const) {
    v.applyLook(look); v.setPhone(true); v.setDpr(2); v.setPhone(false); settle(v);
    const o = disseOf(v);
    assert.equal(o.ink.uniforms.px.value, 0, `${look}: no line width`);
    assert.equal(o.basePx, 0);
    assert.ok('FLATFILL' in (o.toon.defines ?? {}), `${look}: one flat fill`);
    assert.equal(o.toon.uniforms.headAmount.value, 0, 'no flow heads');
    assert.equal(o.toon.uniforms.flowAmount.value, 0, 'no stripes');
    assert.deepEqual((o.toon.uniforms.shade.value as { toArray(): number[] }).toArray(), (o.toon.uniforms.color.value as { toArray(): number[] }).toArray(), 'shade equals fill');
  }
  const vs = (disseOf(v).ink.vertexShader);
  assert.ok(vs.includes('px > 0.0 ?') && vs.includes(': 0.0'), 'the lobule\'s ink shader draws no line where px is 0');
});

test('its colour is 2D\'s: the lymph\'s teal, deepened by 0.85 x smooth(1, 4, rate) of the way to DISSE_DEEP (the numbers are read from the pinned 2D file)', { skip: two.skip || false }, () => {
  const f = readFileSync(`${two.repo}/src/ui/lobule-zoom-field.js`, 'utf8'), z = readFileSync(`${two.repo}/src/ui/lobule-zoom.js`, 'utf8');
  const nums = (s: string) => s.match(/-?\d*\.?\d+/g)!.map(Number);
  const grab = (re: RegExp, text = f) => { const m = text.match(re); assert.ok(m, `2D's text no longer has ${re}`); return m![1]!; };
  const lyL = grab(/LY_LIGHT = \{ (lo: \[[^}]*\]) \}/), lyD = grab(/LY_DARK = \{ (lo: \[[^}]*\]) \}/);
  const L = DISSE_COLOURS.LY_LIGHT, D = DISSE_COLOURS.LY_DARK;
  assert.deepEqual(nums(lyL), [...L.lo, ...L.mid, ...L.hi]);
  assert.deepEqual(nums(lyD), [...D.lo, ...D.mid, ...D.hi]);
  assert.deepEqual(nums(grab(/DISSE_DEEP = (\[[^\]]*\])/)), [...DISSE_COLOURS.DISSE_DEEP]);
  assert.deepEqual(nums(grab(/DISSE_DEEP_DARK = (\[[^\]]*\])/)), [...DISSE_COLOURS.DISSE_DEEP_DARK]);
  assert.match(f, /const lyF = \(m\) => smooth\(1, 4, lymphRate\(m\)\)/);
  assert.match(z, /f = 0\.85 \* lyF\(m\)/);
  assert.match(z, /LYD\[i\] = lerp\(LY\[i\], deep\[i\], f\)/);
  assert.match(f, /const lyProt = \(m\) => clamp\(\(m\.lyProt - 0.42\) \/ 0\.42, 0, 1\)/);
});

test('the tint reads as 2D\'s teal on every look (blue and green both above red: not an olive), and deepens with filtration', () => {
  for (const dark of [false, true]) for (const prot of [0, 0.3, 0.6, 1]) {
    const [r, g, b] = lymphTint(prot, dark);
    assert.ok(b > r && g > r, `${dark ? 'dark' : 'light'} prot ${prot}: ${[r, g, b].map((x) => x.toFixed(2))} is teal`);
    const [r1, g1, b1] = disseColour(prot, 1, dark), [r4, g4, b4] = disseColour(prot, 4, dark);
    assert.deepEqual([r1, g1, b1], [r, g, b], 'a healthy rate leaves the tint');
    assert.ok(b4 > r4 && g4 > r4, 'and stays teal when deepened');
  }
  const v = new LobuleView(createShared());
  v.setVisible(true); v.snapModel(model()); settle(v);
  for (const look of ['light', 'dark'] as const) {
    v.applyLook(look);
    const c = disseOf(v).toon.uniforms.color.value as { r: number; g: number; b: number }, want = disseColour(1, 1, look === 'dark');
    assert.ok(Math.abs(c.r - want[0]) < 1e-6 && Math.abs(c.g - want[1]) < 1e-6 && Math.abs(c.b - want[2]) < 1e-6, `${look}: the view paints 2D's tone`);
  }
});
