// B10 (charts): the `chart:*` rows (the 2D chart-look tables), the `tool:*` rows of the chart kinds, and the data-card gallery rows (`card:<family>/<specimen>`) of the chart families and of
// the readout tiles. Every claim is DERIVED from what the app renders from, never typed apart from it:
//   chart:<look>   the 2D look table (looks2d/chart-looks, copied whole) has the group's keys AND a chart of the registry (ui/charts/registry.ts CHARTS) that draws with it is done.
//                  tests/b10-parity.test.ts builds every specimen and asks which look keys it really read (LOOKS_ASKED), so a table no chart reads is not claimed.
//                  Wired = the chart is mounted by the presenter's data card (decks/charts.ts CHART_TOOLS / CHART_VISUALS, ui/talk/ToolCard.tsx).
//   tool:<kind>    the registry has the kind done; wired = the presenter mounts it (CHART_TOOLS). The Tests instruments (doppler, trace, vitals, hvpg, reading, fibroscan, scope, abdomen, wall) are
//                  batch B11's rows, not claimed here.
//   card:<id>      the 2D gallery's specimen (ui/charts/gallery/catalog.generated.ts, copied by scripts/copy-chart-catalog.mjs): a slide as a 2D deck writes it. Present = its chart is done (or its
//                  tiles are all readings the app knows); wired = the presenter mounts that chart, the chart reads every option the specimen sets, and every other feature the slide needs has
//                  landed (the rw hook table, the same the deck rows use: a specimen on the Circuit view waits for the Circuit view).
// Built after the first round (the rows themselves were claimed already; what they say is now true): the data card's heading (ui/talk/tool-title.ts, drawn by ui/cards/TilesCard.tsx TilesHead for every
// card with an instrument: 2D's cardTitle), and the time-lapse graph. At the 2D pin the graph is the slide's instrument card (slide-instrument.js, PC-6), not part of the teaching card: the copied decks
// name its flow-time chart as the slide's tool, and what was missing was the deck steps' ask for its trail (hp/numbers.ts stepOf: `trail`, and a procedure's `before`), so every flow-time and
// event-graph card was drawn with no data. `data:graph` (decks/hp/hooks.ts) now reads the thing that does it.
// Not claimed, on purpose: `chart:inst` (the Tests abdomen dial's looks: no chart of src/ui/charts draws with them, the abdomen pane is the Tests thread's), `chart:small` stays present only (the timeline
// clock chart, ui/charts/timeline, is mounted by no page: 2D mounts it in the play bar's .tl-time, src/ui/shell/PlayBar.tsx, which needs the jump's {from, days} from ui/timeline), the still column /
// SAAG quadrant / walls of `chart:card`, and `data:spans` (the slide field `span` is the Circuit figure's bracket and live words, ext-callouts.js, not a chart).
import { CHARTS } from '../ui/charts/registry.ts';
import { LOOKS, HOSTS } from '../ui/charts/looks2d/chart-looks/index.js';
import * as DSL from '../ui/charts/looks2d/chart-looks/dsl.js';
import * as RESOLVE from '../ui/charts/looks2d/chart-looks/resolve.js';
import { CHART_TOOLS, CHART_VISUALS } from '../decks/charts.ts';
import { CATALOG } from '../ui/charts/gallery/catalog.generated.ts';
import { TILE } from '../ui/charts/tiles.generated.ts';
import { readiness } from '../decks/hp/hooks.ts';
import { unclassified } from '../decks/hp/fields.ts';
import type { CopiedSlide } from '../decks/hp/types.ts';
import { rowId, type Claim } from './claim.ts';


const chartDone = (kind: string) => CHARTS.some((c) => c.kind === kind && c.status === 'done');
/** The registry kind a 2D tool kind or visual is drawn by (the course is the curve chart's second mode). */
const KIND_OF_TOOL: Record<string, string> = { course: 'curve' };
const KIND_OF_VISUAL: Record<string, string> = { allpatients: 'small', ladders: 'ladder', plane: 'plane' };
/** The presenter's data card mounts the registry kind (a slide's `tool` or `visual`: ui/talk/ToolCard.tsx draws each from decks/charts.ts's lists). */
const mounted = (kind: string): boolean =>
  (CHART_TOOLS as readonly string[]).some((t) => (KIND_OF_TOOL[t] ?? t) === kind) || (CHART_VISUALS as readonly string[]).some((v) => (KIND_OF_VISUAL[v] ?? v) === kind);

// ── chart:<look> ──
/** The look-table group(s) of a 2D chart-look file (the key's first word) and the registry kinds that draw with them (tests/b10-parity.test.ts holds this against what the specimens read). */
export const LOOK_GROUPS: Record<string, { groups: string[]; kinds: string[] }> = {
  allp: { groups: ['ap'], kinds: ['small'] },
  card: { groups: ['card'], kinds: ['ladder'] },   // (only the pressure ladder's red-block hatching: the still column, the SAAG quadrants and the two walls are not drawn)
  crit: { groups: ['crit'], kinds: ['criteria'] },
  flows: { groups: ['flows'], kinds: ['flows'] },
  fluid: { groups: ['fluid'], kinds: ['fluid'] },
  forest: { groups: ['forest'], kinds: ['forest'] },
  lumen: { groups: ['lumen'], kinds: ['lumen'] },
  path: { groups: ['path'], kinds: ['path'] },
  plane: { groups: ['plane'], kinds: ['plane'] },
  plot: { groups: ['plot'], kinds: ['flowtime'] },
  profile: { groups: ['prof'], kinds: ['profile'] },
  saag: { groups: ['saag'], kinds: ['saag'] },
  shift: { groups: ['shift'], kinds: ['shift'] },
  small: { groups: ['small'], kinds: ['timeline'] },   // (the timeline's jump-day count; the lobule view's slide pointer is the micro-views thread's)
  stent: { groups: ['stent'], kinds: ['stent'] },
  stiff: { groups: ['stiff'], kinds: ['stiffness'] },
  talk: { groups: ['talk'], kinds: ['trace'] },
  time: { groups: ['time', 'ft', 'cv', 'co', 'tf'], kinds: ['flowtime', 'curve'] },
  trial: { groups: ['trial', 'trialfit'], kinds: ['trial'] },
};
const has = (group: string) => Object.keys(LOOKS).some((k) => k.split('.')[0] === group);
const out: Claim[] = [];
for (const [id, g] of Object.entries(LOOK_GROUPS)) {
  if (!g.groups.every(has) || !g.kinds.every(chartDone)) continue;
  // wired: a chart that draws with it is on a slide's data card (a chart only the clock or a gallery draws is present, not wired)
  out.push({ id: rowId('chart', id), wired: g.kinds.some(mounted) });
}
// the machinery every table is read through: the constructors the entries are written with, the resolver, and the table with each host's base size (all three run in every frame)
if (typeof DSL.tok === 'function' && typeof DSL.mix === 'function') out.push({ id: rowId('chart', 'dsl'), wired: true });
if (typeof RESOLVE.resolveProps === 'function' && typeof RESOLVE.makeCtx === 'function') out.push({ id: rowId('chart', 'resolve'), wired: true });
if (Object.keys(LOOKS).length > 0 && Object.keys(HOSTS).length > 0) out.push({ id: rowId('chart', 'index'), wired: true });

// ── tool:<kind> ──
/** Every chart kind the 2D slides use as `tool: { kind }` that this batch draws. */
const TOOL_KINDS = ['criteria', 'profile', 'flowtime', 'path', 'curve', 'course', 'flows', 'trial', 'plane', 'evgraph', 'shift', 'lumen', 'fluid', 'menu', 'stent', 'saag', 'forest'] as const;
for (const t of TOOL_KINDS) if (chartDone(KIND_OF_TOOL[t] ?? t)) out.push({ id: rowId('tool', t), wired: (CHART_TOOLS as readonly string[]).includes(t) });

// ── card:<family>/<specimen> ──
/** What each chart reads of a specimen's `tool` (the head words `title` and `short` are the data card's, not the chart's). Tested against the sources by tests/b10-parity.test.ts. */
export const TOOL_OPTIONS: Record<string, readonly string[]> = {
  criteria: ['rows', 'ticks', 'lead', 'ordered', 'rule', 'verdict', 'zones', 'key'],
  path: ['of', 'patient'],
  profile: ['spans', 'from', 'fromLabel', 'hold'],
  flowtime: ['clock', 'lines', 'given', 'view', 'bands', 'keepTiles'],
  curve: ['param', 'from', 'to', 'step', 'lines', 'x', 'xCuts', 'cuts', 'patient', 'days', 'against', 'gap', 'label', 'zone', 'unit', 'oneScale', 'ends', 'xFrom', 'xTo', 'ring', 'dots', 'walk', 'points', 'reading', 'styles'],
  course: ['reading', 'from', 'event', 'wait', 'after', 'then', 'words'],
  flows: ['of'],
  shift: [],
  menu: ['rows'],
  stent: ['vessel', 'show', 'to'],
  evgraph: [],
  lumen: ['vessel', 'site', 'name'],
  trial: ['id', 'at', 'facts'],
  forest: ['ids'],
  saag: ['extra', 'own'],
  fluid: ['forces', 'window'],
  plane: ['plane', 'trail'],
};
const HEAD_WORDS = new Set(['kind', 'title', 'short']);
const FAMILY_KIND: Record<string, string> = { course: 'course' };

for (const e of CATALOG) {
  const tool = e.slide.tool as { kind?: string } | undefined;
  const kind = tool?.kind;
  const tiles = (e.slide.tiles as string[] | undefined) ?? [];
  const tilesOk = tiles.every((k) => !!TILE[k]);
  let present = tilesOk, wired = tilesOk;
  if (kind) {
    const reg = KIND_OF_TOOL[kind] ?? kind;
    const opts = TOOL_OPTIONS[FAMILY_KIND[kind] ?? kind];
    const optionsRead = !!opts && Object.keys(tool).every((o) => HEAD_WORDS.has(o) || opts.includes(o));
    present &&= chartDone(reg);
    wired &&= chartDone(reg) && (CHART_TOOLS as readonly string[]).includes(kind) && optionsRead;
  }
  if (!present) continue;
  // the rest of what the slide needs, as the deck rows count it (a lens, the Circuit view, a procedure, a what-if slider ...); a field no hook table knows leaves it present only
  if (wired) {
    const probe = { id: e.id.replace(/\W+/g, '-'), ...e.slide } as unknown as CopiedSlide;
    wired = unclassified(probe).length === 0 && readiness(probe).wired;
  }
  out.push({ id: rowId('card', e.id), wired });
}

export const claims: readonly Claim[] = out;
