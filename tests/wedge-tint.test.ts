// The HVPG's amber column is a tint on the vessels themselves (20 Nov 2026: "highlight everything beyond the wedge including all branches of the right hepatic vein and fade out with them"): every vessel
// upstream of the balloon in the vein the tip is in, never a separate tube that can leave the vein.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CelScene } from '../src/scene/scene.ts';
import { readFileSync } from 'node:fs';
import { route3d } from '../src/scene/procedures/route3d.ts';
import { centrelineOf } from '../src/scene/vessels/centreline.ts';

// 21 Nov, Mohammad: "the tubes filled, the join did NOT fill, then it filled all of a sudden". Root cause: the amber was computed per tube (a front in each tube's own u, forks on a clock of their own) and the skins carried none, so
// nothing tied one vessel's front to its neighbour's. It is now ONE field: the route distance from the balloon's distal edge, a line d0 + slope u on every tube, blended by the skins from their arms' seams, against ONE front.
import { Vector3 } from 'three';
import { UNITS_PER_SCENE } from '../src/scene/frame2d.ts';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { wedgeCover } from '../src/scene/vessels/wedge-glsl.ts';

const dAt = (p: { d0: number; slope: number }, u: number): number => p.d0 + p.slope * u;

test('the field is zero at the balloon\'s distal edge on the drawn vein, within a shaft width, whichever piece it is on', () => {
  setSmoothJoins(true);
  const sc = new CelScene();
  sc.procs.showHvpgState(1, 1, 'wedge', 0, 1);
  const w = sc.procs.wedgeTint()!, r3 = route3d('hvpg')!, r = r3.route;
  const edgeD = r3.tipD(1) - r3.rc * UNITS_PER_SCENE * 4.2, e = r3.centre(edgeD, new Vector3());
  let checked = 0;
  for (const sub of (r.parts.find((p) => p.name === 'hv')!.subs ?? [])) {
    const p = w.pieces.get(sub.id!);
    if (!p || !(edgeD >= sub.d0 && edgeD <= sub.d1)) continue;
    const u = centrelineOf(sub.id!)!.nearestU([e.x, e.y, e.z]);
    assert.ok(Math.abs(dAt(p, u)) < r3.rc * UNITS_PER_SCENE * 2, `${sub.id}: the field is ${dAt(p, u).toFixed(3)} at the balloon's edge (a shaft is ${(r3.rc * UNITS_PER_SCENE).toFixed(3)})`);
    checked++;
  }
  assert.ok(checked >= 1, 'the piece the balloon is in was checked');
  sc.dispose();
});

test('every vessel of the tree has a line, the forks and the branch thin toward their tips, the cava has none', () => {
  const sc = new CelScene();
  sc.procs.showHvpgState(1, 1, 'wedge', 0, 1);
  const w = sc.procs.wedgeTint()!;
  assert.ok(w.pieces.has('RHV_IVC_1') && (w.pieces.has('POST_R_RHV') || [...w.pieces.keys()].some((k) => k.includes('~F'))));
  for (const [id, p] of w.pieces) {
    assert.ok(p.slope < 0, `${id}: the distance grows toward the outer end`);
    if (id.includes('~F') || id === 'POST_R_RHV') assert.ok(p.fade > 0, `${id} thins toward its tip`);
  }
  assert.ok(!w.pieces.has('IVC_IS'), 'the cava is not tinted');
  sc.procs.showHvpgState(1, 1, 'wedge', 0, 0);
  assert.equal(sc.procs.wedgeTint(), null, 'no column, no tint');
  sc.dispose();
});

test('ONE front: coverage only ever grows as the column fills, is continuous along every vessel and across every seam, and a full column covers every tip', () => {
  setSmoothJoins(true);
  const sc = new CelScene();
  const cols = Array.from({ length: 81 }, (_, i) => 0.02 + i * 0.0122);
  let was: Map<string, number[]> | null = null, wasFront = -Infinity;
  const firstHalf = new Map<string, { d: number; col: number }>();
  for (const col of cols) {
    sc.procs.showHvpgState(1, 1, 'wedge', 0, col);
    const w = sc.procs.wedgeTint()!;
    assert.ok(w.front >= wasFront - 1e-9, `the front never goes back: ${col}`); wasFront = w.front;
    const now = new Map<string, number[]>();
    for (const [id, p] of w.pieces) {
      // (sampled every sixth of the softer edge along the vessel: the cover never steps between neighbours)
      const nS = Math.max(8, Math.ceil(Math.abs(p.slope) / (Math.min(w.behind, w.frontSoft) / 6)));
      const cov = Array.from({ length: nS + 1 }, (_, k) => wedgeCover(dAt(p, k / nS), w.behind, w.front, w.frontSoft));
      for (let k = 1; k < cov.length; k++) assert.ok(Math.abs(cov[k]! - cov[k - 1]!) < 0.3, `${id}: a step along the vessel at ${col}`);
      for (let k = 0; k < cov.length; k++) { const d = dAt(p, k / nS); if (d > 0 && cov[k]! > 0.5 && !firstHalf.has(`${id}@${nS}@${k}`)) firstHalf.set(`${id}@${nS}@${k}`, { d, col }); }
      const before = was?.get(id);
      if (before) cov.forEach((c, k) => assert.ok(c >= before[k]! - 1e-9, `${id}@${k}: coverage went back as the column filled (${before[k]} to ${c})`));
      now.set(id, cov);
    }
    was = now;
    if (col > 0.999) for (const [id, cov] of now) for (const [k, c] of cov.entries()) if (dAt(w.pieces.get(id)!, k / (cov.length - 1)) > 0) assert.ok(c > 0.999, `${id}: a full column covers it to its tip`);
  }
  // ONE front: the column reaches a point the sooner the nearer it is to the balloon, on every vessel of the tree alike (no vessel runs ahead of or behind the rest)
  const order = [...firstHalf.values()].sort((a, b) => a.d - b.d);
  for (let i = 1; i < order.length; i++) assert.ok(order[i]!.col >= order[i - 1]!.col - 1e-9, `a point ${order[i]!.d.toFixed(2)} from the balloon was covered (col ${order[i]!.col.toFixed(3)}) before a nearer one (${order[i - 1]!.d.toFixed(2)}, col ${order[i - 1]!.col.toFixed(3)})`);
  assert.ok(order.length > 20);
  // the seam: a child begins where its parent's line says (one number across it, so the same coverage on both sides at every time)
  sc.procs.showHvpgState(1, 1, 'wedge', 0, 1);
  const w = sc.procs.wedgeTint()!, r = route3d('hvpg')!.route, hv = r.parts.find((p) => p.name === 'hv')!;
  for (const sub of hv.subs ?? []) {
    const parent = sub.id ? w.pieces.get(sub.id) : undefined; if (!parent) continue;
    for (const [id, p] of w.pieces) if (id.startsWith(`${sub.id}~F`)) assert.ok(Math.abs(dAt(parent, 0) - dAt(p, 1)) < 1e-9, `${id} starts where ${sub.id} ends`);
  }
  sc.dispose();
});

test('the tube and the skin shaders read the same field and the same cover function', () => {
  const sh = readFileSync(new URL('../src/scene/vessels/shaders.ts', import.meta.url), 'utf8');
  const sk = readFileSync(new URL('../src/scene/vessels/skin/shaders.ts', import.meta.url), 'utf8');
  assert.match(sh, /wedge\.x \* wedgeCover\(wedgeD\.x \+ wedgeD\.y \* vUv\.x, vec3\(wedge\.y, wedgeD\.z, wedgeD\.w\)\)/);
  assert.match(sk, /wedgeS\.x \* clamp\(pwS, 0\.0, 1\.0\) \* wedgeCover\(dwS \/ pwS, vec3\(wedgeS\.y, wedgeS\.z, wedgeS\.w\)\)/);
  assert.doesNotMatch(sh, /wedgeB/, 'no per-tube cut and front any more');
  const pc = readFileSync(new URL('../src/scene/devices/catheters/proc-catheter.ts', import.meta.url), 'utf8');
  const m = pc.match(/this\.balloon\.setAlphas\((\d*\.?\d+) \*/);
  assert.ok(m && Number(m[1]) >= 0.35, `the balloon's body alpha is ${m?.[1]}: solid enough to see`);
});

test('the balloon is glass with streaks of light and nothing solid in it: no collars, no ink round the glints', () => {
  const src = readFileSync(new URL('../src/scene/devices/catheters/proc-catheter.ts', import.meta.url), 'utf8');
  assert.match(src, /this\.balloonBands = \[\];/, 'no marker bands or collars inside the glass');
  assert.match(src, /mk\(g, 'graft', 9, 'none'/, 'the glints have no outline (it read as a dark bar through the balloon)');
  assert.match(src, /0\.95 \}, \{ phi: -0\.5/, 'a bright, soft specular streak');
});

// 21 Nov, Mohammad: "the balloon still has shit in it, it's not glossy". The shaft inside the glass is left clear (a ghost of it), by one shared hole in the device's alpha (fill and outline alike), and the glass has a
// bright soft specular and a fresnel sheen.
test('the shaft inside the balloon is cleared and the glass is glossy', () => {
  const dev = readFileSync(new URL('../src/scene/devices/device-object.ts', import.meta.url), 'utf8');
  const pc = readFileSync(new URL('../src/scene/devices/catheters/proc-catheter.ts', import.meta.url), 'utf8');
  assert.match(dev, /uniform vec4 holeU;/);
  assert.match(dev, /holeU\.z \* smoothstep\(holeU\.x - w, holeU\.x, u\)/, 'one hole for the fill and the outline (tailK is in both)');
  assert.match(dev, /gSp \* 0\.9 \+ gSh \* 0\.3/, 'a specular and a fresnel sheen on the glass');
  assert.match(pc, /this\.shaft\.setHole\(\(ol\.dC - half\)/, 'the hole is the balloon\'s own span');
  assert.match(pc, /else this\.shaft\.setHole\(0, 0, 0\)/, 'and gone with it');
});
