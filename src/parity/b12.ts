// B12 (presenter features): the Present column's actions, as the 2D menu lists them. Each is derived from the words the Present column renders from (ui/deck/words.ts), so a row is claimed
// only while the control is on the screen with the 2D words; `wired` is true because each does what the 2D one does (library.ts, handout.ts, presenter-link.ts).
// The outline, the name tab, the quick check, the clicker, the share and import links and the scripts have no inventory row of their own; tests/b12-presenter.test.ts holds them.
import { W } from '../ui/deck/words.ts';
import type { Claim } from './claim.ts';

const act = (label: string): Claim => ({ id: `mainmenu:action/${label}`, wired: true });

export const claims: readonly Claim[] = [
  act(W.fromStart), act(W.present), act(W.presenterView), act(W.copyLink), act(W.printNotes), act(W.yourScriptsImport), act(W.addState),
  { id: 'card:sheet/menu-present', wired: true },
  // The summary table is built (table-model.ts, the 2D cut-offs and arrows) but drawn as blocks, one per patient, not the 2D grid, and no deck uses it yet: present, not wired.
  { id: 'card:visual/table', wired: false },
];
