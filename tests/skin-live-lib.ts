// The skin's outline at the LIVE swells (tests/skin-gate-lib.ts draws it at rest: every arm at its built width, every arm kept). The node-side twin of skin/shaders.ts for one patient's numbers: each arm's swell from the engine's
// diameter by the 2D figure's rule (glsl-shared.ts swellOf), the growing arms that are not there left out (keepOf), the vertex stage's blended swell, the fragment stage's ink band and seam pad, and the depth hold-out. Nothing is drawn by a GPU.
// A skin pixel is HOLE when the shader drops it (past the band) or INK when it keeps it as line only, at a place the live union (kept arms, no depth rule) says is lumen: what the figure shows black where it should be vessel.
import { Group, Matrix4, PerspectiveCamera, Vector3, Vector4 } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { CEL_STYLE } from '../src/scene/cel-style.ts';
import { inkTaper } from '../src/scene/vessels/cel-ink.ts';
import { skinKOf } from '../src/scene/vessels/skin/sdf.ts';
import { facetSag } from '../src/scene/vessels/skin/facet-sag.ts';
import { SKIN_ARM_ABSENT, SKIN_HOLD_FROM_K, SKIN_HOLD_TO_K, SKIN_HOLD_FREE_FROM_K, SKIN_HOLD_FREE_TO_K, SKIN_SEAM_PAD_PX } from '../src/scene/vessels/skin/shaders.ts';
import type { ArmAxis } from '../src/scene/vessels/skin/skin-object.ts';
import { sd3, type GateSkin } from './skin-gate-lib.ts';
import { skinNormalTwin, skinShadeK, type TwinArm } from '../src/scene/vessels/skin/exact-normal.ts';
import { lightUnit } from '../src/scene/vessels/cel-ink.ts';

const U = 300;
const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const smin = (a: number, b: number, k: number): number => { const h = Math.min(1, Math.max(0, 0.5 + 0.5 * (b - a) / Math.max(k, 1e-4))); return b + (a - b) * h - k * h * (1 - h); };
const inkCss = (rCss: number): number => Math.min(CEL_STYLE.LINE_MAX, Math.max(CEL_STYLE.LINE_MIN, CEL_STYLE.LINE_R * rCss)) * inkTaper(rCss);

/** An arm's live width against the one its tube was built at (glsl-shared.ts swellOf): the engine's diameter `d` by the 2D figure's rule. */
export function swellOf(d: number, baseD: number, kind: number): number {
  if (kind > 1.5) return 1;
  const w = (x: number): number => 1.3 * Math.max(2.6, 2 * Math.pow(Math.max(x, 0.1), 0.72));
  let m1 = w(d), m0 = w(baseD);
  if (kind > 0.5) { m1 = Math.max(1.8, m1 * 0.5); m0 = Math.max(1.8, m0 * 0.5); }
  return Math.min(8, Math.max(0.2, m1 / m0));
}

export interface LiveVariant {
  /** the depth hold-out judges the pixel against the arm's capsule at its LIVE width (before b9154a0c) instead of at rest */
  holdoutLive?: boolean;
  /** a growing arm that is not there stays in the outline union and the seam pad (before f07a2725) */
  absentInUnion?: boolean;
  /** the depth hold-out of each arm on its own (before 22 Nov, 18:00): a pixel every kept arm holds out (it lies on the stub of an arm that is not there) was dropped. The shipped rule takes it relative to the least-held kept arm (skin/shaders.ts skinSdPx). */
  absoluteHold?: boolean;
  /** a pixel past the band that the arms' screen union (no depth rule) calls lumen stays: it takes the union's distance (the shipped rule; `noRescue` is the rule before it) */
  noRescue?: boolean;
  /** a pixel the depth rule leaves as line that the union calls lumen by more than the line's own width is lumen: no ink inside the union (the purple's two lines running into the azygos) */
  noInkRescue?: boolean;
  /** Plan 16C: the depth hold-out measures each arm's gap with the tier step removed (the pixel's z is moved by the arm's tier less the pixel's blended tier), so only a real 3D separation holds an arm out */
  tierless?: boolean;
  /** the hold-out's ramp, in shares of the blend width k (shipped: SKIN_HOLD_FROM_K to SKIN_HOLD_TO_K): a pixel is held out of an arm from `ramp[0]` k of 3D gap, wholly from `ramp[1]` k */
  ramp?: readonly [number, number];
}
export interface LiveCase { swell: readonly number[]; keep: readonly boolean[]; /** each arm's tier z (frame2d.ts TIER_Z), for `tierless` */ tierZ?: readonly number[] }
/** `covered` pixels the skin's front faces cover; `lumenRef` of them the live union (kept arms, no depth rule) says are lumen; `hole` of those no fragment is drawn at (every face over it is dropped: the tube is cut there, so it is background); `inkOnly` of those the nearest drawn fragment is line only (black where it should be vessel). */
export interface LiveStat { node: string; covered: number; lumenRef: number; hole: number; inkOnly: number; /** of those, the pixels the live union calls lumen by more than the line's own width (ink INSIDE the union: the lines that run on into the azygos) */ deepInk: number; /** pixels inside the hull of the seam rings (where the tubes are cut and only the skin can draw) the live union calls vessel */ hullVessel: number; /** of those, pixels no kept fragment is drawn at: the figure shows background there, a hole through the vessel */ hullHole: number; hullInkOnly: number; /** pixels the shipped rule draws that the rule before it dropped (the stub of an arm that is not there, now in the host's lumen) */ newlyDrawn: number; /** of those, pixels whose shade normal differs by over 15 degrees between the union with every arm and the union of the arms that are there */ newlyDrawnShadeOff: number; /** and whose lit measure n.L differs by over 0.2 (a cel band flips) */ newlyDrawnBandFlip: number; /** drawn pixels shaded from the mesh's own lerped normal (the seam ring's rule, weight over 0.97) with the renormalised weights, and not with the raw weights of the arms that are there: the stub's pixels, shaded as a stub */ vertexNormalWrongly: number }

/** The camera the app has on a phone's screen, brought in on `centre` so one scene unit is `pxPerUnit` CSS px (the figure's depth scale; the rig's own orientation is kept). */
export function closeCamera(scene: CelScene, w: number, h: number, centre: readonly number[], pxPerUnit: number, view?: { yaw: number; pitch?: number }): PerspectiveCamera {
  const rig = scene.rig; rig.resize(w, h); rig.update(1000 + w);
  rig.setInspect(true); rig.inspectTo(view?.yaw ?? 0, view?.pitch ?? 0);
  for (let i = 1; i <= 40; i++) rig.update(1000 + w + i * 1000);
  const cam = rig.camera.clone() as PerspectiveCamera;
  rig.camera.updateMatrixWorld();
  const fwd = new Vector3(); rig.camera.getWorldDirection(fwd);
  const projY = rig.camera.projectionMatrix.elements[5]!;
  const dist = h * projY / (2 * pxPerUnit);   // css px per scene unit at depth d is h * projY / (2 d)
  cam.position.set(centre[0]! - fwd.x * dist, centre[1]! - fwd.y * dist, centre[2]! - fwd.z * dist);
  cam.quaternion.copy(rig.camera.getWorldQuaternion(cam.quaternion.clone()));
  cam.near = Math.min(cam.near, dist * 0.05); cam.far = Math.max(cam.far, dist * 4);
  cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  return cam;
}

/** One skin at one screen and one patient's live numbers, rastered by the fragment stage's outline rule. */
export function rasterLive(skin: GateSkin, cam: PerspectiveCamera, w: number, h: number, dpr: number, cs: LiveCase, variant: LiveVariant = {}, opts?: { normals?: boolean; shade?: (rough: { pairs: number; jumpsAt: number; jumpsProjected: number }) => void; holes?: (x: number, y: number, kind: 'hole' | 'ink') => void; probe?: { x: number; y: number; log: (m: string) => void }; map?: (b: Map<number, { w: number; lumen: boolean; ref: boolean }>, W: number, H: number) => void }): LiveStat {
  const { mesh, axes, node } = skin, arms = mesh.junction.arms, n = axes.length;
  cam.updateMatrixWorld();
  const PV = new Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  const projY = cam.projectionMatrix.elements[5]!;
  const wpc = (cw: number): number => (cw * 2) / (h * projY);   // scene units under one CSS px at clip depth cw
  const clip = (p: ArrayLike<number>): Vector4 => new Vector4(p[0], p[1], p[2], 1).applyMatrix4(PV);
  const px = (p: ArrayLike<number>, R: number): number[] => { const q = clip(p); return [(q.x / q.w * 0.5 + 0.5) * w * dpr, (q.y / q.w * 0.5 + 0.5) * h * dpr, R / wpc(q.w) * dpr, q.w]; };
  const W2 = w * dpr, H2 = h * dpr, kM = skinKOf(arms);
  const mates = axes.map((a) => a.mate ?? -1);
  const ap = (sw: readonly number[]) => axes.map((ax, a) => ax.pts.map((p, i) => px(p, ax.radii[i]! * sw[a]!)));
  const apLive = ap(cs.swell);
  const gWKeepOf = (raw: readonly number[]): number => { let kept = 0; for (let i = 0; i < n; i++) kept += raw[i]! * (cs.keep[i] ? 1 : 0); return cs.keep.every(Boolean) ? 1 : 1 / Math.max(kept, 1e-4); };

  // the vertex stage
  const nv = mesh.position.length / 3, sx = new Float64Array(nv), sy = new Float64Array(nv), sw = new Float64Array(nv), cenW = new Float64Array(nv);
  const sag = facetSag(mesh.position, mesh.index, mesh.restR, mesh.seamVerts.flatMap((a) => [...a]));
  const rawAt = (v: number): number[] => Array.from({ length: n }, (_, i) => (i < 4 ? mesh.weight[v * 4 + i]! : mesh.weight2[v * 2 + i - 4]!));
  for (let v = 0; v < nv; v++) {
    const raw = rawAt(v);
    let swell = 0; for (let i = 0; i < n; i++) swell += raw[i]! * cs.swell[i]!;
    const cc = clip([mesh.cen[v * 3]!, mesh.cen[v * 3 + 1]!, mesh.cen[v * 3 + 2]!]), wp = wpc(cc.w);
    const rst = mesh.restR[v]!, lumenW = rst * swell, rCss = lumenW / wp, inkW = inkCss(rCss) * wp;
    const q = clip([0, 1, 2].map((k) => mesh.position[v * 3 + k]! + mesh.normal[v * 3 + k]! * (rst * (swell - 1) + inkW + (lumenW + inkW) * sag[v]!)));
    sx[v] = (q.x / q.w * 0.5 + 0.5) * W2; sy[v] = (q.y / q.w * 0.5 + 0.5) * H2; sw[v] = q.w; cenW[v] = cc.w;
  }

  // per pixel: the nearest fragment the shader keeps (its depth, whether it is lumen), and whether the live union says the pixel is vessel
  const best = new Map<number, { w: number; lumen: boolean; ref: boolean; deep: boolean }>();
  const nd = { a: 0, b: 0, c: 0, d: 0 };
  const shadeBest = new Map<number, { w: number; p: number[]; k: number }>();
  const idx = mesh.index;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t]!, b = idx[t + 1]!, c = idx[t + 2]!;
    const den = (sy[b]! - sy[c]!) * (sx[a]! - sx[c]!) + (sx[c]! - sx[b]!) * (sy[a]! - sy[c]!);
    if (Math.abs(den) < 1e-9 || den < 0) continue;
    const x0 = Math.max(0, Math.floor(Math.min(sx[a]!, sx[b]!, sx[c]!))), x1 = Math.min(W2 - 1, Math.ceil(Math.max(sx[a]!, sx[b]!, sx[c]!)));
    const y0 = Math.max(0, Math.floor(Math.min(sy[a]!, sy[b]!, sy[c]!))), y1 = Math.min(H2 - 1, Math.ceil(Math.max(sy[a]!, sy[b]!, sy[c]!)));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const fx = x + 0.5, fy = y + 0.5;
      const l0 = ((sy[b]! - sy[c]!) * (fx - sx[c]!) + (sx[c]! - sx[b]!) * (fy - sy[c]!)) / den, l1 = ((sy[c]! - sy[a]!) * (fx - sx[c]!) + (sx[a]! - sx[c]!) * (fy - sy[c]!)) / den, l2 = 1 - l0 - l1;
      if (l0 < 0 || l1 < 0 || l2 < 0) continue;
      const fragW = 1 / (l0 / sw[a]! + l1 / sw[b]! + l2 / sw[c]!);
      const pc = (arr: ArrayLike<number>): number => (l0 * arr[a]! / sw[a]! + l1 * arr[b]! / sw[b]! + l2 * arr[c]! / sw[c]!) * fragW;
      const fragP = [0, 1, 2].map((k) => (l0 * mesh.position[a * 3 + k]! / sw[a]! + l1 * mesh.position[b * 3 + k]! / sw[b]! + l2 * mesh.position[c * 3 + k]! / sw[c]!) * fragW);
      const raw = rawAt(a).map((_, i) => (l0 * rawAt(a)[i]! / sw[a]! + l1 * rawAt(b)[i]! / sw[b]! + l2 * rawAt(c)[i]! / sw[c]!) * fragW);
      const vRest = pc(mesh.restR), vCenW = pc(cenW);
      const gW = gWKeepOf(raw), wAt = raw.map((r, i) => r * (cs.keep[i] ? 1 : 0) * gW);
      let swB = 0; for (let i = 0; i < n; i++) swB += wAt[i]! * cs.swell[i]!;
      const wpcAx = wpc(vCenW), inkDev = inkCss(vRest * swB / wpcAx) * dpr, kPx = kM / wpcAx * dpr;
      // skinArmPx
      const tierPix = variant.tierless && cs.tierZ ? wAt.reduce((t, w, i) => t + w * cs.tierZ![i]!, 0) : 0;
      const fragPOf = (arm: number): number[] => (variant.tierless && cs.tierZ ? [fragP[0]!, fragP[1]!, fragP[2]! + cs.tierZ[arm]! - tierPix] : fragP);
      // (the shader's ramp: the free skin's eased to the seam's by the kept arms' top raw weight, skinHoldSeam)
      const wSeam = smooth(0.75, 0.97, Math.max(...raw.map((r, i) => r * (cs.keep[i] ? 1 : 0))));
      const ramp = variant.ramp ?? [SKIN_HOLD_FREE_FROM_K + (SKIN_HOLD_FROM_K - SKIN_HOLD_FREE_FROM_K) * wSeam, SKIN_HOLD_FREE_TO_K + (SKIN_HOLD_TO_K - SKIN_HOLD_FREE_TO_K) * wSeam];
      const armHeld = (arm: number, holdLive: boolean): number => smooth(ramp[0] * kPx, ramp[1] * kPx, sd3(axes[arm]!, fragPOf(arm), holdLive ? cs.swell[arm]! : 1) / Math.max(wpc(fragW), 1e-9) * dpr);
      const armPx = (arm: number, depth: boolean, holdLive: boolean, sub = 0): number => {
        const P = apLive[arm]!, segs = ([[P[0], P[1]], [P[1], P[2]], [P[2], P[3]]] as number[][][]).map(([p, q]) => {
          const abx = q![0]! - p![0]!, aby = q![1]! - p![1]!, tt = Math.min(1, Math.max(0, ((fx - p![0]!) * abx + (fy - p![1]!) * aby) / Math.max(abx * abx + aby * aby, 1e-6)));
          return Math.hypot(fx - p![0]! - abx * tt, fy - p![1]! - aby * tt) - (p![2]! + tt * (q![2]! - p![2]!));
        });
        const d = Math.min(...segs);
        if (!depth) return d;
        const gap = sd3(axes[arm]!, fragPOf(arm), holdLive ? cs.swell[arm]! : 1) / Math.max(wpc(fragW), 1e-9) * dpr;
        return d + (smooth(ramp[0] * kPx, ramp[1] * kPx, gap) - sub) * (2 * kPx + Math.max(-d, 0));   // (held out of reach: past the arm's own wall, shaders.ts skinSdPx)
      };
      const sdOf = (depth: boolean, holdLive: boolean, absentIn: boolean, subOverride?: number): number => {
        const live = axes.map((_, i) => arms[i] != null && (absentIn || cs.keep[i]));
        const sub = subOverride != null ? subOverride : depth && !variant.absoluteHold ? Math.min(...axes.map((_, i) => (live[i] ? armHeld(i, holdLive) : 1))) : 0;
        const d = axes.map((_, i) => !live[i] ? 1e9 : armPx(i, depth, holdLive, sub) + 2 * kPx * (1 - smooth(0, SKIN_ARM_ABSENT, cs.swell[i]!)));
        let o = 0, first = true;
        for (let i = 0; i < n; i++) {
          const m = mates[i]!;
          if (m > -0.5 && m < i - 0.5) continue;
          let di = d[i]!; if (m > i + 0.5) di = Math.min(di, d[m]!);
          o = first ? di : smin(o, di, kPx); first = false;
        }
        // (on a seam ring the outline is the seam arm's own, shaders.ts skinSeamPin)
        if (seamArm >= 0) { const m = mates[seamArm]!; let own = d[seamArm]!; if (m > -0.5) own = Math.min(own, d[m]!); o += (own - o) * seamPin; }
        return o;
      };
      let seamArm = -1, seamW = 0; for (let i = 0; i < n; i++) { const wi = raw[i]! * (cs.keep[i] ? 1 : 0); if (wi > seamW) { seamW = wi; seamArm = i; } }
      const seamPin = smooth(0.97, 1, seamW);
      const ref = sdOf(false, false, false);   // (the kept arms' union at their live widths: where the vessel is)
      let sd = sdOf(true, !!variant.holdoutLive, !!variant.absentInUnion);
      let wMax = 0; for (let i = 0; i < n; i++) wMax = Math.max(wMax, variant.absentInUnion ? wAt[i]! : raw[i]! * (cs.keep[i] ? 1 : 0));
      const band = inkDev + 0.5 + SKIN_SEAM_PAD_PX * dpr * smooth(0.75, 0.97, wMax);
      if (opts?.probe && x === opts.probe.x && y === opts.probe.y) opts.probe.log(`tri ${t / 3} sd ${sd.toFixed(2)} ref ${ref.toFixed(2)} band ${band.toFixed(2)} w ${fragW.toFixed(4)} d/arm ${axes.map((_, i) => armPx(i, true, false).toFixed(1)).join(',')} nodepth ${axes.map((_, i) => armPx(i, false, false).toFixed(1)).join(',')} raw ${raw.map((r) => r.toFixed(2)).join(',')} kPx ${kPx.toFixed(1)}`);
      if (opts?.normals && sd <= band) {
        const wTopOld = Math.max(...wAt), wTopNew = Math.max(...raw.map((r, i) => r * (cs.keep[i] ? 1 : 0))), unionShare = (w: number): number => 1 - smooth(0.97, 1, w);
        if (unionShare(wTopOld) < 0.5 && unionShare(wTopNew) >= 0.5) nd.d++;
        const old = sdOf(true, !!variant.holdoutLive, !!variant.absentInUnion, 0);
        if (old > band) {
          nd.a++;
          const k = skinShadeK(kM, wpc(fragW)), tw = (off: readonly boolean[]): TwinArm[] => axes.map((ax, i) => ({ pts: ax.pts.flat(), r: ax.radii, mate: ax.mate, sw: cs.swell[i]!, off: off[i]! }));
          const nAll = skinNormalTwin(tw(axes.map(() => false)), k, fragP[0]!, fragP[1]!, fragP[2]!, SKIN_ARM_ABSENT), nKept = skinNormalTwin(tw(cs.keep.map((q) => !q)), k, fragP[0]!, fragP[1]!, fragP[2]!, SKIN_ARM_ABSENT), L = lightUnit();
          const cosA = nAll[0] * nKept[0] + nAll[1] * nKept[1] + nAll[2] * nKept[2], dS = Math.abs((nAll[0] - nKept[0]) * L[0] + (nAll[1] - nKept[1]) * L[1] + (nAll[2] - nKept[2]) * L[2]);
          if (Math.acos(Math.min(1, Math.max(-1, cosA))) > 15 * Math.PI / 180) nd.b++;
          if (dS > 0.2) nd.c++;
        }
      }
      if (!variant.noRescue && sd > band && ref <= -0.5) sd = ref;
      if (!variant.noInkRescue && sd > -0.5 && ref < -(inkDev + 0.5)) sd = ref;
      if (opts?.shade && sd <= band) { const cur0 = shadeBest.get(y * W2 + x); if (!cur0 || fragW < cur0.w) shadeBest.set(y * W2 + x, { w: fragW, p: fragP, k: skinShadeK(kM, wpc(fragW)) }); }
      const drop = sd > band, key = y * W2 + x, cur = best.get(key) ?? { w: Infinity, lumen: false, ref: false, deep: false };
      cur.ref = cur.ref || ref <= -0.5;
      if (!drop && fragW < cur.w) { cur.w = fragW; cur.lumen = sd <= -0.5; cur.deep = sd > -0.5 && ref < -(inkDev + 0.5); }
      best.set(key, cur);
    }
  }
  const st: LiveStat = { node, covered: best.size, lumenRef: 0, hole: 0, inkOnly: 0, deepInk: 0, hullVessel: 0, hullHole: 0, hullInkOnly: 0, newlyDrawn: nd.a, newlyDrawnShadeOff: nd.b, newlyDrawnBandFlip: nd.c, vertexNormalWrongly: nd.d };
  // the hull of the seam rings: the tubes are cut at their rings, so inside it the skin is the only thing that draws
  {
    const pts = mesh.seamVerts.flatMap((r) => [...r]).map((v) => [sx[v]!, sy[v]!] as const).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const cross = (o: readonly number[], a: readonly number[], b: readonly number[]): number => (a[0]! - o[0]!) * (b[1]! - o[1]!) - (a[1]! - o[1]!) * (b[0]! - o[0]!);
    const half = (list: readonly (readonly [number, number])[]): (readonly [number, number])[] => { const h: (readonly [number, number])[] = []; for (const q of list) { while (h.length >= 2 && cross(h[h.length - 2]!, h[h.length - 1]!, q) <= 0) h.pop(); h.push(q); } return h; };
    const lo = half(pts), up = half([...pts].reverse()), hull = [...lo.slice(0, -1), ...up.slice(0, -1)];
    const kRef = kM / wpc(clip(mesh.junction.J).w) * dpr;
    const flat = (fx: number, fy: number): number => {
      const d = axes.map((_, i) => (arms[i] == null || !cs.keep[i]) ? 1e9 : (() => { const P = apLive[i]!; return Math.min(...([[P[0], P[1]], [P[1], P[2]], [P[2], P[3]]] as number[][][]).map(([p, q]) => { const abx = q![0]! - p![0]!, aby = q![1]! - p![1]!, tt = Math.min(1, Math.max(0, ((fx - p![0]!) * abx + (fy - p![1]!) * aby) / Math.max(abx * abx + aby * aby, 1e-6))); return Math.hypot(fx - p![0]! - abx * tt, fy - p![1]! - aby * tt) - (p![2]! + tt * (q![2]! - p![2]!)); })); })() + 2 * kRef * (1 - smooth(0, SKIN_ARM_ABSENT, cs.swell[i]!)));
      let o = 0, first = true;
      for (let i = 0; i < n; i++) { const m = mates[i]!; if (m > -0.5 && m < i - 0.5) continue; let di = d[i]!; if (m > i + 0.5) di = Math.min(di, d[m]!); o = first ? di : smin(o, di, kRef); first = false; }
      return o;
    };
    const inHull = (x: number, y: number): boolean => { let sign = 0; for (let i = 0; i < hull.length; i++) { const c = cross(hull[i]!, hull[(i + 1) % hull.length]!, [x, y]); if (c !== 0) { if (sign === 0) sign = Math.sign(c); else if (Math.sign(c) !== sign) return false; } } return true; };
    if (hull.length >= 3) {
      const xs = hull.map((q) => q[0]), ys = hull.map((q) => q[1]);
      for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(H2 - 1, Math.ceil(Math.max(...ys))); y++) for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(W2 - 1, Math.ceil(Math.max(...xs))); x++) {
        if (!inHull(x + 0.5, y + 0.5) || flat(x + 0.5, y + 0.5) > -0.5) continue;
        st.hullVessel++;
        const c = best.get(y * W2 + x);
        if (!c || c.w === Infinity) { st.hullHole++; opts?.holes?.(x, y, 'hole'); } else if (!c.lumen) { st.hullInkOnly++; opts?.holes?.(x, y, 'ink'); }
      }
    }
  }
  for (const p of best.values()) if (p.ref) { st.lumenRef++; if (p.w === Infinity) st.hole++; else if (!p.lumen) { st.inkOnly++; if (p.deep) st.deepInk++; } }
  if (opts?.shade) {
    const L = lightUnit(), tw: TwinArm[] = axes.map((ax, i) => ({ pts: ax.pts.flat(), r: ax.radii, mate: ax.mate, sw: cs.swell[i]!, off: !cs.keep[i] }));
    const sAt = (f: { p: number[]; k: number }, project: boolean): number => {
      const d: number[] = [0]; let g = skinNormalTwin(tw, f.k, f.p[0]!, f.p[1]!, f.p[2]!, SKIN_ARM_ABSENT, [0, 0, 1], d), q = f.p;
      if (project) { q = [f.p[0]! - g[0] * d[0]!, f.p[1]! - g[1] * d[0]!, f.p[2]! - g[2] * d[0]!]; g = skinNormalTwin(tw, f.k, q[0]!, q[1]!, q[2]!, SKIN_ARM_ABSENT); }
      return g[0] * L[0] + g[1] * L[1] + g[2] * L[2];
    };
    const r = { pairs: 0, jumpsAt: 0, jumpsProjected: 0 };
    for (const [key, a] of shadeBest) { const b = shadeBest.get(key + 1); if (!b) continue; r.pairs++; if (Math.abs(sAt(a, false) - sAt(b, false)) > 0.15) r.jumpsAt++; if (Math.abs(sAt(a, true) - sAt(b, true)) > 0.15) r.jumpsProjected++; }
    opts.shade(r);
  }
  if (opts?.map) opts.map(best, W2, H2);
  return st;
}
