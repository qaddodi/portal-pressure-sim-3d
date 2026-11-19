// The instruments a deck slide can put in its data card (2D presenter-tools.js `tool: { kind }`): which kind is which Tests pane, which options of the slide's `tool` each one reads (the 2D
// presenter's list, one place), and what a kind needs from the figure while its card is up (a probe on the vessel, an organ, the scope). Pure: ui/talk/ToolCard.tsx mounts the panes from this plan
// and tests/deck-tools.test.ts holds every kind and option the copied decks use against it, so a new option in a 2D deck fails there until it is handled here.
import { INSTRUMENT_TOOLS } from '../../decks/charts.ts';

export type Rec = Record<string, unknown>;
export type InstrumentKind = (typeof INSTRUMENT_TOOLS)[number];

/** How a kind is carried today: 'plays' (the pane plays from the slide, evidence says where), 'partial' (mounted, but a part of the 2D card is not drawn yet: `gap` says which). */
export interface InstrumentEntry {
  kind: InstrumentKind;
  /** the 2D tool options this kind reads, besides `kind` (every key a copied slide uses must be here) */
  options: readonly string[];
  /** the file that carries it from the slide to the screen */
  evidence: string;
  status: 'plays' | 'partial';
  gap?: string;
}

const COMMON = ['title', 'delta', 'deltaLabel'] as const;   // (the card's heading; the earlier reading shown faint beside a live one: ghost.ts)
export const INSTRUMENTS: readonly InstrumentEntry[] = [
  { kind: 'doppler', options: [...COMMON, 'vessel', 'gate', 'mode', 'waves', 'pair', 'calipers', 'probe', 'points', 'scale', 'baseline'], evidence: 'src/ui/tests/doppler/DopplerPane.tsx', status: 'plays' },
  { kind: 'fibroscan', options: [...COMMON, 'organ'], evidence: 'src/ui/tests/fibro/FibroPane.tsx', status: 'plays' },
  { kind: 'abdomen', options: [...COMMON], evidence: 'src/ui/tests/abdomen/AbdomenPane.tsx', status: 'plays' },
  { kind: 'scope', options: [...COMMON, 'open', 'readings', 'air', 'red'], evidence: 'src/ui/tests/endo/EndoPane.tsx', status: 'plays' },
  { kind: 'hvpg', options: [...COMMON, 'catheter'], evidence: 'src/ui/talk/HvpgTool.tsx', status: 'plays' },
  { kind: 'reading', options: [...COMMON, 'of'], evidence: 'src/ui/talk/ReadingTool.tsx', status: 'plays' },
  { kind: 'wall', options: [...COMMON], evidence: 'src/ui/tests/endo/WallView.tsx', status: 'plays' },
];

export const instrumentOf = (kind: unknown): InstrumentEntry | undefined => INSTRUMENTS.find((x) => x.kind === kind);
/** Whether the kind plays from a slide end to end (a readiness flag may flip only for these). */
export const instrumentPlays = (kind: string): boolean => instrumentOf(kind)?.status === 'plays';
/** The keys of a slide's tool no entry of its kind reads (empty when every option is handled). */
export const unhandledOptions = (tool: Rec): string[] => {
  const e = instrumentOf(tool.kind);
  return e ? Object.keys(tool).filter((k) => k !== 'kind' && !e.options.includes(k)) : [];
};

export type Organ = 'liver' | 'spleen';
/** What a slide's instrument needs of the Tests state and the figure (2D presenter-tools.js show). */
export interface InstrumentPlan {
  kind: InstrumentKind;
  /** the Doppler: the vessel it samples, the stent's sample spot the slide names (null: the stent's middle), whether a probe is drawn on the figure (none when the scope is the probe), and whether the figure calls out all three of a stent's points */
  doppler?: { vessel: string; gate: string | null; figure: boolean; points: boolean };
  /** FibroScan: the organ the probe stands over */
  organ?: Organ;
  /** the endoscope is drawn down the esophagus */
  scope?: boolean;
  /** Wall mechanics is the scope pane's second view; the plain scope its first */
  view?: 'scope' | 'wall';
}

export function planOf(kind: InstrumentKind, tool: Rec): InstrumentPlan {
  const p: InstrumentPlan = { kind };
  if (kind === 'doppler') p.doppler = { vessel: typeof tool.vessel === 'string' && tool.vessel ? tool.vessel : 'PV_TRUNK', gate: typeof tool.gate === 'string' ? tool.gate : null, figure: tool.probe !== 'scope', points: !!tool.points };
  if (kind === 'fibroscan') p.organ = tool.organ === 'spleen' ? 'spleen' : 'liver';
  if (kind === 'scope') { p.scope = true; p.view = 'scope'; }
  if (kind === 'wall') { p.view = 'wall'; }
  return p;
}
