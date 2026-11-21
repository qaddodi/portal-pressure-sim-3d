// B12x (the 2D gallery's sheets, toasts, teaching-card variants and visuals): the `card:sheet/*`, `card:teaching/*` and `card:visual/*` rows the other claim files leave. The specimens are copied
// from the 2D app (scripts/copy-card-catalog.mjs -> ui/cards/gallery/catalog.generated.ts: a slide as a 2D deck writes it, or the sheet the gallery opens), so a row is claimed only while the 3D
// app can do what that exact specimen asks, never from a typed list of ids. A row some other claim file already has (b12.ts: `card:sheet/menu-present`, `card:visual/table`) is left to it.
//
//   teaching/*, visual/*   the specimen goes through the same path a deck's slide does: hp/deck.ts slideOf (the Slide the cards draw), rw/hooks.ts hooksOf (every field the slide has is one the
//                          app knows; a field it cannot classify, or a feature nothing has registered, leaves the row unclaimed), then one probe of the card that draws the variant (VARIANT below:
//                          the case card, the equation, the compare buttons, the what-if slider, the response tile, the figure's marks ...). present = the probe holds and no hook is missing;
//                          wired = also the slide plans (camera, scene) and hp/hooks.ts readiness says every feature it needs has landed.
//   sheet/*                present = its opener (the top bar's button, the menu's tab) and the table it renders from are in the app with the 2D words; wired = its opener and every row inside it are wired
//                          in the claim files of their own batches (a sheet does what 2D's does only while what it holds does), and a feature the sheet's opener runs is registered where it can be tried.
//   sheet/toast*           the shell's `say` is run once: a plain line, a line in the `bad` tone, a line with a button. Each is present when `say` makes it; the tone and the button are drawn by
//                          Toast.tsx (tests/b12x-cards.test.ts reads it). 2D's note has a warning mark, role="alert", up to two buttons under the words and stays until it is dealt with; the 3D line has
//                          none of that, so the two with a difference are present only.
// Not claimed, listed in the batch report: `teaching/scope-tile` (the endoscopic view as a readout tile: the tile key is dropped by the tiles card), `visual/scale` and `visual/quadrant` (no chart draws them).
import { clock } from '../clock/frame.ts';
import { CARD_CATALOG, type CardSpecimen } from '../ui/cards/gallery/catalog.generated.ts';
import { slideOf } from '../decks/hp/deck.ts';
import { hooksOf, hasHook, missingHooks, type Hook } from '../decks/rw/hooks.ts';
import { registerBuiltinHooks } from '../decks/rw/hooks-builtin.ts';
import { readiness } from '../decks/hp/hooks.ts';
import type { CopiedSlide } from '../decks/hp/types.ts';
import { caseOf, type Slide } from '../decks/schema.ts';
import { NSBB_LEVELS } from '../decks/controls.ts';
import { hasVisualChart } from '../decks/charts.ts';
import { tileRows } from '../decks/hp/tiles-model.ts';
import { tileKeys } from '../ui/deck/from2d/card-tiles.js';
import { figurePlan } from '../ui/deck/figure-plan.ts';
import { parseLine } from '../ui/text/line.ts';
import { sentences } from '../ui/cards/pages.ts';
import { CHARTS } from '../ui/charts/registry.ts';
import { PLANES } from '../ui/charts/plane/model.ts';
import { planeRows } from '../ui/charts/plane/data.ts';
import { extraStep } from '../ui/charts/ladder/model.ts';
import { tableModel } from '../ui/talk/table-model.ts';
import { UI } from '../ui/strings.generated.ts';
import { useShell, TOAST_MS, ACTION_MS } from '../ui/shell/store.ts';
import { hasFeature, type FeatureId } from '../ui/shell/features.ts';
import { startHistory } from '../ui/history/bind.ts';
import { startCompare } from '../ui/compare/bind.ts';
import { HIST } from '../ui/history/words.ts';
import { CMP } from '../ui/compare/words.ts';
import { ROWS as COMPARE_ROWS, GROUPS as COMPARE_GROUPS } from '../ui/compare/model.ts';
import { TABS as TREAT_TABS, drugChips, fluids, procedures } from '../ui/treat/orders.ts';
import { SECTIONS as SETTINGS_SECTIONS } from '../ui/settings/rows.ts';
import { BUILT_PANES, PANE_ORDER } from '../ui/tests/panes.ts';
import { W as DECK_WORDS } from '../ui/deck/words.ts';
import { claims as b1 } from './b1.ts';
import { claims as b2 } from './b2.ts';
import { claims as b5 } from './b5.ts';
import { claims as b6 } from './b6.ts';
import { claims as b9 } from './b9.ts';
import { claims as b11 } from './b11.ts';
import { claims as b12 } from './b12.ts';
import type { Claim } from './claim.ts';

registerBuiltinHooks();

type Cs = CopiedSlide & Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
const chartDone = (kind: string) => CHARTS.some((c) => c.kind === kind && c.status === 'done');
const taken = new Set(b12.map((c) => c.id));   // (b12.ts has `card:sheet/menu-present` and `card:visual/table`: one row is claimed by one file only)

// ── the rows the sheets hold, as the claim files of their own batches say ──
const others: readonly Claim[] = [...b1, ...b2, ...b5, ...b6, ...b9, ...b11, ...b12];
const rowsOf = (prefix: string) => others.filter((c) => c.id.startsWith(prefix));
const allWired = (prefix: string) => { const r = rowsOf(prefix); return r.length > 0 && r.every((c) => c.wired); };
const wiredRow = (id: string) => others.some((c) => c.id === id && c.wired);
const hasTopbar = (id: string) => UI.topbar.some((t) => t.id === id);
/** A feature a control runs is there when something registers it. One that is not yet registered here is tried: started, looked for, and put back as it was. */
const registers = (id: FeatureId, start: () => () => void): boolean => {
  if (hasFeature(id)) return true;
  const off = start();
  const ok = hasFeature(id);
  off();
  return ok;
};

interface Sheet { present: boolean; wired: boolean }
const SHEETS: Record<string, () => Sheet> = {
  // Treat: the top bar's button and the three tabs, each from the table the card renders from (drugs, fluids, procedures); its rows are b5's and b9's.
  treat: () => ({
    present: hasTopbar('btnTreat') && TREAT_TABS.length === 3 && drugChips().length > 0 && fluids().length > 0 && procedures().length > 0,
    wired: wiredRow('topbar:btnTreat') && allWired('treat:'),
  }),
  // History: the button, the sheet's own words, and the feature the button runs.
  history: () => ({
    present: hasTopbar('btnHistory') && HIST.title === 'History' && !!HIST.compare && !!HIST.goBack,
    wired: wiredRow('topbar:btnHistory') && wiredRow('playbar:History') && registers('history', startHistory),
  }),
  // Compare: pinned from the play bar or a History row, the Then / Now / Change choice, the table of every value.
  compare: () => ({
    present: CMP.from === 'Compare from here' && CMP.tableBtn === 'Differences' && COMPARE_ROWS.length > 0 && COMPARE_GROUPS.length > 0,
    wired: wiredRow('playbar:Compare from here') && registers('compare', startCompare),
  }),
  settings: () => ({
    present: hasTopbar('btnSettings') && SETTINGS_SECTIONS.length > 0,
    wired: wiredRow('topbar:btnSettings') && allWired('settings:') && allWired('look:'),
  }),
  'menu-patients': () => ({
    present: hasTopbar('btnMenu') && UI.menus.mainMenu.tabs.some((t) => t.id === 'patients') && UI.presets.length > 0,
    wired: wiredRow('topbar:btnMenu') && wiredRow('mainmenu:tab/Patients') && allWired('preset:'),
  }),
  'menu-present': () => ({
    present: hasTopbar('btnMenu') && UI.menus.mainMenu.tabs.some((t) => t.id === 'present') && !!DECK_WORDS.present && !!DECK_WORDS.fromStart,
    wired: wiredRow('topbar:btnMenu') && wiredRow('mainmenu:tab/Present') && allWired('mainmenu:action/'),
  }),
  palette: () => ({
    present: hasTopbar('btnPalette') && UI.search.commands.length > 0,
    wired: wiredRow('topbar:btnPalette') && allWired('search:'),
  }),
  tests: () => ({
    present: hasTopbar('tabInstruments') && PANE_ORDER.length > 0 && BUILT_PANES.length > 0,
    wired: wiredRow('topbar:tabInstruments') && allWired('tests:'),
  }),
};

// ── the toasts: `say` is run (its timer is cancelled, and a page with the app mounted is not the page this runs on) ──
interface Said { tone: string; action: boolean; ms: number }
function say(tone: 'info' | 'bad', withAction: boolean): Said | null {
  const ids: number[] = [];
  const real = clock.after;
  let ms = 0;
  // (the toast's length is the wait it asks the clock for)
  clock.after = ((fn: () => void, t: number, tag?: string) => { ms = t ?? 0; const id = real.call(clock, fn, t, tag); ids.push(id); return id; }) as typeof clock.after;
  try {
    useShell.getState().say('A message.', tone, withAction ? { label: 'Undo', run: () => undefined } : undefined);
    const t = useShell.getState().toast;
    return t ? { tone: t.tone, action: !!t.action, ms } : null;
  } finally {
    clock.after = real;
    for (const h of ids) clock.cancel(h);
    useShell.setState({ toast: null });
  }
}
const TOASTS: Record<string, () => Sheet> = {
  toast: () => { const s = say('info', false); return { present: !!s && s.tone === 'info' && !s.action && s.ms === TOAST_MS, wired: !!s && s.tone === 'info' }; },
  // (3D draws the tone as a red line; 2D leads with a warning mark and says it as an alert: present, not wired)
  'toast-bad': () => { const s = say('bad', false); return { present: !!s && s.tone === 'bad', wired: false }; },
  // (3D has one button and the line leaves after ACTION_MS; 2D's Undo and Dismiss stand under the words: present, not wired)
  'toast-action': () => { const s = say('info', true); return { present: !!s && s.action && s.ms === ACTION_MS, wired: false }; },
};

// ── the teaching card's variants and the visuals: one probe of the card that draws each ──
interface Ctx { cs: Cs; s: Slide; hooks: Hook[] }
const labelsOf = (v: unknown): string[] => (Array.isArray(v) ? v.map((o) => String((o as { label?: unknown }).label ?? '')) : []);
const pieces = (cs: Cs) => parseLine(String(cs.line ?? ''));
const VARIANT: Record<string, (c: Ctx) => boolean> = {
  // words only: the kicker, the title and the line the card typesets
  'teaching/words-only': ({ s }) => !!s.title && !!s.kicker && sentences(s.line).length > 0,
  // a case opens on a card of its own (CaseCard): the patient, then the slide
  'teaching/vignette': ({ cs, s }) => caseOf(s)?.kicker === 'Case' && caseOf(s)?.text === cs.vignette,
  // the equation (MathML): each quantity, the wedged pressure and the free one in their colours
  'teaching/equation': ({ s }) => !!s.eq?.length && s.eq.some((p) => p.tone === 'wedge') && s.eq.some((p) => p.tone === 'free'),
  // term pills (a figure part the words point at) and a cut-off in bold
  'teaching/terms': ({ cs }) => pieces(cs).filter((p) => p.t === 'term').length >= 2 && pieces(cs).some((p) => p.t === 'cutoff'),
  'teaching/cite': ({ cs, s }) => !!s.cite && s.cite === cs.cite,
  // compare buttons: the 2D labels, the slide's own pressed
  'teaching/compare': ({ cs, s }) => (s.controls?.compare?.opts.length ?? 0) >= 2 && labelsOf(s.controls!.compare!.opts).join() === labelsOf(cs.compare).join() && s.controls?.compare?.opts.some((o) => o.own) === true,
  // the what-if slider: one parameter of the live model, between the slide's own bounds
  'teaching/what-if': ({ cs, s }) => s.controls?.whatIf?.paths.join() === String(cs.whatIf?.param) && s.controls?.whatIf?.min === cs.whatIf?.min && s.controls?.whatIf?.max === cs.whatIf?.max,
  // the HVPG fall: the slide before it is the baseline, and the HVPG monitor is the slide's instrument
  'teaching/response-before': ({ s }) => s.tool?.kind === 'hvpg' && !!s.tiles?.keys.length,
  // the response buttons (three, the slide's own pressed) and the HVPG fall tile counted from the named slide
  'teaching/response': ({ s }) => {
    const opts = s.controls?.compare?.opts ?? [];
    const rows = s.tiles ? tileRows(s.tiles, { hvpg: 7 }, null, undefined, { hvpg: 10 }) : [];
    return opts.length === NSBB_LEVELS.length && opts.every((o, i) => o.label === NSBB_LEVELS[i]!.label) && rows.some((r) => r.key === 'hvpgFall' && r.text === '30%');
  },
  'teaching/strain': ({ s }) => s.controls?.strain?.label === 'Hold to strain',
  // a question slide asks on a card of its own before the slide (the slide has no patient of its own, so the slide is the answer)
  'teaching/question': ({ cs, s }) => caseOf(s)?.kicker === 'Question' && caseOf(s)?.text === cs.question,
  // a case with its one short question and compare buttons
  'teaching/case': ({ cs, s }) => caseOf(s)?.kicker === 'Case' && s.caseQ === cs.caseQ && (s.controls?.compare?.opts.length ?? 0) >= 2,
  // numbered step markers in the words and the figure's matching numbers
  'teaching/steps': ({ cs }) => pieces(cs).filter((p) => p.t === 'step').length >= 2 && (figurePlan(cs).steps?.length ?? 0) > 0,
  // the time-lapse counter under the words (its days are the slide's own)
  'teaching/lapse': ({ cs, s }) => !!s.lapse && s.lapse.days === cs.days,
  // a ring and a label on one vessel, and on a vessel and an organ
  'teaching/mark': ({ cs }) => { const m = figurePlan(cs).marks; return m.length === 1 && m[0]!.label === (cs.mark as { label?: string } | undefined)?.label && m[0]!.edges.length === 1; },
  'teaching/marks': ({ cs }) => { const m = figurePlan(cs).marks; return m.length === (cs.marks as unknown[]).length && m.some((x) => x.edges.length > 0) && m.some((x) => x.organ === 'caudate'); },
  // the endoscopic view as a readout tile: the tile key the slide asks for has to reach the card (tileRows keeps only the readings it can print)
  'teaching/scope-tile': ({ cs, s }) => {
    const keys = tileKeys(cs, false) as string[];
    return keys.includes('scope') && !!s.tiles && tileRows({ ...s.tiles, keys }, {}, null).some((r) => r.key === 'scope');
  },
  // a call-out with a leader to a place in the lobule, and a word that points there
  'teaching/lobule': ({ cs, s }) => figurePlan(cs).callout != null && s.scene?.view === 'lobule' && Object.values(cs.terms as Record<string, string>).every((t) => /^lobule:/.test(t)),

  // the table's Doppler column: a trace for each row, on the slide's vessel (the table card draws one block for each patient: the same reason as `visual/table`, claimed by b12.ts, so present only)
  'visual/table-wave': ({ cs, s }) => {
    const spec = { ...s.table!, cols: [...(s.table?.cols ?? []), 'wave'] };
    const rows = (s.table?.of ?? []).map((o, i) => ({ spec: typeof o === 'string' ? { id: o } : o, i, key: String(i), title: '', kicker: '', f: { pv: 12, hvpg: 5, ppg: 5 }, trace: { t: [0, 1], v: [10, 20] } }));
    const m = tableModel(spec, rows as never);
    return !!s.table?.wave && m.rows.length === (s.table?.of.length ?? -1) && m.rows.every((r) => r.cells.some((c) => c.kind === 'wave' && c.wave?.vessel === cs.wave));
  },
  // the Gut to heart charts in one grid: every row is a patient the engine can be asked for
  'visual/ladders': ({ cs, s }) => hasVisualChart(s) && chartDone('ladder') && (cs.of as unknown[]).length > 0 && (cs.of as never[]).every((o) => !!extraStep(o)),
  // the plane panel: a plane the chart knows, a point for each patient
  'visual/plane': ({ cs, s }) => hasVisualChart(s) && chartDone('plane') && cs.plane in PLANES && planeRows(cs.of, []).length === (cs.of as unknown[]).length,
  'visual/walls': ({ s }) => hasVisualChart(s) && chartDone('walls'),
  // every patient on one chart: the cohort's slides are the points
  'visual/allpatients': ({ cs, s }) => hasVisualChart(s) && chartDone('small') && Array.isArray(cs.cohort) && cs.cohort.every((c: { c?: string; slides?: string[] }) => !!c.c && !!c.slides?.length),
  // (no chart draws these two: `scale` is not a field the app classifies and `visual:quadrant` is a hook nothing registers)
  'visual/scale': ({ hooks }) => missingHooks(hooks, hasHook).length === 0,
  'visual/quadrant': ({ hooks }) => missingHooks(hooks, hasHook).length === 0,
};
/** Visuals that are present but whose card is not what 2D draws (the summary table's blocks), as b12.ts says of `visual/table`. */
const PRESENT_ONLY = new Set(['visual/table-wave']);

/** The slide a specimen becomes in the gallery deck (2D gallery/deck.js specimenSlide), and what the 3D app makes of it. */
function build(e: CardSpecimen): { ctx: Ctx; plans: boolean } | null {
  const cs: Cs = { id: e.id.replace(/[^a-z0-9]+/gi, '-').toLowerCase(), kicker: 'Gallery', title: e.title, line: `Gallery specimen ${e.id}.`, notes: '', ...e.slide } as Cs;
  if (!e.carry && !cs.preset) cs.preset = 'healthy';
  if (!cs.cam) cs.cam = 'fit';
  let hooks: Hook[];
  try { hooks = hooksOf(cs); } catch { return null; }   // (a field the app cannot classify)
  let plans = true;
  let s: Slide;
  try { s = slideOf('gallery', cs, 0, undefined); } catch {
    // (the camera or the scene cannot be planned: the cards are still tried on the slide without them, but the row is not wired)
    plans = false;
    try { s = slideOf('gallery', { ...cs, cam: 'fit' } as Cs, 0, undefined); } catch { return null; }
  }
  return { ctx: { cs, s, hooks }, plans };
}

const out: Claim[] = [];
for (const e of CARD_CATALOG) {
  if (e.family === 'sheet') {
    const key = e.id.slice('sheet/'.length);
    const sh = (SHEETS[key] ?? TOASTS[key])?.();
    if (!sh?.present) continue;
    // (the gallery lists each sheet twice: the second as "#2")
    for (const sfx of ['', '#2']) if (!taken.has(`card:${e.id}${sfx}`)) out.push({ id: `card:${e.id}${sfx}`, wired: sh.wired });
    continue;
  }
  if (taken.has(`card:${e.id}`)) continue;
  const probe = VARIANT[e.id];
  const b = build(e);
  if (!probe || !b) continue;
  let ok = false;
  try { ok = probe(b.ctx); } catch { ok = false; }
  if (!ok || missingHooks(b.ctx.hooks, hasHook).length > 0) continue;
  out.push({ id: `card:${e.id}`, wired: b.plans && !PRESENT_ONLY.has(e.id) && readiness(b.ctx.cs).wired });
}

export const claims: readonly Claim[] = out;
