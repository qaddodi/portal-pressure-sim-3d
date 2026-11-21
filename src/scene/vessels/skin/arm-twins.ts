// The skin's arms, read on the CPU (docs/junction-skin-spec.md 4.8, WP5): the skin draws a junction by blending its arms' LIVE alpha, highlight and lens position by weight, so the scene hands the skin shader, for each arm, what that
// arm's own tube has at its seam ring. These are the JS twins of the tube's vertex stage (vessels/shaders.ts: `fa`, `vHi`) and of the lens span mapping (`lensOf`), read from the tube's own uniforms, so the two never disagree. Pure:
// they read plain numbers, never a three.js object, so a node test pins them.

import { TUBE_SAG } from '../shaders.ts';

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const sstep = (a: number, b: number, x: number): number => { const t = clamp01((x - a) / (b - a || 1e-9)); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** The uniform values the fade reads (vessel-object.ts: fadeMode, fadeA, fadeLine, cavaEnd, stump, len). */
export interface FadeState {
  mode: number;
  /** (from, to, alpha at from, alpha at to), as `fadeA` */
  a: readonly [number, number, number, number];
  /** scene (x1, y1, x2, y2), as `fadeLine` */
  line: readonly [number, number, number, number];
  /** (the share of its length at the cava end that eases to this alpha, that alpha), as `cavaEnd` */
  cavaEnd: readonly [number, number];
  /** the divided stretch's length from the start in figure units (0: whole), as `stump.x` */
  stumpCut: number;
  /** the vessel's length in scene units (`len`) and the figure's units in a scene unit (300) */
  len: number; units: number;
}

/** The wedge's amber share a tube has at `u` (vessels/shaders.ts, the tint block before gl_FragColor), from its `wedge` (amount, cut, fade, fadeOn) and `wedgeB` (edge, front, frontEdge) uniforms. 0..1; the colour is mixed in at 0.78 of it. The skin hands this over for each arm's seam, so the tint is ONE field through the join. */
export function wedgeShareAt(w: readonly [number, number, number, number], b: readonly [number, number, number], u: number): number {
  if (w[0] <= 0.001) return 0;
  const ss = (a: number, c: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (c - a || 1e-9))); return t * t * (3 - 2 * t); };
  let wa = w[0] * (1 - ss(w[1], w[1] + Math.max(b[0], 0.001), u)) * ss(b[1] - Math.max(b[2], 0.001), b[1], u);
  wa *= w[3] > 0.5 ? ss(0, Math.max(w[2], 0.001), u) : 1;
  return wa;
}

/** The vertex stage's `fa` (the vFade a tube carries) at `u` along the vessel, for a point at scene (x, y), at rest on the body (no Circuit: the skin crossfades with the map on its own). */
export function liveFadeAt(f: FadeState, u: number, x: number, y: number): number {
  let fa = 1;
  if (f.mode > 2.5) {
    const dx = f.line[2] - f.line[0], dy = f.line[3] - f.line[1];
    let fv = ((x - f.line[0]) * dx + (y - f.line[1]) * dy) / Math.max(dx * dx + dy * dy, 1e-9);
    if (f.mode > 3.5) {
      fv = clamp01(fv);
      fa = fv < f.a[0] ? mix(f.a[2], f.a[3], sstep(0, Math.max(f.a[0], 1e-4), fv)) : mix(f.a[3], 1, sstep(f.a[0], 1, fv));
    } else fa = mix(f.a[2], f.a[3], clamp01((fv - f.a[0]) / Math.max(1 - f.a[0], 1e-4)));
  } else if (f.mode > 0.5) {
    const fs = f.mode < 1.5 ? u : y;
    fa = mix(f.a[2], f.a[3], clamp01((fs - f.a[0]) / (Math.abs(f.a[1] - f.a[0]) < 1e-5 ? 1e-5 : f.a[1] - f.a[0])));
  }
  if (f.stumpCut > 0) fa *= u * f.len * f.units >= f.stumpCut ? 1 : 0;
  if (f.cavaEnd[0] > 0) fa *= mix(1, f.cavaEnd[1], sstep(1 - f.cavaEnd[0], 1, u));
  return fa;
}

/** The uniform values the highlight weight reads (hiOn, hiDir, hiOffset, hiAhead, hiBehind, hiEnds, hiFade, len). */
export interface HiState { on: number; dir: number; offset: number; ahead: number; behind: number; ends: readonly [number, number]; fade: number; len: number }

/** The vertex stage's `vHi`: how much of the picked vein's own line (or the glow that runs ahead of or behind a tracked bolus) this tube has at `u`. */
export function hiWeightAt(h: HiState, u: number): number {
  const aU = u * h.len;
  const distH = h.dir > 0.5 ? h.offset + aU : h.dir < -0.5 ? h.offset + (h.len - aU) : 0;
  const limitH = h.dir < -0.5 ? h.behind : h.ahead;
  const ownH = sstep(0, Math.max(h.fade, 1e-4), Math.min(h.ends[0] + aU, h.ends[1] + (h.len - aU)));
  return h.on * (Math.abs(h.dir) > 0.5 ? 1 - sstep(0, Math.max(limitH, 1e-4), distH) : ownH);
}

/** The lens ramp's position at the seam: the stretch `span` of the host's ramp the vessel wears, at `u` along the vessel (`lensOf`: mix(lensSpan.x, lensSpan.y, vUv.x)). */
export const lensUAt = (span: readonly [number, number], u: number): number => mix(span[0], span[1], u);

/**
 * How far along its normal a vertex of the TUBE is moved from its rest place (vessels/shaders.ts, VESSEL_VS, `p = aPos + aNor * (...)`): `R` the vertex's rest radius (`radius * rk`), `swell` the live width share, `narrowK` the stenosis waist's share kept
 * (1 at rest), `inkW` the line's width in scene units, `inflate` the lift. The skin's vertex stage (skin/shaders.ts) is THE SAME expression with `R` = the vertex's `restR` and `swell` = the weights' blend of the arms' swells and `narrowK` = 1,
 * so on a seam ring, where one weight is 1, the two stages move a vertex by the same amount (spec 4.6; tests/skin-agreement.test.ts).
 */
export function normalShift(R: number, swell: number, narrowK: number, inkW: number, inflate: number): number {
  return inflate + R * (swell * narrowK - 1) + inkW + (R * swell * narrowK + inkW) * TUBE_SAG;
}

/**
 * A GROWING arm's two widths in the skin's vertex stage (skin/shaders.ts, spec 10.2): `sw` the engine's live width share at its seam, `g` its growth (0 gone, 1 whole).
 *  - the LUMEN `grownLumen = g x sw`: what the ink's capsule, the ink's width and the flow marks are made from (the arm's true radius, `g x R x sw`);
 *  - the SHIFT `grownShift = 1 + g (sw - 1)`: what the vertex takes along its normal. The morph has already moved the vertex by the growth (`P1 - (1 - g) delta`: on the seam ring `centre + g R n`), so the engine's width is applied to the grown part only:
 *    `g R + R (grownShift - 1) = g R sw`, the tube's own ring at the width `g x sw`.
 * An arm that does not grow has g = 1 and both are `sw`, as before.
 */
export const grownLumen = (sw: number, g: number): number => g * sw;
export const grownShift = (sw: number, g: number): number => 1 + g * (sw - 1);
/** One morphed value of the skin (position, normal, rest radius, a weight): the whole shape less what the arm has still to grow times its difference to the closed shape (`GrowMorph`). */
export const grownValue = (whole: number, delta: number, g: number): number => whole - (1 - g) * delta;

/** The alpha of one copy (0 front, 1 solid, 2 veil) of a skin at a point whose arm weights are `w`: the JS twin of the fragment stage's `dot(vWeight, armFade * armCopy[.][SKIN_COPY])` (skin/shaders.ts, spec 10.4). On a seam ring one weight is 1 and this is
 *  that arm tube's own alpha of that copy there (its share of the copy times its fade), which tests/skin-copies.test.ts holds to the tube's own state. */
export function copyAlpha(w: readonly number[], shares: readonly (readonly number[])[], fades: readonly number[], copy: 0 | 1 | 2): number {
  let a = 0;
  for (let i = 0; i < w.length; i++) a += (w[i] ?? 0) * (shares[i]?.[copy] ?? 0) * (fades[i] ?? 0);
  return a;
}

/**
 * How much of an arm's tube is THERE at its seam (0 gone, 1 whole): the JS twin of the tube's own presence in the fragment stage. A skin inherits it exactly, so a skin is never drawn where its arms are not (a liver branch the Circuit's change has not grown yet, a collateral
 * retracted, a vessel faded by the dive): `visible` the tube's group (presence-track.ts `apply` and `drive`), `reveal` its drawing-on (materials/shaders.ts frontOut: a gradient a tenth of the length wide at `reveal * 1.1`), `fade` its dissolve (fadedOut).
 */
export function armPresenceAt(visible: boolean, reveal: number, fade: number, u: number): number {
  if (!visible) return 0;
  const k = reveal >= 0.9999 ? 1 : clamp01((reveal * 1.1 - u) / 0.1);
  return k * clamp01(fade);
}
