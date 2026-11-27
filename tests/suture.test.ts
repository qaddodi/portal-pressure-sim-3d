// The stitches at a WELDED shunt end (vessels/suture.ts). ROOT CAUSE of their absence: the tube paints its own stitches within about 40 figure units of its end, and where a junction skin welds the end the tube is cut at the seam ring and that
// stretch is not drawn; the skin's shader (shared by every junction) has no marks. The suture is an object of its own, laid on the arm's front wall at its seam ring, drawn by the tube's own `seamStitch`.
// Node only: the shaders are read as text and parsed, the numbers are the CPU twins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DataTexture, FloatType, Group, RGBAFormat, type Vector2 } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { SutureSet, SUTURE_FS, SUTURE_VS, isSewn, seamReach } from '../src/scene/vessels/suture.ts';
import { SEWN_IDS, seamsFor, seamAtA } from '../src/scene/vessels/seams.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { PROCEDURE_MARKS_GLSL, SEAM_STITCH_GLSL, SWELL_OF_GLSL } from '../src/scene/vessels/glsl-shared.ts';
import { BACK_EDGES } from '../src/scene/vessels/paths.copied.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { armTube } from '../src/scene/vessels/skin/braid-arm.ts';
import { seamState } from '../src/scene/vessels/shape.ts';
import { buildTubes, TUBE_RADIAL } from '../src/scene/vessels/tubes.ts';
import { widthSwell } from '../src/scene/vessels/live-width.ts';
import { ringOf } from '../src/scene/vessels/skin/skin-set.ts';

setSmoothJoins(true);
const scene = new CelScene(), parent = new Group();
const set = new SkinSet({
  vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
  make: (mesh) => ({ node: mesh.junction.node, mesh, object: new Group(), setArm() {}, setArc() {}, setPres() {}, setArmCopy() {}, setTransparent() {}, dispose() {} }),
  add: (o) => parent.add(o), remove: (o) => parent.remove(o), warn: () => {},
});
set.build(2);
const meshes = new Group();
let side = false;
const sut = new SutureSet({ add: (o) => meshes.add(o), remove: (o) => meshes.remove(o), side: () => side });
sut.sync(set);

/** The ends a skin welds that the tube stitches: the objects there must be. */
const expected: string[] = [];
for (const id of SEWN_IDS) for (const e of [0, 1] as const) if (set.endsOf(id)[e] && (seamsFor(id, false)[e] || seamsFor(id, true)[e])) expected.push(`${id}:${e}`);

test('the figure has welded sewn ends, and exactly one suture stands at each, none anywhere else', () => {
  assert.ok(expected.length >= 4, `welded sewn ends: ${expected.join(' ')}`);
  assert.deepEqual(sut.all().map((o) => `${o.vesselId}:${o.end}`).sort(), [...expected].sort());
  for (const k of expected) assert.equal(sut.all().filter((o) => `${o.vesselId}:${o.end}` === k).length, 1, `${k}: one`);
  // (no object at an end the tube still draws: a skin that dropped the shunt's end, an end that is no skin's)
  for (const id of SEWN_IDS) for (const e of [0, 1] as const) if (!set.endsOf(id)[e]) assert.equal(sut.of(id, e), undefined, `${id}:${e} is the tube's own`);
  assert.equal(meshes.children.length, expected.length, 'each one is in the scene');
});

test('the stitches lie wholly in the stretch the skin cut away (the root cause), so the tube draws none of them there', () => {
  for (const s of set.seamsOf(new Set(SEWN_IDS))) {
    const curve = seamsFor(s.vesselId, false)[s.end] ?? seamsFor(s.vesselId, true)[s.end];
    if (!curve) continue;
    let a0 = Infinity, a1 = -Infinity;
    for (let i = 0; i <= 40; i++) { const d = seamAtA(curve, -1 + i / 20); a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
    const cut = s.obj.skinCut(), len = s.obj.toon.uniforms.len!.value as number, ringAt = (s.end === 0 ? cut[0] : 1 - cut[1]) * len * 300;
    assert.ok(a1 + 0.8 < ringAt, `${s.vesselId}:${s.end}: the seam (to ${(a1 + 0.8).toFixed(1)} units in) is inside the cut part (the ring is ${ringAt.toFixed(1)} in)`);
    assert.ok(a0 > 0);
  }
});

test('each suture is centred on its seam ring (within 1e-4), heading away from the node, with the ring\'s radius', () => {
  for (const o of sut.all()) {
    const s = set.seamsOf(new Set([o.vesselId])).find((x) => x.end === o.end)!;
    const def = NETWORK_BY_ID.get(o.vesselId)!, at = armTube(def, seamState(undefined)), g = buildTubes(at.courses, at.tubular, def.radius).geometry;
    const cut = set.skinOf(s.node)!.cuts.find((c) => c.vesselId === o.vesselId && c.end === o.end)!;
    const ring = ringOf(g, cut.ring, def.radius);
    const c = [0, 0, 0];
    for (let j = 0; j < TUBE_RADIAL; j++) for (let k = 0; k < 3; k++) c[k]! += ring.pos[j * 3 + k]! / TUBE_RADIAL;
    const p = o.centre();
    assert.ok(Math.hypot(p[0] - c[0]!, p[1] - c[1]!, p[2] - c[2]!) < 1e-4, `${o.vesselId}:${o.end} centre`);
    const h = o.heading();
    assert.ok(Math.abs(Math.hypot(...h) - 1) < 1e-9, 'unit heading');
    // (the heading runs into the tube: toward the tube's interior, away from the skin's node)
    const inner = g.getAttribute('position'), K = Math.round(inner.count / (TUBE_RADIAL + 1)) - 1, far = (cut.ring + (o.end === 1 ? -1 : 1) * Math.min(3, K)) * (TUBE_RADIAL + 1);
    const dx = inner.getX(far) - c[0]!, dy = inner.getY(far) - c[1]!, dz = inner.getZ(far) - c[2]!;
    assert.ok(dx * h[0] + dy * h[1] + dz * h[2] > 0, `${o.vesselId}:${o.end} heads into the tube`);
    const meanR = ring.rest.reduce((t, r) => t + r, 0) / TUBE_RADIAL;
    assert.ok(Math.abs(o.restRadius() - meanR) < 0.03 * meanR, `${o.vesselId}:${o.end} ring radius ${o.restRadius()} against the tube's ${meanR}`);
  }
});

let checked = 0;
test('the line is as long as the arm is wide now: its half length is the ring\'s radius times the live swell at 0.5, 1 and 1.5', () => {
  for (const o of sut.all()) {
    const u = o.armObject.toon.uniforms, idx = u.vindex!.value as number, kind = u.widthKind!.value as 0 | 1 | 2, base = u.baseD!.value as number;
    // (the scene's data texture is a 1 x 1 stand-in under node: a real one, wide enough for the vessel's texel, is laid in for the test)
    const wasTex = u.vdata!.value, wasSize = (u.vdataSize!.value as Vector2).clone(), W = 128;
    const tex = new DataTexture(new Float32Array(W * 4), W, 1, RGBAFormat, FloatType), off = (idx % W) * 4 + 2, was = 0, wasUse = u.useData!.value;
    u.vdata!.value = tex; (u.vdataSize!.value as Vector2).set(W, 1);
    u.useData!.value = 1;
    try {
      for (const want of [0.5, 1, 1.5]) {
        // the diameter that gives this swell (the swell grows with it: bisection)
        let lo = 0.1, hi = 80;
        for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (widthSwell(kind, base, mid) < want) lo = mid; else hi = mid; }
        const d = (lo + hi) / 2, got = widthSwell(kind, base, d);
        if (Math.abs(got - want) > 1e-3) continue;   // (a fixed-width vessel: no swell to test)
        (tex.image.data as Float32Array)[off] = d; checked++;
        assert.ok(Math.abs(o.liveHalfLength() - o.restRadius() * want) < 2e-3 * o.restRadius() + 1e-9, `${o.vesselId}:${o.end} at swell ${want}: ${o.liveHalfLength()} against ${o.restRadius() * want}`);
      }
    } finally { u.vdata!.value = wasTex; (u.vdataSize!.value as Vector2).copy(wasSize); u.useData!.value = wasUse; void was; }
  }
  assert.ok(checked >= 3 * sut.all().length, `every end was checked at all three swells (${checked})`);
  assert.match(SUTURE_VS, /float sw = swellOf\(sData\.x, sData\.y, sData\.z\) \* \(1\.0 - clamp\(sData\.w, 0\.0, 0\.97\)\);\s*float R = sRest \* sw;/, 'the vertex stage reads the live width from the data texture');
  assert.match(SUTURE_VS, /R \* \(a \* D \+ sqrt\(max\(0\.0, 1\.0 - a \* a\)\) \* N\)/, 'the ribbon is the half pipe, R across: a line on the front half, never a ring');
  assert.ok(SUTURE_VS.includes(SWELL_OF_GLSL), 'swellOf is the shared one');
});

test('the marks are the tube\'s own rule: one seamStitch in both programs, the thread and halo the tube has', () => {
  assert.ok(VESSEL_FS.includes(SEAM_STITCH_GLSL) && SUTURE_FS.includes(SEAM_STITCH_GLSL), 'the one function in both');
  assert.match(PROCEDURE_MARKS_GLSL, /seamStitch\(A, B, sl, aa, rr, fwAcr\)/, 'the tube calls it');
  assert.match(SUTURE_FS, /seamStitch\(sSeamA, sSeamB, sSeamA\.x \+ vMark\.y/, 'the suture calls it');
  assert.ok(!/floor\(tn \/ B\.w\)/.test(PROCEDURE_MARKS_GLSL), 'no second copy of the dash rule in the tube\'s marks');
  assert.match(PROCEDURE_MARKS_GLSL, /c = mix\(c, THREAD_EDGE, te \* 0\.4\);\s*c = mix\(c, THREAD, tw\);/, 'the tube lays the halo at 0.4 then the thread');
  assert.match(SUTURE_FS, /float te = st\.y \* 0\.4;/, 'the same halo strength');
});

test('one thread profile: the seam stitch and the stump tie are drawn by the same core and edge, as capsules', () => {
  assert.match(SEAM_STITCH_GLSL, /float threadCore\(float d\)/, 'the core is one global function');
  assert.match(SEAM_STITCH_GLSL, /float threadEdge\(float d\)/, 'the edge is one global function');
  assert.match(SEAM_STITCH_GLSL, /return vec2\(threadCore\(dd\) \* dsh, threadEdge\(dd\) \* dsh\)/, 'the stitch uses them');
  assert.match(PROCEDURE_MARKS_GLSL, /tw = max\(tw, threadCore\(dd\)\);\s*te = max\(te, threadEdge\(dd\)\);/, 'the stump tie uses the same ones');
  assert.match(SEAM_STITCH_GLSL, /dd = length\(vec2\(max\(abs\(along\) - halfLen, 0\.0\), dd\)\)/, 'a dash is a capsule, its ends round like the thread');
  assert.ok(!/\bhalf\b/.test(SEAM_STITCH_GLSL.replace(/\/\/.*$/gm, '')), 'no reserved word `half` in GLSL');
});

test('the depth is the tube\'s rule, the pass is the arm\'s front copy, the alpha eases with the shunt and the Circuit', () => {
  assert.match(SUTURE_VS, /mix\(cc\.z \/ cc\.w, c\.z \/ c\.w, 0\.15\)/, 'the axis\' depth and 15 % of the surface\'s (TUBE_DEPTH_SHARE)');
  assert.match(SUTURE_FS, /1\.0 - smoothstep\(0\.0, 0\.05, own\)/, 'it goes with the Circuit\'s change as the skin does: by its seam\'s own share (skin-rank.test.ts)');
  for (const id of SEWN_IDS) assert.ok(!BACK_EDGES.has(id), `${id} is drawn in front: the one copy`);
  for (const o of sut.all()) { assert.equal(o.mesh.layers.mask, 2, 'the vessels\' pass (layer 1)') }
});

test('alpha is the tube\'s fade times the shunt\'s presence times the weld; with the shunt off no suture is drawn', () => {
  const live = sut.all();
  assert.ok(live.length > 0);
  for (const o of live) {
    const obj = o.armObject, was = obj.group.visible;
    obj.group.visible = false;
    set.sync(); sut.sync(set);
    assert.ok(!o.mesh.visible && o.alphaNow() === 0, `${o.vesselId}:${o.end}: shunt off, no suture drawn`);
    obj.group.visible = was;
    set.sync(); sut.sync(set);
  }
  // (a skin that is not welded yet hands the end over later: the alpha follows the weld's share, 0 to 1)
  for (const o of sut.all()) {
    const s = set.seamsOf(new Set([o.vesselId])).find((x) => x.end === o.end)!;
    assert.ok(Math.abs(o.alphaNow() - (o.mesh.visible ? s.fade * s.presence * s.weld : 0)) < 1e-6, 'alpha = fade x presence x weld');
  }
});

test('the portocaval shunt\'s start is sewn only when it is side to side: the object is there, drawn with the case', () => {
  const o = sut.of('S_PC', 0);
  if (!set.endsOf('S_PC')[0]) return;
  assert.ok(o, 'the start of S_PC has its object (undrawn end to side)');
  side = false; sut.sync(set); assert.equal(o!.curveNow(), null);
  side = true; sut.sync(set); assert.ok(o!.curveNow());
  side = false; sut.sync(set);
});

test('a skin that goes takes its sutures; the reach covers the curve\'s slant', () => {
  for (const id of SEWN_IDS) assert.ok(isSewn(id));
  for (const id of SEWN_IDS) for (const c of seamsFor(id, true)) if (c) { const r = seamReach(c); assert.ok(r.slant >= 0 && r.reach > 0 && Number.isFinite(r.der)); }
  const own = new SutureSet({ add: (o) => meshes.add(o), remove: (o) => meshes.remove(o), side: () => false });
  const before = meshes.children.length;
  own.sync(set); assert.equal(meshes.children.length, before + expected.length);
  own.sync(null); assert.equal(meshes.children.length, before, 'no skins: no sutures');
});

test('the shaders parse as GLSL', async () => {
  let parse: ((s: string) => unknown) | null = null;
  const name = '@shaderfrog/glsl-parser';
  try { const m = await import(name); parse = (s) => m.parser.parse(s, { quiet: true }); } catch { /* not installed */ }
  if (!parse) return;
  parse(SUTURE_VS); parse(SUTURE_FS);
});
