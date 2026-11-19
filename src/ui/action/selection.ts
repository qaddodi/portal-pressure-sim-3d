// What is selected on the figure: a vessel, an organ, a lobule part. The tap-anything card shows for it. A vessel the scene picks (a tap on the figure) selects itself; a
// card, a Changes row, the search or Treat selects by this module, and a vessel is lit in the scene while it is the selection. One selection at a time, as in the 2D app.
import { create } from 'zustand';
import { useTests } from '../tests/store.ts';

export type Sel =
  | { type: 'edge'; id: string }
  | { type: 'organ'; id: string; lobe?: 'L' | 'R' | null; zone?: string | number }
  | { type: 'lobule'; part?: string; zone?: number }
  | { type: 'node'; id: string };

export const useSelection = create<{ sel: Sel | null }>(() => ({ sel: null }));

/** The scene's handle for lighting a vessel (set by the app at start so this module stays free of the scene; tests leave it empty). */
let lightVessel: ((id: string | null) => void) | null = null;
export function bindScene(light: (id: string | null) => void): void { lightVessel = light; }

const same = (a: Sel | null, b: Sel | null) => a === b || (!!a && !!b && JSON.stringify(a) === JSON.stringify(b));

/** Ascites has one home, the Tests card's Ascites pane (2D main.js select): selecting the abdomen (Treat's Paracentesis, the search's "Ascites", the fluid's station) opens
 *  it instead of a card that would sit over the vessels, and nothing stays selected. */
const isAbdomen = (sel: Sel | null): boolean => !!sel && ((sel.type === 'organ' && sel.id === 'abdomen') || (sel.type === 'node' && sel.id === 'EPI'));

/** Select a structure (or clear with null). A vessel is lit in the scene; the card follows. */
export function selectStructure(sel: Sel | null): void {
  if (isAbdomen(sel)) { selectStructure(null); useTests.getState().show('abdomen'); return; }
  if (!same(useSelection.getState().sel, sel)) useSelection.setState({ sel });
  lightVessel?.(sel && sel.type === 'edge' ? sel.id : null);
}

/** A mode that takes the scene's taps for itself (the shunt waiting for its target): while one is held, a pick goes to it and the selection stays. Returns the remover. */
let pickHold: ((id: string | null) => void) | null = null;
export function holdScenePicks(f: (id: string | null) => void): () => void { pickHold = f; return () => { if (pickHold === f) pickHold = null; }; }

/** The scene picked (or un-picked) a vessel by a tap: the selection follows it. */
export function scenePicked(id: string | null): void {
  if (pickHold) { pickHold(id); return; }
  const cur = useSelection.getState().sel;
  if (id == null) { if (cur?.type === 'edge') useSelection.setState({ sel: null }); return; }
  if (!(cur?.type === 'edge' && cur.id === id)) useSelection.setState({ sel: { type: 'edge', id } });
}

/** Whether a mode holds the scene's taps (the shunt waiting for its target). */
export const scenePicksHeld = (): boolean => pickHold != null;
