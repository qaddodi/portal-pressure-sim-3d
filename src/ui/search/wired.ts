// Which of the 2D palette's commands do their 2D work in the 3D app today (the rest are listed, found by typing, and say "not in the 3D app yet" when run; the empty field
// offers only these). Pure, so the parity claims and the tests can read it without the scene. commands.ts holds the work; a test keeps the two in step.
import { UI } from '../strings.generated.ts';
import { isOrderCommand } from '../treat/palette-orders.ts';

const DAYS = new Set(['+1 week', '+1 month', '+6 months', '+1 year', 'Until something happens', 'Restart this patient', 'Undo (back one change)', 'Compare from here']);
const APP = new Set(['Home', 'Reset everything', 'Guide & shortcuts', 'Light / dark theme', 'Copy share link']);

export function isWiredCommand(group: string, title: string): boolean {
  if (group === 'Time') return DAYS.has(title);
  if (group === 'View') return title === 'Anatomy view' || UI.lenses.some((l) => title === `Colored by ${l.name.toLowerCase()}`);
  if (group === 'App') return APP.has(title) || UI.looks.some((l) => title === `Appearance: ${l.name}`);
  if (group === 'Patient') return true;
  if (group === 'Treat' || group === 'Change') return isOrderCommand(group, title);   // (B9: the orders)
  return false;
}
