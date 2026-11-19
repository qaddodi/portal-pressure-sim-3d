// What the History list and the play bar read of the timeline. The timeline itself (model.ts) lives outside React; this store only counts its changes
// (`rev`) and holds the few facts a control shows, so a row re-renders when the history changes and never on a frame.
import { create } from 'zustand';

export interface TimelineView { rev: number; count: number; canUndo: boolean; canRedo: boolean }
export const useTimeline = create<TimelineView>(() => ({ rev: 0, count: 0, canUndo: false, canRedo: false }));
