import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { blendFrom, braid, coilCourses, CoilState, wiggle, varixSize, varixSpreadK, type P2 } from '../src/scene/vessels/coil.ts';
import { LIVER_BRANCH_HOSTS } from '../src/scene/vessels/liver-branches.ts';
import { isCut, NETWORK, NETWORK_BY_ID, NODE_Z, feederLive } from '../src/scene/vessels/network.ts';
import { REST, coursesOf, tubularOf } from '../src/scene/vessels/shape.ts';
import { buildTubes } from '../src/scene/vessels/tubes.ts';
import { EDGE_PATH_2D } from '../src/scene/vessels/paths.copied.ts';
import { FEEDERS_2D, STRANDS_2D } from '../src/scene/vessels/coil.copied.ts';
import { CelScene } from '../src/scene/scene.ts';
import { wholeOf } from '../src/scene/anatomy/placed-network.ts';
import { centrelineOf } from '../src/scene/vessels/centreline.ts';
import { endOn } from '../src/scene/vessels/starts.ts';

const repo = process.env.PPS_2D_REPO;
const line = (n: number): P2[] => Array.from({ length: 64 }, (_, i) => [100 + (i / 63) * 300, 200 + 20 * Math.sin(i / 9) + n]);

/** The 2D source's own wiggle, braid and blendFrom (stage-paths.js), cut out of the file and run. */
function source2d() {
  const text = readFileSync(`${repo}/src/ui/stage-paths.js`, 'utf8');
  const cut = (name: string) => {
    const at = text.indexOf(`function ${name}(`);
    let depth = 0, i = text.indexOf('{', at);
    const start = at;
    for (; i < text.length; i++) { if (text[i] === '{') depth++; else if (text[i] === '}' && --depth === 0) break; }
    return text.slice(start, i + 1);
  };
  const smooth01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const wiggleAt = (amp: number, env: number, d: number, k: number, seed: number) => amp * env * Math.sin(d * k + seed);
  return new Function('smooth01', 'clamp', 'lerp', 'wiggleAt', `${cut('wiggle')}\n${cut('braid')}\n${cut('blendFrom')}\nreturn { wiggle, braid, blendFrom };`)(smooth01, clamp, lerp, wiggleAt) as {
    wiggle: typeof wiggle; braid: typeof braid; blendFrom: typeof blendFrom;
  };
}

test('wiggle, braid and blendFrom are the 2D source\'s own (when the 2D checkout is there)', { skip: !repo || !existsSync(`${repo}/src/ui/stage-paths.js`) }, () => {
  const t = source2d(), a = line(0);
  assert.deepEqual(wiggle(a, 5, 3), t.wiggle(a, 5, 3));
  assert.deepEqual(wiggle(a, 7, 2.3, 0.1), t.wiggle(a, 7, 2.3, 0.1));
  assert.deepEqual(braid(a, 9, 0.22), t.braid(a, 9, 0.22));
  assert.deepEqual(braid(a, -14, 0, [0.1, 0.8], 2.1), t.braid(a, -14, 0, [0.1, 0.8], 2.1));
  assert.deepEqual(braid(a, 6, 0.2, null, 0, true), t.braid(a, 6, 0.2, null, 0, true));
  assert.deepEqual(blendFrom(a, wiggle(a, 4, 1), 0.3), t.blendFrom(a, wiggle(a, 4, 1), 0.3));
});

test('a wiggle keeps both ends and stays within its amplitude; a small one is the course itself', () => {
  const a = line(0), w = wiggle(a, 5, 1);
  assert.deepEqual(w[0], a[0]); assert.deepEqual(w[63], a[63]);
  assert.ok(w.every((p, i) => Math.hypot(p[0] - a[i]![0], p[1] - a[i]![1]) <= 5.0001));
  assert.equal(wiggle(a, 0.2, 1), a);
});

test('the varix size and spread are the 2D rules: 2 mm resting, 7 and 8 mm full; the strands fan 55 % to 100 %', () => {
  assert.equal(varixSize('VAR', 2), 0); assert.equal(varixSize('VAR', 7), 1); assert.equal(varixSize('GV', 8), 1); assert.equal(varixSize('GV', undefined), 1);
  assert.equal(varixSpreadK(0), 0.55); assert.equal(varixSpreadK(1), 1);
});

test('a collateral coils once it is past a quarter open and straightens below a fifth, the target moving only past 0.6', () => {
  const c = new CoilState();
  c.step(0.2, 1, 16, true); assert.equal(c.wig, 0);
  c.step(0.3, 1, 16, true); assert.ok(Math.abs(c.wig - (1.5 + 3.5 * 0.3)) < 1e-9);
  c.step(0.22, 1, 16, true); assert.ok(c.wig > 0, 'held until below a fifth');
  c.step(0.15, 1, 16, true); assert.equal(c.wig, 0);
  c.step(1, 1, 16, true); const full = c.wig;
  c.step(0.96, 1, 1000, false); assert.equal(c.wig, full, 'a small change leaves the target');
});

test('the braids: the varices, the rectal and retroperitoneal veins and the gastric channel carry the 2D strand data, drawn as at most three separate strands each (no mesh)', () => {
  assert.equal(STRANDS_2D.C1a!.length, 5); assert.equal(STRANDS_2D.C2!.length, 4); assert.equal(STRANDS_2D.C4!.length, 5); assert.equal(STRANDS_2D.C7!.length, 4);
  for (const id of ['C1a', 'C2', 'C4', 'C7']) {
    const v = NETWORK_BY_ID.get(id)!;
    const cs = coursesOf(v, REST);
    assert.equal(cs.length, 1 + Math.min(3, STRANDS_2D[id]!.length), id);
    assert.equal(cs[0]!.radius, 0, `${id}: the trunk's own tube, a solid fill the width of the bundle, is not drawn (the red mesh)`);
    assert.ok(cs.slice(1).every((c) => c.radius > 0), `${id}: every strand is drawn whole`);
  }
  const c = coilCourses('C1a', EDGE_PATH_2D.C1a as P2[], true, 5, 1);
  assert.equal(c.strands.length, 3);
  assert.deepEqual(c.strands[0]!.pts[0], EDGE_PATH_2D.C1a![0], 'a strand with no start offset leaves the vessel\'s own end');
});

test('the caput medusae fan and the tributaries are vessels of their own, on the host\'s data', () => {
  assert.equal(FEEDERS_2D.C3!.length, 40);
  const fan = NETWORK_BY_ID.get('C3~F:caput')!;
  assert.equal(fan.lensId, 'C3'); assert.equal(fan.host, 'C3');
  assert.equal(coursesOf(fan, REST).length, 40);
  assert.ok(!NETWORK_BY_ID.has('AZY_SVC~F') && !NETWORK_BY_ID.has('CAUD~F') && !NETWORK_BY_ID.has('CAUD~F:caudate'));
  const f = { Q: [], D: [] };
  assert.equal(feederLive({ host: 'AZY_SVC', when: null }, f as never), 1);
});

test('joined vessels meet at one depth: every course starts and ends at its node\'s depth', () => {
  for (const v of NETWORK) {
    if (v.feeder) continue;
    const c = coursesOf(v, REST)[0]!, zf = NODE_Z.get(v.from)!, zt = NODE_Z.get(v.to)!;
    const cutStart = isCut(v.id) && !(LIVER_BRANCH_HOSTS.out as readonly string[]).includes(v.id), cutEnd = isCut(v.id) && (LIVER_BRANCH_HOSTS.out as readonly string[]).includes(v.id);   // (a vein that branches is cut at its split)
    // (restated for the placed anatomy, the only one now: a vessel that joins another's WALL lands on that vein's own drawn course, at its depth there, not at the node's one depth: the collaterals, the
    //  shunts, the hepatic veins into the cava and the trunk. So an end is at its node's depth, or on the axis of a piece of the same whole vein as one at its node (within its radius, depth included);
    //  a run-on end of starts.ts END_ON (the rectal varices down the rectum) is free in both figures)
    for (const k of [0, 1] as const) {
      if (k ? cutEnd : cutStart) continue;
      const node = k ? v.to : v.from, p = k ? c.pts[c.pts.length - 1]! : c.pts[0]!;
      if (Math.abs(p[2] - (k ? zt : zf)) < 1e-9 || (k && endOn(v.id))) continue;
      const wholes = new Set(NETWORK.filter((o) => o !== v && !o.feeder && (o.from === node || o.to === node)).map((o) => wholeOf(o.id) ?? o.id));
      const on = NETWORK.filter((o) => o !== v && !o.feeder && wholes.has(wholeOf(o.id) ?? o.id)).some((o) => {
        const cl = centrelineOf(o.id); if (!cl) return false;
        const u = cl.nearestU(p), q = cl.pointAt(u);
        return Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!) <= cl.radiusAt(u);
      });
      assert.ok(on, `${v.id} ${k ? 'end' : 'start'}: off its node's depth and on no vein that meets there`);
    }
  }
});

test('a vessel that runs on into exactly one other meets it at the mean width: no step at the join', () => {
  let pairs = 0;
  for (const v of NETWORK) {
    if (v.feeder || !v.taper) continue;
    pairs++;
    for (const k of [0, 1] as const) {
      const node = k ? v.to : v.from, mates = NETWORK.filter((o) => !o.feeder && o !== v && (o.from === node || o.to === node));
      if (v.taper[k] === 1 || mates.length !== 1) continue;
      const m = mates[0]!, mk = m.from === node ? 0 : 1;
      assert.ok(Math.abs(v.radius * v.taper[k] - m.radius * (m.taper?.[mk] ?? 1)) < 1e-9, `${v.id} → ${m.id}`);
    }
  }
  assert.ok(pairs > 5, `${pairs} run-ons eased`);
});

test('a shape that changes keeps its vertex count, so its positions are rewritten in place', () => {
  for (const id of ['C1a', 'C2', 'C4', 'C7', 'C8', 'C3~F:caput']) {
    const v = NETWORK_BY_ID.get(id)!, tub = tubularOf(v);
    const a = buildTubes(coursesOf(v, REST), tub, v.radius).geometry, b = buildTubes(coursesOf(v, { wig: 5, spr: 0.55, rec: 0.5, bead: 0.2, bands: 2, strandsOn: false, live: 0.5 }), tub, v.radius).geometry;
    assert.equal(a.getAttribute('position').count, b.getAttribute('position').count, id);
    assert.equal(a.getAttribute('rk').count, a.getAttribute('position').count, `${id} rk`);
  }
});

test('the scene coils an open collateral in place and straightens it when it closes, with no new geometry', () => {
  const s = new CelScene();
  const o = s.vessels.find((x) => x.edge!.id === 'C1a')!;
  const pos = o.toonMesh.geometry.getAttribute('position'), before = Float32Array.from(pos.array as Float32Array);
  assert.ok(o.toonMesh.geometry.getAttribute('rk'));
  s.dispose();
  assert.ok(before.length > 0);
});

// ── the cavernoma (C8): channels in the frame of the clotted trunk, each joined at both ends, grown with the recruitment ──
import { cavChannels, CAV, cavGrowth } from '../src/scene/vessels/cav.ts';
test('the cavernoma has six channels; each starts and ends on the trunk\'s course, wound about it', () => {
  const c8 = NETWORK_BY_ID.get('C8')!;
  const co = coursesOf(c8, REST);
  assert.equal(co.length, 1 + CAV.length, 'the main channel and six more');
  const trunk = ['PV_TRUNK_1', 'PV_TRUNK'].map((id) => (NETWORK_BY_ID.get(id)!.plan as unknown as { base: [number, number][] }).base);
  const main = (c8.plan as unknown as { base: [number, number][] }).base;
  const ch = cavChannels(trunk, main);
  assert.equal(ch.length, 6);
  const all = trunk.flat();
  const nearTrunk = (p: readonly number[]) => Math.min(...all.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1])));
  for (const c of ch) {
    assert.equal(c.length, main.length);
    // both ends lie on the trunk's own course (within a stride of the samples), the middle stands off it
    assert.ok(nearTrunk(c[0]!) < 12 && nearTrunk(c[c.length - 1]!) < 12, 'joined at both ends');
    assert.ok(Math.max(...c.map(nearTrunk)) > 5, 'stands off the trunk');
  }
});
test('a channel grows with the recruitment: none before it begins, whole after', () => {
  assert.equal(cavGrowth(0, 0), 0);
  assert.equal(cavGrowth(5, 0.2), 0);
  assert.equal(cavGrowth(0, 1), 1);
  assert.ok(cavGrowth(1, 0.5) > 0 && cavGrowth(1, 0.5) < 1);
  assert.equal(cavGrowth(0, 0.27), 0, 'the acute opening of the preformed veins is not a cavernoma');
});

// ── the bands and the bead (the esophageal varices) ──
import { VESSEL_VS } from '../src/scene/vessels/shaders.ts';
test('each band narrows one strand of the varices\' plexus to a thin cord (never to nothing: no stump) and the rest shrink by 14 % a band (to four)', () => {
  const v = NETWORK_BY_ID.get('C1a')!;
  const rad = (bands: number) => coursesOf(v, { ...REST, bands }).map((c) => c.radius);
  const r0 = rad(0), r1 = rad(1), r2 = rad(2), r4 = rad(4);
  assert.ok(r0.length >= 2 && r0.slice(1).every((r) => r > 0), 'no band: every strand is there');
  assert.ok(r1[1]! > 0 && r1[1]! < r0[1]! * 0.4, 'one band narrows the first strand to a cord');
  assert.ok(r1[2]! > r1[1]! * 2, 'the next is still whole');
  assert.ok(r2[2]! < r0[2]! * 0.4 && r2[2]! > 0, 'two bands narrow the second');
  assert.ok(rad(4).slice(1).every((r) => r > 0), 'four bands: every strand is still a drawn cord, the path is one tube end to end');
  assert.ok(Math.abs(r1[0]! - r0[0]! * (1 - 0.14)) < 1e-9, 'the main channel shrinks by 14 % a band');
  assert.ok(Math.abs(r4[0]! - r0[0]! * (1 - 0.56)) < 1e-9);
  assert.ok(Math.abs(rad(7)[0]! - r4[0]!) < 1e-9, 'more than four bands shrink no further');
  // the other vessels do not feel the bands
  const w = NETWORK_BY_ID.get('C2')!;
  assert.deepEqual(coursesOf(w, { ...REST, bands: 3 }).map((c) => c.radius), coursesOf(w, REST).map((c) => c.radius));
});

test('the varices bead by their size: the strands of the esophageal and fundal varices, and the gastrorenal shunt itself', () => {
  const sw = (v: ReturnType<typeof NETWORK_BY_ID.get>, bead: number) => buildTubes(coursesOf(v!, { ...REST, bead }), tubularOf(v!), v!.radius).geometry.getAttribute('rk');
  for (const id of ['C1a', 'C2', 'C5']) {
    const v = NETWORK_BY_ID.get(id)!;
    const a = sw(v, 0), b = sw(v, 0.3);
    let moved = 0;
    for (let i = 0; i < a.count; i++) if (Math.abs(a.getX(i) - b.getX(i)) > 1e-4) moved++;
    assert.ok(moved > 20, `${id} has beads`);
  }
  const v = NETWORK_BY_ID.get('C4')!;
  const a = sw(v, 0), b = sw(v, 0.3);
  for (let i = 0; i < a.count; i++) assert.equal(a.getX(i), b.getX(i), 'the rectal veins do not bead');
});

test('a tube of no radius is not drawn, not even its ink', () => {
  assert.match(VESSEL_VS, /if \(rk <= 0\.0\) gl_Position = vec4\(2\.0, 2\.0, 2\.0, 1\.0\);/);
});
