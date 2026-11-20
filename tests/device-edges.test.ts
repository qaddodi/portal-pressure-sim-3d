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
import { EndoScope } from '../src/scene/devices/probes/scope.ts';
import { DopplerProbe, WEDGE_STOPS, WEDGE_MID } from '../src/scene/devices/probes/doppler-probe.ts';
import { FibroProbe, HEAD_MS, SCAN_FADE_MS } from '../src/scene/devices/probes/fibro-probe.ts';
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
    const [shaft, bend, tip, lens, , band, needle, face, port, ...rings] = sc.parts as unknown as DeviceObject[];
    for (const o of [shaft!, bend!]) { assert.equal(fill(o), raw(t.scope), 'insertion tube: --dev-scope'); assert.equal(edge(o), raw(scopeSoftHex(t))); assert.equal(edgeA(o), SCOPE_EDGE_A); }
    assert.equal(fill(tip!), raw(t.scopeTip)); assert.equal(edgeA(tip!), SCOPE_EDGE_A);
    assert.equal(fill(face!), raw(t.scopeFace)); assert.ok(Math.abs(edgeA(face!) - SCOPE_EDGE_A * 0.8) < 1e-9);
    assert.equal(fill(port!), raw(t.port)); assert.equal(edgeA(port!), 0); assert.equal(port!.ink.visible, false);
    assert.equal(edge(needle!), raw(t.polyEdge)); assert.equal(edgeA(needle!), 0.8);
    assert.equal(edgeA(band!), 0, 'the ligator\'s band is plain platinum');
    assert.ok(lens && rings.length === 4); for (const r of rings) assert.equal(edgeA(r as unknown as DeviceObject), 0, 'the hit\'s rings are discs with no outline');
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
    assert.equal(fill(body!), raw(LOOKS[id].card)); assert.equal(edge(body!), raw(LOOKS[id].text2)); assert.equal(edgeA(body!), 1);
    assert.equal(fill(pad!), raw(LOOKS[id].text2)); assert.equal(edgeA(pad!), 0);
    assert.equal(fill(cable!), raw(LOOKS[id].text3)); assert.equal(edgeA(cable!), 0);
    assert.equal(edgeA(screen!), 0); assert.equal(edgeA(wave!), 0);
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
