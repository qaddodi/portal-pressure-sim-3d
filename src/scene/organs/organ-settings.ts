// Settings > Figure depth: Organ depth (on/off) and Organ fill (see-through wash or solid) drive the organ layer live. The first call takes the saved choice at once (nothing eases in at boot);
// a change after that is eased by the layer on the clock, and one frame is asked for so the ease starts (it keeps asking while it moves: OrganLayer.update).
import type { OrganFill } from '../../state/settings.ts';

export interface OrganChoices { organDepth: boolean; organFill: OrganFill }
export interface OrganTarget { setDepth(on: boolean, instant?: boolean): void; setFill(f: OrganFill, instant?: boolean): void }
export interface ChoiceStore { getState(): OrganChoices; subscribe(fn: () => void): () => void }

/** Wires the layer to the settings; returns the remover. `invalidate` is `clock.invalidate`. */
export function bindOrganSettings(layer: OrganTarget, store: ChoiceStore, invalidate: (why: string) => void): () => void {
  let depth: boolean | null = null, fill: OrganFill | null = null;
  const apply = () => {
    const s = store.getState(), first = depth === null;
    if (s.organDepth === depth && s.organFill === fill) return;
    depth = s.organDepth; fill = s.organFill;
    layer.setDepth(depth, first); layer.setFill(fill, first);
    invalidate('organ-depth');
  };
  apply();
  return store.subscribe(apply);
}
