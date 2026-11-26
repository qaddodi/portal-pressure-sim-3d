// What the sinusoid view draws that a label must never stand on (Mohammad, 26 Nov: the Protein callout "sits inside the bile duct ... it has to be in a clean area"): the hepatocytes' nuclei, the bile
// canaliculi, the Kupffer and stellate cells' bodies, and the cell borders (faint lines, kept clear by the callouts that choose a clean spot). ONE keep-out set, in the same micrometres the layout
// stands in, projected to the screen by the caller: names.ts keeps every name off it (the layout's `settle` treats the bodies as fixed boxes and steps a name clear of them, `clearSpot` picks a
// callout's place from what is free), and tests/label-keepout.test.ts holds every name of every screen size to it. The places are the 3D scene's own (micro3d/sinusoid3d.ts: nuclei at
// `cellOf`'s nu / nv / nr, binucleate ones as two at 0.8 of the radius, the canaliculus at `edgeAt(j, sd, UM.hep / 2)` of radius CANAL_R, the Kupffer cell's body at KUP_SCALE).
// Pure: no DOM, no GPU.
import { CELL, SEED, UM, cellOf, edgeAt } from './layout.ts';

/** The canaliculus's radius (µm), the Kupffer cell's size against its design and its centre's depth in the lumen: sinusoid3d.ts CANAL_R, KUP_SCALE (kept equal by tests/label-keepout.test.ts). */
export const CANAL_R = 0.72, KUP_SCALE = 0.72;
/** What a label keeps off, by kind. A `border` is a line (the cell borders), the others are round. */
export type StructKind = 'nucleus' | 'canaliculus' | 'kupffer' | 'stellate' | 'border';
export interface Circle { kind: Exclude<StructKind, 'border'>; x: number; y: number; r: number }
export interface Seg { kind: 'border'; x1: number; y1: number; x2: number; y2: number }
export interface Keepout { circles: Circle[]; segs: Seg[] }
export interface StructGeom {
  xs: number; xk: number;
  halfW(x: number): number; wallIn(x: number): number; hepIn(x: number): number; disseW(x: number): number;
}
/** The Kupffer cell's reach (µm) from its centre: its body and its arms (layout.ts KUP_HALF, the span the names already keep clear of). */
export const KUP_REACH = 3.9;
/** The stellate cell's reach (µm) from its centre in the space of Disse: its body, in a band 3.4 µm wide. */
export const HSC_REACH = 2.2;

/** The keep-out set for the stretch lo..hi µm along the sinusoid, in the plane's own µm (x along, y across with y down as the shader has it). */
export function structuresOf(g: StructGeom, lo: number, hi: number): Keepout {
  const circles: Circle[] = [], segs: Seg[] = [];
  for (const [sd, s] of [[SEED.plateUp, -1], [SEED.plateDn, 1]] as const) {
    for (let j = Math.floor(lo / CELL) - 1; j <= Math.ceil(hi / CELL) + 1; j++) {
      const c = cellOf(j, sd), xn = c.x0 + (c.x1 - c.x0) * c.nu, v = c.nv * UM.hep;
      const put = (x: number, r: number) => circles.push({ kind: 'nucleus', x, y: s * (g.hepIn(x) + v), r });
      if (c.bi) { const dx = (c.x1 - c.x0) * 0.17; put(xn - dx, c.nr * 0.8); put(xn + dx, c.nr * 0.8); } else put(xn, c.nr);
      const xe = edgeAt(j, sd, UM.hep * 0.5);
      circles.push({ kind: 'canaliculus', x: xe, y: s * (g.hepIn(xe) + UM.hep * 0.5), r: CANAL_R });
      // the border of this cell with the one before it: from the face on Disse down the plate
      for (let q = 0; q < 10; q++) {
        const v0 = UM.hep * q / 10, v1 = UM.hep * (q + 1) / 10, x0 = edgeAt(j, sd, v0), x1 = edgeAt(j, sd, v1);
        segs.push({ kind: 'border', x1: x0, y1: s * (g.hepIn(x0) + v0), x2: x1, y2: s * (g.hepIn(x1) + v1) });
      }
    }
  }
  circles.push({ kind: 'kupffer', x: g.xk, y: g.halfW(g.xk) - 1.7, r: KUP_REACH });
  circles.push({ kind: 'stellate', x: g.xs, y: -(g.wallIn(g.xs) + g.disseW(g.xs) * 0.5), r: HSC_REACH });
  return { circles, segs };
}

/** A box in px. */
export interface PxBox { x0: number; x1: number; y0: number; y1: number }
/** The keep-out set on the screen: `toScreen` takes a place of the plane (µm) to px, `k` is px per µm. */
export interface PxKeepout { circles: { kind: Circle['kind']; x: number; y: number; r: number }[]; segs: { x1: number; y1: number; x2: number; y2: number }[] }
export function toPx(K: Keepout, toScreen: (x: number, y: number) => readonly [number, number], k: number): PxKeepout {
  return {
    circles: K.circles.map((c) => { const [x, y] = toScreen(c.x, c.y); return { kind: c.kind, x, y, r: c.r * k }; }),
    segs: K.segs.map((s) => { const [x1, y1] = toScreen(s.x1, s.y1), [x2, y2] = toScreen(s.x2, s.y2); return { x1, y1, x2, y2 }; }),
  };
}
/** How far (px) the circle's centre is from the box (0 when inside it). */
const circleGap = (b: PxBox, c: { x: number; y: number }): number => Math.hypot(Math.max(b.x0 - c.x, 0, c.x - b.x1), Math.max(b.y0 - c.y, 0, c.y - b.y1));
/** The round structures a box covers (within `margin` px of their edge), by kind. */
export function circlesHit(b: PxBox, K: PxKeepout, margin = 0, kinds?: ReadonlySet<Circle['kind']>): PxKeepout['circles'] {
  return K.circles.filter((c) => (!kinds || kinds.has(c.kind)) && circleGap(b, c) < c.r + margin);
}
/** The cell borders a box covers (within `margin` px of the line). */
export function bordersHit(b: PxBox, K: PxKeepout, margin = 0): PxKeepout['segs'] {
  return K.segs.filter((s) => {
    const n = Math.max(2, Math.ceil(Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / 3));
    for (let i = 0; i <= n; i++) {
      const x = s.x1 + (s.x2 - s.x1) * i / n, y = s.y1 + (s.y2 - s.y1) * i / n;
      if (x > b.x0 - margin && x < b.x1 + margin && y > b.y0 - margin && y < b.y1 + margin) return true;
    }
    return false;
  });
}
