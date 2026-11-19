// The patient's settings as the cards change them: the 2D app's updateParams (store.js) on the 3D app's engine. A change is a patch or a function on a copy of the
// current params; it goes to the worker (setParams) and is adopted here at once, so the next press reads what this one made. Every learner change is one history
// entry with its label (what History and Undo list). The engine owns the numbers: nothing here computes a pressure.
import { deepMerge } from '../../engine/hales/portal/scenario.js';
import { engine } from '../../engine/boot.ts';
import { patient, setParams } from '../../engine/store.ts';
import { create } from 'zustand';

/** The model's parameter record (engine/hales/portal/scenario.js defaultParams), as a loose tree: the engine is JavaScript. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Params = any;
export interface Entry { params: Params; label: string }
export interface UpdateOpts { label?: string; history?: boolean; settle?: boolean }

/** Bumps on every change to the params or the history, so a card that lists them re-reads (the numbers on a card come from frames, not from here). */
export const useParamsTick = create<{ tick: number }>(() => ({ tick: 0 }));
const bump = () => useParamsTick.setState((s) => ({ tick: s.tick + 1 }));

const MAX_HISTORY = 200;
let past: Entry[] = [];
let future: Entry[] = [];
type Hook = (a: { label: string; history: boolean }) => void;
const hooks = new Set<Hook>();

/** The patient's settings now (the 2D `store.get().params`). Empty until the first patient is loaded. */
export function currentParams(): Params { return (patient.params ?? null) as Params; }
/** A copy no caller can change under the engine. */
export const paramsCopy = (): Params => structuredClone(currentParams());

let base: { id: string; params: Params } | null = null;
/** A patient was loaded (a preset, a restart, a deep link): what it came with is a fact about the patient, not a change to undo, and the history starts again from there,
 *  as the 2D app's loadPreset does. `params` are the patient's own settings (the worker's `presetLoaded`). */
export function presetStarted(id: string, params: Params): void { base = { id, params: structuredClone(params) }; past = []; future = []; bump(); }
/** The loaded patient's own settings (the 2D `presetBase`), or null when there is none yet. */
export const presetBase = (): Params | null => base?.params ?? null;

/** Make a change: `patchOrFn` is a patch (deep merged) or a function that edits the copy it is given (and may return it). Returns false when nothing was made. */
export function updateParams(patch: Record<string, unknown>, opts?: UpdateOpts): boolean;
export function updateParams(edit: (p: Params) => Params | void, opts?: UpdateOpts): boolean;
export function updateParams(patchOrFn: Record<string, unknown> | ((p: Params) => Params | void), opts: UpdateOpts = {}): boolean {
  const prev = currentParams();
  if (!prev) return false;
  const history = opts.history ?? true, label = opts.label ?? '';
  let next: Params;
  if (typeof patchOrFn === 'function') { const copy = structuredClone(prev); next = (patchOrFn as (p: Params) => Params | void)(copy) ?? copy; } else next = deepMerge(prev, patchOrFn);
  if (!next) return false;
  if (history) { past.push({ params: prev, label }); if (past.length > MAX_HISTORY) past.shift(); future = []; }
  setParams(next);
  try { engine().send({ type: 'setParams', params: next, settle: opts.settle ?? false }); } catch { /* the engine is not up (a test): the local copy is the change */ }
  bump();
  for (const h of hooks) h({ label, history });
  return true;
}

/** Called after every change (the shell's flow-mark pulse; the timeline's marks). Returns the remover. */
export function onParamsChange(h: Hook): () => void { hooks.add(h); return () => { hooks.delete(h); }; }

/** The learner's changes, oldest first (what History lists). */
export const historyNow = (): readonly Entry[] => past;
export const canUndo = (): boolean => past.length > 0;
export const canRedo = (): boolean => future.length > 0;

function jump(params: Params): void { setParams(params); try { engine().send({ type: 'setParams', params, settle: false }); } catch { /* no engine */ } bump(); }
/** Back one change; returns its label (or true when it had none), false when there is nothing to undo. */
export function undo(): string | true | false {
  const h = past.pop();
  if (!h) return false;
  future.push({ params: currentParams(), label: h.label });
  jump(h.params);
  return h.label || true;
}
export function redo(): string | true | false {
  const h = future.pop();
  if (!h) return false;
  past.push({ params: currentParams(), label: h.label });
  jump(h.params);
  return h.label || true;
}
