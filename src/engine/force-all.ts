// "Show everything" for the inspector (`?inspect`, src/ui/debug/inspect): every collateral open and every fixed shunt in at once, and the model frozen, by FORGING the engine frame the page shows. The scene decides what is drawn from the
// engine's newest frame (presence: vessels/network.ts presenceOf reads the diameters `D` and the flows; the shapes, the stents, the strands, the Circuit's rows and the labels read the same frame), so one forged frame reaches the body and the
// Circuit alike and nothing in the scene is touched. The engine is never edited (AGENTS.md): the forged frame is a COPY (`live.frame` stays the model's), held in `latest` by `holdFrame` (store.ts, as Compare's Then view does), and a tap on
// `onFrame` makes the next one from each live frame. A held frame of someone else (Compare) is never taken over. Switched off, the live frame goes back and everything eases away on the scene's own tracks, nothing pops.
// While it is on the numbers, labels and lens colours of the figure are the forged frame's, not the patient's: the inspector's panel says so.
import { EDGES } from './hales/portal/topology.js';
import type { EngineFrame } from './protocol.ts';
import { holdFrame, latest, live, onFrame } from './store.ts';

export interface ForceState {
  /** every collateral edge opened to its full diameter, carrying flow */
  collaterals: boolean;
  /** the six procedure shunts (TIPS, DIPS, portocaval, distal splenorenal, mesocaval, Meso-Rex) given a diameter and flow */
  shunts: boolean;
  /** the model stops: the frame shown stays as it is (forged or not) until this goes off */
  freeze: boolean;
}

interface Edge { id: string; kind: string; shunt?: string; dMax?: number; d?: number }
const edges = EDGES as Edge[];
/** The six shunts the figure draws (vessels/network.ts SHUNT_IDS; the arterioportal ones are never drawn) and the diameter each is given, mm: a stent's own 8 for TIPS and DIPS, the edge's own `d` for the surgical ones. */
export const FORCE_SHUNTS: ReadonlyArray<readonly [string, number]> = [['TIPS', 8], ['DIPS', 8], ['S_PC', 14], ['S_DSR', 9], ['S_MC', 10], ['REX', 8]];
/** Flow given to a forced vessel when the model's own is less, mL/s: enough for the flow marks and the presence rule (0.3), never a figure a card would quote as real. */
export const FORCE_FLOW = 2;

const index = new Map(edges.map((e, i) => [e.id, i]));
/** Every collateral edge's id, in the engine's order (C1a, C1b, C2, C3, C4, C5, C6, C7, C9, C8). */
export const COLLATERAL_IDS: readonly string[] = edges.filter((e) => e.kind === 'collateral').map((e) => e.id);

/** A copy of `f` with the asked edges opened. Pure: `f` and its arrays are untouched. */
export function forgeFrame(f: EngineFrame, o: Pick<ForceState, 'collaterals' | 'shunts'>): EngineFrame {
  if (!o.collaterals && !o.shunts) return f;
  const D = Float32Array.from(f.D), Q = Float32Array.from(f.Q), Qf = Float32Array.from(f.Qf);
  const open = (id: string, d: number): void => {
    const k = index.get(id);
    if (k === undefined) return;
    D[k] = Math.max(D[k]!, d);
    for (const a of [Q, Qf]) a[k] = Math.abs(a[k]!) >= FORCE_FLOW ? a[k]! : (a[k]! < 0 ? -FORCE_FLOW : FORCE_FLOW);   // (a flow of its own direction is kept)
  };
  if (o.collaterals) for (const e of edges) if (e.kind === 'collateral') open(e.id, e.dMax ?? 6);
  if (o.shunts) for (const [id, d] of FORCE_SHUNTS) open(id, d);
  return { ...f, D, Q, Qf };
}

let state: ForceState = { collaterals: false, shunts: false, freeze: false };
let mine: EngineFrame | null = null;
let off: (() => void) | null = null;

/** What is forced now (a copy). */
export const forceState = (): Readonly<ForceState> => ({ ...state });
/** Whether the page is showing a frame this module made. */
export const forcing = (): boolean => mine !== null && latest.frame === mine;

/** Makes the frame to show from the model's `f` (forged as asked; a copy even when nothing is forced, so a frozen one is never replaced by the model's later ones) and holds it. */
function make(f: EngineFrame): void {
  const g = forgeFrame(f, state);
  mine = g === f ? { ...f } : g;
  holdFrame(mine);
}

/** Changes what is forced. Returns false when another part of the app holds the frame (Compare's Then view): nothing is taken from it. */
export function setForce(patch: Partial<ForceState>): boolean {
  const next = { ...state, ...patch };
  const on = next.collaterals || next.shunts || next.freeze;
  const base = live.frame;
  if (on && base && latest.frame !== mine && latest.frame !== base) return false;
  const was = state;
  state = next;
  if (!on) {
    off?.(); off = null;
    if (mine && latest.frame === mine) holdFrame(null);
    mine = null;
    return true;
  }
  // every live frame makes the next shown one, unless the model is frozen
  if (!off) off = onFrame((f) => { if (!state.freeze && (latest.frame === mine || latest.frame === f)) make(f); });
  const changed = was.collaterals !== next.collaterals || was.shunts !== next.shunts;
  // frozen with a frame already held and nothing new asked: that frame stays. Otherwise it is made again from the model's newest.
  if (base && (!next.freeze || changed || !mine)) make(base);
  return true;
}
