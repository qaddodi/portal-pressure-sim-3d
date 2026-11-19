// The options a slide's instrument is showing now, laid over the slide's own (2D presenter-tools.js `option(patch)`): a compare button `{ tool: { red: false } }` or a what-if slider on a tool
// (`{ tool: 'air' }`) moves one option of the Doppler or the scope and leaves the model alone. The patch belongs to one slide (its `deck/slide` key) and is gone when the slide is: the slide's own
// options are set again whenever it is shown. Pure state; ui/talk/ToolCard.tsx reads it, ui/talk/controls-run.ts writes it.
import { create } from 'zustand';

type Rec = Record<string, unknown>;
interface ToolPatch {
  key: string;
  patch: Rec;
  /** Lay `patch` over the slide's own options; an empty patch puts the slide's own back. */
  set(key: string, patch: Rec | null): void;
  /** Move one option of the slide's own (a slider's value). */
  one(key: string, name: string, value: number): void;
}

export const useToolPatch = create<ToolPatch>((set, get) => ({
  key: '', patch: {},
  set: (key, patch) => set({ key, patch: patch ? { ...patch } : {} }),
  one: (key, name, value) => set({ key, patch: { ...(get().key === key ? get().patch : {}), [name]: value } }),
}));

/** The slide's tool with what a button or slider has moved on it (the patch of another slide is ignored). */
export const withPatch = (tool: Rec, key: string, s: { key: string; patch: Rec }): Rec => (s.key === key && Object.keys(s.patch).length ? { ...tool, ...s.patch } : tool);
