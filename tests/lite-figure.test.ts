import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClock, type Env } from '../src/clock/frame.ts';
import { FrameProbe, LITE_FRAME_MS, LITE_KEYS, PROBE_FRAMES, SLOW_FIRST_MS, isSoftwareRenderer, withLite, type LiteOwn } from '../src/state/lite.ts';
import { softwareRenderer } from '../src/boot/webgl.ts';
import { figureDpr } from '../src/scene/quality.ts';
import { parseSettings, DEPTH_KEYS } from '../src/state/settings.ts';

const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('the renderer names that mean "no GPU" are software; a real GPU is not', () => {
  for (const n of ['Google SwiftShader', 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)', 'llvmpipe (LLVM 15.0.7, 256 bits)', 'Mesa Software Rasterizer', 'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0)', 'softpipe'])
    assert.equal(isSoftwareRenderer(n), true, n);
  for (const n of ['Apple GPU', 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)', 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)', 'Intel(R) UHD Graphics 620', 'Adreno (TM) 650', '', null, undefined])
    assert.equal(isSoftwareRenderer(n as string), false, String(n));
});

test('the probe: a context refused with failIfMajorPerformanceCaveat is software; a named software renderer is software; a real GPU, or a probe that throws, is not', () => {
  const lost: string[] = [];
  const ctx = (name: string | null) => ({
    getExtension: (n: string) => (n === 'WEBGL_debug_renderer_info' ? (name === null ? null : { UNMASKED_RENDERER_WEBGL: 37446 }) : { loseContext: () => { lost.push('lost'); } }),
    getParameter: () => name,
  });
  assert.equal(softwareRenderer(() => ({ getContext: (_id: string, o?: object) => ((o as { failIfMajorPerformanceCaveat?: boolean }).failIfMajorPerformanceCaveat ? null : {}) })), true, 'refused with the caveat flag');
  assert.equal(softwareRenderer(() => ({ getContext: () => ctx('llvmpipe (LLVM 15)') })), true, 'named');
  assert.equal(lost.length, 1, 'the probe context is given back at once');
  assert.equal(softwareRenderer(() => ({ getContext: () => ctx('Apple GPU') })), false);
  assert.equal(softwareRenderer(() => ({ getContext: () => ctx(null) })), false, 'no name to read: left to the frames');
  assert.equal(softwareRenderer(() => ({ getContext: () => { throw new Error('no'); } })), false);
});

test('first frames: five frames averaging over 250 ms choose lite; fast frames do not; a pause starts the count again; it judges once', () => {
  const slow = new FrameProbe(); let t = 1000, r: boolean | null = null;
  r = slow.note(t); assert.equal(r, null, 'the first frame has no interval');
  for (let i = 0; i < PROBE_FRAMES; i++) { t += SLOW_FIRST_MS + 50; r = slow.note(t); if (i < PROBE_FRAMES - 1) assert.equal(r, null); }
  assert.equal(r, true); assert.equal(slow.note(t + 1000), null, 'done');
  const fast = new FrameProbe(); t = 0; fast.note(t); for (let i = 0; i < PROBE_FRAMES; i++) { t += 16.7; r = fast.note(t); }
  assert.equal(r, false);
  const mixed = new FrameProbe(); t = 0; mixed.note(t);
  t += 200; assert.equal(mixed.note(t), null); t += 9000; assert.equal(mixed.note(t), null, 'a pause is not a slow frame');
  for (let i = 0; i < PROBE_FRAMES; i++) { t += 20; r = mixed.note(t); }
  assert.equal(r, false, 'only the frames since the pause count');
  const edge = new FrameProbe(); t = 0; edge.note(t); for (let i = 0; i < PROBE_FRAMES; i++) { t += SLOW_FIRST_MS; r = edge.note(t); }
  assert.equal(r, false, 'exactly 250 ms is not over it');
});

test('withLite: every quiet switch reads off while lite stands, the person\'s own values come back when it goes', () => {
  assert.deepEqual([...LITE_KEYS].sort(), ['blur', ...DEPTH_KEYS].sort(), 'lite quiets the glass blur and every figure depth switch');
  const own = Object.fromEntries(LITE_KEYS.map((k, i) => [k, i % 2 === 0])) as LiteOwn;
  assert.ok(LITE_KEYS.every((k) => withLite(own, true)[k] === false));
  assert.deepEqual(withLite(own, false), own);
  assert.ok(Object.values(own).some(Boolean), 'the input is not changed');
});

test('lite draws at 1x whatever Figure detail says, and at 2x when it is not lite', () => {
  assert.equal(figureDpr(2, true, false, 3, true), 1);
  assert.equal(figureDpr(0, false, true, 3, true), 1);
  assert.equal(figureDpr(2, true, false, 3), 2);
  assert.equal(figureDpr(2, true, false, 1, true), 1);
});

test('the clock frame floor: about every third vsync at 60 Hz, none when off, real time, and an idle loop wakes at once', () => {
  let t = 1000, id = 0;
  const q = new Map<number, (t: number) => void>();
  const env: Env = { raf: (cb) => { q.set(++id, cb); return id; }, cancel: (i) => { q.delete(i); }, now: () => t };
  const tick = (ms = 16.7) => { t += ms; const cbs = [...q.values()]; q.clear(); cbs.forEach((cb) => cb(t)); };
  const c = createClock(env); let n = 0;
  c.on('render', () => { n++; });
  c.setFrameFloor(LITE_FRAME_MS);
  const h = c.hold('move');
  for (let i = 0; i < 60; i++) tick();   // one second of vsyncs
  assert.ok(n >= 18 && n <= 21, `about 20 frames in a second, got ${n}`);
  assert.equal(c.awake, true, 'the loop stays awake between the frames it lets go by');
  c.setFrameFloor(0); n = 0;
  for (let i = 0; i < 60; i++) tick();
  assert.equal(n, 60, 'off: every vsync');
  h.release(); tick(); tick();
  assert.equal(c.awake, false);
  c.setFrameFloor(LITE_FRAME_MS); c.invalidate('once'); n = 0; tick(); assert.equal(n, 1, 'a frame asked for after a rest is drawn at once');
});

test('the settings store: lite reads the quiet switches off and keeps the person\'s own; an own choice made in lite stands; the saved values are the person\'s own; the device never overrules a person', async () => {
  const mem = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); } };
  const { useSettings } = await import('../src/state/settings.ts');
  const st = () => useSettings.getState();
  st().reset();
  st().set('dof', false); st().setBlur(false);
  st().setLite(true, 'device');
  assert.equal(st().lite, true); assert.equal(st().liteBy, 'device');
  for (const k of LITE_KEYS) assert.equal(st()[k], false, `${k} reads off`);
  const saved = JSON.parse(mem.get('pps3d.settings.v1')!);
  assert.equal(saved.lite, true); assert.equal(saved.liteBy, 'device');
  assert.equal(saved.tilt, true, 'the saved tilt is the person\'s own (on), not the quiet one');
  assert.equal(saved.dof, false); assert.equal(saved.blur, false);
  st().set('tilt', true);   // (the person switches one back on while lite stands: theirs)
  assert.equal(st().tilt, true); assert.equal(st().organDepth, false);
  st().setLite(false, 'person');
  assert.equal(st().liteBy, 'person');
  assert.equal(st().organDepth, true, 'own values come back'); assert.equal(st().tilt, true);
  assert.equal(st().dof, false, 'a switch the person had off stays off'); assert.equal(st().blur, false);
  const again = parseSettings(mem.get('pps3d.settings.v1')!);
  assert.equal(again.lite, false); assert.equal(again.liteBy, 'person');
  st().reset();
  assert.equal(st().lite, false); assert.equal(st().liteBy, null); assert.equal(st().blur, true);
});

test('lite is parsed from a save: a switch, who chose it; anything else is "not lite, nobody chose"', () => {
  const p = parseSettings('{"lite":true,"liteBy":"device"}');
  assert.equal(p.lite, true); assert.equal(p.liteBy, 'device');
  const q = parseSettings('{"lite":"yes","liteBy":"robot"}');
  assert.equal(q.lite, false); assert.equal(q.liteBy, null);
  assert.equal(parseSettings(null).liteBy, null);
});

test('the pieces are wired: boot decides on a software renderer, Stage times the first frames and paces the clock, Settings has the row', () => {
  assert.match(src('../src/main.tsx'), /liteBy === null && softwareRenderer\(\)\) useSettings\.getState\(\)\.setLite\(true, 'device'\)/);
  const stage = src('../src/scene/Stage.tsx');
  assert.match(stage, /new FrameProbe\(\)/); assert.match(stage, /clock\.setFrameFloor\(was \? LITE_FRAME_MS : 0\)/);
  assert.match(stage, /st\.lite\)/, 'the pixel ratio follows lite');
  const sheet = src('../src/ui/settings/SettingsSheet.tsx');
  assert.match(sheet, /sec\.title === 'Display' \? <LiteFigure \/>/);
  assert.match(sheet, /setLite\(v, 'person'\)/);
});

test('a preset keeps working under lite: it is read back from the person\'s own values, and one chosen while lite stands reads as chosen', async () => {
  const mem = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); } };
  const { useSettings, ownSettings } = await import('../src/state/settings.ts');
  const { presetOf, presetValues } = await import('../src/state/figure-presets.ts');
  const st = () => useSettings.getState();
  st().reset();
  st().setMany(presetValues('rich', false));
  st().setLite(true, 'device');
  assert.equal(st().organDepth, false, 'the figure reads the quiet values');
  assert.equal(presetOf(ownSettings(st()), false), 'rich', 'Settings still shows the preset the person chose');
  assert.equal(presetOf(st(), false), null, 'the live values are a mix');
  st().setMany(presetValues('cool', false));
  assert.equal(presetOf(ownSettings(st()), false), 'cool');
  st().setLite(false, 'person');
  assert.equal(presetOf(st(), false), 'cool', 'and it is what comes back');
});
