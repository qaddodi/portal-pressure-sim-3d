// Plan 16's gate G1 (tests/skin-parts.test.ts): how far the vertices of the DRAWN mesh stand from the live union of the arms that are there. A skin draws whatever triangles its mesh has; the fragment stage can recolour or drop a pixel but cannot move
// the surface it lies on, so a junction is welded only where the mesh itself is the smooth union of the arms that are there at their live widths. The vertex stage's own move is replayed (a vertex goes out its normal by rest radius x (blended swell - 1), shaders.ts),
// and the distance is the exact one of skin/exact-normal.ts skinArmSd3 (sd3), the union the smooth minimum of the kept arms' capsules at the skin's blend width, a through run's halves a plain minimum.
import { sd3, type GateSkin } from './skin-gate-lib.ts';
import { skinKOf } from '../src/scene/vessels/skin/sdf.ts';

const smin = (a: number, b: number, k: number): number => { const h = Math.min(1, Math.max(0, 0.5 + 0.5 * (b - a) / Math.max(k, 1e-4))); return b + (a - b) * h - k * h * (1 - h); };

export interface OffUnion { vertices: number; p50: number; p95: number; max: number; /** vertices more than `tolPx` off, split into out of the union (stub, outside) and inside it */ over: number; outside: number; inside: number }

/** The live union of the kept arms at a point: the smooth minimum of their capsules at their live swells (an absent arm 1e9). */
export function unionAt(skin: GateSkin, p: readonly number[], swell: readonly number[], keep: readonly boolean[]): number {
  const { axes, mesh } = skin, k = skinKOf(mesh.junction.arms), d = axes.map((ax, i) => (keep[i] ? sd3(ax, p, swell[i]!) : 1e9));
  let o = 0, first = true;
  for (let i = 0; i < axes.length; i++) {
    const m = axes[i]!.mate ?? -1;
    if (m > -0.5 && m < i - 0.5) continue;
    let di = d[i]!; if (m > i + 0.5) di = Math.min(di, d[m]!);
    o = first ? di : smin(o, di, k); first = false;
  }
  return o;
}

/** The distance (px at `pxPerUnit`) of the mesh's vertices from the live union of the kept arms; seam-ring vertices are the tubes' own and are left out (they are the arms, not the fillet). */
export function offUnion(skin: GateSkin, swell: readonly number[], keep: readonly boolean[], pxPerUnit = 700, tolPx = 2): OffUnion {
  const { mesh, axes } = skin, n = axes.length, nv = mesh.position.length / 3, seam = new Set<number>(mesh.seamVerts.flatMap((a) => [...a]));
  const ds: number[] = []; let outside = 0, inside = 0;
  for (let v = 0; v < nv; v++) {
    if (seam.has(v)) continue;
    let sw = 0; for (let i = 0; i < n; i++) sw += (i < 4 ? mesh.weight[v * 4 + i]! : mesh.weight2[v * 2 + i - 4]!) * swell[i]!;
    const rst = mesh.restR[v]!, p = [0, 1, 2].map((c) => mesh.position[v * 3 + c]! + mesh.normal[v * 3 + c]! * rst * (sw - 1));
    const d = unionAt(skin, p, swell, keep) * pxPerUnit;
    ds.push(Math.abs(d)); if (d > tolPx) outside++; else if (d < -tolPx) inside++;
  }
  ds.sort((a, b) => a - b);
  const q = (f: number): number => ds[Math.min(ds.length - 1, Math.floor(f * ds.length))] ?? 0;
  return { vertices: ds.length, p50: q(0.5), p95: q(0.95), max: ds[ds.length - 1] ?? 0, over: outside + inside, outside, inside };
}

// ---- which mesh a skin draws at a patient's numbers, and the numbers it is judged by ---------------------------------------------------------------------------------------------------------------------------------------------
import { collateralOpen } from '../src/scene/vessels/network.ts';
import { partKey } from '../src/scene/vessels/skin/plain.ts';
import { swellOf } from './skin-live-lib.ts';
import type { gateSkins } from './skin-gate-lib.ts';

/** One skin at one frame of the engine: the mesh the skin set draws for the growers that are there (skin-set.ts sync), and the live swell and keep flags of its arms. `kind`: whole (no growing arm), welded (every grower there), part (some), plain (none, the plain trunk), tubes (none and no plain trunk: the tubes' own cut ends carry the weld). */
export interface Drawn { /** the welded skin of the node at the same frame (what was drawn before parts): its mesh, live swells and keep flags */ full: { skin: GateSkin; swell: number[]; keep: boolean[] }; node: string; kind: 'whole' | 'welded' | 'part' | 'plain' | 'tubes'; here: string[]; growers: string[]; skin: GateSkin | null; swell: number[]; keep: boolean[] }
export interface EngineFrame { D: ArrayLike<number> }

export function drawnSkins(g: ReturnType<typeof gateSkins>, fr: EngineFrame & Record<string, unknown>): Drawn[] {
  return g.skins.map((s) => {
    const arms = s.mesh.junction.arms, gi = arms.map((a, i) => (a.grow ? i : -1)).filter((i) => i >= 0);
    const open = (i: number): boolean => collateralOpen(arms[i]!.vesselId, fr as never);
    const here = gi.filter(open);
    const base = { node: s.node, growers: gi.map((i) => arms[i]!.vesselId), here: here.map((i) => arms[i]!.vesselId) };
    let kind: Drawn['kind'], skin: GateSkin | null;
    if (!gi.length) { kind = 'whole'; skin = s; }
    else if (here.length === gi.length) { kind = 'welded'; skin = s; }
    else if (here.length) { kind = 'part'; skin = g.partsOf(s.node).find((p) => p.key === partKey(here))?.skin ?? null; }
    else { skin = g.plain(s.node) ?? null; kind = skin ? 'plain' : 'tubes'; }
    const a = skin?.mesh.junction.arms ?? [];
    const fa = s.mesh.junction.arms, full = { skin: s, swell: fa.map((x) => swellOf(fr.D[x.dataIndex]!, x.baseD, x.widthKind)), keep: fa.map((x) => !x.grow || collateralOpen(x.vesselId, fr as never)) };
    return { ...base, full, kind, skin, swell: a.map((x) => swellOf(fr.D[x.dataIndex]!, x.baseD, x.widthKind)), keep: a.map((x) => !x.grow || collateralOpen(x.vesselId, fr as never)) };
  });
}
