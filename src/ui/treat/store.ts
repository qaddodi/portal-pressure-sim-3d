// Treat's own state: whether the card is open, its tab (kept, as 2D keeps the last), and (on a phone) whether Changes is the page showing. Nothing per-frame lives here.
import { create } from 'zustand';
import type { TabId } from './orders.ts';

export const useTreat = create<{ open: boolean; tab: TabId; changesPage: boolean; setTab(t: TabId): void; setOpen(o: boolean): void; toggle(): void; showChanges(on: boolean): void }>((set, get) => ({
  open: false, tab: 'drugs', changesPage: false,
  setTab: (tab) => set({ tab }),
  setOpen: (open) => set(open ? { open } : { open, changesPage: false }),
  toggle: () => get().setOpen(!get().open),
  showChanges: (changesPage) => set({ changesPage }),
}));
