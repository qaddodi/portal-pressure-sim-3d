// Clots (thrombus): the 2D figure's lumpy plug that lies against one wall of the vein, grows from that wall as the occlusion rises, lengthens, and at full occlusion spans the lumen with blunt ends (copied/clot-shape.js).
// PLAN 26: the clot is PAINTED IN ITS VEIN'S OWN FRAGMENT SHADER (clot-field.ts), not drawn as a mesh. A separate mesh inside an opaque tube had to win a depth contest against that tube at every pixel and every angle and stay inside an outline
// it did not share (root cause of the torn, angle-dependent clots with faded ends: plans 11, 19). This layer is only the eased occlusion of each clot and the writer of its uniforms: for each piece of the vein, where along the whole clot the piece
// lies (f0, df), the clot's length, its side times its occlusion, its seed's lump phases. The vessel's shader and the junction skins' shaders (the arms that carry the vein) do the rest.
// A clot thickens and thins with its parameter in a moment (lesion-ease.js) and never pops: a new clot grows from nothing, a lysed one shrinks to nothing.
import { Group } from 'three';
import type { LookId } from '../../looks/looks.ts';
import type { Palette } from '../palette.ts';
import { type Host, type Swells, radiusAtShare, cavaWallShare, cavaFarWallShare, drawnHost, swellsOf } from './host.ts';
import { CAUDATE_VEIN_ID } from '../vessels/caudate-veins.ts';
import { PLACED_HV_TRUNK } from '../anatomy/placed-network.ts';
import { NETWORK_BY_ID } from '../vessels/network.ts';
import { ClotGrow } from './clot-ease.ts';
import { clotTokens } from './paint.ts';
import { setClotTones } from './clot-uniforms.ts';
import { type ClotUniform, clotPhases, clotPiece, clotRange, ostialLength, CLOT_CAP_LEN, CLOT_V_FROM } from './clot-field.ts';

/** What the layer needs of a drawn vessel: its piece's clot uniform. */
export interface ClotSink { setClot(c: ClotUniform | null): void }

interface Clot { id: string; grow: ClotGrow; goal: number; cur: number; written: number; cava: number; vein: number }

const hasClotSink = (v: object): v is ClotSink => typeof (v as { setClot?: unknown }).setClot === 'function';

/** Where each piece of the drawn vein lies along its whole arc (scene units): [start, end] per piece, the pieces sharing their joints. */
export function pieceRanges(host: Host): Array<[number, number]> {
  const end: number[] = host.pieces.map(() => 0);
  host.piece.forEach((k, i) => { end[k] = host.s[i]!; });
  end[host.pieces.length - 1] = host.length;
  return host.pieces.map((_, k) => [k === 0 ? 0 : end[k - 1]!, end[k]!] as [number, number]);
}

/** Where a vein's clot is anchored (plan 34c): Budd-Chiari is hepatic vein thrombosis, so the hepatic veins and the caudate vein are clotted at their OSTIUM and upstream; every other vein (the portal trunk, the splenic confluence, the renal veins) keeps 2D's clot from the middle. A table, not inferred. */
const OSTIUM = new Set(['RHV_IVC', 'MHV_IVC', 'LHV_IVC', CAUDATE_VEIN_ID]);
export const clotAnchor = (id: string): 'ostium' | 'mid' => (OSTIUM.has(id) ? 'ostium' : 'mid');

/** Where a clot in `host` must stop upstream (share of the drawn host): just downstream of the middle hepatic vein's mouth on the common trunk (its join point plus that vein's radius), for the trunk's host; 0 for every other vein. */
export function mergeShare(host: Host): number {
  const t = PLACED_HV_TRUNK, last = host.pieces[host.pieces.length - 1];
  if (!(t.length > 0) || last?.id !== t.piece) return 0;
  let bi = 0, bd = Infinity; host.pts.forEach((q, i) => { const d = Math.hypot(q.x - t.at[0], q.y - t.at[1], q.z - t.at[2]); if (d < bd) { bd = d; bi = i; } });
  return Math.min(1, (host.s[bi]! + (NETWORK_BY_ID.get(t.joiner)?.radius ?? 0)) / host.length);
}
/** WHERE THE CLOT ENDS BEFORE THE JOIN (Mohammad, 25 Nov: "can make the clot end before the actual join"): the clot used to run out to the IVC's wall and end there in a hard one-pixel cut. Now its cap's tip stops this many VEIN WIDTHS short of the wall at the vein's centre line
 *  (the wall slants across the vein by 0.15 to 0.75 widths, so even at the near silhouette the clot is clear of it). The same for the middle hepatic vein and the trunk's wall it opens into, and the caudate vein. The wall's cut stays as the safety (nothing is ever inside the cava), but no clot reaches it. */
export const CLOT_JOIN_GAP = 1;
/** THE COMMON TRUNK CLOTTED MORE (Mohammad, 25 Nov: "Q+"): the vein that carries the shared trunk (the left hepatic vein, mergeShare > 0) has its clot run on past the middle vein's mouth and into the left vein, this share of the drawn vein at full occlusion, (1 + 2 v) / 3 of it at v;
 *  every other ostial vein keeps its (1 + 2 v) widths. The share is under OSTIAL_MAX_SHARE. */
export const TRUNK_CLOT_SHARE = 0.42;

/** The ostial clot's ends (plans 34d, 34e, and the 25 Nov build): the distal end a and the proximal end b, shares of the drawn vein. b0 is plan 34d's end: the cap's length short of the IVC's drawn wall at the vein's centre line (a fixed point), where the cap's tip would touch the wall. The clot's body
 *  ends CLOT_JOIN_GAP vein widths before that, so its tip stops that far short of the wall; a is `ostialLength` (vein widths) upstream of b, or the trunk's TRUNK_CLOT_SHARE of the vein. It does not depend on the slant. `far` (cavaFarWallShare) is the last place any line across the vein is outside the IVC, the old end of the body;
 *  it is returned for the tests that hold the clot clear of the wall. Null for a vein that does not open into the cava. */
export function ostialEnds(host: Host, v: number, cavaSwell: number, veinSwell = 1): { a: number; b: number; b0: number; D: number; wall: number; far: number } | null {
  const wall = cavaWallShare(host, cavaSwell), far = cavaFarWallShare(host, cavaSwell, veinSwell);
  if (wall == null || far == null) return null;
  let b0 = wall;
  for (let i = 0; i < 4; i++) b0 = wall - CLOT_CAP_LEN * radiusAtShare(host, b0) / host.length;   // (the cap's length is in lumen radii at the clot's own end: a fixed point)
  const D = 2 * radiusAtShare(host, b0), b = Math.max(b0 - CLOT_JOIN_GAP * D / host.length, 0);
  // (A SHARED TRUNK (placed anatomy, Mohammad 25 Nov: "RHV alone, MHV+LHV shared trunk"; Q+: the trunk clotted more): the left hepatic vein's clot is the trunk's and runs on past the middle hepatic vein's mouth into the left vein)
  const len = mergeShare(host) > 0 ? ((1 + 2 * v) / 3) * TRUNK_CLOT_SHARE : ostialLength(v, D, host.length) / host.length;
  return { a: clotRange(v, b, len).a, b, b0, D, wall, far };
}

/** The clot's uniform for each piece of `host` at occlusion `v` (side * v: the seed's wall). An 'ostium' vein's clot runs to the IVC's wall across the vein's width and grows upstream (ostialEnds). `veinSwell`: the vein's live width over its built one at the cava end. */
export function clotUniforms(host: Host, v: number, cavaSwell: number, id: string, veinSwell = 1): ClotUniform[] {
  const e = clotAnchor(id) === 'ostium' ? ostialEnds(host, v, cavaSwell, veinSwell) : null;
  const { a, b } = e ?? clotRange(v, null), { side } = clotPhases(id);
  return pieceRanges(host).map(([s0, s1]) => clotPiece(a, b, host.length, s0, s1, side * v, id));
}

export class ClotLayer {
  /** (empty: nothing is a mesh now; the scene's layer lists still hold the group) */
  readonly group = new Group();
  private clots = new Map<string, Clot>();
  private sinks = new Map<string, ClotSink[]>();

  /** The drawn vessels by network id: the pieces a clot is written to. */
  bindPieces(vessels: readonly { edge?: { id: string } | null }[]): void {
    for (const v of vessels) if (v.edge && hasClotSink(v)) { const l = this.sinks.get(v.edge.id) ?? []; l.push(v); this.sinks.set(v.edge.id, l); }
  }

  applyLook(look: LookId, _p: Palette): void { setClotTones(clotTokens(look)); }

  /** The params' thrombus map. `instant` (a new patient) takes it whole. `D`: the engine's diameter of every edge (mm): a cava-opening vein's clot ends at the cava's wall. Returns true while a clot grows or shrinks. */
  set(thrombus: Record<string, number>, dt: number, instant = false, D: ArrayLike<number> | null = null): boolean {
    for (const id of Object.keys(thrombus)) if (!this.clots.has(id) && drawnHost(id)) this.clots.set(id, { id, grow: new ClotGrow(), goal: 0, cur: 0, written: -1, cava: NaN, vein: NaN });
    let moving = false;
    for (const c of this.clots.values()) {
      c.goal = thrombus[c.id] ?? 0;
      c.grow.to(c.goal, instant); c.grow.step(instant ? 0 : dt);
      const next = c.grow.v;   // (the DRAWN occlusion eases on its own profile: clot-ease.ts; the engine's value is untouched)
      const host = drawnHost(c.id)!, sw = swellsOf(host, D) as Swells, cava = sw.cava ?? 1, vein = sw[sw.length - 1] ?? 1;   // (the vein's own live width at its cava end: where the wall crosses its width)
      if (next !== c.cur || c.written !== next || Math.abs(cava - c.cava) > 0.004 * cava || Math.abs(vein - c.vein) > 0.004 * vein) { c.cur = next; this.write(c, host, cava, vein); }
      if (c.cur !== c.goal || c.grow.vel !== 0) moving = true;
    }
    return moving;
  }

  private write(c: Clot, host: Host, cava: number, vein: number): void {
    c.written = c.cur; c.cava = cava; c.vein = vein;
    const on = c.cur > CLOT_V_FROM, list = on ? clotUniforms(host, c.cur, cava, c.id, vein) : null;
    host.pieces.forEach((p, k) => { for (const s of this.sinks.get(p.id) ?? []) s.setClot(list ? list[k]! : null); });
  }

  /** The body's dissolve: a clot is part of its vein's pixels now, so it dissolves with them. */
  setFade(_f: number): void {}
  setPhone(_phone: boolean): void {}

  /** The clots drawn now, by vein, with their shown occlusion. */
  shown(): Record<string, number> { const o: Record<string, number> = {}; for (const c of this.clots.values()) if (c.cur > CLOT_V_FROM) o[c.id] = c.cur; return o; }
  dispose(): void { this.sinks.clear(); }
}
