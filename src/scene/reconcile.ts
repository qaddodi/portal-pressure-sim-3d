// The ONE place that turns the figure's intent (intent.ts) into calls on the scene (R5). It keeps the intent it last applied and, whenever the resolved intent changes, makes the calls for
// the fields that differ, nothing for the rest. `reconcile` is pure over a target (so node tests drive it with a recorder); `startReconciler` follows the layers store.
import { useIntent, resolve, EMPTY_INTENT, type FigureIntent } from './intent.ts';

/** The calls the reconciler may make (the scene API's own methods of these names). */
export interface ReconcileTarget {
  setNamedVessels(ids: readonly string[]): void;
  pinOrgans(ids: readonly string[], normalSpleen?: boolean): void;
  setSinceRef(P: ArrayLike<number> | null): void;
  /** light exactly these vessels (the scene clears the pick as it does); [] puts them out */
  markVessels(ids: readonly string[]): void;
  /** pick a vessel, or null to clear (the scene's own highlight and the pick store) */
  pick(id: string | null): void;
  setResistors(keys: FigureIntent['resistors']): void;
  /** the Circuit's caudate lane and the anatomy's lobe (`veins`: with its short hepatic veins) */
  setCaudatePin(on: boolean, veins?: boolean): void;
}

const same = (a: readonly string[], b: readonly string[]): boolean => a === b || (a.length === b.length && a.every((x, i) => x === b[i]));

/** Calls for what differs between `prev` and `next`; returns the intent now applied (`next`). */
export function reconcile(prev: FigureIntent, next: FigureIntent, to: ReconcileTarget): FigureIntent {
  if (!same(prev.named, next.named)) to.setNamedVessels(next.named);
  if (!same(prev.pins, next.pins) || prev.normalSpleen !== next.normalSpleen) to.pinOrgans(next.pins, next.normalSpleen);
  if (prev.sinceRef !== next.sinceRef) to.setSinceRef(next.sinceRef);
  if (!same(prev.resistors, next.resistors)) to.setResistors(next.resistors);
  if (prev.caudate !== next.caudate || prev.caudateVeins !== next.caudateVeins) to.setCaudatePin(next.caudate, next.caudateVeins);
  // The lit vessels and the pick share one highlight: lighting vessels replaces the pick in the scene (and putting them out leaves none), so the pick the intent holds is put back
  // whenever nothing is lit and either the lit set just ended or the pick changed. While vessels are lit the pick is hidden, not lost.
  const litChanged = !same(prev.marked, next.marked);
  if (litChanged) to.markVessels(next.marked);
  if (next.marked.length === 0 && (litChanged || prev.picked !== next.picked)) to.pick(next.picked);
  return next;
}

/** Follows the layers store: every change of the resolved intent is reconciled onto `to`. Returns the stop function. */
export function startReconciler(to: ReconcileTarget): () => void {
  let applied: FigureIntent = EMPTY_INTENT;
  const run = () => { applied = reconcile(applied, resolve(useIntent.getState().layers), to); };
  run();
  const off = useIntent.subscribe(run);
  return () => { off(); };
}
