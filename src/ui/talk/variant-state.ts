// The patient a compare button puts the model in, as the numbers the slide's charts read (its fingerprint and parameters), worked out off screen by the engine's 'sequence'. One function for the app and
// the tests (controls-run.ts gives it the live engine's `sequence`; tests/variant-state.test.ts gives it the host in node), so the chart, the card and the figure cannot be fed from different states.
import type { CompareOpt } from '../../decks/controls.ts';
import type { VariantState } from './variant-words.ts';

/** What the engine's `sequence` gives (src/engine/client.ts): a step per answer. */
export type Seq = (steps: unknown[], base?: unknown) => Promise<{ fp?: unknown; snap?: unknown; params?: unknown }[]>;
/** The slide's state as the deck's calc keeps it (decks/hp/calc.ts). */
export interface Own { fp?: unknown; snap?: unknown; params?: unknown; base?: unknown }
export interface Picked { /** the model the figure eases to (a snapshot); absent for a parameter change, which the live model takes itself */ snap?: unknown; /** what the charts of the slide read; null: the slide's own */ state: VariantState | null }

const asState = (r: { fp?: unknown; params?: unknown } | undefined): VariantState | null => (r?.fp ? { fp: r.fp as VariantState['fp'], params: r.params } : null);

/** A patient button's key: the preset with the params, days and relax a button gives it (2D xKey). */
export const patientKey = (o: { preset: string; params?: unknown; days?: number }): string => o.preset + (o.params || o.days ? JSON.stringify([o.params, o.days]) : '');

/** The state a compare button gives: a patient (`preset`) is worked out from a fresh model, a parameter change from the slide's own base (`own.base`), another slide's state is that slide's (`other`).
 *  The slide's own button gives state null (its own fingerprint is what the slide reads). Results are kept per `cache` key, so a button is worked out once. */
export function variantStateOf(seq: Seq, cache: Map<string, Promise<Picked>>, ctx: { slideKey: string }, o: CompareOpt, own: Own | undefined, other: Own | undefined): Promise<Picked | null> {
  const keep = (key: string, make: () => Promise<Picked>): Promise<Picked> => {
    let p = cache.get(key);
    if (!p) { p = make(); cache.set(key, p); p.catch(() => cache.delete(key)); }
    return p;
  };
  if (o.preset) {
    return keep(`patient|${patientKey(o as { preset: string })}`, () => seq([{ preset: o.preset!, ...(o.params ? { params: o.params } : {}), ...(o.days ? { days: o.days } : {}) }]).then((r) => ({ snap: r[0]?.snap, state: o.own ? null : asState(r[0]) })));
  }
  if (o.how === 'params') {
    if (o.own || !own?.base) return Promise.resolve(o.own ? { state: null } : null);
    return keep(`params|${ctx.slideKey}|${JSON.stringify(o.params ?? {})}`, () => seq([{ params: o.params ?? {} }], own.base).then((r) => ({ state: asState(r[0]) })));
  }
  const at = other ?? own;
  return Promise.resolve({ snap: at?.snap, state: o.own ? null : asState(at) });
}
