// The patient's settings as the cards change them: the 2D app's updateParams (store.js) on the 3D app's engine. A change is a patch or a function on a copy of the
// current params; it goes to the worker (setParams) and is adopted here at once, so the next press reads what this one made. Every learner change is one history
// entry with its label (what History and Undo list). The engine owns the numbers: nothing here computes a pressure.
import { deepMerge } from '../../engine/hales/portal/scenario.js';
import { migratePieceKeys } from './piece-keys.ts';
import { sendParams } from '../../engine/params-send.ts';
import { patient, useParamsTick } from '../../engine/store.ts';
import { caseAsk, paramsKind } from '../case/guard.ts';

/** The model's parameter record (engine/hales/portal/scenario.js defaultParams), as a loose tree: the engine is JavaScript. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Params = any;
export interface Entry { params: Params; label: string }
export interface UpdateOpts { label?: string; history?: boolean; settle?: boolean;
  /** the change is the new base (a slide's patient, a link, a restored patient): what the learner changes is counted from it, and the Undo history before it is gone (audit W9) */
  base?: boolean }

/** The tick lives with the copy it follows (engine/store.ts setParams bumps it on every change); `bump` here is for the history list only (the numbers on a card come from frames, not from here). */
export { useParamsTick };
const bump = () => useParamsTick.setState((s) => ({ tick: s.tick + 1 }));

const MAX_HISTORY = 200;
let past: Entry[] = [];
let future: Entry[] = [];
type Hook = (a: { label: string; history: boolean }) => void;
const hooks = new Set<Hook>();

/** The patient's settings now (the 2D `store.get().params`). Empty until the first patient is loaded. */
export function currentParams(): Params { return (patient.params ?? null) as Params; }

let base: { id: string; params: Params } | null = null;
/** A patient was loaded (a preset, a restart, a deep link): what it came with is a fact about the patient, not a change to undo, and the history starts again from there,
 *  as the 2D app's loadPreset does. `params` are the patient's own settings (the worker's `presetLoaded`). */
export function presetStarted(id: string, params: Params): void { base = { id, params: structuredClone(params) }; past = []; future = []; bump(); }
/** The loaded patient's own settings (the 2D `presetBase`), or null when there is none yet. */
/** The patient as it stands now becomes the base: a slide's state, a link's or a restored patient's is a fact about the patient, not a change of the learner's. Treat's "Your changes" counts from
 *  here, Clear all returns here, and Undo does not walk back through what came before it. */
export function rebase(): void { const p = currentParams(); if (!p) return; base = { id: base?.id ?? '', params: structuredClone(p) }; past = []; future = []; bump(); }
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
  // (in a case, a change of the patient's settings asks first, and is made once the case is left, from the settings then: case/guard.ts)
  const q = caseAsk(() => paramsKind(prev, next), label);
  if (q) { void q.then((go) => { if (go) again(patchOrFn, opts); }); return false; }
  next = migratePieceKeys(next);
  if (history && !opts.base) { past.push({ params: prev, label }); if (past.length > MAX_HISTORY) past.shift(); future = []; }
  sendParams(next, { settle: opts.settle ?? false, replace: true });
  if (opts.base) rebase(); else bump();
  for (const h of hooks) h({ label, history });
  return true;
}

/** the same change again, once a case has been left (either form: the overloads take one each) */
const again = updateParams as (p: Record<string, unknown> | ((p: Params) => Params | void), o: UpdateOpts) => boolean;

/** Called after every change (the shell's flow-mark pulse; the timeline's marks). Returns the remover. */
export function onParamsChange(h: Hook): () => void { hooks.add(h); return () => { hooks.delete(h); }; }

/** The learner's changes, oldest first (what History lists). */
export const historyNow = (): readonly Entry[] => past;
export const canUndo = (): boolean => past.length > 0;
export const canRedo = (): boolean => future.length > 0;

function jump(params: Params): void { sendParams(migratePieceKeys(params), { replace: true }); bump(); }
/** Back one change; returns its label (or true when it had none), false when there is nothing to undo. */
export function undo(): string | true | false {
  const q = caseAsk('undo');
  if (q) { void q.then((go) => { if (go) undo(); }); return false; }
  const h = past.pop();
  if (!h) return false;
  future.push({ params: currentParams(), label: h.label });
  jump(h.params);
  return h.label || true;
}
export function redo(): string | true | false {
  const q = caseAsk('redo');
  if (q) { void q.then((go) => { if (go) redo(); }); return false; }
  const h = future.pop();
  if (!h) return false;
  past.push({ params: currentParams(), label: h.label });
  jump(h.params);
  return h.label || true;
}
