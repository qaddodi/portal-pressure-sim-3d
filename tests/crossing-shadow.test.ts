// S3, the crossing shadow (Mohammad, 22 Nov: "let's go with shadow"): where a vessel passes in front of another, the one behind is darkened in a thin soft band round the front one. This pins the arithmetic the shaders run
// (cel-ink.ts SHADOW), that it reads in every look, that nothing gaps at a junction (the topology's adjacency), that a crossing really has the front vessel's hull in front of the one behind, and that the Circuit's lines have an over and under.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LENS_TOKENS } from '../src/scene/lenses/tokens.copied.ts';
import { sampler, toOklab, hexToRgb01 } from '../src/scene/lenses/oklab.ts';
import { LOOKS } from '../src/looks/looks.ts';
import { LOOK_IDS } from '../src/looks/looks.ts';
import { SHADOW, SHADOW_MIN_DL, SHADOW_PX, SHADOW_FEATHER, SHADOW_DEPTH, SHADOW_DEPTH_MAP, MAP_DEPTH_STEP, celTubeBase, isDarkLook, shadowFeather, shadowEndK, shadowEndLen } from '../src/scene/vessels/cel-ink.ts';
import { NETWORK, MAPPED } from '../src/scene/vessels/network.ts';
import { neighboursAt, shadowEndsOf } from '../src/scene/vessels/shadow.ts';
import { mapDepthOf, mapDepthOfTube, mapOrder } from '../src/scene/circuit/map-depth.ts';
import { TIER_Z, x2d, y2d, UNITS_PER_SCENE } from '../src/scene/frame2d.ts';
import { TUBE_DEPTH_SHARE, VESSEL_FS, VESSEL_VS } from '../src/scene/vessels/shaders.ts';

const mixTo = (c: readonly number[], t: readonly number[], a: number) => c.map((v, i) => v + (t[i]! - v) * a);
const L = (c: readonly number[]) => toOklab(c as [number, number, number])[0];

test('the shadow reads in every look: it darkens every colour of the pressure ramp by at least SHADOW_MIN_DL, and never lightens anything', () => {
  for (const look of LOOK_IDS) {
    const { rgb, a } = SHADOW[look], tone = rgb.map((v) => v / 255), s = sampler(LENS_TOKENS[look].pressure);
    for (let p = 0; p <= 30; p += 2.5) {
      const c = celTubeBase(s.at(p, [0, 0, 0]), isDarkLook(look)), dl = L(c) - L(mixTo(c, tone, a));
      assert.ok(dl >= SHADOW_MIN_DL, `${look} at ${p} mmHg: the shadow changes lightness by ${dl.toFixed(3)}`);
    }
    const bg = hexToRgb01(LOOKS[look].bg);
    assert.ok(L(bg) - L(mixTo(bg, tone, a)) >= 0, `${look}: never lighter than the page`);
    if (!isDarkLook(look)) assert.ok(L(bg) - L(mixTo(bg, tone, a)) >= SHADOW_MIN_DL, `${look}: the band shows on the page too`);
  }
});

test('the shadow is defined once per look, a darker tone than the look\'s ground, and its strength is modest', () => {
  assert.deepEqual(Object.keys(SHADOW).sort(), [...LOOK_IDS].sort());
  for (const look of LOOK_IDS) {
    const { rgb, a } = SHADOW[look], bg = hexToRgb01(LOOKS[look].bg);
    assert.ok(L(rgb.map((v) => v / 255)) <= L(bg), `${look}: the tone is no lighter than the page`);
    assert.ok(a > 0.1 && a < 0.4, `${look}: strength ${a}`);
  }
});

test('the band falls from whole to nothing across SHADOW_PX, with a half pixel at the line\'s edge and none over the vessel itself', () => {
  assert.equal(shadowFeather(-1), 0);
  assert.equal(shadowFeather(-0.5), 0);
  assert.ok(Math.abs(shadowFeather(0) - 1) < 1e-9, 'whole at the line\'s edge');
  assert.ok(Math.abs(shadowFeather(SHADOW_FEATHER * SHADOW_PX - 1e-9) - 1) < 1e-6, 'whole to the feather');
  assert.equal(shadowFeather(SHADOW_PX), 0);
  assert.equal(shadowFeather(SHADOW_PX + 1), 0);
  let prev = 1;
  for (let x = SHADOW_FEATHER * SHADOW_PX; x <= SHADOW_PX; x += 0.05) { const f = shadowFeather(x); assert.ok(f <= prev + 1e-9, 'never rises outward'); prev = f; }
});

test('a join never gaps: every end another drawn vessel shares is faded over a length of at least its neighbours\' width, a free end is not faded, and the shader\'s fade is the twin\'s', () => {
  let joined = 0, free = 0;
  for (const v of NETWORK) {
    if (v.feeder) continue;
    const e = shadowEndsOf(v);
    for (const end of [0, 1] as const) {
      const nb = neighboursAt(v, end);
      if (!nb.length) { assert.equal(e[end], 0, `${v.id} end ${end} is free`); free++; continue; }
      joined++;
      const wide = Math.max(...nb.map((o) => o.radius));
      assert.ok(e[end] * v.radius >= 1.25 * wide, `${v.id} end ${end}: fade ${e[end].toFixed(2)} radii must cover its neighbours' ${(wide / v.radius).toFixed(2)}`);
      assert.ok(e[end] >= 1.5);
    }
  }
  assert.ok(joined > 40 && free > 5, `joined ${joined}, free ${free}`);
  // the twin: nothing at the join, whole from `len` radii in, between by a smoothstep
  assert.equal(shadowEndK(0, 3, 1), 0);
  assert.equal(shadowEndK(1.5, 3, 1), 0);
  assert.equal(shadowEndK(3, 3, 1), 1);
  assert.equal(shadowEndK(0, 0, 1), 1, 'a free end');
  assert.equal(shadowEndLen(1, []), 0);
  assert.ok(shadowEndLen(1, [2]) >= 3.25);
  // the cross-tier joins the depth alone cannot tell from a crossing (a hepatic vein into the cava) are among them
  const rhv = NETWORK.find((v) => v.id === 'RHV_IVC_1')!;
  assert.ok(shadowEndsOf(rhv).some((x) => x > 0), 'a hepatic vein joins the cava');
  // the shaders read exactly the twin's constants
  assert.match(VESSEL_FS, new RegExp(`smoothstep\\(${SHADOW_FEATHER}\\d* \\* shadowPx, shadowPx, sS\\)|smoothstep\\(${SHADOW_FEATHER} \\* shadowPx`));
  assert.match(VESSEL_FS, /smoothstep\(0\.5 \* shadowEnd\.x \* rS, shadowEnd\.x \* rS, d0S\)/);
});

test('every crossing has the front vessel\'s hull in front of the one behind, and a neighbour of one tier is never behind it', () => {
  const halo = (SHADOW_PX * 1.4) / 155;   // (scene units: SHADOW_PX CSS px at a screen about 155 px to a scene unit)
  const drawn = NETWORK.filter((v) => !v.feeder && v.kind !== 'liver' && v.id !== 'C9');
  const P = (v: (typeof drawn)[number]) => v.pts.map((p) => [x2d(p[0]), y2d(p[1]), p[2]] as const);
  const seg = (a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[]) => {
    const r = [b[0]! - a[0]!, b[1]! - a[1]!], s = [d[0]! - c[0]!, d[1]! - c[1]!], den = r[0]! * s[1]! - r[1]! * s[0]!;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((c[0]! - a[0]!) * s[1]! - (c[1]! - a[1]!) * s[0]!) / den, u = ((c[0]! - a[0]!) * r[1]! - (c[1]! - a[1]!) * r[0]!) / den;
    return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98 ? [t, u] as const : null;
  };
  let crossings = 0;
  for (let i = 0; i < drawn.length; i++) for (let j = i + 1; j < drawn.length; j++) {
    const a = drawn[i]!, b = drawn[j]!;
    if ([a.from, a.to].some((n) => n === b.from || n === b.to)) continue;   // (a join: the end fade's, above)
    const pa = P(a), pb = P(b);
    for (let k = 1; k < pa.length; k++) for (let l = 1; l < pb.length; l++) {
      const x = seg(pa[k - 1]!, pa[k]!, pb[l - 1]!, pb[l]!);
      if (!x) continue;
      const za = pa[k - 1]![2] + (pa[k]![2] - pa[k - 1]![2]) * x[0], zb = pb[l - 1]![2] + (pb[l]![2] - pb[l - 1]![2]) * x[1];
      const [front, back, zf, zbk] = za >= zb ? [a, b, za, zb] : [b, a, zb, za];
      if (zf - zbk < 0.004) continue;   // (one tier: no over or under to shade)
      crossings++;
      // depth along the view: the hull's front surface vs the back tube's front surface (shaders.ts: the axis's depth plus TUBE_DEPTH_SHARE of the bulge)
      const hull = zf + TUBE_DEPTH_SHARE * (front.radius + halo) - SHADOW_DEPTH, behind = zbk + TUBE_DEPTH_SHARE * back.radius;
      assert.ok(hull > behind, `${front.id} over ${back.id}: hull ${hull.toFixed(4)} must be nearer than ${behind.toFixed(4)}`);
      // and the front tube itself is nearer than its own hull, so it is never shadowed by itself
      assert.ok(zf + TUBE_DEPTH_SHARE * front.radius > hull);
    }
  }
  assert.ok(crossings >= 15, `${crossings} crossings found`);
  // two neighbours of one tier: the hull is behind the neighbour's front, so a junction is never shadowed by depth either
  for (const v of drawn) for (const end of [0, 1] as const) for (const o of neighboursAt(v, end)) {
    if (TIER_Z[v.tier] !== TIER_Z[o.tier] || o.kind === 'liver') continue;
    const hull = TIER_Z[v.tier] + TUBE_DEPTH_SHARE * (v.radius + halo) - SHADOW_DEPTH, theirs = TIER_Z[o.tier] + TUBE_DEPTH_SHARE * o.radius;
    assert.ok(hull < theirs, `${v.id} next to ${o.id}`);
  }
});

test('the Circuit\'s lines each stand at a depth of their own, in the body\'s tier order, the thinner over the thicker of one tier, and the whole stack is shallower than the map\'s parallax allows', () => {
  const ids = MAPPED.map((v) => v.id), depths = ids.map(mapDepthOf);
  assert.equal(new Set(depths).size, ids.length, 'no two lines tie');
  for (let i = 0; i < MAPPED.length; i++) for (let j = 0; j < MAPPED.length; j++) {
    const a = MAPPED[i]!, b = MAPPED[j]!;
    if (TIER_Z[a.tier] > TIER_Z[b.tier]) assert.ok(mapDepthOf(a.id) > mapDepthOf(b.id), `${a.id} is in front of ${b.id}`);
    else if (TIER_Z[a.tier] === TIER_Z[b.tier] && a.radius < b.radius) assert.ok(mapDepthOf(a.id) > mapDepthOf(b.id), `${a.id} is thinner than ${b.id} and over it`);
  }
  assert.ok(Math.min(...depths) >= 0 && Math.max(...depths) < 0.02, 'under 0.02 scene units: about a pixel of parallax at the map\'s edge');
  // (the liver's branches and the caudate lane stand on the plate too, circuit/map-depth.ts: the network's lines keep their order and are a whole number of steps apart, the whole plate one step apart)
  const sorted = [...depths].sort((x, y) => x - y);
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i]! - sorted[i - 1]! >= MAP_DEPTH_STEP - 1e-9 && Math.abs(Math.round((sorted[i]! - sorted[i - 1]!) / MAP_DEPTH_STEP) * MAP_DEPTH_STEP - (sorted[i]! - sorted[i - 1]!)) < 1e-9, 'a whole number of steps apart');
  const plate = mapOrder().map(mapDepthOfTube).sort((x, y) => x - y);
  for (let i = 1; i < plate.length; i++) assert.ok(Math.abs(plate[i]! - plate[i - 1]! - MAP_DEPTH_STEP) < 1e-9, 'one step apart on the whole plate');
  assert.ok(SHADOW_DEPTH_MAP > 0 && SHADOW_DEPTH_MAP < MAP_DEPTH_STEP, 'the hull lies between two lines, behind its own');
});

test('both programs carry the rule: SHADOW widens the tube, lays it behind its own depth, takes the tube\'s fades and the join fade, and the main program applies the Circuit\'s depth offset', () => {
  assert.match(VESSEL_VS, /#ifdef SHADOW\s+shW = shadowPx \* wpcV \/ vU;/);
  assert.match(VESSEL_VS, /c\.z \+= mix\(shadowDepth, shadowDepthC, circT\)/);
  assert.match(VESSEL_VS, /c\.z -= mapDepth \* circT/);
  assert.match(VESSEL_VS, /\* \(1\.0 - circT\)\) \* c\.w;/);   // (a flat line has no bulge in depth)
  assert.match(VESSEL_FS, /#ifdef SHADOW[\s\S]*gl_FragColor = vec4\(shadowCol, aS\)/);
  assert.match(VESSEL_FS, /fadeHere \*= max\(solidK, veilK\)/);
  assert.match(VESSEL_FS, /if \(dotted > 0\.5\) discard;/);
  // it comes after the glow's return and before the tube's own colour work
  const iG = VESSEL_FS.indexOf('#ifdef GLOW'), iS = VESSEL_FS.indexOf('#ifdef SHADOW'), iT = VESSEL_FS.indexOf('float sT = dot(n, lightD)');
  assert.ok(iG > 0 && iS > iG && iT > iS);
});

test('the band starts at the line the vertex stage really drew: the artery\'s heavier wall is in the shadow\'s line width, in the tube, the glow and the shadow (the shadow was hidden under the artery\'s own line, 22 Nov)', () => {
  const lineOf = (name: string) => new RegExp(`float ${name} = ([^;]*);`).exec(VESSEL_FS)?.[1] ?? VESSEL_VS.match(new RegExp(`float ${name} = ([^;]*);`))?.[1] ?? '';
  const heavy = (e: string) => e.startsWith('min(') && e.includes(' * (1.0 + ');   // the artery form of inkPxGlsl: min(LINE_MAX, base * (1.0 + k * art * taper))
  assert.ok(heavy(lineOf('lineS')), 'the shadow\'s line carries the artery wall');
  assert.ok(heavy(lineOf('lineG')), 'the glow\'s line carries it');
  assert.ok(heavy(lineOf('inkPx')), 'the tube\'s line carries it');
});

// Plan 18: the band falls only on a vessel. The stencil bit that only vessel surfaces write gates the shadow, so the liver and the page never carry a second outline.
import { MeshBasicMaterial, AlwaysStencilFunc, EqualStencilFunc, ReplaceStencilOp, KeepStencilOp } from 'three';
import { readFileSync } from 'node:fs';
import { VESSEL_STENCIL, markVesselStencil, shadowStencil } from '../src/scene/vessels/cel-ink.ts';
import { partOf } from '../src/engine/hales/portal/topology.js';

test('the shadow draws only where a vessel surface wrote the vessel bit, and writes nothing', () => {
  const m = shadowStencil(new MeshBasicMaterial()), w = markVesselStencil(new MeshBasicMaterial());
  assert.equal(VESSEL_STENCIL, 4);
  assert.deepEqual([m.stencilFunc, m.stencilRef, m.stencilFuncMask, m.stencilWriteMask, m.stencilZPass], [EqualStencilFunc, 4, 4, 0, KeepStencilOp]);
  assert.deepEqual([w.stencilFunc, w.stencilRef, w.stencilFuncMask, w.stencilWriteMask, w.stencilZPass], [AlwaysStencilFunc, 4, 4, 4, ReplaceStencilOp]);
});

test('the tube, the veil copy and the skin copies write the vessel bit; the shadow reads it; the strand ink, the gut and the vessels use disjoint bits', () => {
  const vo = readFileSync('src/scene/vessels/vessel-object.ts', 'utf8'), sk = readFileSync('src/scene/vessels/skin/skin-object.ts', 'utf8');
  assert.match(vo, /markVesselStencil\(markBlends\(new ShaderMaterial\(\{ name: 'vessel toon'/);
  assert.match(vo, /markVesselStencil\(markBlends\(new ShaderMaterial\(\{ name: 'vessel veil'/);
  assert.match(vo, /shadowStencil\(new ShaderMaterial\(\{ name: 'vessel crossing shadow'/);
  assert.match(sk, /markVesselStencil\(markBlends\(new ShaderMaterial\(\{\s*name: 'skin'/);
  const cel = readFileSync('src/scene/materials/cel.ts', 'utf8'), gut = readFileSync('src/scene/organs/layer.ts', 'utf8');
  assert.match(cel, /stencilRef = 1; this\.ink\.stencilFuncMask = 1; this\.ink\.stencilWriteMask = 1;/);
  assert.match(gut, /stencilRef = 2; m\.stencilFuncMask = 2; m\.stencilWriteMask = 2;/);
  assert.equal(1 & 2 & VESSEL_STENCIL, 0); assert.equal((1 | 2) & VESSEL_STENCIL, 0);
});

test('two pieces of one vein are a run-on, not a join: the band runs straight through the piece joint, and a real branch there still sets the fade', () => {
  const by = (id: string) => NETWORK.find((v) => v.id === id)!;
  for (const v of NETWORK) if (!v.feeder) for (const end of [0, 1] as const) for (const o of neighboursAt(v, end)) assert.notEqual(partOf(o.id), partOf(v.id), `${v.id} end ${end} counts ${o.id}`);
  const a = by('PV_TRUNK_1'), b = by('PV_TRUNK');
  if (a && b) {
    const shared = [0, 1].map((e) => e as 0 | 1).find((e) => neighboursAt(a, e).length === 0 || neighboursAt(a, e).some((o) => o.id !== b.id));
    assert.ok(shared !== undefined);
  }
});
