// Which of the 2D palette's commands do their 2D work in the 3D app today (the rest are listed, found by typing, and say "not in the 3D app yet" when run; the empty field
// offers only these). Pure, so the parity claims and the tests can read it without the scene. commands.ts holds the work; a test keeps the two in step.
import { EDGES, PART_OF } from '../../engine/hales/portal/topology.js';
import { UI } from '../strings.generated.ts';
import { BUILT_PANES, type PaneId } from '../tests/panes.ts';
import { isOrderCommand } from '../treat/palette-orders.ts';

const DAYS = new Set(['+1 week', '+1 month', '+6 months', '+1 year', 'Until something happens', 'Restart this patient', 'Undo (back one change)', 'Compare from here']);
const APP = new Set(['Home', 'Reset everything', 'Guide & shortcuts', 'Light / dark theme', 'Copy share link']);

/** The palette's Tests commands (2D palette.js): the Doppler's portal vein probe, and the endoscopy pane. */
export const TESTS_PANE: Record<string, PaneId> = { 'Doppler of the portal vein': 'doppler', Endoscopy: 'endoscopy' };
/** The palette's Go to commands (2D palette.js): a vessel by its name, or one of six structures. "Ascites" opens the Tests card's Ascites pane (the selection does that). */
const GO_ORGANS: Record<string, string> = { Liver: 'liver', 'Right heart': 'heart', 'Esophageal varices': 'varices', 'Fundal varices': 'gastric', Spleen: 'spleen', Ascites: 'abdomen' };
const GO_EDGES = new Map<string, string>();
for (const e of EDGES as readonly { id: string; kind?: string; label?: string }[]) if (e.label && e.kind !== 'wedge' && e.kind !== 'shunt' && !GO_EDGES.has(e.label)) GO_EDGES.set(e.label, (PART_OF as Record<string, string>)[e.id] ?? e.id);   // (a vein split in pieces is one vein)
export function goToSel(title: string): { type: 'organ' | 'edge'; id: string } | null {
  if (GO_ORGANS[title]) return { type: 'organ', id: GO_ORGANS[title] };
  const id = GO_EDGES.get(title);
  return id ? { type: 'edge', id } : null;
}
export function isWiredCommand(group: string, title: string): boolean {
  if (group === 'Tests') return !!TESTS_PANE[title] && BUILT_PANES.includes(TESTS_PANE[title]!);
  if (group === 'Go to') return !!goToSel(title);
  if (group === 'Time') return DAYS.has(title);
  if (group === 'View') return title === 'Anatomy view' || title === 'Circuit view' || UI.lenses.some((l) => title === `Colored by ${l.name.toLowerCase()}`);
  if (group === 'App') return APP.has(title) || UI.looks.some((l) => title === `Appearance: ${l.name}`);
  if (group === 'Patient') return true;
  if (group === 'Treat' || group === 'Change') return isOrderCommand(group, title);   // (B9: the orders)
  return false;
}
