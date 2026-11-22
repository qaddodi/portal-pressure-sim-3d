// The skin's outline at the LIVE swells (tests/skin-gate-lib.ts draws it at rest: every arm at its built width, every arm kept). The node-side twin of skin/shaders.ts for one patient's numbers: each arm's swell from the engine's
// diameter by the 2D figure's rule (glsl-shared.ts swellOf), the growing arms that are not there left out (keepOf), the vertex stage's blended swell, the fragment stage's ink band and seam pad, and the depth hold-out. Nothing is drawn by a GPU.
// A skin pixel is HOLE when the shader drops it (past the band) or INK when it keeps it as line only, at a place the live union (kept arms, no depth rule) says is lumen: what the figure shows black where it should be vessel.
import { Group, Matrix4, PerspectiveCamera, Vector3, Vector4 } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { CEL_STYLE } from '../src/scene/cel-style.ts';
import { inkTaper } from '../src/scene/vessels/cel-ink.ts';
import { skinKOf } from '../src/scene/vessels/skin/sdf.ts';
import { facetSag } from '../src/scene/vessels/skin/facet-sag.ts';
import { SKIN_ARM_ABSENT, SKIN_SEAM_PAD_PX } from '../src/scene/vessels/skin/shaders.ts';
import type { ArmAxis } from '../src/scene/vessels/skin/skin-object.ts';
import { sd3, type GateSkin } from './skin-gate-lib.ts';

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
}
export interface LiveCase { swell: readonly number[]; keep: readonly boolean[] }
/** `covered` pixels the skin's front faces cover; `lumenRef` of them the live union (kept arms, no depth rule) says are lumen; `hole` of those no fragment is drawn at (every face over it is dropped: the tube is cut there, so it is background); `inkOnly` of those the nearest drawn fragment is line only (black where it should be vessel). */
export interface LiveStat { node: string; covered: number; lumenRef: number; hole: number; inkOnly: number }

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
export function rasterLive(skin: GateSkin, cam: PerspectiveCamera, w: number, h: number, dpr: number, cs: LiveCase, variant: LiveVariant = {}, opts?: { probe?: { x: number; y: number; log: (m: string) => void }; map?: (b: Map<number, { w: number; lumen: boolean; ref: boolean }>, W: number, H: number) => void }): LiveStat {
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
  const best = new Map<number, { w: number; lumen: boolean; ref: boolean }>();
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
      const armHeld = (arm: number, holdLive: boolean): number => smooth(0.25 * kPx, kPx, sd3(axes[arm]!, fragP, holdLive ? cs.swell[arm]! : 1) / Math.max(wpc(fragW), 1e-9) * dpr);
      const armPx = (arm: number, depth: boolean, holdLive: boolean, sub = 0): number => {
        const P = apLive[arm]!, segs = ([[P[0], P[1]], [P[1], P[2]], [P[2], P[3]]] as number[][][]).map(([p, q]) => {
          const abx = q![0]! - p![0]!, aby = q![1]! - p![1]!, tt = Math.min(1, Math.max(0, ((fx - p![0]!) * abx + (fy - p![1]!) * aby) / Math.max(abx * abx + aby * aby, 1e-6)));
          return Math.hypot(fx - p![0]! - abx * tt, fy - p![1]! - aby * tt) - (p![2]! + tt * (q![2]! - p![2]!));
        });
        const d = Math.min(...segs);
        if (!depth) return d;
        const gap = sd3(axes[arm]!, fragP, holdLive ? cs.swell[arm]! : 1) / Math.max(wpc(fragW), 1e-9) * dpr;
        return d + 2 * kPx * (smooth(0.25 * kPx, kPx, gap) - sub);
      };
      const sdOf = (depth: boolean, holdLive: boolean, absentIn: boolean): number => {
        const live = axes.map((_, i) => arms[i] != null && (absentIn || cs.keep[i]));
        const sub = depth && !variant.absoluteHold ? Math.min(...axes.map((_, i) => (live[i] ? armHeld(i, holdLive) : 1))) : 0;
        const d = axes.map((_, i) => !live[i] ? 1e9 : armPx(i, depth, holdLive, sub) + 2 * kPx * (1 - smooth(0, SKIN_ARM_ABSENT, cs.swell[i]!)));
        let o = 0, first = true;
        for (let i = 0; i < n; i++) {
          const m = mates[i]!;
          if (m > -0.5 && m < i - 0.5) continue;
          let di = d[i]!; if (m > i + 0.5) di = Math.min(di, d[m]!);
          o = first ? di : smin(o, di, kPx); first = false;
        }
        return o;
      };
      const sd = sdOf(true, !!variant.holdoutLive, !!variant.absentInUnion);
      const ref = sdOf(false, false, false);   // (the kept arms' union at their live widths: where the vessel is)
      let wMax = 0; for (let i = 0; i < n; i++) wMax = Math.max(wMax, variant.absentInUnion ? wAt[i]! : raw[i]! * (cs.keep[i] ? 1 : 0));
      const band = inkDev + 0.5 + SKIN_SEAM_PAD_PX * dpr * smooth(0.75, 0.97, wMax);
      if (opts?.probe && x === opts.probe.x && y === opts.probe.y) opts.probe.log(`tri ${t / 3} sd ${sd.toFixed(2)} ref ${ref.toFixed(2)} band ${band.toFixed(2)} w ${fragW.toFixed(4)} d/arm ${axes.map((_, i) => armPx(i, true, false).toFixed(1)).join(',')} nodepth ${axes.map((_, i) => armPx(i, false, false).toFixed(1)).join(',')} raw ${raw.map((r) => r.toFixed(2)).join(',')} kPx ${kPx.toFixed(1)}`);
      const drop = sd > band, key = y * W2 + x, cur = best.get(key) ?? { w: Infinity, lumen: false, ref: false };
      cur.ref = cur.ref || ref <= -0.5;
      if (!drop && fragW < cur.w) { cur.w = fragW; cur.lumen = sd <= -0.5; }
      best.set(key, cur);
    }
  }
  const st: LiveStat = { node, covered: best.size, lumenRef: 0, hole: 0, inkOnly: 0 };
  for (const p of best.values()) if (p.ref) { st.lumenRef++; if (p.w === Infinity) st.hole++; else if (!p.lumen) st.inkOnly++; }
  if (opts?.map) opts.map(best, W2, H2);
  return st;
}
