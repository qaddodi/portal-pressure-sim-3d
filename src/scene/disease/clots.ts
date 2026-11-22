// Clots (thrombus): the 2D figure's lumpy plug that lies against one wall of the vein, grows from that wall as the occlusion rises, lengthens, and at full occlusion spans the lumen with blunt ends (copied/clot-shape.js).
// PLAN 26: the clot is PAINTED IN ITS VEIN'S OWN FRAGMENT SHADER (clot-field.ts), not drawn as a mesh. A separate mesh inside an opaque tube had to win a depth contest against that tube at every pixel and every angle and stay inside an outline
// it did not share (root cause of the torn, angle-dependent clots with faded ends: plans 11, 19). This layer is only the eased occlusion of each clot and the writer of its uniforms: for each piece of the vein, where along the whole clot the piece
// lies (f0, df), the clot's length, its side times its occlusion, its seed's lump phases. The vessel's shader and the junction skins' shaders (the arms that carry the vein) do the rest.
// A clot thickens and thins with its parameter in a moment (lesion-ease.js) and never pops: a new clot grows from nothing, a lysed one shrinks to nothing.
import { Group } from 'three';
import type { LookId } from '../../looks/looks.ts';
import type { Palette } from '../palette.ts';
import { type Host, type Swells, radiusAtShare, drawnHost, swellsOf } from './host.ts';
import { CAUDATE_VEIN_ID } from '../vessels/caudate-veins.ts';
import { ClotGrow } from './clot-ease.ts';
import { clotTokens } from './paint.ts';
import { setClotTones } from './clot-uniforms.ts';
import { type ClotUniform, clotPhases, clotPiece, clotRange, CLOT_CAP_LEN, CLOT_V_FROM } from './clot-field.ts';

/** What the layer needs of a drawn vessel: its piece's clot uniform. */
export interface ClotSink { setClot(c: ClotUniform | null): void }

interface Clot { id: string; grow: ClotGrow; goal: number; cur: number; written: number; cava: number; seam: number }

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

/** The share of the drawn vein where the IVCS junction skin's seam stands (its plain tube ends there), from the skin's own seam `u` on the vein's last piece. Null when the skin is not drawn yet. */
export function seamShare(host: Host, seamU: number | null): number | null {
  if (seamU == null) return null;
  const rs = pieceRanges(host), [s0, s1] = rs[rs.length - 1]!;
  return (s0 + (s1 - s0) * seamU) / host.length;
}

/** The clot's uniform for each piece of `host` at occlusion `v` (side * v: the seed's wall). An 'ostium' vein's clot ends with its cap's tip at the skin's seam and grows upstream (clotRange). `seamU`: the IVCS skin's seam on its last piece (uv.x). */
export function clotUniforms(host: Host, v: number, _cavaSwell: number, id: string, seamU: number | null = null): ClotUniform[] {
  const seam = clotAnchor(id) === 'ostium' ? seamShare(host, seamU) : null;
  const cap = seam == null ? 0 : CLOT_CAP_LEN * radiusAtShare(host, seam) / host.length;
  const { a, b } = clotRange(v, seam == null ? null : seam - cap), { side } = clotPhases(id);
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

  /** The params' thrombus map. `instant` (a new patient) takes it whole. `D`: the engine's diameter of every edge (mm): a cava-opening vein's clot ends before its fade into the cava. Returns true while a clot grows or shrinks. */
  set(thrombus: Record<string, number>, dt: number, instant = false, D: ArrayLike<number> | null = null, seam: ((id: string) => number | null) | null = null): boolean {
    for (const id of Object.keys(thrombus)) if (!this.clots.has(id) && drawnHost(id)) this.clots.set(id, { id, grow: new ClotGrow(), goal: 0, cur: 0, written: -1, cava: NaN, seam: NaN });
    let moving = false;
    for (const c of this.clots.values()) {
      c.goal = thrombus[c.id] ?? 0;
      c.grow.to(c.goal, instant); c.grow.step(instant ? 0 : dt);
      const next = c.grow.v;   // (the DRAWN occlusion eases on its own profile: clot-ease.ts; the engine's value is untouched)
      const host = drawnHost(c.id)!, cava = (swellsOf(host, D) as Swells).cava ?? 1;
      const su = seam ? seam(c.id) : null, sk = su ?? -1;   // (a seam that appears or moves rewrites the clot's range)
      if (next !== c.cur || c.written !== next || Math.abs(cava - c.cava) > 0.004 * cava || sk !== c.seam) { c.cur = next; this.write(c, host, cava, su); c.seam = sk; }
      if (c.cur !== c.goal || c.grow.vel !== 0) moving = true;
    }
    return moving;
  }

  private write(c: Clot, host: Host, cava: number, seamU: number | null): void {
    c.written = c.cur; c.cava = cava;
    const on = c.cur > CLOT_V_FROM, list = on ? clotUniforms(host, c.cur, cava, c.id, seamU) : null;
    host.pieces.forEach((p, k) => { for (const s of this.sinks.get(p.id) ?? []) s.setClot(list ? list[k]! : null); });
  }

  /** The body's dissolve: a clot is part of its vein's pixels now, so it dissolves with them. */
  setFade(_f: number): void {}
  setPhone(_phone: boolean): void {}

  /** The clots drawn now, by vein, with their shown occlusion. */
  shown(): Record<string, number> { const o: Record<string, number> = {}; for (const c of this.clots.values()) if (c.cur > CLOT_V_FROM) o[c.id] = c.cur; return o; }
  dispose(): void { this.sinks.clear(); }
}
