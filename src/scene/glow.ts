// The selection glow (owner, 20 Nov: "instead of an outline, make it a glow"): a soft halo in the item's own tone round what is selected, strongest at its edge and thinning to nothing a short way out,
// that fades away along the vessel toward both ends and eases in and out. A vessel's is a ribbon laid along its course, behind nothing and over nothing of its own (it is clear over the lumen), with an
// alpha across the ribbon; the organs' is a few hulls of growing width (highlight.ts OrganPins); the lobule's is the same ribbon (lobule/mark.ts). No outline is widened or recoloured.
import { VESSEL_LAYER } from './layers.ts';
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Mesh, MeshBasicMaterial, type Group } from 'three';

/** How far past the lumen's edge the halo reaches, scene units (a figure unit is 1/300 of one): a few device px at the fit, as the figure itself grows. */
export const GLOW_REACH = 0.04;
/** The halo's alpha across the ribbon, from the lumen's edge (1) outward to its reach (0): the bright rim then a long soft tail, as a blur falls. */
export const GLOW_PROFILE: readonly (readonly [number, number])[] = [[0, 0.62], [0.2, 0.46], [0.4, 0.28], [0.6, 0.15], [0.8, 0.06], [1, 0]];

type P3 = readonly [number, number, number];

/** The ribbon of a course: at each point, columns across (the lumen's inside clear, the rim at the edge, the soft tail out), with the along-vessel strength `along(u)` (0 to 1, u the share of the length) as a factor on alpha. */
export function glowRibbon(pts: readonly P3[], radius: number, along: (u: number) => number, reach = GLOW_REACH + radius * 0.6): { pos: number[]; col: number[]; idx: number[] } {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const n = pts.length;
  if (n < 2) return { pos, col, idx };
  // the columns: from one side's tail in to its rim, a clear stretch over the lumen, and out again
  const cols: { off: number; a: number }[] = [];
  for (let i = GLOW_PROFILE.length - 1; i >= 0; i--) cols.push({ off: -(radius + reach * GLOW_PROFILE[i]![0]), a: GLOW_PROFILE[i]![1] });
  cols.push({ off: -radius * 0.85, a: 0 }, { off: radius * 0.85, a: 0 });
  for (let i = 0; i < GLOW_PROFILE.length; i++) cols.push({ off: radius + reach * GLOW_PROFILE[i]![0], a: GLOW_PROFILE[i]![1] });
  const seg: number[] = [0];
  for (let i = 1; i < n; i++) seg.push(seg[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  const total = seg[n - 1]! || 1, C = cols.length;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)]!, b = pts[Math.min(n - 1, i + 1)]!, p = pts[i]!;
    let dx = b[0] - a[0], dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const k = along(seg[i]! / total);
    for (const c of cols) { pos.push(p[0] - dy * c.off, p[1] + dx * c.off, p[2]); col.push(1, 1, 1, c.a * k); }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < C - 1; j++) { const a = i * C + j, b = (i + 1) * C + j; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  return { pos, col, idx };
}

/** A glow mesh in a group, sized to one course; `amount` (0 to 1) is how far it has eased in. */
export class VesselGlow {
  readonly mesh: Mesh;
  private readonly mat = new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, depthTest: false, side: DoubleSide, opacity: 0 });
  constructor(parent: Group) {
    this.mesh = new Mesh(new BufferGeometry(), this.mat);
    this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.name = 'highlight/glow'; this.mesh.renderOrder = 30;
    this.mesh.layers.set(VESSEL_LAYER);   // (the vessels' own pass: scene.ts draws layer 0, then the vessels over the cleared depth; a glow left on layer 0 was drawn before them)
    parent.add(this.mesh);
  }
  /** Lay the halo along `pts` with this strength along the vessel. */
  build(pts: readonly P3[], radius: number, along: (u: number) => number): void {
    const r = glowRibbon(pts, radius, along);
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(r.pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(r.col, 4));
    g.setIndex(r.idx);
    this.mesh.geometry.dispose(); this.mesh.geometry = g;
  }
  /** `rgb` are the sRGB values 0..1 as the cel shaders hold them (not three's linear): the material's colour is converted so the screen shows them as they are. */
  setColour(r: number, g: number, b: number): void { this.mat.color.setRGB(r, g, b).convertSRGBToLinear(); }
  /** Eased in: smoothstep of the highlight's own linear fade, times `gate` (0 to 1: how much of the glow the Circuit's change has left it, highlight.ts glowGate); hidden at nothing. */
  show(amount: number, gate: number): void {
    this.mat.opacity = amount * amount * (3 - 2 * amount) * gate;
    this.mesh.visible = gate > 0.001 && amount > 0.001;
  }
  dispose(): void { this.mesh.geometry.dispose(); this.mat.dispose(); this.mesh.removeFromParent(); }
}
