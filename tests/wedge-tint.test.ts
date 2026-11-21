// The HVPG's amber column is a tint on the vessels themselves (20 Nov 2026: "highlight everything beyond the wedge including all branches of the right hepatic vein and fade out with them"): every vessel
// upstream of the balloon in the vein the tip is in, never a separate tube that can leave the vein.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CelScene } from '../src/scene/scene.ts';

test('wedged: the vein beyond the tip and its branches are tinted, the stretch behind the balloon is not', () => {
  const sc = new CelScene();
  sc.procs.showHvpgState(1, 1, 'wedge', 0, 1);
  const w = sc.procs.wedgeTint()!;
  assert.ok(w && w.amount > 0.99);
  assert.ok(w.pieces.has('RHV_IVC_1'), 'the outer piece of the right hepatic vein');
  const outer = w.pieces.get('RHV_IVC_1')!;
  assert.ok(outer.cut > 0.3 && outer.cut < 0.9, `the tint stops at the balloon, ${outer.cut}`);
  assert.ok(w.pieces.has('POST_R_RHV') || [...w.pieces.keys()].some((k) => k.includes('~F')), 'the branches are tinted too');
  for (const [id, p] of w.pieces) if (id.includes('~F') || id === 'POST_R_RHV') assert.ok(p.fade > 0, `${id} thins toward its tip`);
  assert.ok(!w.pieces.has('IVC_IS'), 'the cava is not tinted');
  sc.procs.showHvpgState(1, 1, 'wedge', 0, 0);
  assert.equal(sc.procs.wedgeTint(), null, 'no column, no tint');
  sc.dispose();
});

// 20 Nov, Mohammad: "the yellow/orange highlighting should start basically from the balloon edge and move forward into the hepatic vein and branches to cover it"; "make the HVPG balloon less transparent".
import { readFileSync } from 'node:fs';
import { route3d } from '../src/scene/procedures/route3d.ts';
import { centrelineOf } from '../src/scene/vessels/centreline.ts';

test('the tint is whole at the balloon\'s distal edge (no untinted gap, no 8% ramp) and its front travels forward as the column fills', () => {
  const sc = new CelScene();
  const r3 = route3d('hvpg')!, sub = (r3.route.parts.find((p) => p.name === 'hv') as unknown as { subs: { id: string; d0: number; d1: number; fa: number; fb: number }[] }).subs.find((q) => q.id === 'RHV_IVC_1')!;
  // (the balloon edge's place on the vein AS DRAWN, by projection on its drawn centreline: the shader's u is the drawn tube's own length, not the 2D course's share)
  const edgeD = r3.tipD(1) - r3.rc * 300 * 4.2, ce = r3.centre(edgeD), edgeU = centrelineOf('RHV_IVC_1')!.nearestU([ce.x, ce.y, ce.z]);
  const at = (col: number) => { sc.procs.showHvpgState(1, 1, 'wedge', 0, col); return sc.procs.wedgeTint()?.pieces.get('RHV_IVC_1'); };
  const full = at(1)!;
  assert.ok(Math.abs(full.cut - edgeU) < 2e-3, `the tint's cut is the balloon's distal edge: ${full.cut} against ${edgeU}`);
  assert.ok(full.edge < 0.08 && full.edge > 0.005, `it ends softly over a few shaft radii, never a hard step and never 0.08 of the course: ${full.edge}`);
  assert.ok(full.front <= 0.0001, 'a full column covers the vein to its outer end');
  // the column filling: the front starts at the balloon and only ever moves forward (u falls toward the outer end), one eased number
  let was = Infinity;
  for (const col of [0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1]) {
    const p = at(col);
    const f = p ? p.front : Infinity;   // (not reached yet: no piece, as far back as it can be)
    assert.ok(f <= was + 1e-9, `the front never goes back: ${col} -> ${f}`);
    was = f;
  }
  const mid = at(0.2)!;
  assert.ok(mid && mid.front > 0.02 && mid.front < edgeU, `part of the way along the vein, ${mid?.front}`);
  const early = sc.procs.wedgeTint()!; sc.procs.showHvpgState(1, 1, 'wedge', 0, 0.1);
  assert.ok(sc.procs.wedgeTint()!.pieces.get('POST_R_RHV') === undefined, 'the branches wait for the front to reach them');
  void early;
  sc.procs.showHvpgState(1, 1, 'wedge', 0, 1);
  assert.ok(sc.procs.wedgeTint()!.pieces.get('POST_R_RHV')!.front <= 0.0001, 'and a full column covers them');
  sc.dispose();
});

test('the shader tints from the cut forward as far as the front has come; the balloon is a body that reads against the vein', () => {
  const sh = readFileSync(new URL('../src/scene/vessels/shaders.ts', import.meta.url), 'utf8');
  assert.match(sh, /wedge\.x \* \(1\.0 - smoothstep\(wedge\.y, wedge\.y \+ max\(wedgeB\.x, 0\.001\), vUv\.x\)\) \* smoothstep\(wedgeB\.y - max\(wedgeB\.z, 0\.001\), wedgeB\.y, vUv\.x\)/);
  assert.doesNotMatch(sh, /wedge\.y - 0\.08/, 'no 8% ramp that left a gap before the amber');
  const pc = readFileSync(new URL('../src/scene/devices/catheters/proc-catheter.ts', import.meta.url), 'utf8');
  const m = pc.match(/this\.balloon\.setAlphas\((\d*\.?\d+) \*/);
  assert.ok(m && Number(m[1]) >= 0.35, `the balloon's body alpha is ${m?.[1]}: solid enough to see`);
});

// 21 Nov, Mohammad: "the yellow/orange is not what we agreed upon" (a hard band well upstream of the balloon, plain vein between them). Root cause: the shader's u is the DRAWN tube's length share, and the tint's cut was the route's
// linear share of the 2D course (fa to fb): on the right hepatic vein 0.65 where the balloon's edge really is at 0.755, a tenth of the vein away.
import { Vector3 } from 'three';
import { UNITS_PER_SCENE } from '../src/scene/frame2d.ts';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';

test('the tint\'s cut is where the balloon\'s distal edge stands on the drawn vein, within a shaft width, whichever piece it is on', () => {
  setSmoothJoins(true);
  const sc = new CelScene();
  sc.procs.showHvpgState(1, 1, 'wedge', 0, 1);
  const w = sc.procs.wedgeTint()!, r3 = route3d('hvpg')!, r = r3.route;
  const edgeD = r3.tipD(1) - r3.rc * UNITS_PER_SCENE * 4.2;
  let checked = 0;
  for (const sub of (r.parts.find((p) => p.name === 'hv')!.subs ?? [])) {
    const p = w.pieces.get(sub.id!);
    if (!p || p.cut >= 2 || !(edgeD >= sub.d0 && edgeD <= sub.d1)) continue;
    const c = centrelineOf(sub.id!)!, at = c.pointAt(p.cut), e = r3.centre(edgeD, new Vector3());
    const dist = Math.hypot(at[0] - e.x, at[1] - e.y, at[2] - e.z);
    assert.ok(dist < r3.rc * 2, `${sub.id}: the tint's edge is ${dist.toFixed(4)} from the balloon's edge (the shaft is ${r3.rc.toFixed(4)})`);
    checked++;
  }
  assert.ok(checked >= 1, 'the piece the balloon is in was checked');
  sc.dispose();
});

test('the balloon is glass with streaks of light and nothing solid in it: no collars, no ink round the glints', () => {
  const src = readFileSync(new URL('../src/scene/devices/catheters/proc-catheter.ts', import.meta.url), 'utf8');
  assert.match(src, /this\.balloonBands = \[\];/, 'no marker bands or collars inside the glass');
  assert.match(src, /mk\(g, 'graft', 9, 'none'/, 'the glints have no outline (it read as a dark bar through the balloon)');
  assert.match(src, /0\.95 \}, \{ phi: -0\.5/, 'a bright, soft specular streak');
});
