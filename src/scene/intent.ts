// What the figure should show, as plain data, in layers (R5). Before, about ten "link" modules each kept their own "last value I sent" in a closure and called the scene's setters, and
// each needed a hand-written undo on exit; two of them could fight over the same thing and the last writer won by accident. Now each writer owns a LAYER of partial intent, a pure
// `resolve` lets the topmost layer that says something about a field decide it, and ONE reconciler (reconcile.ts) makes the calls on the scene for what changed. Leaving a talk or
// closing a tool is `clearLayer(...)`: there is no cleanup code, and nothing can be left behind.
//
//   base   free play: what the person chose with the menus and keys
//   talk   what the slide on show asks (its FigurePlan)
//   tool   a tool in use: Tests, Treat, shunt targeting, Compare
//
// The fields here are the set-like ones the talk drives (R5a, first part). The rest of R5a/R5b (lens, layers, blood, camera, the timed procedures) move in as they are ready.
import { create } from 'zustand';

export interface FigureIntent {
  /** vessels (edge ids) named: they carry the flow marks and the glow */
  named: readonly string[];
  /** organs (organ layer ids) outlined by a slide's glow, spot or terms */
  pins: readonly string[];
  /** also draw the normal-sized spleen's line */
  normalSpleen: boolean;
  /** the node pressures a "change since" slide counts from; null: the state the figure showed as the lens came in */
  sinceRef: ArrayLike<number> | null;
}

export const EMPTY_INTENT: FigureIntent = { named: [], pins: [], normalSpleen: false, sinceRef: null };

/** Lowest first: a higher layer decides a field it says anything about. */
export const LAYER_ORDER = ['base', 'talk', 'tool'] as const;
export type LayerName = (typeof LAYER_ORDER)[number];
export type Layers = Partial<Record<LayerName, Partial<FigureIntent>>>;

/** The intent the layers add up to: for each field, the value of the topmost layer that has one, else the empty value. Pure. */
export function resolve(layers: Layers): FigureIntent {
  const out: FigureIntent = { ...EMPTY_INTENT };
  const o = out as unknown as Record<string, unknown>;
  for (const name of LAYER_ORDER) {
    const l = layers[name];
    if (!l) continue;
    for (const k of Object.keys(l)) if ((l as Record<string, unknown>)[k] !== undefined) o[k] = (l as Record<string, unknown>)[k];
  }
  return out;
}

export const useIntent = create<{ layers: Layers }>(() => ({ layers: {} }));

/** A layer says these fields (and keeps what it said about the others). */
export function setLayer(name: LayerName, patch: Partial<FigureIntent>): void {
  useIntent.setState((s) => ({ layers: { ...s.layers, [name]: { ...s.layers[name], ...patch } } }));
}
/** The layer is taken away: everything it said goes, and what is under it shows again. */
export function clearLayer(name: LayerName): void {
  useIntent.setState((s) => { if (!(name in s.layers)) return s; const { [name]: _gone, ...rest } = s.layers; void _gone; return { layers: rest }; });
}
export const resolved = (): FigureIntent => resolve(useIntent.getState().layers);
