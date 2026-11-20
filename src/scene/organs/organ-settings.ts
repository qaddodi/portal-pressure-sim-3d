// Settings > Figure depth: Organ depth (on/off) drives the organ layer live. The first call takes the saved choice at once (nothing eases in at boot);
// a change after that is eased by the layer on the clock, and one frame is asked for so the ease starts (it keeps asking while it moves: OrganLayer.update).

export interface OrganChoices { organDepth: boolean }
export interface OrganTarget { setDepth(on: boolean, instant?: boolean): void }
export interface ChoiceStore { getState(): OrganChoices; subscribe(fn: () => void): () => void }

/** Wires the layer to the settings; returns the remover. `invalidate` is `clock.invalidate`. */
export function bindOrganSettings(layer: OrganTarget, store: ChoiceStore, invalidate: (why: string) => void): () => void {
  let depth: boolean | null = null;
  const apply = () => {
    const s = store.getState(), first = depth === null;
    if (s.organDepth === depth) return;
    depth = s.organDepth;
    layer.setDepth(depth, first);
    invalidate('organ-depth');
  };
  apply();
  return store.subscribe(apply);
}
