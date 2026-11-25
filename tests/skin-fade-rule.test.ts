// THE JUNCTION FADE RULE reaches every side arm that opens into a receded trunk (23 Nov, Mohammad: the Warren shunt is "an opaque slug with a flat end" in the renal vein, the portocaval and mesocaval shunts "a cap floating in the IVC"). ROOT CAUSE: the rule (the arm's opacity
// eases to its trunk's as the pixel nears the trunk's wall, skin/shaders.ts) was keyed to the hepatic veins only (`opensIntoCava`), so a shunt at alpha 1 met the cava (0.45) or the renal vein (0.55) across the weights' contour, a polygon. skin/fade-rule.ts decides it from the
// junction's structure now. Node only: the real baked skins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateSkins, sd3, type GateSkin } from './skin-gate-lib.ts';
import { ARM_RULE_NONE, ARM_RULE_TRUNK, armRuleOf, isReceded, joinsByRule } from '../src/scene/vessels/skin/fade-rule.ts';
import { CAVA_RECEDE, RECEDE, CAVA_LIKE, opensIntoCava } from '../src/scene/vessels/fades.ts';
import { CAVA_RAMP_R } from '../src/scene/vessels/fade-alpha.ts';
import { findSkinJunctions } from '../src/scene/vessels/skin/inventory.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';

const rampOf = (g: ReturnType<typeof gateSkins>): { name: string; skin: GateSkin }[] => g.skins.flatMap((s) => [{ name: s.node, skin: s }, ...g.partsOf(s.node).map((p) => ({ name: `${s.node}~${p.key}`, skin: p.skin }))]);
const trunkAlpha = (id: string): number => (CAVA_LIKE.has(id) ? CAVA_RECEDE : RECEDE[id] ?? 1);
/** The arm's axis is a polyline of three points and the trunk's wall a curve: where the polyline's last leg runs along the wall the distance may rise by a hair at the joint (C6 at LRV_S, 7e-6 of a unit, 0.0002 of alpha, 0.01 px): not a step anyone can see, and the 0.05 a px bound below still holds. */
const ALPHA_NOISE = 1e-3;
const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

test('the rule marks the hepatic veins (as before) and the collaterals and surgical shunts that open into a receded run; stents, branches into a run of their own opacity, and the arms of a run are left alone', () => {
  const g = gateSkins();
  try {
    const marked: string[] = [];
    for (const { name, skin } of rampOf(g)) {
      const arms = skin.mesh.junction.arms;
      arms.forEach((a, i) => { if (armRuleOf(arms, skin.axes, i) === ARM_RULE_TRUNK) marked.push(`${name}:${a.vesselId}@${a.end}`); });
      arms.forEach((a, i) => { const m = armRuleOf(arms, skin.axes, i); assert.ok(m === ARM_RULE_NONE || m === ARM_RULE_TRUNK || m === skin.axes[i]!.mate, `${name}:${a.vesselId}: -1, -2 or its mate`); });
    }
    const grown = marked.filter((m) => !opensIntoCava(m.split(':').at(-1)!.split('@')[0]!) || m.endsWith('@0')).map((m) => m.replace(/^.*:/, '').replace(/@.*/, ''));
    // every vessel marked is a hepatic vein into the cava (today's rule), a collateral, or a surgical shunt
    for (const m of marked) { const id = m.split(':').at(-1)!.split('@')[0]!; assert.ok(opensIntoCava(id) || joinsByRule(id), `${m} is no hepatic vein, collateral or surgical shunt`); }
    const has = (n: string): boolean => marked.some((m) => m.endsWith(n));
    for (const want of ['S_DSR@1', 'C6@1', 'S_MC@1', 'S_PC@1', 'C5@1', 'LRV_IVC@1']) assert.ok(has(want), `${want} opens into a receded trunk`);
    // the stents' ends stand as strong as their middle (2D JOIN_F_NOFADE); a shunt into a trunk of its own opacity ramps to nothing, so it is not marked
    for (const not of ['DIPS@1', 'TIPS@0', 'TIPS@1', 'REX@0', 'S_DSR@0', 'C6@0', 'S_PC@0', 'S_MC@0']) assert.ok(!has(not), `${not} is not marked`);
    assert.ok(grown.length > 0);
    // the through run's own halves carry their mate, never the rule
    for (const { skin } of rampOf(g)) skin.axes.forEach((ax, i) => { if (ax.mate !== undefined) assert.equal(armRuleOf(skin.mesh.junction.arms, skin.axes, i), ax.mate); });
    assert.equal(isReceded('IVC_IS_1'), true); assert.equal(isReceded('V_KID_L'), true); assert.equal(isReceded('SV_MID'), false); assert.equal(isReceded('PV_TRUNK_1'), false);
  } finally { g.scene.dispose(); }
});

test('the shunt\'s alpha eases to its trunk\'s from CAVA_RAMP_R trunk radii out to the wall: monotone, no step over 0.05 a CSS px (700 px a unit), and equal to the trunk\'s at the wall', () => {
  const g = gateSkins();
  try {
    let checked = 0;
    for (const { name, skin } of rampOf(g)) {
      const arms = skin.mesh.junction.arms;
      arms.forEach((a, i) => {
        if (!a.grow || armRuleOf(arms, skin.axes, i) !== ARM_RULE_TRUNK) return;
        const trunks = arms.map((o, k) => k).filter((k) => skin.axes[k]!.mate !== undefined);
        const aT = Math.min(...trunks.map((k) => trunkAlpha(arms[k]!.vesselId))), aArm = 1;
        // walk the arm's axis from its seam in toward the node: the skin's pixels between, at the arm's own alpha eased by the pixel's distance to the trunk's wall
        const ax = skin.axes[i]!, P = [ax.pts[2], ax.pts[1], ax.pts[0]];
        const samples: { s: number; alpha: number }[] = [];
        let s = 0;
        for (let seg = 0; seg < P.length - 1; seg++) {
          const L = Math.hypot(P[seg + 1]![0] - P[seg]![0], P[seg + 1]![1] - P[seg]![1], P[seg + 1]![2] - P[seg]![2]);
          for (let t = 0; t < 1; t += 1 / Math.max(2, Math.ceil(L * 700))) {
            const q = [0, 1, 2].map((c) => P[seg]![c]! + (P[seg + 1]![c]! - P[seg]![c]!) * t);
            let sd = Infinity, rad = 1;
            for (const k of trunks) { const d = sd3(skin.axes[k]!, q); if (d < sd) { sd = d; rad = Math.max(skin.axes[k]!.radii[2]!, 1e-5); } }
            const ramp = 1 - smooth(0, CAVA_RAMP_R * rad, sd);
            samples.push({ s: s + L * t, alpha: aArm + (aT - aArm) * ramp });
          }
          s += L;
        }
        let worst = 0;
        for (let k = 1; k < samples.length; k++) {
          const da = samples[k]!.alpha - samples[k - 1]!.alpha, dsPx = (samples[k]!.s - samples[k - 1]!.s) * 700;
          assert.ok(da <= ALPHA_NOISE, `${name}:${a.vesselId} eases down monotonically`);
          if (dsPx > 1e-6) worst = Math.max(worst, Math.abs(da) / dsPx);
        }
        assert.ok(worst < 0.05, `${name}:${a.vesselId}: ${worst.toFixed(4)} alpha a px at its steepest`);
        checked++;
      });
    }
    assert.ok(checked >= 5, `${checked} shunt and collateral arms checked`);
  } finally { g.scene.dispose(); }
});

test('no vessel end lands on a receded host with no skin on it: the tube-side ramp (fades.ts ivcJoinSpan) is not needed for a future one to look right, and the test names it if one appears', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const g = gateSkins();
  try {
    assert.ok(g.set.dropped.length > 0);
    for (const d of g.set.dropped) {
      const [node, id] = d.startsWith('wall:') ? [d.split(':')[1]!, d.split(':').at(-1)!] : [d.split(':')[0]!, d.split(':')[1]!];
      const host = d.startsWith('wall:') ? node : '';
      if (host) { assert.ok(!isReceded(host), `${d}: the host ${host} is receded and the end has no skin`); continue; }
      const j = findSkinJunctions().find((x) => x.node === node);
      assert.ok(j, d);
      // (an end named for its node that a wall skin takes up, the lower cava's: S_PC and C9 at IVCI, wall:IVC_IS_1:S_PC1,C90, is welded)
      const end = NETWORK_BY_ID.get(id)!.to === node ? 1 : 0;
      if (g.skins.some((s) => s.mesh.junction.arms.some((a) => a.vesselId === id && a.end === end))) continue;
      assert.ok(!(joinsByRule(id) && j!.arms.some((a) => !a.grow && isReceded(a.vesselId))), `${d}: a shunt or collateral lands on a receded trunk with no skin`);
      assert.ok(NETWORK_BY_ID.get(id));
    }
  } finally { g.scene.dispose(); setSmoothJoins(was); }
});
