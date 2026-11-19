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

// the 2D gallery's Tests card specimens (`card:tests-<pane>/<patient>` and its `#2` twin: the same card shot again): each is that pane showing that patient, so it is claimed as soon
// as the pane is built (the patients are the engine's own presets, the same numbers as 2D: tests/engine-numbers.test.ts). tests/parity-score.test.ts fails a name the inventory lacks.
const GALLERY: Record<string, string[]> = {
  profile: ['healthy', 'csph', 'decomp', 'tips', 'pvt', 'budd-chiari'], scope: ['csph', 'decomp'], hvpg: ['csph', 'healthy', 'not-measurable', 'tips'], doppler: ['healthy', 'hepatofugal', 'pvt', 'tips'],
  endoscopy: ['large-varix', 'none', 'gastric', 'wall'], abdomen: ['ascites', 'none'], fibroscan: ['liver', 'spleen', 'no-spleen'], readouts: ['healthy', 'decomp'], trials: ['csph'],
};
for (const [pane, states] of Object.entries(GALLERY)) for (const st of states) for (const twin of ['', '#2']) out.push({ id: `card:tests-${pane}/${st}${twin}`, wired: BUILT_PANES.includes(pane as PaneId) });

// the 2D gallery's slide instruments (`tool: { kind }` on a slide, ui/talk/ToolCard.tsx mounts the Tests pane): the three FibroScan cards, the scope's three (air, red wale, readings: EndoPane's `options`),
// the abdomen and the varix wall. (The HVPG monitor's frozen free / wedge / result cards, the measurement monitors, Doppler's gates and ghosts, the traces and the vitals are the deck threads'.)
for (const id of ['fibroscan/liver', 'fibroscan/spleen', 'fibroscan/no-spleen', 'scope/varix', 'scope/insufflation', 'scope/no-wale', 'abdomen/ascites', 'wall/varix']) out.push({ id: `card:${id}`, wired: true });

export const claims: readonly Claim[] = out;
