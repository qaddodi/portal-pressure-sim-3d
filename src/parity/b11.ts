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
// the abdomen and the varix wall.
for (const id of ['fibroscan/liver', 'fibroscan/spleen', 'fibroscan/no-spleen', 'scope/varix', 'scope/insufflation', 'scope/no-wale', 'abdomen/ascites', 'wall/varix']) out.push({ id: `card:${id}`, wired: true });

// The rest of the slide instruments (ui/talk/ToolCard.tsx): each is claimed because the card exists with the slide's options, not for the deck's hooks, which the deck thread flips.
//  Doppler (22): every vessel, the display modes, the waves, the pair with its calipers, the stent's gates, the fixed scale and baseline, the scope as the probe, the earlier reading as a ghost (tests/b11-slide.test.ts lists the 22).
//  hvpg (4): the HVPG tracing as a data card (slide/HvpgCard.tsx): free, wedge and result with the catheter on the figure, and the card with no catheter that takes a reading for each Next.
//  reading (4): the measurement monitor following a procedure's clock (slide/ReadingCard.tsx): present, wired once the deck's procedure player calls readingCard.procAt each frame it runs.
//  trace (7): beat by beat on EKG paper (slide/BeatCard.tsx) and the talk chart (charts/trace); vitals (4): the bedside monitor (charts/vitals).
const SLIDE_CARDS: [string, boolean][] = [
  ...['pv-spectrum', 'pv-color', 'pv-variance', 'hv-waves', 'pair-calipers', 'artery', 'reversed', 'no-flow', 'splenic', 'ivc', 'varix', 'paraumbilical', 'scope-probe', 'eus-glue', 'tips-proximal', 'tips-mid', 'tips-distal', 'tips-site', 'aliasing', 'aliasing-baseline', 'ghost-before', 'ghost'].map((x): [string, boolean] => [`doppler/${x}`, true]),
  ...['free', 'wedge', 'result', 'card'].map((x): [string, boolean] => [`hvpg/${x}`, true]),
  ...['hvpgcath', 'eus', 'irivc', 'tipsgrad'].map((x): [string, boolean] => [`reading/${x}`, false]),
  ...['beats', 'beats-plain', 'beats-delta', 'talk', 'talk-steps', 'talk-since', 'talk-milestones'].map((x): [string, boolean] => [`trace/${x}`, true]),
  ...['default', 'output', 'hold', 'alarm'].map((x): [string, boolean] => [`vitals/${x}`, true]),
];
for (const [id, wired] of SLIDE_CARDS) out.push({ id: `card:${id}`, wired });
// the deck's `tool: { kind }` rows: the instruments the card mounts (the reading card waits for the procedure's clock)
for (const k of ['doppler', 'hvpg', 'fibroscan', 'scope', 'abdomen', 'wall', 'trace', 'vitals']) out.push({ id: `tool:${k}`, wired: true });
out.push({ id: 'tool:reading', wired: false });
// the Ascites pane's pressure dial wears 2D's inst.* numbers (charts/looks2d/chart-looks/inst.js is copied; the dial itself is hand-laid in tests/abdomen/model.ts dialFrame)
out.push({ id: 'chart:inst', wired: false });

export const claims: readonly Claim[] = out;
