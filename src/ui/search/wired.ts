// Which of the 2D palette's commands do their 2D work in the 3D app today (the rest are listed, found by typing, and say "not in the 3D app yet" when run; the empty field
// offers only these). Pure, so the parity claims and the tests can read it without the scene. commands.ts holds the work; a test keeps the two in step.
import { UI } from '../strings.generated.ts';
import { BUILT_PANES, type PaneId } from '../tests/panes.ts';
import { isOrderCommand } from '../treat/palette-orders.ts';
import { EDGES } from '../../engine/hales/portal/topology.js';

const DAYS = new Set(['+1 week', '+1 month', '+6 months', '+1 year', 'Until something happens', 'Restart this patient', 'Undo (back one change)', 'Compare from here']);
const APP = new Set(['Home', 'Reset everything', 'Guide & shortcuts', 'Light / dark theme', 'Copy share link']);

const VIEW = new Set(['Anatomy view', 'Circuit view', 'Lobule view', 'Tests']);

/** The palette's Go to organs (2D palette.js), by the words it lists them under. */
const GO_ORGANS: Record<string, string> = { Liver: 'liver', 'Right heart': 'heart', 'Esophageal varices': 'varices', 'Fundal varices': 'gastric', Spleen: 'spleen', Ascites: 'abdomen' };
/** A vessel by its 2D label: the model's edge of that name (2D: every edge with a label that is not a wedge or a shunt). A vessel the model holds in pieces
 *  (PV_TRUNK, PV_TRUNK_1) is reached by its first piece, the one whose id has no piece number. */
const GO_EDGES = new Map<string, string>();
for (const e of EDGES as { id: string; kind?: string; label?: string }[]) {
  if (!e.label || e.kind === 'wedge' || e.kind === 'shunt') continue;
  const had = GO_EDGES.get(e.label);
  if (!had || (/_\d+$/.test(had) && !/_\d+$/.test(e.id))) GO_EDGES.set(e.label, e.id);
}
/** What a Go to command selects (2D palette.js: `ctx.select({ type: 'edge' | 'organ', id })`), or null for a title that names nothing the model has. */
export function goToSel(title: string): { type: 'edge' | 'organ'; id: string } | null {
  if (GO_ORGANS[title]) return { type: 'organ', id: GO_ORGANS[title]! };
  const id = GO_EDGES.get(title);
  return id ? { type: 'edge', id } : null;
}

/** The palette's Tests commands (2D palette.js): the Doppler's portal vein probe, and the endoscopy pane. */
export const TESTS_PANE: Record<string, PaneId> = { 'Doppler of the portal vein': 'doppler', Endoscopy: 'endoscopy' };
export function isWiredCommand(group: string, title: string): boolean {
  if (group === 'Tests') return !!TESTS_PANE[title] && BUILT_PANES.includes(TESTS_PANE[title]!);
  if (group === 'Time') return DAYS.has(title);
  if (group === 'View') return VIEW.has(title) || UI.lenses.some((l) => title === `Colored by ${l.name.toLowerCase()}`);
  if (group === 'App') return APP.has(title) || UI.looks.some((l) => title === `Appearance: ${l.name}`);
  if (group === 'Go to') return !!goToSel(title);
  if (group === 'Patient' || group === 'Present') return true;
  if (group === 'Treat' || group === 'Change') return isOrderCommand(group, title);   // (B9: the orders)
  return false;
}
