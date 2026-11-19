// B11 (instruments and probes): the rows of the 2D Tests card the 3D app has, derived from the tables the card renders from (ui/tests/panes.ts), never typed apart from them.
// A Tests tab is present as soon as it is on the card (with the 2D name); it is wired when its instrument is built (BUILT_PANES).
import { PANES, BUILT_PANES, type PaneId } from '../ui/tests/panes.ts';
import { UI } from '../ui/strings.generated.ts';
import type { Claim } from './claim.ts';

const out: Claim[] = [];
for (const p of UI.testsPanes) out.push({ id: `tests:${p.id}`, wired: BUILT_PANES.includes(p.id as PaneId) && !!PANES[p.id as PaneId] });
// the palette's two Tests commands open their pane (ui/search/commands.ts)
const PALETTE_PANE: Record<string, PaneId> = { 'Doppler of the portal vein': 'doppler', Endoscopy: 'endoscopy' };
for (const c of UI.search.commands) if (c.group === 'Tests') out.push({ id: `search:Tests/${c.title}`, wired: BUILT_PANES.includes(PALETTE_PANE[c.title]!) });

export const claims: readonly Claim[] = out;
