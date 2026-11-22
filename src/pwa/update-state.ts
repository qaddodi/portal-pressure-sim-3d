// Whether a newer build than the one this page runs is out (set by src/pwa/update.ts; read by the build pill, which then says so where nobody can miss it).
import { create } from 'zustand';

export const useUpdate = create<{ /** the newer build's short commit ('' when only the worker said so and the commit is not known), or null when this page is the newest */ commit: string | null; found: (commit: string) => void }>((set) => ({
  commit: null,
  found: (commit) => set({ commit }),
}));
