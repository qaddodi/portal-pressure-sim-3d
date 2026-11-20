// The inspector (?inspect, ?joins=debug; Mohammad 20 Nov: "make the debug more elaborate: rotate all around, change shaders"): the hooks live only behind the VDBG define, a page without the flag carries nothing of it, the free orbit turns without limit and
// holds, the live joins answers are the one switch the scene, the skin programs and the lobule read, and the presets say what they take away.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, Mesh, BufferGeometry, ShaderMaterial } from 'three';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { SKIN_FS } from '../src/scene/vessels/skin/shaders.ts';
import { INSPECT, VDBG_GLSL, inspectOn, partDefault, partUniformValues, setPart, vdbgDefines, vdbgUniforms } from '../src/scene/vessels/debug-view.ts';
import { clearJoinsOverride, joinsMode, setJoinsOverride, skinDebugOn, skinLeaveOut } from '../src/scene/vessels/skin/joins-mode.ts';
import { reapplySkinDefines } from '../src/scene/vessels/skin/skin-object.ts';
import { CameraRig, INSPECT_PITCH } from '../src/scene/camera/rig.ts';
import { fullRoom } from '../src/scene/camera/room.ts';
import { ORBIT_LIMIT } from '../src/scene/camera/shots.ts';
import { createGestures, type GestureEnv, type GestureHost } from '../src/scene/gesture/controller.ts';
import { PRESETS, VIEWS, defaultState, stateText, wrapDeg } from '../src/ui/debug/inspect/state.ts';
import { flagOn, inspectRequested, knownFlags } from '../src/ui/debug/flags.ts';
import { rawPrograms } from '../src/debug/gl-registry.ts';

/** The shader text with every `#ifdef VDBG .. #endif` block taken out. */
const withoutVdbg = (src: string): string => src.replace(/#ifdef VDBG\n[\s\S]*?#endif\n/g, '');

test('the inspector hooks of both fragment shaders stand only inside #ifdef VDBG: a page without the flag compiles exactly what it did', () => {
  for (const [name, fs] of [['tube', VESSEL_FS], ['skin', SKIN_FS]] as const) {
    const plain = withoutVdbg(fs);
    assert.doesNotMatch(plain, /\bdbg[A-Z]\w*/, `${name}: a dbg name outside the define`);
    for (const hook of ['dbgBody(', 'dbgEnd(', 'dbgInk < 0.5']) assert.ok(fs.includes(hook), `${name}: ${hook}`);
    assert.ok(fs.includes('dbgDust < 0.5') && fs.includes('dbgHeads < 0.5'), `${name}: marks`);
  }
  assert.match(VDBG_GLSL, /^\n#ifdef VDBG[\s\S]*#endif\n$/);
});

test('a part left out is CLEARED, never multiplied by nothing (a NaN times 0 is still NaN: the speck being hunted)', () => {
  assert.match(VESSEL_FS, /if \(dbgDust < 0\.5\) fd = vec4\(0\.0\);/);
  assert.match(VESSEL_FS, /if \(dbgHeads < 0\.5\) hd = vec4\(0\.0\);/);
  assert.match(VESSEL_FS, /if \(dbgInk < 0\.5\) inkT = 0\.0;/);
  assert.match(SKIN_FS, /if \(dbgDust < 0\.5\) dustAcc = vec4\(0\.0\);/);
  assert.match(SKIN_FS, /if \(dbgHeads < 0\.5\) headAcc = vec4\(0\.0\);/);
  assert.match(SKIN_FS, /if \(dbgInk < 0\.5\) inkT = 0\.0;/);
});

test('this page asks for no inspector: no define, no uniforms on any material; the flags that ask for it are ?inspect and ?joins=debug', () => {
  assert.equal(INSPECT, false);
  assert.deepEqual(vdbgDefines(), {});
  assert.deepEqual(vdbgUniforms('tube'), {}); assert.deepEqual(vdbgUniforms('skin'), {});
  assert.equal(inspectOn('?inspect'), true); assert.equal(inspectOn('?joins=debug'), true); assert.equal(inspectOn('?joins=old'), false); assert.equal(inspectOn(''), false);
  assert.equal(inspectRequested('?inspect=1'), true); assert.equal(flagOn('inspect', '?inspect'), true);
  assert.ok(knownFlags().some((f) => f.id === 'inspect' && f.gate === 'live'));
});

test('a part\'s view writes its uniforms (tubes and skins apart), and back to as drawn', () => {
  const t = partUniformValues('tube'), s = partUniformValues('skin');
  setPart('tube', { shade: 2, dust: false, ink: false, tint: true, colour: '#00ff00', amount: 0.5 });
  assert.equal(t.dbgShade!.value, 2); assert.equal(t.dbgDust!.value, 0); assert.equal(t.dbgHeads!.value, 1); assert.equal(t.dbgInk!.value, 0); assert.equal(t.dbgTint!.value, 1);
  assert.deepEqual((t.dbgCol!.value as { toArray(): number[] }).toArray().map((x) => Math.round(x * 100) / 100), [0, 1, 0, 0.5]);
  assert.equal(s.dbgShade!.value, 0, 'the skins are not the tubes');
  setPart('tube', partDefault());
  assert.equal(t.dbgShade!.value, 0); assert.equal(t.dbgDust!.value, 1); assert.equal(t.dbgInk!.value, 1); assert.equal(t.dbgTint!.value, 0);
  assert.equal((t.dbgCol!.value as { w: number }).w, 0);
});

test('the live joins answers are the one switch: a call with no address reads them, an address string never does, and clearing puts the address back', () => {
  assert.equal(joinsMode(), 'mesh2'); assert.equal(skinDebugOn(), false); assert.equal(skinLeaveOut(), '');
  const ch = setJoinsOverride({ mode: 'old', drop: true, leave: 'marks' });
  assert.deepEqual(ch.sort(), ['drop', 'leave', 'mode']);
  assert.equal(joinsMode(), 'old'); assert.equal(skinDebugOn(), true); assert.equal(skinLeaveOut(), 'marks');
  assert.equal(joinsMode('?joins=mesh'), 'mesh', 'an address string is its own answer'); assert.equal(skinDebugOn('?joins=old'), false);
  assert.deepEqual(setJoinsOverride({ mode: 'old' }), [], 'the same answer is no change');
  assert.deepEqual(setJoinsOverride({ leave: '' }), ['leave']); assert.equal(skinLeaveOut(), '', 'an empty leave-out overrides an address that asked for one');
  clearJoinsOverride();
  assert.equal(joinsMode(), 'mesh2'); assert.equal(skinDebugOn(), false);
});

test('switching a skin diagnostic sets the defines of every skin program (front, solid, veil, glow) and marks it for a new compile; no change, no compile', () => {
  const root = new Group();
  const mk = (name: string, defines: Record<string, number>) => { const m = new ShaderMaterial({ name, defines }); root.add(new Mesh(new BufferGeometry(), m)); return m; };
  const a = mk('skin', { SKIN_COPY: 0, SKIN_GROW: 1 }), b = mk('skin', { SKIN_COPY: 2, SKIN_GROW: 1 }), g = mk('skin-glow', { SKIN_COPY: 0, SKIN_GROW: 1, GLOW: 1 }), other = mk('toon', {});
  assert.equal(reapplySkinDefines(root), 0);
  setJoinsOverride({ drop: true, leave: 'ink' });
  const v0 = a.version;
  assert.equal(reapplySkinDefines(root), 3);
  for (const m of [a, b, g]) { assert.equal(m.defines!.SKIN_DEBUG, 1); assert.equal(m.defines!.SKIN_NOINK, 1); assert.equal(m.defines!.SKIN_NOMARKS, undefined); assert.equal(m.defines!.SKIN_COPY === undefined, false); }
  assert.ok(a.version > v0, 'a new compile is asked for');
  assert.equal(other.defines && 'SKIN_DEBUG' in other.defines, false, 'no other program is touched');
  assert.equal(b.defines!.SKIN_COPY, 2); assert.equal(g.defines!.GLOW, 1);
  assert.equal(reapplySkinDefines(root), 0, 'nothing changed: nothing compiled');
  setJoinsOverride({ drop: false, leave: 'marks' });
  assert.equal(reapplySkinDefines(root), 3);
  assert.equal(a.defines!.SKIN_DEBUG, undefined); assert.equal(a.defines!.SKIN_NOINK, undefined); assert.equal(a.defines!.SKIN_NOMARKS, 1);
  clearJoinsOverride();
});

test('the free orbit turns without a limit, tilts to 88 degrees, takes the short way, and steps home on the rig\'s own clock', () => {
  const rig = new CameraRig('free');
  rig.goTo('free', fullRoom(800, 600), 0, 0);
  rig.update(10);
  assert.equal(rig.free, false);
  assert.ok(Math.abs(rig.setOrbit(3) ? rig.orbitAngle : 0) <= ORBIT_LIMIT, 'without it the turn stops softly at 25 degrees');
  rig.setOrbit(0);
  const front = rig.camera.position.clone();
  rig.setInspect(true);
  assert.equal(rig.free, true); assert.equal(rig.inspectOn, true);
  assert.equal(rig.setOrbit(3), true); assert.equal(rig.orbitAngle, 3, 'a turn of 172 degrees: no soft stop');
  assert.equal(rig.setOrbitPitch(2), true); assert.equal(rig.pitchAngle, INSPECT_PITCH, 'the tilt stops short of straight up');
  rig.setOrbitPitch(0); rig.setOrbit(Math.PI);
  rig.update(20);
  const back = rig.camera.position;
  assert.ok(back.z < 0 && front.z > 0, `the camera went round to the back: z ${front.z.toFixed(2)} -> ${back.z.toFixed(2)}`);
  // a view button eases (never snaps), the short way round
  rig.setOrbit(Math.PI * 1.9);
  rig.inspectTo(0, 0);
  const seen: number[] = [];
  for (let t = 40; t < 2000; t += 16) { rig.update(t); seen.push(rig.inspectAngles.yaw); }
  assert.ok(seen[0]! > Math.PI * 1.9 && seen[0]! < Math.PI * 2, 'it starts moving toward the goal, the short way (a turn of 342 degrees is 18 the other way)');
  assert.ok(seen.every((v, i) => i === 0 || Math.abs(v - seen[i - 1]!) < 0.4), 'no jump between two frames');
  assert.ok(Math.abs(rig.inspectAngles.yaw - Math.PI * 2) < 1e-3, 'it lands on the front (a full turn)');
  // off: the turn eases back to square, and the gestures' turn is the limited one again
  rig.setInspect(false);
  for (let t = 2000; t < 4000; t += 16) rig.update(t);
  assert.ok(Math.abs(Math.sin(rig.inspectAngles.yaw)) < 1e-3 && Math.abs(rig.inspectAngles.pitch) < 1e-3);
  assert.equal(rig.free, false);
});

test('the fit never measures the inspector\'s turn (the figure\'s framing is the shot\'s, however far it is turned)', () => {
  const rig = new CameraRig('free');
  rig.goTo('free', fullRoom(800, 600), 0, 0); rig.update(10);
  const r0 = rig.fitRect();
  rig.setInspect(true); rig.setOrbit(2); rig.setOrbitPitch(1); rig.update(20);
  const r1 = rig.fitRect();
  assert.deepEqual(r1, r0);
});

test('with the turn held (the inspector), nothing springs home 2 s after the finger lifts and a spin has no soft stop', () => {
  let t = 1000, id = 0, orbit = 0, hold = true;
  const asks = new Map<number, (n: number) => void>(), timers = new Map<number, { at: number; fn: () => void }>();
  const env: GestureEnv = { now: () => t, ask: (cb) => { asks.set(++id, cb); return id; }, cancel: (i) => { asks.delete(i); }, timer: (fn, ms) => { timers.set(++id, { at: t + ms, fn }); return id; }, clearTimer: (i) => { timers.delete(i); }, reduceMotion: () => false, viewport: () => ({ w: 800, h: 600 }) };
  const host: GestureHost = { hand: () => ({ k: 1, x: 0, y: 0 }), setHand: () => {}, holdHand: () => {}, centre: () => ({ x: 400, y: 300 }), fitRect: () => ({ x0: 100, y0: 50, x1: 700, y1: 550 }), orbit: () => orbit, setOrbit: (r) => { const c = r !== orbit; orbit = r; return c; }, holdTurn: () => hold, tap: () => {}, picked: () => null, setPicked: () => {}, context: () => {} };
  type Fn = (e: never) => void;
  const mk = () => { const l = new Map<string, Set<Fn>>(); return { addEventListener(n: string, f: Fn) { (l.get(n) ?? l.set(n, new Set()).get(n)!).add(f); }, removeEventListener(n: string, f: Fn) { l.get(n)?.delete(f); }, emit(n: string, e: object) { for (const f of [...(l.get(n) ?? [])]) f({ preventDefault() {}, isTrusted: true, ctrlKey: false, metaKey: false, shiftKey: false, button: 0, ...e } as never); } }; };
  const el = mk(), win = mk();
  createGestures(el, host, env, win);
  const ptr = (type: string, x: number) => { const e = { type, pointerId: 1, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: 300 }; win.emit(type, e); el.emit(type, e); };
  const run = (ms: number) => { for (const e = t + ms; t < e;) { t += 16; const q = [...asks]; asks.clear(); for (const [, cb] of q) cb(t); for (const [i, x] of [...timers]) if (x.at <= t) { timers.delete(i); x.fn(); } } };
  ptr('pointerdown', 400); ptr('pointermove', 410); t += 16; ptr('pointermove', 900); t += 16; ptr('pointerup', 900);
  const turned = orbit;
  assert.ok(Math.abs(turned) > ORBIT_LIMIT, `a drag turns past 25 degrees (${turned.toFixed(2)} rad)`);
  run(6000);
  assert.ok(Math.abs(orbit) > Math.abs(turned) - 1e-9 || Math.abs(orbit) > ORBIT_LIMIT, 'still turned after 6 s');
  assert.notEqual(orbit, 0);
  hold = false; ptr('pointerdown', 400); ptr('pointerup', 400); run(6000);
  assert.ok(Math.abs(orbit) < 0.01, 'without the hold it springs home as before');
});

test('the named views and the presets: each says what it takes away, and a preset changes nothing else', () => {
  assert.deepEqual(VIEWS.map((v) => v.id), ['front', 'back', 'left', 'right', 'top', 'bottom']);
  assert.ok(VIEWS.every((v) => Math.abs(v.pitch) <= 88));
  assert.deepEqual([wrapDeg(190), wrapDeg(-190), wrapDeg(540), wrapDeg(0)], [-170, 170, 180, 0]);
  const base = defaultState();
  for (const p of PRESETS) { assert.ok(p.hint.length > 20, p.id); assert.notDeepEqual(p.make(base), base, `${p.id} changes something`); }
  const by = (id: string) => PRESETS.find((p) => p.id === id)!.make(base);
  const marks = by('marks-off'); assert.deepEqual([marks.tube.dust, marks.tube.heads, marks.skin.dust, marks.skin.heads, marks.leave, marks.tube.ink], [false, false, false, false, 'marks', true]);
  const ink = by('ink-off'); assert.deepEqual([ink.tube.ink, ink.skin.ink, ink.leave, ink.tube.dust], [false, false, 'ink', true]);
  assert.equal(by('old').joins, 'old'); assert.equal(by('drops').drop, true); assert.equal(by('normals').skin.shade, 2); assert.equal(by('who').skin.amount > 0, true);
  const t = stateText(marks, 'build x');
  assert.match(t, /^inspector · build x\njoins=mesh2 drop=0 leave=marks aa=1\ntubes shade=0 dust=0 heads=0 ink=1/);
});

test('every program the panel can reach is registered for the compile check (the vessel and the skin with the hooks, and the three skin diagnostics)', () => {
  const names = rawPrograms('').map((p) => p.name);
  for (const n of ['vessel (inspector)', 'skin (inspector)', 'skin (inspector, no marks)', 'skin (inspector, no ink)']) assert.ok(names.includes(n), n);
});

test('a program\'s budget and uniform check read its source as the driver\'s preprocessor leaves it: the hooks cost a page without the inspector nothing, and the inspector\'s own programs stay under the floor', async () => {
  const { liveSource, declarations, budget, lateMaterialProgram, ES3_FLOOR } = await import('../src/debug/gl-programs.ts');
  const src = '#define A\n#ifdef A\nuniform float a;\n#else\nuniform float notA;\n#endif\n#ifndef B\nuniform float b;\n#ifdef C\nuniform float c;\n#endif\n#endif\n#if X > 1\nuniform float x1;\n#else\nuniform float x2;\n#endif\n';
  assert.deepEqual(declarations(src).map((d) => d.name), ['a', 'b', 'x1', 'x2'], 'ifdef, else, nested, and an unknown #if keeps both branches');
  assert.ok(!liveSource(src).includes('notA'));
  const plain = lateMaterialProgram('skin', (await import('../src/scene/vessels/skin/shaders.ts')).SKIN_VS, SKIN_FS);
  const hooked = lateMaterialProgram('skin', (await import('../src/scene/vessels/skin/shaders.ts')).SKIN_VS, SKIN_FS, { VDBG: 1 });
  assert.ok(!declarations(plain.fragmentGlsl).some((d) => d.name === 'dbgShade'), 'no inspector uniforms in the plain program');
  assert.ok(declarations(hooked.fragmentGlsl).some((d) => d.name === 'dbgShade'), 'the inspector\'s are in its own');
  const bp = budget(plain), bh = budget(hooked);
  assert.equal(bh.fragmentUniformVectors - bp.fragmentUniformVectors, 6);
  for (const k of Object.keys(ES3_FLOOR) as Array<keyof typeof ES3_FLOOR>) assert.ok(bh[k] <= ES3_FLOOR[k], `${k}: ${bh[k]} of ${ES3_FLOOR[k]}`);
});
