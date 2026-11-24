// Where the approved placement moves each organ in the front view (docs/approved/anatomy-placement.md: "the abdomen is pulled 16% toward the middle; the liver keeps its right lobe width"; the spleen toward the stomach; the kidney
// further in). The mock moves an organ's outline by p -> t and then pulls its x toward xs[1] by xs[0] (page/geom.js inflateOrgan), never a turn or a scale in y: so the move is one axis-aligned map of the plane, X = sx * x + ox,
// Y = y + oy. Everything 2D lays on an organ by its place in the 2D figure (the art, the oesophagus's seam, the stomach's box and pool, the liver's texture and cirrhotic field, the pivots it scales about) is laid on the moved
// organ through this map, so it lands where it did on the old one. Pure arithmetic.
import { PLACED } from '../anatomy/source.ts';
import { PLACED_ORGANS } from '../anatomy/placement.generated.ts';

/** One organ's placement parameters as the mock's data block has them (placement-data.json organs.A). */
export interface PlacedOrganA {
  zc?: number; thick?: number; back?: number; xs?: readonly [number, number]; p?: readonly [number, number]; t?: readonly [number, number]; hide?: boolean;
  zones?: readonly { axis: string; from: number; to: number; dz?: number; dx?: number; round?: boolean }[];
}
export const PLACED_A: Readonly<Record<string, PlacedOrganA>> = PLACED_ORGANS.A;
/** The organs the placement moves and re-inflates (the gut's pillows are hidden: the gut is tubes, organs/gut-tubes.ts). */
export const INFLATED_IDS: readonly string[] = Object.keys(PLACED_A).filter((id) => !PLACED_A[id]!.hide && (PLACED_A[id]!.thick ?? 0) > 0);

export interface PlaneMap { sx: number; ox: number; oy: number }
const IDENTITY: PlaneMap = { sx: 1, ox: 0, oy: 0 };
/** The organ's move in the front view: X = sx x + ox, Y = y + oy (scene units). The identity for an organ the placement does not move, and for every organ with the switch off. */
export function planeMap(id: string): PlaneMap {
  const A = PLACED ? PLACED_A[id] : undefined;
  if (!A || A.hide || !A.thick) return IDENTITY;
  const xs = A.xs ?? [1, 0], p = A.p ?? [0, 0], t = A.t ?? p;
  if (A.zones?.some((z) => z.dx)) throw new Error(`placed-map: ${id} moves part of itself sideways; its art cannot follow one map`);
  return { sx: xs[0], ox: xs[0] * (t[0] - p[0] - xs[1]) + xs[1], oy: t[1] - p[1] };
}
export const mapX = (m: PlaneMap, x: number): number => m.sx * x + m.ox;
export const mapY = (m: PlaneMap, y: number): number => y + m.oy;
export const unmapX = (m: PlaneMap, x: number): number => (x - m.ox) / m.sx;
export const unmapY = (m: PlaneMap, y: number): number => y - m.oy;
/** A box (min x, max y, width, height) in scene units, moved with its organ. */
export const mapBox = (m: PlaneMap, b: readonly [number, number, number, number]): [number, number, number, number] => [mapX(m, b[0]), mapY(m, b[1]), b[2] * m.sx, b[3]];
export const unmapBox = (m: PlaneMap, b: readonly [number, number, number, number]): [number, number, number, number] => [unmapX(m, b[0]), unmapY(m, b[1]), b[2] / m.sx, b[3]];
