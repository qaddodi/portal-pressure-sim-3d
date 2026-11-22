// Polish C (22 Nov 2026): scene objects come and go by alpha, and their colours glide. A device part's `group.visible` is written by DeviceObject alone (`show` / `present` / `park`, level times presence);
// `setTone` mixes to the new colour; the shunt guide fades and mixes its colour; and the raw `.visible =` writes under src/scene only go down (scripts/visible-allowance.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Color } from 'three';
import { createClock, type Env } from '../src/clock/frame.ts';
import { createShared } from '../src/scene/materials/cel.ts';
import { PALETTES } from '../src/scene/palette.ts';
import { DeviceObject, DEVICE_FADE_MS } from '../src/scene/devices/device-object.ts';
import { allocTube, DEVICE_SIDES } from '../src/scene/devices/tube-rings.ts';
import { ShuntGuide } from '../src/scene/shunt-guide.ts';
import { Vector3 } from 'three';
import { GlueCast } from '../src/scene/devices/glue-cast.ts';
import { Tamponade } from '../src/scene/devices/balloons/tamponade.ts';
import { ProcCatheter, CATHETER_IDLE } from '../src/scene/devices/catheters/proc-catheter.ts';
import { route3d } from '../src/scene/procedures/route3d.ts';
import { EndoScope } from '../src/scene/devices/probes/scope.ts';
import { countAll, readAllowance } from '../scripts/visible-ratchet.mjs';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// a clock on a hand-turned Env: frames and time move only when the test says so
let t = 1000, id = 0;
const q = new Map<number, (t: number) => void>();
const env: Env = { raf: (cb) => { q.set(++id, cb); return id; }, cancel: (i) => { q.delete(i); }, now: () => t };
const fake = createClock(env);
DeviceObject.clock = fake;
const FRAME = 16;
const tick = (): void => { t += FRAME; const cbs = [...q.values()]; q.clear(); cbs.forEach((cb) => cb(t)); };
const frames = (n: number): void => { for (let i = 0; i < n; i++) tick(); };
const alphaOf = (o: DeviceObject): number => o.toon.uniforms.alpha!.value as number;
const shared = createShared();
const part = (): DeviceObject => { const o = new DeviceObject(allocTube(6, DEVICE_SIDES), 'steel', shared); o.applyPalette(PALETTES.light); return o; };

/** Runs frames until `done()` or 40 frames; returns the alphas seen, one per frame, and whether `visible` was still true on every frame that had an alpha above nothing. */
function trace(o: DeviceObject, step: () => void = () => undefined): number[] {
  const seen: number[] = [alphaOf(o)];
  for (let i = 0; i < 40; i++) { tick(); step(); seen.push(alphaOf(o)); if (!o.group.visible && alphaOf(o) <= 0.002) break; if (o.wanted && alphaOf(o) >= 0.999) break; }
  return seen;
}
const middles = (a: number[]): number => a.filter((v) => v > 0.02 && v < 0.98).length;

test('a part that is asked to go fades out over several frames and leaves the draw list only when it is gone', () => {
  const o = part();
  assert.equal(o.group.visible, true); assert.equal(alphaOf(o), 1);
  o.show(false);
  assert.equal(o.group.visible, true, 'still drawn: it has not faded yet');
  const a = trace(o);
  assert.ok(middles(a) >= 3, `alpha passes through middle values: ${a.map((v) => v.toFixed(2))}`);
  assert.ok(a.every((v, i) => i === 0 || v <= a[i - 1]! + 1e-9), 'monotone down');
  assert.equal(o.group.visible, false);
  assert.ok(a.length * FRAME >= DEVICE_FADE_MS * 0.9 && a.length * FRAME <= DEVICE_FADE_MS + 4 * FRAME, `took ${a.length * FRAME} ms`);
});

test('a part that is asked to show fades in from nothing, and one that was never shown stays out whatever its level', () => {
  const o = part(); o.park();
  assert.equal(o.group.visible, false); o.setAlpha(0.8); assert.equal(o.group.visible, false, 'a parked part is not woken by a level');
  o.show(true);
  assert.equal(alphaOf(o), 0, 'it starts from nothing');
  const a = trace(o);
  assert.ok(middles(a) >= 3, `rises through middle values: ${a.map((v) => v.toFixed(2))}`);
  assert.ok(Math.abs(alphaOf(o) - 0.8) < 1e-9, 'and lands at its level');
  o.setAlpha(0); assert.equal(o.group.visible, false, 'a level of nothing is out of the list');
});

test('an owner that eases its own alpha (present) is not eased twice: its alpha is the whole fade', () => {
  const o = part(); o.park(); o.present(); o.setAlpha(0.5);
  assert.equal(alphaOf(o), 0.5); assert.equal(o.group.visible, true);
  o.setAlpha(0); assert.equal(o.group.visible, false);
});

test('setTone glides: the colour passes through mixes of the two tones, and a part that is not drawn takes it at once', () => {
  const o = part(); o.setTone('steel');
  const from = (o.toon.uniforms.color!.value as Color).clone();
  o.setTone('trWedge');
  const goal = new Color(); { const p = part(); p.park(); p.setTone('trWedge'); goal.copy(p.toon.uniforms.color!.value as Color); }
  const dist = (a: Color, b: Color): number => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
  assert.ok(dist(o.toon.uniforms.color!.value as Color, from) < 1e-6, 'it starts where it was');
  let mid = 0;
  for (let i = 0; i < 30 && dist(o.toon.uniforms.color!.value as Color, goal) > 1e-6; i++) {
    tick(); const c = o.toon.uniforms.color!.value as Color;
    if (dist(c, from) > 0.01 && dist(c, goal) > 0.01) mid++;
  }
  assert.ok(mid >= 3, `${mid} frames between the two colours`);
  assert.ok(dist(o.toon.uniforms.color!.value as Color, goal) < 1e-6, 'and lands on the new tone');
  const h = part(); h.park(); h.setTone('steel'); h.setTone('trWedge');
  assert.ok(dist(h.toon.uniforms.color!.value as Color, goal) < 1e-6, 'a part that is not drawn takes it at once');
});

test('the shunt guide fades in and out over D_FLIP and mixes its colour between accent and danger', () => {
  const g = new ShuntGuide(fake);
  const a = new Vector3(0, 0, 0), b = new Vector3(1, 0, 0), alpha = (): number => g.mesh.material instanceof Object ? ((g.mesh.material as unknown as { uniforms: { alpha: { value: number } } }).uniforms.alpha.value) : 0;
  const col = (): Color => (g.mesh.material as unknown as { uniforms: { color: { value: Color } } }).uniforms.color.value;
  assert.equal(g.mesh.visible, false);
  g.set(a, b, 100, '#2f7cf6');
  assert.equal(g.mesh.visible, true); assert.equal(alpha(), 0, 'it starts from nothing');
  const up: number[] = [];
  for (let i = 0; i < 20; i++) { tick(); up.push(alpha()); }
  assert.ok(up.filter((v) => v > 0.02 && v < 0.93).length >= 2, `fades in: ${up.map((v) => v.toFixed(2))}`);
  assert.ok(Math.abs(alpha() - 0.95) < 1e-9);
  const accent = col().clone(), danger = new Color('#d62d2d');
  g.set(a, b, 100, '#d62d2d');
  const d = (x: Color, y: Color): number => Math.hypot(x.r - y.r, x.g - y.g, x.b - y.b);
  assert.ok(d(col(), accent) < 1e-6, 'the colour starts where it was');
  let mid = 0; for (let i = 0; i < 20; i++) { tick(); if (d(col(), accent) > 0.01 && d(col(), danger) > 0.01) mid++; }
  assert.ok(mid >= 1, `the colour passes through mixes (${mid} frames)`);
  assert.ok(d(col(), danger) < 0.02, 'and lands on the danger colour');
  g.hide();
  assert.equal(g.mesh.visible, true, 'still drawn while it fades');
  const down: number[] = []; for (let i = 0; i < 20; i++) { tick(); down.push(alpha()); }
  assert.ok(down.filter((v) => v > 0.02 && v < 0.93).length >= 2, `fades out: ${down.map((v) => v.toFixed(2))}`);
  assert.equal(g.mesh.visible, false);
});

test('the glue coil and cast, the tamponade, the catheter\'s balloon and the scope\'s needle leave by alpha: middle values over several frames, then out', () => {
  // glue
  const gl = new GlueCast(shared); gl.applyPalette(PALETTES.light);
  gl.set({ coil: 1, column: 1, flash: 0, opacity: 1 }); frames(20);
  gl.set({ coil: 1, column: 0, flash: 0, opacity: 1 });
  let a = trace(gl.cast); assert.ok(middles(a) >= 3, `glue cast: ${a.map((v) => v.toFixed(2))}`); assert.equal(gl.cast.group.visible, false);
  // tamponade
  const tp = new Tamponade(shared); tp.applyPalette(PALETTES.light);
  tp.want(true, true); tp.snap(); frames(20);
  assert.ok(tp.gas.group.visible && alphaOf(tp.gas) > 0.9);
  tp.want(false, false); tp.update(1e6);
  a = trace(tp.gas); assert.ok(middles(a) >= 3, `tamponade balloon: ${a.map((v) => v.toFixed(2))}`); assert.equal(tp.gas.group.visible, false);
  frames(20); assert.ok(!tp.tube.group.visible && !tp.eso.group.visible, 'every part is out once it has faded');
  // the catheter's balloon
  const r3 = route3d('hvpg')!, c = new ProcCatheter(r3, shared); c.applyPalette(PALETTES.light);
  c.set({ ...CATHETER_IDLE, u: 1, balloon: 1, opacity: 1 }); frames(20);
  const bl = (c as unknown as { balloon: DeviceObject }).balloon;
  assert.ok(bl.group.visible);
  c.set({ ...CATHETER_IDLE, u: 1, balloon: 0, opacity: 1 });
  a = trace(bl); assert.ok(middles(a) >= 3, `catheter balloon: ${a.map((v) => v.toFixed(2))}`); assert.equal(bl.group.visible, false);
  // the scope's needle
  const sc = new EndoScope(shared); sc.applyPalette(PALETTES.light);
  const drive = { u: 1, tgt: 0, aim: 1, fan: 1, needle: 1, flash: 0, read: 0 };
  let now = 0; const run = (n = 1): void => { for (let i = 0; i < n; i++) { now += 16; sc.update(16, true, 'eus', 'pv', undefined, undefined, drive, now); tick(); } };
  run(30);
  const nd = (sc as unknown as { parts_: { needle: DeviceObject } }).parts_.needle;
  assert.ok(nd.group.visible && alphaOf(nd) > 0.9);
  drive.needle = 0; sc.update(16, true, 'eus', 'pv', undefined, undefined, drive, now += 16);
  a = trace(nd); assert.ok(middles(a) >= 3, `scope needle: ${a.map((v) => v.toFixed(2))}`); assert.equal(nd.group.visible, false);
});

test('raw `.visible =` writes under src/scene only go down (scripts/visible-allowance.json; node scripts/visible-ratchet.mjs --update lowers it)', () => {
  const now = countAll() as Record<string, number>, was = readAllowance() as Record<string, number>, over: string[] = [];
  for (const f of Object.keys(now)) if (now[f]! > (was[f] ?? 0)) over.push(`${f}: ${now[f]} > ${was[f] ?? 0}`);
  assert.deepEqual(over, [], 'a scene object is shown with DeviceObject.show / setAlpha (it eases), not a boolean (it pops)');
});

test('no device part or container is switched by a raw `group.visible =` outside DeviceObject (the one writer): show / present / setAlpha only', () => {
  const dir = new URL('../src/scene/devices/', import.meta.url).pathname, bad: string[] = [];
  const walk = (d: string): void => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(n) && n !== 'device-object.ts') { const src = readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1'); src.split('\n').forEach((l, i) => { if (/\bgroup\.visible\s*=(?!=)/.test(l)) bad.push(`${p.slice(dir.length)}:${i + 1}`); }); } } };
  walk(dir);
  assert.deepEqual(bad, [], 'DeviceObject.show / present / park / setAlpha own a part\'s visibility, and a container is never switched');
});

test('presence and an owner\'s fade multiply and start together: a Doppler mark rises with the probe\'s own fade, not after it', () => {
  const o = part(); o.park();
  o.show(true); o.setAlpha(0);            // structurally there from the start, the owner's fade at nothing
  frames(20);                             // presence is whole long before the owner starts
  const first: number[] = [];
  for (let i = 0; i < 6; i++) { o.setAlpha((i + 1) / 10); first.push(alphaOf(o)); tick(); }
  assert.ok(first.every((v, i) => Math.abs(v - (i + 1) / 10) < 1e-9), `the owner's fade comes through whole: ${first.map((v) => v.toFixed(2))}`);
});

test('a tamponade balloon grows from a true zero: its alpha is nothing at the first drop of fill and rises with its size', () => {
  const tp = new Tamponade(shared); tp.applyPalette(PALETTES.light);
  const st = (tp as unknown as { state: { adv: number; gas: number; eso: number } }).state, draw = (): void => (tp as unknown as { draw(): void }).draw();
  tp.want(true, true); st.adv = 1;
  const seen: number[] = [];
  for (const g of [0.0011, 0.02, 0.06, 0.2, 1]) { st.gas = g; st.eso = 0; draw(); frames(20); seen.push(alphaOf(tp.gas)); }   // (20 frames: presence is whole, so what is read is the fill's own alpha)
  assert.ok(seen[0]! < 0.02, `at the first drop it is invisible (${seen[0]})`);
  assert.ok(seen.every((v, i) => i === 0 || v >= seen[i - 1]! - 1e-9), `and rises with the fill: ${seen.map((v) => v.toFixed(2))}`);
  assert.ok(Math.abs(seen[seen.length - 1]! - 0.92) < 1e-6, 'to the latex\'s own alpha');
});
