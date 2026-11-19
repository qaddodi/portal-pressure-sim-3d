// What the Over time pane has chosen: the range, the traces, Smooth and the two lanes (2D pressure-time.js, kept for the page's life, not across visits).
import { create } from 'zustand';
import { TRACES, type Range, type TraceId } from './model.ts';

export interface TraceChoice {
  range: Range; chosen: ReadonlySet<TraceId>; smooth: boolean; ekg: boolean; lane: boolean;
  /** Smooth was touched by the learner (until then the two minutes draw smooth, the beats keep their pulses: 2D smooth0) */
  touched: boolean;
  setRange(r: Range): void; toggle(id: TraceId): void; toggleSmooth(): void; toggleEkg(): void; toggleLane(): void;
}
export const useTrace = create<TraceChoice>((set, get) => ({
  range: 'beats', chosen: new Set(TRACES.filter((t) => t.on).map((t) => t.id)), smooth: false, ekg: false, lane: true, touched: false,
  // (The Tests pane draws the minutes' trace smooth until Smooth is touched: the spikes of each beat and breath are the option there, 2D play-test 16 Nov 2026.)
  setRange: (range) => set((s) => ({ range, smooth: s.touched ? s.smooth : range !== 'beats' })),
  toggle: (id) => { const c = new Set(get().chosen); if (c.has(id)) c.delete(id); else c.add(id); set({ chosen: c }); },
  toggleSmooth: () => set((s) => ({ smooth: !s.smooth, touched: true })),
  toggleEkg: () => set((s) => ({ ekg: !s.ekg })),
  toggleLane: () => set((s) => ({ lane: !s.lane })),
}));
