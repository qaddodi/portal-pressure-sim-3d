import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stentGoldEdge, stentGraftEdge, stentWireEdge, STENT_GLASS } from '../src/scene/devices/stent/stent-look.ts';
import { resolveEdge } from '../src/scene/devices/edges.ts';
import { DEVICE_TOKENS } from '../src/scene/procedures/copied/device-tokens.copied.ts';

const lum = (h: string): number => { const n = parseInt(h.slice(1), 16); return 0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255); };
describe('stent look', () => {
  it('draws every stent edge softer than the figure ink, in warm colours for the metal', () => {
    for (const look of ['light', 'dark'] as const) {
      const ctx = { t: DEVICE_TOKENS[look], look, ink: '#14182a' };
      for (const r of [stentWireEdge, stentGoldEdge, stentGraftEdge]) assert.ok(resolveEdge(r, ctx).a < 1);
      assert.ok(lum(resolveEdge(stentWireEdge, ctx).hex) > lum(ctx.t.stentWire));
    }
  });
  it('keeps the graft a rim-edged glass', () => { assert.ok(STENT_GLASS.rim > 0 && STENT_GLASS.fill > 0); });
});

import { stentCircuitLook, STENT_FRONT_ALPHA } from '../src/scene/devices/stent/stent-look.ts';
import { PALETTES } from '../src/scene/palette.ts';
import { readFileSync } from 'node:fs';
describe('stent look in the Circuit', () => {
  it('takes its colours and strengths from the one table, in every look', () => {
    for (const id of Object.keys(PALETTES) as (keyof typeof PALETTES)[]) {
      const l = stentCircuitLook(PALETTES[id]); assert.equal(l.wireA, STENT_FRONT_ALPHA); assert.ok(l.wire.r > 0.5 && l.goldA < 1);
    }
  });
  it('has no fixed ink or gold left in the vessel shader stent', () => {
    const src = readFileSync(new URL('../src/scene/vessels/shaders.ts', import.meta.url), 'utf8');
    assert.ok(src.includes('stentWire.rgb') && !src.includes('mix(c, inkColor, 0.85 * cov * kS)') && !src.includes('vec3(0.86, 0.66, 0.2), gold * kS'));
  });
});

describe('the Circuit stent tiles by true arc length', () => {
  const src = readFileSync(new URL('../src/scene/vessels/shaders.ts', import.meta.url), 'utf8');
  it('measures the stent along the course the tube is drawn on (body at rest, map in the Circuit), not the body length', () => {
    assert.match(src, /vArcLen = mix\(len, cl\.y, circShare\)/);
    assert.match(src, /Lw = vArcLen \* vU, s = vUv\.x \* Lw/);
    assert.match(src, /fwPx = fwidth\(vUv\.x \* vArcLen \* vU\)/);
  });
  it('sizes every cell from the lumen alone (un), so a longer stent adds cells and never stretches them', () => {
    const blk = src.slice(src.indexOf('if (stentU.x > 0.001'), src.indexOf('the running stitch'));
    assert.match(blk, /Pc = 11\.0 \* un/);
    assert.match(blk, /Nb = max\(1\.0, floor\(\(bEnd - t0\) \/ \(17\.0 \* un\)/);
    assert.doesNotMatch(blk, /\/ len\b|\* len\b/);
  });
});

import { headings, skewOf } from '../src/scene/circuit/geometry.ts';
import { bareHalfWidths, BARE_MM } from '../src/scene/devices/stent/stent-look.ts';
describe('the stent keeps real proportions on the map', () => {
  it('the bare stretch is a real 2 cm whatever the route length (in lumen half widths, by the diameter)', () => {
    assert.equal(bareHalfWidths(8), 5);                       // 20 mm bare, an 8 mm lumen (half width 4 mm)
    assert.equal(BARE_MM, 20);
    assert.ok(bareHalfWidths(6) > bareHalfWidths(10), 'a narrower lumen takes more half widths for the same 2 cm');
    const dev = readFileSync(new URL('../src/scene/devices/stent/stent-device.ts', import.meta.url), 'utf8');
    assert.match(dev, /bareHalfWidths\(this\.dq\)/);
    assert.doesNotMatch(dev, /\(INSET \+ this\.paths\.bareEnd\) \/ this\.L/);
  });
  it('headings unwrap through a half turn and an S bend', () => {
    const q = (a: number): [number, number] => [Math.cos(a), Math.sin(a)];
    const h = headings([q(3.0), q(3.0 + 0.3), q(-3.0)]);   // across the +/-pi cut: still a turn that never jumps by 2 pi
    assert.ok(Math.abs(h[1]! - 0.3) < 1e-9 && Math.abs(h[2]! - (2 * Math.PI - 6.0)) < 1e-9);
    const s = headings([q(0), q(1), q(0.2)]); assert.ok(Math.abs(s[2]! - 0.2) < 1e-9);
  });
  it('a cell keeps its length on the surface at any offset round a corner (inside and outside)', () => {
    const rho = 40, pitch = 6;                                  // a bend of radius 40, cells 6 apart along the centre
    for (const lat of [-9, -4, 0, 4, 9]) {                      // lateral offsets (left positive); the surface runs (rho - lat) per radian
      const turn = (s: number): number => s / rho, phase = (s: number): number => s - skewOf(lat, turn(s));
      let prevS = 0, prevP = phase(0), min = 1e9, max = -1e9;
      for (let s = 1; s <= 60; s++) {
        const ds = (rho - lat) * (turn(s) - turn(s - 1)), dp = phase(s) - prevP;   // surface length vs phase advanced
        const ratio = dp / ds; min = Math.min(min, ratio); max = Math.max(max, ratio); prevS = s; prevP = phase(s);
      }
      assert.ok(max - min < 1e-9 && Math.abs(max - 1) < 1e-9, `lat ${lat}: one phase per surface length (${min}..${max})`);
    }
    void pitch;
  });
  it('the shader uses the bare length, the skew and the nominal lumen in the stent block', () => {
    const src = readFileSync(new URL('../src/scene/vessels/shaders.ts', import.meta.url), 'utf8');
    const blk = src.slice(src.indexOf('if (stentU.x > 0.001'), src.indexOf('the running stitch'));
    assert.match(blk, /sB = s0 \+ stentU\.w \* vR0/);
    assert.match(blk, /float sp = s - vSkew/);
    assert.doesNotMatch(blk, /stentU\.w \* Lw/);
    assert.match(src, /vSkew = circShare \* dot\(aNor\.xy, vec2\(-tl\.y, tl\.x\)\) \* lumenW \* vU \* \(turn - stentT0\)/);
  });
});
