// The timeline chart's own state: what is drawn, the days shown, the day the crosshair reads, which side column is up. Nothing here is per-frame.
import { create } from 'zustand';
import { MEASURES } from './measures.ts';

export type Panel = 'graph' | 'happened';
interface BigState {
  /** a measure by id: drawn (true) or not */
  on: Record<string, boolean>;
  /** medicines (by key) and procedures (by base name) not drawn */
  hidden: ReadonlySet<string>;
  /** the days shown; null: the whole run */
  win: readonly [number, number] | null;
  /** the day the crosshair is on now, and the day it was pinned to (a click, a finger's lift, a row of What happened) */
  cursor: number | null;
  pin: number | null;
  panel: Panel;
  /** a phone: the side column is raised as a sheet over the chart */
  raised: boolean;
  /** the row of What happened that is open (an entry id) */
  row: number | null;
  /** the page of What happened (-1: the newest, followed as rows come) */
  page: number;
  set(p: Partial<Omit<BigState, 'set' | 'toggle' | 'toggleMark'>>): void;
  toggle(id: string): void;
  toggleMark(key: string): void;
}
export const DEFAULT_ON: Record<string, boolean> = Object.fromEntries(MEASURES.map((m) => [m.id, m.on]));
export const useBig = create<BigState>((set, get) => ({
  on: { ...DEFAULT_ON }, hidden: new Set(), win: null, cursor: null, pin: null, panel: 'graph', raised: false, row: null, page: -1,
  set: (p) => set(p),
  toggle: (id) => set({ on: { ...get().on, [id]: !get().on[id] } }),
  toggleMark: (key) => { const h = new Set(get().hidden); if (h.has(key)) h.delete(key); else h.add(key); set({ hidden: h }); },
}));

/** the window a zoom leaves: `factor` > 1 shows fewer days, about `at`; kept inside the run and never narrower than `min` days */
export function zoomed(win: readonly [number, number], full: readonly [number, number], factor: number, at: number, min = 3): [number, number] {
  const w = Math.max(Math.min(min, full[1] - full[0]), Math.min(full[1] - full[0], (win[1] - win[0]) / factor));
  const k = (at - win[0]) / Math.max(1e-9, win[1] - win[0]);
  return slid([at - k * w, at - k * w + w], full);
}
/** a window moved inside the run, its width kept */
export function slid(win: readonly [number, number], full: readonly [number, number]): [number, number] {
  const w = Math.min(win[1] - win[0], full[1] - full[0]);
  const a = Math.max(full[0], Math.min(full[1] - w, win[0]));
  return [a, a + w];
}
