// The patient a compare button puts the model in, as the numbers the slide's charts read (its fingerprint and parameters), worked out off screen by the engine's 'sequence'. One function for the app and
// the tests (controls-run.ts gives it the live engine's `sequence`; tests/variant-state.test.ts gives it the host in node), so the chart, the card and the figure cannot be fed from different states.
import { patchOf, type CompareOpt } from '../../decks/controls.ts';
import type { VariantState } from './variant-words.ts';
import { deepMerge } from '../../engine/hales/portal/scenario.js';

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
/** The slide's own step and the state its days start from (the slide before's settled model): a parameter button on a slide that lives days replays them (`replayOf`). */
export interface Replay { step: { params?: unknown; days?: number; [k: string]: unknown }; base: unknown }
/** The replay a parameter button needs on slide i: only a slide that lives days (its own step has `days`), and only once the slide before's state is in. */
export function replayOf(step: Replay['step'] | undefined, before: Own | undefined): Replay | undefined {
  return step && (step.days ?? 0) > 0 && !step.sameAs && !step.restoreStep && before?.base ? { step, base: before.base } : undefined;
}

export function variantStateOf(
  seq: Seq, cache: Map<string, Promise<Picked>>, ctx: { slideKey: string; replay?: Replay }, o: CompareOpt, own: Own | undefined, other: Own | undefined,
): Promise<Picked | null> {
  const keep = (key: string, make: () => Promise<Picked>): Promise<Picked> => {
    let p = cache.get(key);
    if (!p) { p = make(); cache.set(key, p); p.catch(() => cache.delete(key)); }
    return p;
  };
  if (o.preset) {
    return keep(`patient|${patientKey(o as { preset: string })}`, () => seq([{ preset: o.preset!, ...(o.params ? { params: o.params } : {}), ...(o.days ? { days: o.days } : {}) }]).then((r) => ({ snap: r[0]?.snap, state: o.own ? null : asState(r[0]) })));
  }
  if (o.how === 'params') {
    // a slide that lives days (diuretics over 28 days, four years of disease): the button's choice is made where the slide's days begin, and the days are lived again with it. Laid on the
    // slide's END (the old way) a slow treatment changed nothing: diuretics act on the ascites over days, so "No diuretics" read the same litres as "Diuretics" (Ascites 14, Ten years 6, 26 Nov)
    if (ctx.replay) {
      if (o.own) return Promise.resolve({ snap: own?.snap, state: null });
      // (the days' chart is the slide's own: the replay needs only where they end)
      const { step: { trail: _trail, ...step }, base } = ctx.replay;
      const params = deepMerge((step.params ?? {}) as Record<string, unknown>, (o.params ?? {}) as Record<string, unknown>);
      return keep(`replay|${ctx.slideKey}|${JSON.stringify(o.params ?? {})}`, () => seq([{ ...step, params }], base).then((r) => ({ snap: r[0]?.snap, state: asState(r[0]) })));
    }
    if (o.own || !own?.base) return Promise.resolve(o.own ? { state: null } : null);
    return keep(`params|${ctx.slideKey}|${JSON.stringify(o.params ?? {})}`, () => seq([{ params: o.params ?? {} }], own.base).then((r) => ({ state: asState(r[0]) })));
  }
  const at = other ?? own;
  return Promise.resolve({ snap: at?.snap, state: o.own ? null : asState(at) });
}

/** A what-if slider at x as a parameter button (the value at each of its paths): the same change the live model is eased by (controls-run.ts dragWhatIf), so the slide's charts read it as they read a button's. */
export const sliderOpt = (paths: readonly string[], x: number): CompareOpt => ({ label: `what if ${paths.join()} ${x}`, how: 'params', params: patchOf(paths, x) } as CompareOpt);
