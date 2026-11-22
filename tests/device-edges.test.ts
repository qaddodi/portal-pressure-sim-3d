// The probes and instruments wear 2D's own materials and edges, not the look's ink hairline (audit 20 Nov PM, section 6, rows 6.1 to 6.8). Root cause it pins: every device part took
// DeviceObject's default edge ('ink'), so the scope's black polymer, the Doppler head's rim, the FibroScan's lines and the bands all drew in the figure's outline colour. Each part now
// names its edge (devices/edges.ts), from the device tokens generated from 2D's tokens.css.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Color } from 'three';
import { createShared, rawColor } from '../src/scene/materials/cel.ts';
import { PALETTES } from '../src/scene/palette.ts';
import { LOOK_IDS, LOOKS } from '../src/looks/looks.ts';
import { DEVICE_TOKENS } from '../src/scene/procedures/copied/device-tokens.copied.ts';
import { NEEDLE_EDGE, SCOPE_EDGE_A, mixHex, resolveEdge, scopeEdge, scopeSoftHex } from '../src/scene/devices/edges.ts';
import { EndoScope, FAN_COLS, FAN_ROWS, MARK_EVERY, MARK_UNITS, SCOPE_BEND, SCOPE_CREAM, SCOPE_LIGHT, SCOPE_NEEDLE, SCOPE_SILVER, SCOPE_TUBE } from '../src/scene/devices/probes/scope.ts';
import { DopplerProbe, WEDGE_STOPS, WEDGE_MID } from '../src/scene/devices/probes/doppler-probe.ts';
import { FibroProbe, HEAD_MS, SCAN_FADE_MS, BODY_LIFT, bodyFill, tapAt, TAP_V } from '../src/scene/devices/probes/fibro-probe.ts';
import { ArriveTrack } from '../src/scene/devices/probes/ease-track.ts';
import { Bands } from '../src/scene/devices/bands.ts';
import type { DeviceObject } from '../src/scene/devices/device-object.ts';
import { easeArrive } from '../src/ui/tests/copied/motion.copied.js';
import { pinned2D } from './two-d-pin.ts';

const hex = (c: Color): string => '#' + c.getHexString(undefined as never).toUpperCase();
const raw = (h: string): string => hex(rawColor(h));
const fill = (o: DeviceObject): string => hex(o.toon.uniforms.color!.value as Color);
const edge = (o: DeviceObject): string => hex(o.ink.uniforms.color!.value as Color);
const edgeA = (o: DeviceObject): number => o.ink.uniforms.edgeA!.value as number;
const luma = (h: string): number => { const n = parseInt(h.slice(1), 16); return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255; };
const rawLuma = luma;
const sh = createShared();

test('the device table carries 2D\'s scope, port and Doppler head tokens for every look, and the copy is current', () => {
  const light = DEVICE_TOKENS.light, dark = DEVICE_TOKENS.dark;
  assert.deepEqual([light.scope, light.scopeTip, light.scopeFace, light.scopeEdge, light.port], ['#2B2E33', '#5C5E66', '#C7C9CC', '#0B0D12', '#0D0D0F']);
  assert.deepEqual([light.dopHeadRim, light.dopHeadInk, light.dopFace, light.dopGlow], ['#000000', '#FFFFFF', '#15181D', '#1F2433']);
  assert.deepEqual([dark.scopeEdge, dark.dopHeadRim, dark.dopHeadInk, dark.dopFace, dark.dopGlow], ['#C9CED6', '#FFFFFF', '#000000', '#F1ECE2', '#F4F6FF']);
  for (const id of LOOK_IDS) assert.equal(DEVICE_TOKENS[id].scope, '#2B2E33', `${id}: the scope is black polymer on every look`);
  const two = pinned2D('src/ui/theme-tokens.js');
  if (!two.skip) execFileSync('node', ['scripts/copy-b5-data.mjs', '--from', two.repo, '--check'], { stdio: 'pipe' });
});

test('the edge rules: none draws nothing, the needle is the catheter\'s dark edge at 0.8, the scope\'s hairline is its edge moved 55 % to the body at 0.26', () => {
  for (const id of LOOK_IDS) {
    const t = DEVICE_TOKENS[id], ctx = { t, look: id, ink: LOOKS[id].ink };
    assert.equal(resolveEdge('none', ctx).a, 0);
    assert.deepEqual(resolveEdge('ink', ctx), { hex: LOOKS[id].ink, a: 1 });
    assert.deepEqual(resolveEdge(NEEDLE_EDGE, ctx), { hex: t.polyEdge, a: 0.8 });
    assert.deepEqual(resolveEdge(scopeEdge(), ctx), { hex: scopeSoftHex(t), a: SCOPE_EDGE_A });
    assert.ok(Math.abs(resolveEdge(scopeEdge(0.8), ctx).a - SCOPE_EDGE_A * 0.8) < 1e-12);
  }
  assert.equal(SCOPE_EDGE_A, 0.26);
  assert.equal(mixHex('#000000', '#FFFFFF', 0.5), '#808080');
  // dark looks' hairline is light, light looks' is dark: 2D's --dev-scope-edge flips with the look
  assert.ok(parseInt(scopeSoftHex(DEVICE_TOKENS.dark).slice(1, 3), 16) > parseInt(scopeSoftHex(DEVICE_TOKENS.light).slice(1, 3), 16));
});

for (const id of LOOK_IDS) {
  test(`${id}: the endoscope is black polymer with a soft edge, its needle steel in the dark edge, its port and rings with none`, () => {
    const t = DEVICE_TOKENS[id], sc = new EndoScope(sh);
    sc.applyPalette(PALETTES[id]);
    const [shaft, bend, tip, lens, needle, face, port, array, light0, light1, chan, ...rest] = sc.parts as unknown as DeviceObject[];
    const rings = rest.slice(0, 3);   // (the two ripples and the flashback; then the needle's sheath, which has the scope's own soft edge)
    // (the redesign, 20 Nov 2026: the shaft is 2D's black polymer; the bending section a lifted black; the distal housing polished silver; the transducer cap cream with a dark face; the needle bright steel)
    assert.equal(fill(shaft!), raw(SCOPE_TUBE(t)), 'insertion tube: --dev-scope, softened'); assert.equal(edge(shaft!), raw(scopeSoftHex(t))); assert.equal(edgeA(shaft!), SCOPE_EDGE_A);
    assert.equal(fill(bend!), raw(SCOPE_BEND(t))); assert.equal(edge(bend!), raw(scopeSoftHex(t))); assert.equal(edgeA(bend!), SCOPE_EDGE_A);
    assert.equal(fill(tip!), raw(SCOPE_SILVER(t)), 'the distal housing is silver'); assert.equal(edgeA(tip!), SCOPE_EDGE_A, 'the same quiet edge as the tube');
    assert.ok(rawLuma(fill(tip!)) > rawLuma(raw(t.scopeTip)) + 0.1, 'lighter than 2D\'s tip grey');
    assert.equal(fill(face!), raw(SCOPE_CREAM(t))); assert.equal(edgeA(face!), SCOPE_EDGE_A);
    assert.equal(fill(array!), raw(t.port), 'the transducer\'s face is dark'); assert.equal(edgeA(array!), 0);
    assert.equal(fill(light0!), raw(SCOPE_LIGHT)); assert.equal(fill(light1!), raw(SCOPE_LIGHT)); assert.equal(fill(chan!), raw(t.port)); assert.equal(fill(lens!), raw(t.port), 'the lens is dark glass');
    assert.equal(fill(port!), raw(t.port)); assert.equal(edgeA(port!), 0); assert.equal(port!.ink.visible, false);
    assert.equal(fill(needle!), raw(SCOPE_NEEDLE)); assert.equal(edge(needle!), raw(t.polyEdge)); assert.equal(edgeA(needle!), 0.8);
    assert.equal(bend!.toon.uniforms.stripeP!.value, 0, 'the bending section is a smooth cover, no grooves'); assert.equal(bend!.toon.uniforms.gloss!.value, 1, 'glossy');
    assert.ok(lens && rings.length === 3); for (const r of rings) assert.equal(edgeA(r as unknown as DeviceObject), 0, 'the hit\'s rings are discs with no outline');
    assert.notEqual(fill(shaft!), raw(DEVICE_TOKENS[id].steel), 'no longer the grey steel');
    sc.dispose();
  });

  test(`${id}: the Doppler head is the look's surface in its ink line on a rim, the face the inverse, the light and beam in --dop-glow`, () => {
    const t = DEVICE_TOKENS[id], d = new DopplerProbe(sh);
    d.applyPalette(PALETTES[id]);
    const [head, face, light] = d.parts as unknown as DeviceObject[], rim = d.parts[d.parts.length - 1] as unknown as DeviceObject;
    assert.equal(fill(head!), raw(LOOKS[id].card)); assert.equal(edge(head!), raw(t.dopHeadInk)); assert.equal(edgeA(head!), 1);
    assert.equal(fill(face!), raw(t.dopFace)); assert.equal(edge(face!), raw(t.dopHeadInk));
    assert.equal(fill(light!), raw(t.dopGlow)); assert.equal(edgeA(light!), 0);
    assert.equal(fill(rim), raw(t.dopHeadRim), 'the 4 px rim: --dop-head-rim'); assert.equal(edgeA(rim), 0);
    assert.notEqual(t.dopHeadRim, t.dopHeadInk, 'the rim is the inverse of the line');
    // the fill is shrunk by half the line and the rim grown by half its width: 2D's strokes are centred on the path
    assert.equal(head!.toon.uniforms.fatPx!.value, -0.8); assert.equal(face!.toon.uniforms.fatPx!.value, -0.7); assert.equal(rim.toon.uniforms.fatPx!.value, 2);
    // the beam: --dop-glow, three stops
    const col = (d as unknown as { wedgeGeo: { getAttribute(n: string): { getX(i: number): number; getW(i: number): number } } }).wedgeGeo.getAttribute('color');
    const g = new Color(t.dopGlow);
    for (let i = 0; i < 5; i++) assert.ok(Math.abs(col.getX(i) - g.r) < 1e-6);
    [0, 3, 1].forEach((v, i) => assert.ok(Math.abs(col.getW(v) - WEDGE_STOPS[i]!) < 1e-6));   // (float32)
    d.dispose();
  });

  test(`${id}: the FibroScan body is the look's surface in a --text-2 line, its tip --text-2, its cable --text-3, none outlined but the body`, () => {
    const f = new FibroProbe(sh);
    f.applyPalette(PALETTES[id]);
    const [body, pad, screen, cable, wave] = f.parts as unknown as DeviceObject[];
    assert.equal(fill(body!), raw(bodyFill(id)), 'the surface, lifted a little toward its line'); assert.equal(edge(body!), raw(LOOKS[id].text2)); assert.equal(edgeA(body!), 1);
    assert.equal(hex(body!.toon.uniforms.shade!.value as Color), fill(body!), 'flat: no dark band on the body (it read as heavy black)');
    assert.equal(fill(pad!), raw(LOOKS[id].text2)); assert.equal(edgeA(pad!), 0);
    assert.equal(fill(cable!), raw(LOOKS[id].text3)); assert.equal(edgeA(cable!), 0);
    assert.equal(edgeA(screen!), 0); assert.equal(edgeA(wave!), 0);
    // root cause of "very dark from side": a tube is shaded by celTubeTone, which cuts a darker tone on its far side whatever `shade` is; a flat part must not use it, so it reads as one colour from every angle
    for (const o of [body!, pad!, screen!, cable!, wave!]) assert.equal(o.toon.defines?.TUBE_TONES, undefined, 'a flat part has no tube tones');
    f.dispose();
  });
}

test('the bands are a plain platinum stroke with no outline and no growth beyond it', () => {
  const b = new Bands(sh);
  b.applyPalette(PALETTES.light);
  for (const r of b.rings) { assert.equal(edgeA(r), 0); assert.equal(r.toon.uniforms.fatPx!.value, 0); assert.equal(fill(r), raw(DEVICE_TOKENS.light.platinum)); }
  b.dispose();
});

test('the Doppler beam\'s middle stop is 2D\'s: .46 at the face, .22 at .8, 0 at the far wall', () => {
  assert.deepEqual([...WEDGE_STOPS], [0.46, 0.22, 0]); assert.equal(WEDGE_MID, 0.8);
  const two = pinned2D('src/ui/dop-probe.js');
  if (!two.skip) {
    const src = readFileSync(`${two.repo}/src/ui/dop-probe.js`, 'utf8');
    assert.ok(src.includes('offset="0" style="stop-color:var(--dop-glow);stop-opacity:.46"') && src.includes('offset=".8" style="stop-color:var(--dop-glow);stop-opacity:.22"') && src.includes('offset="1" style="stop-color:var(--dop-glow);stop-opacity:0"'));
  }
});

test('the FibroScan probe fades over 420 ms and its head over 240 ms, on the arrive curve, not an exponential', () => {
  assert.equal(SCAN_FADE_MS, 420); assert.equal(HEAD_MS, 240);
  const t = new ArriveTrack(0);
  t.go(1, 420, 1000);
  assert.equal(t.step(1000), true); assert.equal(t.value, 0);
  t.step(1210); assert.ok(Math.abs(t.value - easeArrive(0.5)) < 1e-12);
  assert.equal(t.step(1420), false); assert.equal(t.value, 1);
  // a change back while it runs goes from where it stands, over a shortened time (CSS's reversing factor)
  const u = new ArriveTrack(0); u.go(1, 420, 0); u.step(100); const mid = u.value; u.go(0, 420, 100);
  assert.equal(u.value, mid);
  const back = 420 * easeArrive(100 / 420);   // (the time it had gone, on the curve, is the time it takes to come back)
  assert.equal(u.step(100 + back - 2), true); assert.ok(u.value < mid);
  assert.equal(u.step(100 + back + 1), false); assert.equal(u.value, 0);
  assert.ok(back < 420, 'sooner than a whole fade');
  // the whole probe, end to end: it is half way at 210 ms by the curve
  const f = new FibroProbe(sh), box = () => ({ min: { x: -1, y: -0.5, z: -0.2 }, max: { x: 1, y: 0.5, z: 0.2 } }) as never;
  f.update(16, 0, true, 'liver', box, 5); f.update(16, 210, true, 'liver', box, 5);
  assert.ok(Math.abs(f.shown - easeArrive(0.5)) < 1e-9, `shown ${f.shown}`);
  f.update(16, 420, true, 'liver', box, 5); assert.equal(f.shown, 1);
  f.dispose();
});

test('with a screen the Doppler\'s marks are thin strokes over the figure (screen px), the head and beam stay 3D', async () => {
  const { len3 } = await import('../src/scene/frame2d.ts');
  const { Vector3 } = await import('three');
  const { LINE_SIGHT, LINE_AXIS } = await import('../src/scene/devices/probes/doppler-probe.ts');
  const { DOP_LINE_PX, DOP_RIM_STROKE_PX, strokeTransform } = await import('../src/scene/labels/probe-labels.ts');
  const env = { project: (p: InstanceType<typeof Vector3>, out: { x: number; y: number }) => { out.x = 500 + (p.x / len3(1)) * 1.5; out.y = 350 - (p.y / len3(1)) * 1.5; return out; }, size: () => ({ w: 1000, h: 700 }), cards: () => [] };
  const d = new DopplerProbe(createShared());
  for (let t = 0; t < 4000; t += 16) d.update(16, true, 'PV_TRUNK', null, env as never, t);
  assert.equal(d.overlay, true); assert.ok(d.shown > 0.99);
  const [, , , sight, axis, barA, barB] = d.parts;
  for (const o of [sight, axis, barA, barB]) assert.equal(o!.group.visible, false, 'the 3D rods are not drawn');
  assert.equal(d.parts[0]!.group.visible, true, 'the head is');
  const L = d.lines;
  assert.ok([...L].every(Number.isFinite));
  const len = (i: number) => Math.hypot(L[i * 4 + 2]! - L[i * 4]!, L[i * 4 + 3]! - L[i * 4 + 1]!);
  assert.ok(len(LINE_SIGHT) > 20 && len(LINE_AXIS) > 10, 'real strokes');
  // thin: a line under 2.5 px and a rim under 5 px; the rim is wider than its line
  DOP_LINE_PX.forEach((w, i) => { assert.ok(w <= 2.2 && DOP_RIM_STROKE_PX[i]! > w && DOP_RIM_STROKE_PX[i]! <= 4.5); });
  assert.match(strokeTransform(10, 20, 40, 60), /^translate3d\(10px,20px,0\) rotate\(0\.9273rad\) scaleX\(50\)$/);
  d.dispose();
});

test('the tip vibrates as 2D\'s does: a tap once a second, the pad +2, -1.2, +0.6 px along the axis over 420 ms, nothing else moves', () => {
  assert.equal(tapAt(0), 0); assert.equal(tapAt(1), 0); assert.ok(Math.abs(tapAt(0.2) - TAP_V[1]) < 1e-9 && Math.abs(tapAt(0.45) - TAP_V[2]) < 1e-9 && Math.abs(tapAt(0.7) - TAP_V[3]) < 1e-9);
  const sh = createShared(), f = new FibroProbe(sh), box = () => ({ min: { x: -1, y: -0.5, z: -0.2 }, max: { x: 1, y: 0.5, z: 0.2 } }) as never;
  const seen: number[] = [];
  for (let t = 0; t <= 2100; t += 16) { f.update(16, t, true, 'liver', box, 8); seen.push(f.tipX); }
  assert.ok(seen.some((x) => x > 1.5) && seen.some((x) => x < -1), 'it goes out and back');
  assert.ok(seen.every((x) => Math.abs(x) <= 2.0001), 'by 2 px at most');
  const quiet = seen.slice(Math.ceil(430 / 16) + 1, Math.floor(990 / 16));
  assert.ok(quiet.length > 10 && quiet.every((x) => x === 0), 'at rest between taps');
  const taps = seen.filter((x, i) => x !== 0 && (i === 0 || seen[i - 1] === 0)).length;
  assert.ok(taps >= 2, `a tap a second (${taps})`);
  f.dispose();
});

test('the Doppler probe is not faded out and in, nor hidden, while the view is moved under the hand (orbit, pan, pinch)', async () => {
  const { len3 } = await import('../src/scene/frame2d.ts');
  const make = (rot: number, k: number, ox: number) => ({ project: (p: { x: number; y: number }, out: { x: number; y: number }) => { const u = (p.x / len3(1)) * k, v = (p.y / len3(1)) * k; out.x = ox + u * Math.cos(rot) - v * 0.9 * Math.sin(rot); out.y = 350 - (u * Math.sin(rot) * 0.5 + v * 0.9 * Math.cos(rot)); return out; }, size: () => ({ w: 1000, h: 700 }), cards: () => [{ x0: 700, y0: 60, x1: 1000, y1: 700 }] });
  const d = new DopplerProbe(createShared());
  let t = 0;
  for (; t < 3000; t += 16) d.update(16, true, 'PV_TRUNK', null, make(0, 1.5, 420) as never, t);
  assert.ok(d.shown > 0.99, 'it is up');
  let min = 1;
  // the figure turned and dragged by hand for four seconds: the map changes every frame; `env.moving` (a glide) says nothing
  for (let i = 0; i < 250; i++, t += 16) { d.update(16, true, 'PV_TRUNK', null, make(Math.sin(i / 25) * 0.9, 1.5 + 0.5 * Math.sin(i / 40), 420 + i * 1.6) as never, t); min = Math.min(min, d.shown); }
  assert.ok(min > 0.99, `it never faded while the view moved (lowest ${min})`);
  d.dispose();
});

// The scope redesign (owner, 20 Nov 2026, from photos of echoendoscopes and a forward-viewing endoscope).
const driveScope = (mode: 'scope' | 'eus', station: 'pv' | 'hv' = 'pv'): EndoScope => { const sc = new EndoScope(sh); sc.applyPalette(PALETTES.light); for (let t = 0; t < 14000; t += 16) sc.update(16, true, mode, station); return sc; };

test('both scopes carry thin white depth rings along the tube, a heavier one every fifth, counted from the tip so they travel with it', () => {
  for (const mode of ['scope', 'eus'] as const) {
    const sc = driveScope(mode), shaft = sc.parts[0] as unknown as DeviceObject, u = shaft.toon.uniforms;
    assert.ok((u.stripeP!.value as number) > 0, `${mode}: the tube has marks`);
    assert.equal(hex(u.stripeCol!.value as Color), raw('#F4F2EC'), 'white');
    // the spacing is MARK_UNITS figure units along the way, the half width a fraction of it, the heavy ring wider than the thin
    const P = u.stripeP!.value as number, half = u.stripeW!.value as number;
    assert.ok(half > 0 && half < P / 6, `${mode}: a thin ring (${half} of ${P})`);
    assert.ok((u.stripeHeavy!.value as number) > 1.5 && MARK_EVERY === 5);
    sc.dispose();
  }
  assert.ok(MARK_UNITS > 10, 'spaced well apart, not a barcode');
});

test('the marks move with the tip: the origin of the rings is the tip\'s own place along the way', () => {
  const sc = new EndoScope(sh); sc.applyPalette(PALETTES.light);
  const shaft = sc.parts[0] as unknown as DeviceObject, offs: number[] = [];
  for (const u of [0.3, 0.6, 1]) { for (let t = 0; t < 14000; t += 16) sc.update(16, true, 'scope', 'pv', u); offs.push(shaft.toon.uniforms.stripeOff!.value as number); }
  assert.ok(offs[0]! < offs[1]! && offs[1]! < offs[2]!, `the origin follows the tip down the way (${offs})`);
  sc.dispose();
});

test('every scope has a bending section behind its rigid tip: straight and grooved on the plain scope, the tube\'s black lifted a shade', () => {
  for (const mode of ['scope', 'eus'] as const) {
    const sc = driveScope(mode), parts = sc.parts as unknown as DeviceObject[], p = sc as unknown as { bendOn: boolean };
    assert.equal(p.bendOn, true, `${mode}: the bending section is laid`);
    assert.equal(parts[1]!.group.visible, true);
    assert.equal(fill(parts[1]!), raw(SCOPE_BEND(DEVICE_TOKENS.light)));
    sc.dispose();
  }
});

test('the plain endoscope has a tip face (lens, two light guides, the working channel); the echoendoscope has its transducer (cream cap, dark face), a bright needle and a see-through fan', () => {
  const plain = driveScope('scope'), pp = plain.parts as unknown as DeviceObject[];
  const [, , , lens, , face, , array, l0, l1, chan] = pp;
  for (const o of [lens!, l0!, l1!, chan!]) assert.equal(o.group.visible, true, 'plain scope: the tip face is drawn');
  for (const o of [face!, array!]) assert.equal(o.group.visible, false, 'plain scope: no transducer');
  assert.equal(fill(l0!), raw(SCOPE_LIGHT));
  plain.dispose();
  const eus = driveScope('eus'), ep = eus.parts as unknown as DeviceObject[];
  const [, , tip, elens, needle, eface, , earray, el0, el1, echan] = ep;
  assert.equal(eface!.group.visible, true); assert.equal(earray!.group.visible, true);
  for (const o of [el0!, el1!, echan!]) assert.equal(o.group.visible, false, 'echoendoscope: the light guides and channel face are not drawn');
  assert.equal(elens!.group.visible, true);
  assert.equal(fill(eface!), raw(SCOPE_CREAM(DEVICE_TOKENS.light)));
  assert.ok(luma(fill(eface!)) > luma(fill(earray!)) + 0.4, 'the cap is cream and its face dark');
  assert.ok(luma(fill(tip!)) > luma(fill(ep[0]!)) + 0.3, 'the housing is silver against the black tube');
  assert.equal(fill(needle!), raw(SCOPE_NEEDLE)); assert.equal(needle!.group.visible, true);
  // the cap stands proud of the housing on the wall's side (its rings are wider than the tip's half way along)
  const k = eus as unknown as { faceBuf: { rings: { r: number }[] }; arrayBuf: { rings: { r: number }[] }; tip: { rings: { r: number }[] } };
  const mid = k.faceBuf.rings[Math.floor(k.faceBuf.rings.length / 2)]!.r, ends = k.faceBuf.rings[0]!.r;
  assert.ok(mid > ends * 1.2, 'rounded at its ends');
  assert.ok(mid > 0.5 * k.tip.rings[0]!.r, 'a real cap, not a hairline');
  eus.dispose();
});

test('the echoendoscope\'s sector is a see-through wash: faint at the apex, fainter out at the far arc and at the two sides, never opaque', () => {
  const sc = driveScope('eus'), k = sc as unknown as { fanGeo: { getAttribute(n: string): { getW(i: number): number; count: number } }; fanMesh: { visible: boolean }; fanMat: { opacity: number; transparent: boolean } };
  assert.equal(k.fanMesh.visible, true); assert.equal(k.fanMat.transparent, true);
  const col = k.fanGeo.getAttribute('color'), n = 1 + FAN_ROWS * FAN_COLS;
  assert.equal(col.count, n);
  let max = 0; for (let i = 0; i < n; i++) max = Math.max(max, col.getW(i));
  assert.ok(max <= 0.3 && max > 0.1, `the apex alpha ${max}`);
  const far = (j: number): number => col.getW(1 + (FAN_ROWS - 1) * FAN_COLS + j);
  assert.ok(far(Math.floor(FAN_COLS / 2)) < col.getW(0) * 0.25, 'the far arc is a fifth of the apex');
  assert.ok(far(0) < far(Math.floor(FAN_COLS / 2)) && far(FAN_COLS - 1) < far(Math.floor(FAN_COLS / 2)), 'fading toward the sides');
  for (let r = 1; r < FAN_ROWS; r++) assert.ok(col.getW(1 + r * FAN_COLS + 9) <= col.getW(1 + (r - 1) * FAN_COLS + 9) + 1e-9, 'the wash only thins with the reach');
  sc.dispose();
});

test('every flat part on every device is plain-shaded (no tube tones): FibroScan, the Doppler\'s marks and rim', () => {
  const f = new FibroProbe(sh), d = new DopplerProbe(sh);
  f.applyPalette(PALETTES.black); d.applyPalette(PALETTES.black);
  for (const o of [...f.parts, ...d.parts] as unknown as DeviceObject[]) {
    const flat = (o.toon.uniforms.shade!.value as Color).equals(o.toon.uniforms.color!.value as Color);
    if (flat) assert.equal(o.toon.defines?.TUBE_TONES, undefined, 'a flat part (shade = colour) never takes the tube shader');
  }
  const body = f.parts[0] as unknown as DeviceObject;
  assert.ok(luma(fill(body)) > luma(raw(LOOKS.black.card)) + 0.08, 'the body is visibly lighter than the black surface');
  f.dispose(); d.dispose();
});

test('the EUS bending cover is long, curves through its length (not straight then a knee), and meets the rigid tip', () => {
  const sc = driveScope('eus'), k = sc as unknown as { bend: { rings: { c: { x: number; y: number; z: number }; t: { x: number; y: number } }[] }; tip: { rings: { c: { x: number; y: number } }[] } };
  const rs = k.bend.rings, n = rs.length - 1, ang = (i: number): number => Math.atan2(rs[i]!.t.y, rs[i]!.t.x);
  const total = Math.abs(ang(n) - ang(0)), firstThird = Math.abs(ang(Math.floor(n / 3)) - ang(0));
  assert.ok(total > 0.05, `it turns (${total})`);
  assert.ok(firstThird > total * 0.05, `the turn starts early along the cover (${firstThird} of ${total})`);
  const e = rs[n]!.c, t0 = k.tip.rings[0]!.c;
  assert.ok(Math.hypot(e.x - t0.x, e.y - t0.y) < 0.03, 'the cover ends at the tip');
  sc.dispose();
});
