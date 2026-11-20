// The mark on the lobule's selected part (2D draws it through the vessel layer's F_SEL flag: the selection's vessels bright, the rest at 0.55). The tap-anything card says what was tapped; this
// shows it: a halo of the part's own shape under it, in the look's highlight colour, that fades in and out and, along a vessel, thins out toward both ends (the same way a vein's highlight in the anatomy does).
// The shapes are pure (lobule radii, y down) so the tests build them in node; the mesh is the only part that needs three.
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial } from 'three';
import type { LobuleHit, PickTube } from './pick.ts';
import type { LobuleNet, P2 } from './geometry.ts';
import { PLATE_Z } from './plate.ts';
import { LOBULE_R, lobuleToScene } from './shots.ts';

/** One polyline of the mark: its width across (lobule radii), whether it closes on itself, and whether it thins toward its ends. */
export interface MarkLine { pts: P2[]; w: number; closed: boolean; fade: boolean }
export interface MarkEnv { net: LobuleNet; tubes: readonly PickTube[]; cvRadius: number; septU: number; radius(t: PickTube, i: number): number }

const circle = (c: P2, r: number, n = 48): P2[] => Array.from({ length: n }, (_, i) => [c[0] + r * Math.cos((i / n) * 2 * Math.PI), c[1] + r * Math.sin((i / n) * 2 * Math.PI)] as P2);
const RING_W = 0.022, PAD = 0.014;

/** What to draw round the hit part, or [] when the part has no shape to mark (nothing hit). */
export function markShapes(hit: LobuleHit | null, e: MarkEnv): MarkLine[] {
  if (!hit) return [];
  const tr = hit.tri != null ? e.net.triads[hit.tri] : undefined;
  const tube = hit.tube != null ? e.tubes.find((t) => t.id === hit.tube) : undefined;
  const lines: MarkLine[] = [];
  const along = (t: PickTube) => {
    let r = 0; for (let i = 0; i < t.pts.length; i += 4) r = Math.max(r, e.radius(t, i));
    lines.push({ pts: t.pts.map((p) => [p[0], p[1]] as P2), w: 2 * (r + PAD), closed: false, fade: true });
  };
  switch (hit.part) {
    case 'cv': lines.push({ pts: circle([0, 0], e.cvRadius + PAD), w: RING_W, closed: true, fade: false }); break;
    case 'triad': if (tr) lines.push({ pts: circle([tr.x, tr.y], e.net.rt * 1.1), w: RING_W, closed: true, fade: false }); break;
    case 'ha': case 'bd': case 'lv': {
      if (tube) { along(tube); break; }
      if (tr) lines.push({ pts: circle(tr[hit.part], 0.05), w: RING_W, closed: true, fade: false });
      break;
    }
    case 'septum': {
      const C = e.net.corners;
      lines.push({ pts: C.map((p) => [p[0], p[1]] as P2), w: RING_W, closed: true, fade: false });
      if (e.septU > 0.18) for (const s of e.net.septa) lines.push({ pts: s.map((p) => [p[0], p[1]] as P2), w: 2 * PAD, closed: false, fade: true });
      break;
    }
    case 'hep': {
      // the zone's band: its outer and inner hexagon (hexFrac 1 is the corners; zone 1 runs .66 to 1, zone 2 .36 to .66, zone 3 the centre to .36)
      const z = hit.zone ?? 1, hi = [1, 0.66, 0.36][z - 1]!, lo = [0.66, 0.36, 0][z - 1]!;
      for (const q of lo > 0 ? [hi, lo] : [hi]) lines.push({ pts: e.net.corners.map((p) => [p[0] * q, p[1] * q] as P2), w: RING_W, closed: true, fade: false });
      break;
    }
    default: if (tube) along(tube);   // a sinusoid, a vessel of the net, a canal: its own course
  }
  return lines;
}

/** Across a halo ribbon: the position (-1 to 1 of the half width) and the alpha, bright at the middle and thinning to nothing at both edges. */
const ACROSS: readonly (readonly [number, number])[] = [[-1, 0], [-0.75, 0.16], [-0.5, 0.42], [-0.25, 0.7], [0, 0.85], [0.25, 0.7], [0.5, 0.42], [0.75, 0.16], [1, 0]];

/** The halo as triangles: for each line a ribbon of its width, with an alpha per vertex (1, or thinning to 0.18 at the two ends of a vessel). */
export function ribbon(lines: readonly MarkLine[], z: number): { pos: number[]; col: (number)[]; idx: number[] } {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (const L of lines) {
    const n = L.pts.length;
    if (n < 2) continue;
    const base = pos.length / 3, h = L.w / 2;
    for (let i = 0; i < n; i++) {
      const a = L.pts[L.closed ? (i + n - 1) % n : Math.max(0, i - 1)]!, b = L.pts[L.closed ? (i + 1) % n : Math.min(n - 1, i + 1)]!;
      let dx = b[0] - a[0], dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      const p = L.pts[i]!, u = n > 1 ? i / (n - 1) : 0;
      const al = L.fade ? 0.18 + 0.82 * Math.min(1, 5 * Math.min(u, 1 - u)) : 1;
      // across the ribbon: the part's own line clear, then a glow thinning to nothing at the edge (a halo, not an outline)
      for (let j = 0; j < ACROSS.length; j++) {
        const [s, a] = ACROSS[j]!;
        const q = lobuleToScene(p[0] - dy * h * s, p[1] + dx * h * s, z);   // (y is down in the lobule's plane; lobuleToScene flips it)
        pos.push(q[0], q[1], q[2]);
        col.push(1, 1, 1, a * al);
      }
    }
    const m = L.closed ? n : n - 1;
    const C = ACROSS.length;
    for (let i = 0; i < m; i++) for (let j = 0; j < C - 1; j++) { const a = base + C * i + j, b = base + C * ((i + 1) % n) + j; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  }
  return { pos, col, idx };
}

export const MARK_FADE_MS = 180;

/** The mark in the lobule's group: set it with a hit, step it on the clock (it eases in and out), colour it with the look. */
export class LobuleMark {
  readonly mesh: Mesh;
  private amount = 0;
  private want = 0;
  private shown = false;
  private readonly mat = new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, opacity: 0 });
  constructor(parent: Group) {
    this.mesh = new Mesh(new BufferGeometry(), this.mat);
    this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.name = 'lobule/mark'; this.mesh.renderOrder = 1;
    parent.add(this.mesh);
  }
  setColour(hex: string): void { this.mat.color.set(hex); }
  /** The part to mark, or null to let it go. The new shape appears at once under the fading alpha (a new part fades in from nothing). */
  set(hit: LobuleHit | null, e: MarkEnv): void {
    const lines = markShapes(hit, e);
    this.want = lines.length ? 1 : 0;
    if (!lines.length) return;
    const r = ribbon(lines, PLATE_Z + 0.02 * LOBULE_R);
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(r.pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(r.col, 4));
    g.setIndex(r.idx);
    this.mesh.geometry.dispose(); this.mesh.geometry = g;
    this.amount = this.shown ? this.amount : 0;
  }
  /** Steps the fade; true while it moves. */
  step(dtMs: number, instant: boolean): boolean {
    const k = instant ? 1 : Math.min(1, dtMs / MARK_FADE_MS);
    if (this.amount !== this.want) this.amount = Math.abs(this.want - this.amount) <= k ? this.want : this.amount + Math.sign(this.want - this.amount) * k;
    this.mat.opacity = this.amount; this.shown = this.amount > 0; this.mesh.visible = this.amount > 0.001;
    return this.amount !== this.want;
  }
  dispose(): void { this.mesh.geometry.dispose(); this.mat.dispose(); }
}
