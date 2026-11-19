// The search's "Go to" group (2D palette.js, "Go to a structure"): every drawn vessel by its name, and the organs. Choosing one selects it, as 2D's `ctx.select` does: the vessel
// is lit on the figure and the tap-anything card opens for it (selection.ts); the abdomen goes to the Ascites instrument instead of a card (2D main.js select). The names are the
// topology's own labels (the same list 2D builds), so a test holds this table to UI.search.commands, which is the 2D inventory's. Pure apart from the two stores it writes.
// (2D's select does not move the camera, so neither does this.)
import { EDGES } from '../../engine/hales/portal/topology.js';
import { HIDDEN_EDGES } from '../../scene/vessels/paths.copied.ts';
import { selectStructure, type Sel } from '../action/selection.ts';
import { useTests } from '../tests/store.ts';

interface E { id: string; kind?: string; label?: string }

/** Title -> what choosing it selects. A vessel drawn in several segments with one name is one entry (the inventory has one row per name): its first segment. */
export const GO_TO: ReadonlyMap<string, Sel> = (() => {
  const m = new Map<string, Sel>();
  for (const e of EDGES as E[]) if (!HIDDEN_EDGES.has(e.id) && e.kind !== 'wedge' && e.kind !== 'shunt' && e.label && !m.has(e.label)) m.set(e.label, { type: 'edge', id: e.id });
  for (const [id, t] of [['liver', 'Liver'], ['heart', 'Right heart'], ['varices', 'Esophageal varices'], ['gastric', 'Fundal varices'], ['spleen', 'Spleen'], ['abdomen', 'Ascites']] as const) m.set(t, { type: 'organ', id });
  return m;
})();

/** Go to a structure: select it. The abdomen has one home, the Ascites instrument (the fluid on the figure, a station, this palette), so it opens that instead of a card. */
export function goTo(title: string): boolean {
  const sel = GO_TO.get(title);
  if (!sel) return false;
  if (sel.type === 'organ' && sel.id === 'abdomen') { selectStructure(null); useTests.getState().show('abdomen'); return true; }
  selectStructure(sel);
  return true;
}
