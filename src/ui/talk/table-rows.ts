// The patients behind a summary table's rows. A row that names a slide is the patient that slide stands on (its numbers, worked out off screen with the talk's other slides, slide-states.ts);
// a row of its own (a preset and its changes, a patient no slide shows) is worked out by itself. The card reads them from this store and shows a bar of the width of a number until they arrive.
import { create } from 'zustand';
import { engine } from '../../engine/index.ts';
import type { Deck, Slide, TableRowSpec } from '../../decks/schema.ts';
import type { ResolvedRow, Fp } from './table-model.ts';
import { slideFps, fpsNow } from './slide-states.ts';

const keyOf = (d: Deck, s: Slide) => `${d.id}:${s.id}`;
export const useTables = create<{ rows: Record<string, ResolvedRow[]> }>(() => ({ rows: {} }));
/** Rises when a deck's numbers arrive, so a card that waited for them reads again. */
const asked = new Set<string>();

const rowOf = (d: Deck, spec: TableRowSpec | string, f: Fp | null): ResolvedRow => {
  const sp: TableRowSpec = typeof spec === 'string' ? { id: spec } : spec;
  const at = sp.id ? d.slides.findIndex((x) => x.id === sp.id) : -1;
  const sl = at >= 0 ? d.slides[at] : null;
  return { spec: sp, i: at >= 0 ? at + 1 : -1, f, title: sp.title ?? sl?.title ?? '', kicker: sp.kicker ?? sl?.kicker ?? '' };
};

/** The rows before their numbers are in (their names, no readings): what the card measures first, so it does not grow when the numbers arrive. */
export const pendingRows = (d: Deck, s: Slide): ResolvedRow[] => (s.table?.of ?? []).map((sp) => rowOf(d, sp, null));

/** Starts working out a table's rows (once per slide); the store holds them, with empty numbers first. */
export function resolveTable(d: Deck, s: Slide): void {
  const k = keyOf(d, s);
  if (!s.table || asked.has(k)) return;
  asked.add(k);
  const specs = s.table.of;
  const put = (fps: (Fp | null)[]) => useTables.setState((st) => ({ rows: { ...st.rows, [k]: specs.map((sp, j) => rowOf(d, sp, fps[j] ?? null)) } }));
  put([]);
  void (async () => {
    try {
      const all = await slideFps(d).catch((): Fp[] => []);
      const own = specs.map((sp, j) => ({ sp, j })).filter(({ sp }) => typeof sp !== 'string' && !sp.id && sp.preset);
      const mine = own.length ? await engine().sequence(own.map(({ sp }) => { const o = sp as TableRowSpec; return { preset: o.preset, ...(o.params ? { params: o.params } : {}), ...(o.days != null ? { presetDays: o.days } : {}) }; }), undefined).catch(() => []) : [];
      const fps = specs.map((sp, j): Fp | null => {
        const id = typeof sp === 'string' ? sp : sp.id;
        if (id) { const at = d.slides.findIndex((x) => x.id === id); return at >= 0 ? all[at] ?? null : null; }
        const m = own.findIndex((o) => o.j === j);
        return m >= 0 ? (mine[m]?.fp as Fp | undefined) ?? null : null;
      });
      put(fps);
    } catch { asked.delete(k); }
  })();
}
/** The numbers at a slide of the deck, for a row whose `vs` names a slide the table does not list (null until the talk's numbers are worked out). */
export const fpOfSlide = (d: Deck, id: string): Fp | null => { const at = d.slides.findIndex((x) => x.id === id); return at >= 0 ? fpsNow(d)?.[at] ?? null : null; };
