// The skin GATE's raster (tests/skin-gate.test.ts): the real junction skins, as built for the body at rest, drawn in node by the fragment stage's own outline rule (skin/shaders.ts skinPx, skinArmPx, skinSmin, skinSdPx: the JS twin below) on the
// camera the app really has on a given screen (the rig, at that size). Each pixel of each skin's front faces is the lumen (the outline's distance under -0.5 px), the line (up to the band's edge) or dropped (past it), so "every joint is good" is a number
// per skin and per screen, not an eyeball on a phone. Nothing is drawn by a GPU: no pictures, no headless browser.
import { Group, Matrix4, Vector4 } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { CEL_STYLE } from '../src/scene/cel-style.ts';
import { inkTaper } from '../src/scene/vessels/cel-ink.ts';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { skinKOf } from '../src/scene/vessels/skin/sdf.ts';
import { throughMates } from '../src/scene/vessels/skin/through.ts';
import type { ArmAxis } from '../src/scene/vessels/skin/skin-object.ts';
import type { SkinMesh } from '../src/scene/vessels/skin/types.ts';

export interface GateSkin { node: string; mesh: SkinMesh; axes: readonly ArmAxis[] }
export interface GateStat { node: string; pixels: number; lumen: number; line: number; dropped: number; /** pixels whose outline the depth rule moved by more than a pixel */ held: number }

/** The body's skins at rest, as the scene builds them (the baked file under node), and the scene whose camera draws them. */
export function gateSkins(): { scene: CelScene; skins: GateSkin[]; /** the parts of a node's skin (plain.ts partOf: the permanent arms and one set of the growing arms), by key */ partsOf(node: string): { key: string; skin: GateSkin; keep: readonly number[] }[]; set: SkinSet; plain(node: string): GateSkin | undefined; done(): void } {
  setSmoothJoins(true);
  const scene = new CelScene(), draws: GateSkin[] = [], parent = new Group();
  const set = new SkinSet({
    vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
    make: (mesh, axes) => { const d = { node: mesh.junction.node, mesh, axes, object: new Group(), setArm() {}, setArc() {}, setPres() {}, setArmCopy() {}, setTransparent() {}, dispose() {} }; draws.push(d); return d; },
    add: (o) => parent.add(o), remove: (o) => parent.remove(o), warn: () => {},
  });
  set.build(2);
  const live = new Set<unknown>(set.liveDraws());
  const byDraw = new Map<unknown, GateSkin>(draws.map((d) => [d, d]));
  return { scene, set, plain: (node) => { const d = set.plainDrawOf(node); return d ? byDraw.get(d) : undefined; }, skins: draws.filter((d) => live.has(d)), partsOf: (node) => [...set.partsOf(node)].map(([key, p]) => ({ key, skin: byDraw.get(p.draw)!, keep: p.keep })), done: () => (scene as unknown as { dispose?(): void }).dispose?.() };
}

/** An arm's exact 3D distance (skin/exact-normal.ts skinArmSd3): from the point to the arm's capsule over its four axis points, less the radius at the nearest. */
export function sd3(ax: ArmAxis, p: readonly number[], swell = 1): number {
  let best = Infinity, r = 0;
  for (let s = 0; s < ax.pts.length - 1; s++) {
    const a = ax.pts[s]!, b = ax.pts[s + 1]!, ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], q = [p[0]! - a[0], p[1]! - a[1], p[2]! - a[2]];
    const bb = ab[0]! * ab[0]! + ab[1]! * ab[1]! + ab[2]! * ab[2]!, t = bb > 0 ? Math.min(1, Math.max(0, (q[0]! * ab[0]! + q[1]! * ab[1]! + q[2]! * ab[2]!) / bb)) : 0;
    const d = Math.hypot(q[0]! - t * ab[0]!, q[1]! - t * ab[1]!, q[2]! - t * ab[2]!);
    if (d < best) { best = d; r = ax.radii[s]! + (ax.radii[s + 1]! - ax.radii[s]!) * t; }
  }
  return best - r * swell;
}

const U = 300;   // the figure's units in a scene unit (shaders.ts SKIN_FIGURE_UNITS)
const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const smin = (a: number, b: number, k: number): number => { const h = Math.min(1, Math.max(0, 0.5 + 0.5 * (b - a) / Math.max(k, 1e-4))); return b + (a - b) * h - k * h * (1 - h); };

export interface RasterOpts {
  /** the outline without the depth hold-out (the reference) */
  ignoreDepth?: boolean;
  /** the hold-out as it was until 22 Nov: the pixel's depth against the axis' depth at the arm's nearest SCREEN point (the gate's proof that a turned figure had holes) */
  screenDepth?: boolean;
  /** the figure turned as a hand's orbit turns it (radians) */
  view?: { yaw: number; pitch?: number };
}
/** The skins on a screen `w` x `h` CSS px drawn at pixel ratio `dpr`: the camera the rig frames at that size (turned by `opts.view`), the line the vertex stage builds, the outline the fragment stage judges. */
export function rasterSkins(scene: CelScene, skins: readonly GateSkin[], w: number, h: number, dpr: number, opts: RasterOpts = {}): GateStat[] {
  const { ignoreDepth = false, screenDepth = false, view } = opts;
  const rig = scene.rig; rig.resize(w, h); rig.update(1000 + w);
  // (the figure turned, as a hand's orbit turns it: the same camera, swung round the target by `view` radians; the inspector's turn is the rig's public way to it, and a few big steps let its ease settle)
  rig.setInspect(true); rig.inspectTo(view?.yaw ?? 0, view?.pitch ?? 0);
  for (let i = 1; i <= 40; i++) rig.update(1000 + w + i * 1000);
  const cam = rig.camera; cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const PV = new Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  const projY = cam.projectionMatrix.elements[5]!;
  const wpc = (cw: number, scale = 1): number => (cw * 2) / (h * projY) * scale;
  const clip = (p: ArrayLike<number>): Vector4 => new Vector4(p[0], p[1], p[2], 1).applyMatrix4(PV);
  const px = (p: ArrayLike<number>, R: number): number[] => { const q = clip(p); return [(q.x / q.w * 0.5 + 0.5) * w * dpr, (q.y / q.w * 0.5 + 0.5) * h * dpr, R / wpc(q.w) * dpr, q.w]; };
  const W2 = w * dpr, H2 = h * dpr, out: GateStat[] = [];
  for (const { node, mesh, axes } of skins) {
    const n = axes.length, mates = throughMates(axes, mesh.junction.arms.map((a) => !!(a as { growing?: boolean }).growing)), kM = skinKOf(mesh.junction.arms);
    const ap = axes.map((ax) => ax.pts.map((p, i) => px(p, ax.radii[i]!)));
    // skinArmPx
    const armPx = (fx: number, fy: number, a: number, fragW: number, kPx: number, inkPx: number, fragP?: readonly number[], sub = 0): number => {
      const P = ap[a]!;
      const segs = ([[P[0], P[1]], [P[1], P[2]], [P[2], P[3]]] as number[][][]).map(([p, q]) => {
        const abx = q![0]! - p![0]!, aby = q![1]! - p![1]!, t = Math.min(1, Math.max(0, ((fx - p![0]!) * abx + (fy - p![1]!) * aby) / Math.max(abx * abx + aby * aby, 1e-6)));
        return { d: Math.hypot(fx - p![0]! - abx * t, fy - p![1]! - aby * t) - (p![2]! + t * (q![2]! - p![2]!)), w: p![3]! + t * (q![3]! - p![3]!), r: p![2]! + t * (q![2]! - p![2]!) };
      });
      const best = segs.reduce((m, x) => (x.d < m.d ? x : m));
      if (fragW < 0) return best.d;
      // (the shader's hold-out, skin/shaders.ts skinArmPx: how far the pixel's own place in the figure lies from the arm's capsule, in 3D, in px at the pixel's depth; `screenDepth` is the rule before 22 Nov)
      const gap = screenDepth ? Math.abs(fragW - best.w) / Math.max(wpc(best.w), 1e-9) * dpr - best.r - inkPx : sd3(axes[a]!, fragP!) / Math.max(wpc(fragW), 1e-9) * dpr;
      return best.d + 2 * kPx * (smooth(0.25 * kPx, kPx, gap) - sub);
    };
    // (the shader's skinArmHeld: the hold-out's share, 0 to 1; the outline takes it relative to the least-held arm, skin/shaders.ts skinSdPx)
    const armHeld = (a: number, fragW: number, kPx: number, fragP: readonly number[]): number => smooth(0.25 * kPx, kPx, sd3(axes[a]!, fragP, 1) / Math.max(wpc(fragW), 1e-9) * dpr);
    const sdPx = (fx: number, fy: number, fragW: number, kPx: number, inkPx: number, fragP?: readonly number[]): number => {
      const sub = fragW >= 0 && !screenDepth ? Math.min(...axes.map((_, i) => armHeld(i, fragW, kPx, fragP!))) : 0;
      const d = axes.map((_, i) => armPx(fx, fy, i, fragW, kPx, inkPx, fragP, sub));
      let o = 0, first = true;
      for (let i = 0; i < n; i++) {
        const m = mates[i]!;
        if (m > -0.5 && m < i - 0.5) continue;
        let di = d[i]!; if (m > i + 0.5) di = Math.min(di, d[m]!);
        o = first ? di : smin(o, di, kPx); first = false;
      }
      return o;
    };
    // the vertex stage: the surface stands the line (CSS px of it from the lumen's radius at the axis' depth) out of the rest shape
    const nv = mesh.position.length / 3, sx = new Float64Array(nv), sy = new Float64Array(nv), sw = new Float64Array(nv), ink = new Float64Array(nv);
    for (let v = 0; v < nv; v++) {
      const cc = clip([mesh.cen[v * 3]!, mesh.cen[v * 3 + 1]!, mesh.cen[v * 3 + 2]!]), wp = wpc(cc.w, U), rCss = mesh.restR[v]! * U / wp;
      const inkPx = Math.min(CEL_STYLE.LINE_MAX, Math.max(CEL_STYLE.LINE_MIN, CEL_STYLE.LINE_R * rCss)) * inkTaper(rCss), inkW = inkPx * wp / U;
      const q = clip([0, 1, 2].map((k) => mesh.position[v * 3 + k]! + mesh.normal[v * 3 + k]! * inkW));
      sx[v] = (q.x / q.w * 0.5 + 0.5) * W2; sy[v] = (q.y / q.w * 0.5 + 0.5) * H2; sw[v] = q.w; ink[v] = inkPx * dpr;
    }
    const st: GateStat = { node, pixels: 0, lumen: 0, line: 0, dropped: 0, held: 0 };
    const idx = mesh.index;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t]!, b = idx[t + 1]!, c = idx[t + 2]!;
      const den = (sy[b]! - sy[c]!) * (sx[a]! - sx[c]!) + (sx[c]! - sx[b]!) * (sy[a]! - sy[c]!);
      if (Math.abs(den) < 1e-9 || den < 0) continue;   // (front faces only, as the shader drops the rest)
      const x0 = Math.max(0, Math.floor(Math.min(sx[a]!, sx[b]!, sx[c]!))), x1 = Math.min(W2 - 1, Math.ceil(Math.max(sx[a]!, sx[b]!, sx[c]!)));
      const y0 = Math.max(0, Math.floor(Math.min(sy[a]!, sy[b]!, sy[c]!))), y1 = Math.min(H2 - 1, Math.ceil(Math.max(sy[a]!, sy[b]!, sy[c]!)));
      const q = clip([mesh.cen[a * 3]!, mesh.cen[a * 3 + 1]!, mesh.cen[a * 3 + 2]!]), kPx = kM / wpc(q.w) * dpr;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const fx = x + 0.5, fy = y + 0.5;
        const l0 = ((sy[b]! - sy[c]!) * (fx - sx[c]!) + (sx[c]! - sx[b]!) * (fy - sy[c]!)) / den, l1 = ((sy[c]! - sy[a]!) * (fx - sx[c]!) + (sx[a]! - sx[c]!) * (fy - sy[c]!)) / den, l2 = 1 - l0 - l1;
        if (l0 < 0 || l1 < 0 || l2 < 0) continue;
        const fragW = 1 / (l0 / sw[a]! + l1 / sw[b]! + l2 / sw[c]!), inkDev = (l0 * ink[a]! / sw[a]! + l1 * ink[b]! / sw[b]! + l2 * ink[c]! / sw[c]!) * fragW;
        // (the pixel's place in the figure: the vertices' lumen positions, interpolated perspective-correct, as the varying vPos is)
        const fragP = [0, 1, 2].map((k) => (l0 * mesh.position[a * 3 + k]! / sw[a]! + l1 * mesh.position[b * 3 + k]! / sw[b]! + l2 * mesh.position[c * 3 + k]! / sw[c]!) * fragW);
        const sd = sdPx(fx, fy, ignoreDepth ? -1 : fragW, kPx, inkDev, fragP);
        st.pixels++;
        if (!ignoreDepth && Math.abs(sd - sdPx(fx, fy, -1, kPx, inkDev)) > 1) st.held++;
        if (sd > inkDev + 0.5) st.dropped++; else if (sd > -0.5) st.line++; else st.lumen++;
      }
    }
    out.push(st);
  }
  return out;
}
