// The organ painter's arithmetic in JS (organ-shader.ts ORGAN_FS with the gut's patches, organ-art.ts), at a vertex of a built organ: the colour it lays on the page. Used to measure the colour step where one gut part hands
// over to the next (tests/gut-colour.test.ts). The pool, the nodules, the window and the derivatives' widths are left out (none of them is on the gut at rest); everything else is the shader's own order of terms.
import type { BufferGeometry, ShaderMaterial } from 'three';
import { CEL_LIGHT_UNIT } from '../../src/scene/cel-glsl.ts';

type V3 = [number, number, number];
type U = Record<string, { value: unknown }>;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ss = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** A uniform's value as numbers: a Color (r, g, b), a vector (x, y, z, w) or a float. */
function nums(v: unknown): number[] {
  if (typeof v === 'number') return [v];
  const o = v as Record<string, number>;
  if ('r' in o) return [o.r!, o.g!, o.b!];
  return 'w' in o ? [o.x!, o.y!, o.z!, o.w!] : 'z' in o ? [o.x!, o.y!, o.z!] : [o.x!, o.y!];
}

/** What the gut's look blend reads (organ-art.ts GUT_LOOK): each tone uniform of the material, mixed toward the stomach's own (`<name>S`) by the vertex's stomach share `tos`, as the shader's `mix(u, uS, vTos)`. */
export function reader(m: ShaderMaterial, tos: number): (k: string) => number[] {
  const u = m.uniforms as U;
  return (k) => { if (k === 'box') return nums(u.box!.value); const a = nums(u[k]!.value), s = u[`${k}S`] ? nums(u[`${k}S`]!.value) : null; return s ? a.map((x, i) => x + (s[i]! - x) * tos) : a; };
}

/** The colour (0..1 rgb) the organ's fill lays on the page at vertex `i` of `g`, drawn with material `m`, and the opacity it lies at. `depthAmt` is Settings > Figure depth (1 on). `tosAt` in place of the vertex's
 *  own stomach share: `m` may be another part's material, read at this part's point (what that part would draw here). */
export function fillAt(m: ShaderMaterial, g: BufferGeometry, i: number, depthAmt = 1, tosAt?: number): { rgb: V3; a: number; onPage: V3 } {
  const P = g.getAttribute('position'), N = g.getAttribute('normal'), S = g.getAttribute('shadeN'), A = g.getAttribute('depthAo'), T = g.getAttribute('tos'), E = g.getAttribute('esoA');
  const tos = tosAt ?? (T ? T.getX(i) : 0), U = reader(m, tos);
  const shadeK = U('shadeK')[0]!, n0: V3 = [N.getX(i), N.getY(i), N.getZ(i)], s0: V3 = S ? [S.getX(i), S.getY(i), S.getZ(i)] : n0;
  const sn = mix3(n0, s0, shadeK), l = Math.hypot(...sn) || 1, nws: V3 = [sn[0] / l, sn[1] / l, sn[2] / l];
  const turn = 1 - clamp01(nws[2]);
  // (the box the gradient and volume are measured in: the organ's own, mixed toward the stomach's (boxS) by tos, as gutLook's mix(vBox, vBoxS, vTos))
  const inBox = (b: number[]) => [(P.getX(i) - b[0]!) / Math.max(b[2]!, 1e-5), (b[1]! - P.getY(i)) / Math.max(b[3]!, 1e-5)];
  const u = m.uniforms as U, own = inBox(nums(u.box!.value)), bS = u.boxS ? inBox(nums(u.boxS.value)) : own, vb = [own[0]! + (bS[0]! - own[0]!) * tos, own[1]! + (bS[1]! - own[1]!) * tos];
  const t = clamp01(((vb[0]! - 0.15) * 0.7 + vb[1]!) / (0.49 + 1));
  let fill = mix3(U('o1') as V3, U('o2') as V3, t);
  const vg = U('volGeo'), vl = U('volLight'), vs = U('volShade'), at = U('volShadeAt')[0]!;
  const r = Math.hypot(vb[0]! - vg[0]!, vb[1]! - vg[1]!) / vg[2]!;
  fill = mix3(fill, [vl[0]!, vl[1]!, vl[2]!], vl[3]! * (1 - clamp01(r / vg[3]!)));
  fill = mix3(fill, [vs[0]!, vs[1]!, vs[2]!], vs[3]! * clamp01((r - at) / (1 - at)));
  const hl = Math.hypot(nws[0], nws[1]), side = hl > 1e-4 ? [nws[0] / hl, nws[1] / hl] : [0, 0];
  const lowerRight = ss(-0.35, 0.65, side[0]! * 0.57 - side[1]! * 0.82);
  const sh = U('shadeSteps'), k = (1 - (1 - sh[0]!) * (1 - sh[1]!) * (1 - sh[2]!)) * ss(0.35, 1, turn), dk = U('ogDark'), lg = U('ogLight');
  fill = mix3(fill, [dk[0]!, dk[1]!, dk[2]!], dk[3]! * k * lowerRight);
  const lit = ss(0.62, 0.8, turn) * clamp01(side[0]! * -0.6 + side[1]! * 0.8);
  fill = mix3(fill, [lg[0]!, lg[1]!, lg[2]!], lg[3]! * U('rimK')[0]! * lit);
  if (depthAmt > 0.001) {
    const ao = clamp01(A ? A.getX(i) / (A.normalized ? 1 : 1) : 0), wa = 0.12;
    const tuck = (ss(0.2 - wa, 0.2 + wa, ao) + ss(0.5 - wa, 0.5 + wa, ao) + ss(0.8 - wa, 0.8 + wa, ao)) / 3;
    const lam = nws[0] * CEL_LIGHT_UNIT[0] + nws[1] * CEL_LIGHT_UNIT[1] + nws[2] * CEL_LIGHT_UNIT[2], wl = 0.08;
    const away = 1 - ss(0.3 - wl, 0.3 + wl, lam), toward = ss(0.7 - wl, 0.7 + wl, lam) * (1 - ao);
    fill = mix3(fill, [dk[0]!, dk[1]!, dk[2]!], clamp01(dk[3]! * (1.5 * tuck + 0.6 * away)) * depthAmt);
    fill = mix3(fill, [lg[0]!, lg[1]!, lg[2]!], clamp01(lg[3]! * 0.5 * toward) * depthAmt);
  }
  let a = U('layer')[0]! * ((m.uniforms as U).fade ? nums((m.uniforms as U).fade!.value)[0]! : 1);
  if (E && /vEsoA/.test(m.fragmentShader)) a *= E.getX(i);
  const page = nums((m.uniforms as U).page!.value) as V3;
  return { rgb: fill, a, onPage: mix3(page, fill, a) };
}
