// B9 (action cards and Treat): the rows of the Treat card and of the search's Change and Treat orders, derived from the tables the card and the orders run from.
// Wired = the order does what the 2D one does (same params, same label in History, same toast words).
import { UI } from '../ui/strings.generated.ts';
import { isOrderCommand } from '../ui/treat/palette-orders.ts';
import { drugChips, DRUG_IDS } from '../ui/treat/orders.ts';
import type { Claim } from './claim.ts';

const out: Claim[] = [];
for (const c of UI.search.commands) if ((c.group === 'Treat' || c.group === 'Change')) out.push({ id: `search:${c.group}/${c.title}`, wired: isOrderCommand(c.group, c.title) });
for (const d of drugChips()) if ((DRUG_IDS as readonly string[]).includes(d.id)) out.push({ id: `treat:drug/${d.label}`, wired: true });
export const claims: readonly Claim[] = out;
