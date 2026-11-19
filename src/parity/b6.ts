// B6 (labels, callouts, search): the search's Go to rows, derived from the table the palette runs them from (src/ui/search/goto.ts: the topology's vessel labels and the organs).
// Wired = choosing the entry selects the structure as 2D's palette does (vessel lit on the figure, tap-anything card open; the abdomen opens the Ascites instrument).
// The slide hooks for labels, marks, callouts and sites are the deck thread's (src/ui/deck/figure-link.ts), not claimed here.
import { UI } from '../ui/strings.generated.ts';
import { GO_TO } from '../ui/search/goto.ts';
import type { Claim } from './claim.ts';

const out: Claim[] = [];
for (const c of UI.search.commands) if (c.group === 'Go to') out.push({ id: `search:Go to/${c.title}`, wired: GO_TO.has(c.title) });
export const claims: readonly Claim[] = out;
