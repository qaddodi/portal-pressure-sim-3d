// The parity score, as one pure function: the 2D app's inventory against the rows the 3D batches claim (src/parity/claim.ts).
// tests/parity-score.test.ts prints it and the `?parity` page (src/parity/ParityPage.tsx) shows it, so both always say the same numbers.
export interface Row { id: string; area: string; batch: string; label: string }
export interface Claimed { id: string; wired: boolean; file: string }
/** y = rows in the 2D app, x = present (on screen), w = wired (does what the 2D one does), m = matches 2D (the owner checked it on his device: src/parity/matches.ts). */
export interface Tally { y: number; x: number; w: number; m: number }
export interface Score {
  total: Tally;
  byBatch: { batch: string; tally: Tally }[];
  byArea: { group: string; tally: Tally; areas: string[]; batches: string[]; rows: (Row & { state: 'missing' | 'present' | 'wired' | 'matches' })[] }[];
  unknown: Claimed[];
  duplicates: { id: string; files: string[] }[];
}

/** The plan's batch names (parity-plan.md section 5). */
export const BATCH_NAMES: Record<string, string> = {
  B1: 'Shell parity', B2: 'Patients and model controls', B3: 'Vessels, blood and lenses', B4: 'Organs, disease and collaterals',
  B5: 'Procedures, catheters and balloons', B6: 'Labels, callouts and figure key', B7: 'Circuit view and morph', B8: 'Lobule and sinusoid',
  B9: 'Action cards and Treat', B10: 'Charts', B11: 'Instruments and probes', B12: 'Presenter features', B13: 'Deck port', B14: 'Accessibility and debug', B15: 'Guides',
};

/** The groups the page lists, in the order a reader thinks of the app: each is the inventory's `area` values it gathers. */
export const AREA_GROUPS: { group: string; areas: string[] }[] = [
  { group: 'Top bar, view pills and zoom', areas: ['topbar', 'view', 'zoom'] },
  { group: 'Play bar and time', areas: ['playbar'] },
  { group: 'Bottom bar (phones)', areas: ['bottombar'] },
  { group: 'Menus (main menu, Blood, Layers)', areas: ['menu', 'mainmenu'] },
  { group: 'Settings and looks', areas: ['settings', 'look', 'platform'] },
  { group: 'Search', areas: ['search'] },
  { group: 'Shortcuts and help', areas: ['shortcut', 'help'] },
  { group: 'Behaviours of the shell', areas: ['behaviour'] },
  { group: 'Patients (presets)', areas: ['preset'] },
  { group: 'Colour lenses', areas: ['lens'] },
  { group: 'Treat (drugs, fluids, procedures)', areas: ['treat'] },
  { group: 'Tests (instruments and probes)', areas: ['tests'] },
  { group: 'Charts', areas: ['chart'] },
  { group: 'Tools', areas: ['tool'] },
  { group: 'Cards', areas: ['card'] },
  { group: 'Decks', areas: ['deck'] },
  { group: 'Slides', areas: ['slide'] },
  { group: 'Slide camera shots', areas: ['camera'] },
];

const empty = (): Tally => ({ y: 0, x: 0, w: 0, m: 0 });
function add(t: Tally, state: 'missing' | 'present' | 'wired' | 'matches') { t.y++; if (state !== 'missing') t.x++; if (state === 'wired' || state === 'matches') t.w++; if (state === 'matches') t.m++; }

export function score(rows: readonly Row[], claimed: readonly Claimed[], matches: readonly string[] = []): Score {
  const ok = new Set(matches);
  const ids = new Set(rows.map((r) => r.id));
  const first = new Map<string, Claimed>();
  const files = new Map<string, Set<string>>();
  const unknown: Claimed[] = [];
  for (const c of claimed) {
    if (!ids.has(c.id)) { unknown.push(c); continue; }
    if (!first.has(c.id)) first.set(c.id, c);
    (files.get(c.id) ?? files.set(c.id, new Set()).get(c.id)!).add(c.file);
  }
  const duplicates = [...files].filter(([, f]) => f.size > 1).map(([id, f]) => ({ id, files: [...f] }));
  // (a row can match only if a batch also claims it wired: a matching row that is not built is a stale entry)
  const state = (r: Row) => { const c = first.get(r.id); return c ? (c.wired ? (ok.has(r.id) ? 'matches' as const : 'wired' as const) : 'present' as const) : 'missing' as const; };

  const total = empty();
  const per = new Map<string, Tally>();
  const groupOf = new Map<string, string>();
  for (const g of AREA_GROUPS) for (const a of g.areas) groupOf.set(a, g.group);
  const groups = new Map<string, Score['byArea'][number]>(AREA_GROUPS.map((g) => [g.group, { group: g.group, tally: empty(), areas: g.areas, batches: [], rows: [] }]));
  for (const r of rows) {
    const s = state(r);
    add(total, s);
    add(per.get(r.batch) ?? per.set(r.batch, empty()).get(r.batch)!, s);
    const gname = groupOf.get(r.area) ?? 'Other';
    const g = groups.get(gname) ?? groups.set(gname, { group: gname, tally: empty(), areas: [r.area], batches: [], rows: [] }).get(gname)!;
    add(g.tally, s);
    if (!g.batches.includes(r.batch)) g.batches.push(r.batch);
    g.rows.push({ ...r, state: s });
  }
  const n = (b: string) => Number(b.slice(1));
  return {
    total,
    byBatch: [...per].sort((a, b) => n(a[0]) - n(b[0])).map(([batch, tally]) => ({ batch, tally })),
    byArea: [...groups.values()].filter((g) => g.tally.y > 0),
    unknown, duplicates,
  };
}

export const pct = (t: Tally, of: 'x' | 'w' | 'm' = 'x') => (t.y ? Math.round((100 * t[of]) / t.y) : 0);
