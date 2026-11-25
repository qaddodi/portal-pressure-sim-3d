// The patients behind a summary table's rows. A row that names a slide is the patient that slide stands on (its numbers, worked out off screen with the talk's other slides, slide-states.ts);
// a row of its own (a preset and its changes, a patient no slide shows) is worked out by itself. The card reads them from this store and shows a bar of the width of a number until they arrive.
import { create } from 'zustand';
import { engine } from '../../engine/index.ts';
import type { Deck, Slide, TableRowSpec } from '../../decks/schema.ts';
import type { ResolvedRow, Fp } from './table-model.ts';
import { bakedById } from '../charts/baked/store.ts';
import { slideFps, fpsNow } from './slide-states.ts';
import { useStates } from '../../decks/hp/calc.ts';
import { waveVessel, packTrace, WAVE_SECS, type Trace } from './table-wave.ts';

const keyOf = (d: Deck, s: Slide) => `${d.id}:${s.id}`;
/** True when the slide is one of THIS deck's: its rows are stored under the deck's id and the slide's id, and many decks have a slide called "summary", so a table asked for with one deck's id and another deck's slide would fill that key with rows that are not the deck's own (and `asked` would never let the right ones in: Next bleed 11 showed the Outflow table's six names over bars, capture f23a4c59). */
export const slideOfDeck = (d: Deck, s: Slide): boolean => d.slides.some((x) => x.id === s.id && x.table === s.table);
export const useTables = create<{ rows: Record<string, ResolvedRow[]> }>(() => ({ rows: {} }));
/** Rises when a deck's numbers arrive, so a card that waited for them reads again. */
const asked = new Set<string>();

// The Doppler column's traces (table-wave.ts): each is worked out once per state and vessel on the engine (a step of its own from the row's state: the host's `wave` extra, run off the live clock's frames), one at a time.
const traces = new WeakMap<object, Map<string, Promise<Trace | null>>>();
let queue: Promise<unknown> = Promise.resolve();
function traceOf(snap: object, vessel: string): Promise<Trace | null> {
  let m = traces.get(snap);
  if (!m) traces.set(snap, (m = new Map()));
  if (!m.has(vessel)) {
    const p = queue.then(() => engine().sequence([{ wave: { vessel, secs: WAVE_SECS } }], snap)).then((out) => { const w = (out[0]?.extra as { wave?: Record<string, Trace> } | undefined)?.wave?.[vessel]; return w ? packTrace(w) : null; }, () => null);
    queue = p.catch(() => undefined);
    m.set(vessel, p);
    void p.then((w) => { if (!w) m.delete(vessel); });   // (a run that gave nothing is asked again the next time the table is drawn)
  }
  return m.get(vessel)!;
}

const rowOf = (d: Deck, spec: TableRowSpec | string, f: Fp | null): ResolvedRow => {
  const sp: TableRowSpec = typeof spec === 'string' ? { id: spec } : spec;
  const at = sp.id ? d.slides.findIndex((x) => x.id === sp.id) : -1;
  const sl = at >= 0 ? d.slides[at] : null;
  return { spec: sp, i: at >= 0 ? at + 1 : -1, f, title: sp.title ?? sl?.title ?? '', kicker: sp.kicker ?? sl?.kicker ?? '' };
};

/** The rows as the build worked them out (the readings and the Doppler traces, baked/make.ts): complete in the card's very first drawing, no worker, no waiting. Null when the deck has no baked file for these words. */
export function bakedRows(d: Deck, s: Slide): ResolvedRow[] | null {
  const baked = bakedById(d.id);
  if (!baked || !s.table) return null;
  const specs = s.table.of, waves = baked.waves?.[s.id];
  return specs.map((sp, j) => {
    const id = typeof sp === 'string' ? sp : sp.id, at = id ? d.slides.findIndex((x) => x.id === id) : -1;
    const f = (id ? (at >= 0 ? baked.states[at]?.fp : null) : baked.tables[s.id]?.[j]) as Fp | null ?? null;
    return { ...rowOf(d, sp, f), ...(waves && waves[j] !== undefined ? { trace: waves[j] } : {}) };
  });
}
/** The rows before their numbers are in (their names, no readings): what the card measures first, so it does not grow when the numbers arrive. The baked ones when there are some. */
export const pendingRows = (d: Deck, s: Slide): ResolvedRow[] => bakedRows(d, s) ?? (s.table?.of ?? []).map((sp) => rowOf(d, sp, null));

/** Starts working out a table's rows (once per slide); the store holds them, with empty numbers first. */
export function resolveTable(d: Deck, s: Slide): void {
  const k = keyOf(d, s);
  if (!s.table || !slideOfDeck(d, s) || asked.has(k)) return;
  asked.add(k);
  const specs = s.table.of;
  const put = (fps: (Fp | null)[]) => useTables.setState((st) => ({ rows: { ...st.rows, [k]: specs.map((sp, j) => ({ ...rowOf(d, sp, fps[j] ?? null), ...(st.rows[k]?.[j]?.trace !== undefined ? { trace: st.rows[k]![j]!.trace } : {}) })) } }));
  // (the rows' readings and traces baked at build time are in the first drawing; a deck that has them whole needs no worker at all)
  const first = bakedRows(d, s);
  useTables.setState((st) => ({ rows: { ...st.rows, [k]: first ?? pendingRows(d, s) } }));
  const withWave = !!s.table.cols?.includes('wave');
  if (first && first.every((r) => r.f && (!withWave || r.trace !== undefined))) return;
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
      if (s.table?.cols?.includes('wave')) {
        const res = useStates.getState().results[d.id] ?? [];
        specs.forEach((sp, j) => {
          const id = typeof sp === 'string' ? sp : sp.id, at = id ? d.slides.findIndex((x) => x.id === id) : -1, m = own.findIndex((o) => o.j === j);
          const snap = (id ? res[at]?.snap : (mine[m] as { snap?: unknown } | undefined)?.snap) as object | undefined;
          if (!snap || useTables.getState().rows[k]?.[j]?.trace !== undefined) return;
          void traceOf(snap, waveVessel(typeof sp === 'string' ? null : sp, s.table)).then((w) => {
            useTables.setState((st) => ({ rows: { ...st.rows, [k]: (st.rows[k] ?? []).map((r, q) => (q === j ? { ...r, trace: w } : r)) } }));
          });
        });
      }
    } catch { asked.delete(k); }
  })();
}
/** The numbers at a slide of the deck, for a row whose `vs` names a slide the table does not list (null until the talk's numbers are worked out). */
export const fpOfSlide = (d: Deck, id: string): Fp | null => { const at = d.slides.findIndex((x) => x.id === id); return at >= 0 ? fpsNow(d)?.[at] ?? null : null; };
