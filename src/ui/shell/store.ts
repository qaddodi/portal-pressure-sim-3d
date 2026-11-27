// The shell's own state: what is showing (free play or a talk), the view, which sheet or menu is open, the toast, and the figure's switches
// (Blood menu, Layers, the colour lens). Nothing here is per-frame: a frame never writes to it. The engine's numbers reach it only when a displayed word changes.
import { create } from 'zustand';
import { UI } from '../strings.generated.ts';
import { STORAGE_PREFIX } from '../../state/settings.ts';
import type { ViewId } from './views.ts';
import type { LensId } from '../../scene/lenses/model.ts';

import { clock, type TimerId } from '../../clock/frame.ts';
/** What stands in the menus' one slot: a menu (or the timeline chart, until it is a panel). Opening one closes the one before it. */
export type Sheet = 'menu' | 'settings' | 'search' | 'help' | 'guide' | 'blood' | 'layers' | 'lens' | 'speed' | 'jump' | 'readings' | 'timeline' | null;
/** The panels of the shell that stood in the menus' slot until stage 2 of the menu unification: each has its own flag (`panels`), so a menu opens over them
 *  and History and Compare stand together; the slot table (surface/wire.ts) says which panels a panel coming up puts away. */
export const SHELL_PANEL_IDS = ['history', 'compare', 'why'] as const;
export type ShellPanelId = (typeof SHELL_PANEL_IDS)[number];
export const isShellPanel = (p: string | null | undefined): p is ShellPanelId => p === 'history' || p === 'compare' || p === 'why';
/** What can be opened by name: a sheet of the menus' slot or a panel of the shell. */
export type Place = Exclude<Sheet, null> | ShellPanelId;
/** Where a sheet or a panel was opened from, so its Back returns there: a sheet or a panel, and for Settings the page that was pushed (History). */
export interface Origin { sheet: Place; page?: 'history' }
export type MenuTab = 'present' | 'patients' | 'histories';
/** The ten lenses of the 2D menu, in its order (the scene's own list also holds the two a slide uses). */
export const LENS_IDS: readonly LensId[] = UI.lenses.map((l) => l.id as LensId);
export type LabelLevel = 'key' | 'all' | 'none';

/** The figure's own choices the shell owns. The Blood menu's switches (chevrons, key chevrons, pressure values, collaterals, organ names) live in `useBlood`
 *  (scene/blood/options.ts); write any switch through `setFigureSwitch` (figure-switch.ts), never here. */
export interface Figure {
  labelLevel: LabelLevel;
  /** Layers (the lobule view) */
  zones: boolean; lymph: boolean; bile: boolean;
}
export const FIGURE_DEFAULTS: Figure = { labelLevel: 'key', zones: false, lymph: true, bile: true };

export interface ToastAction { label: string; run(): void }
export interface Toast { id: number; text: string; tone: 'info' | 'bad'; action?: ToastAction }
export interface ToastRun { seq: number; ms: number; from: number; paused: boolean }
export interface Transport { running: boolean; speed: number; lapse: number; time: string; day: number }

interface ShellState {
  view: ViewId;
  /** the views the scene can draw (Anatomy now; the Circuit and the lobule batches turn theirs on with `markViewReady`) */
  ready: Record<ViewId, boolean>;
  sheet: Sheet;
  /** which panels of the shell are open (History, Compare, Why), each on its own */
  panels: Record<ShellPanelId, boolean>;
  /** a small dialog over everything (Reset everything?) */
  dialog: 'reset' | 'about' | 'privacy' | null;
  /** the About page's section to scroll to (References) */
  aboutSection: 'refs' | null;
  menuTab: MenuTab;
  menuQuery: string;
  helpSection: 'keys' | 'present' | null;
  /** the page Settings is asked to push as it opens (History, from the chart's "What happened" on a phone); Settings takes it and clears it (settings/SettingsSheet.tsx) */
  settingsPage: 'history' | null;
  /** the sheet `to` was opened from `from` (goFrom); cleared as soon as another sheet is up or none is (below), so a later plain opening of `to` has no origin */
  cameFrom: { to: Place; from: Origin } | null;
  toast: Toast | null;
  /** The note's clock, drawn as the rule under it (Toast.tsx): it shortens from `from` (share of the note's time left) to nothing over `ms`; paused while held; null for a sticky note. */
  toastRun: ToastRun | null;
  figure: Figure;
  transport: Transport;
  patientId: string;
  /** a number that rises on every refit ask (second tap on the active view, Fit, the 0 key): the scene's camera follows it */
  refit: number;
  /** a card or other sheet outside the shell is open (Esc closes that first) */
  set(p: Partial<ShellState>): void;
  /** Opens a sheet (in place of the one in the menus' slot) or a panel (beside the panels up; the menu or chart it was chosen from goes). */
  open(sheet: Place): void;
  /** Go to `to` from `from` (what is up now, which it takes the place of): `to` remembers where it came from.
   *  For Settings, `page` is the page pushed as it opens (History: it slides in from the right over the rows, as a tapped row's page does). */
  goFrom(from: Origin, to: Place, page?: 'history'): void;
  /** Back from `here` (the sheet in the slot when left out): return to where it was opened from, or close it when it was opened on its own. One rule for the chart, History and
   *  Settings' pages, on every device. */
  returnBack(here?: Place): void;
  /** Closes the sheet in the menus' slot (never a panel: `closePanel`). */
  close(): void;
  closePanel(id: ShellPanelId): void;
  /** Closes the sheet and every panel of the shell (a talk starting, a capture of the bare figure). */
  closeAll(): void;
  /** Close from a press that may be on the sheet's own opener (a scrim or backdrop press): the opener's click that follows does not reopen it. */
  closeByPress(): void;
  toggle(sheet: Place): void;
  /** One line at the foot; with an `action` it stays ACTION_MS and carries a button (Send feedback's "Copy full report"). */
  say(text: string, tone?: 'info' | 'bad', action?: ToastAction, sticky?: boolean): void;
  /** A finger or the pointer is on the note (true) or has left it (false): it stays while held, then fades TOAST_LINGER_MS after. A sticky note is never timed. */
  holdToast(on: boolean): void;
  /** Swipe, a click on the note, or Esc: the note fades now. */
  dismissToast(): void;
  setFigure(p: Partial<Figure>): void;
  markViewReady(v: ViewId): void;
}

const KEY = `${STORAGE_PREFIX}figure.v1`;
function loadFigure(): Figure {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || '{}');
    const b = (k: keyof Figure) => (typeof o[k] === 'boolean' ? o[k] : (FIGURE_DEFAULTS[k] as boolean));
    return { labelLevel: ['key', 'all', 'none'].includes(o.labelLevel) ? o.labelLevel : 'key', zones: b('zones'), lymph: b('lymph'), bile: b('bile') };
  } catch { return { ...FIGURE_DEFAULTS }; }
}
const saveFigure = (f: Figure) => { try { localStorage.setItem(KEY, JSON.stringify(f)); } catch { /* kept for this visit */ } };

let toastId = 0, toastTimer: TimerId | undefined, toastSticky = false, toastHeld = false, toastDue = 0, toastTotal = 1, toastLeft = 0, runSeq = 0;
/** The least a note stays (also 2D's own 3.2 s). */
export const TOAST_MS = 3200;
/** A note stays about a word's reading time per word (250 ms), never under TOAST_MS or over TOAST_MAX_MS, so a long one is not gone mid-sentence. */
export const TOAST_WORD_MS = 250, TOAST_MAX_MS = 10000;
/** How long a note lingers after the finger or pointer that held it lets go. */
export const TOAST_LINGER_MS = 1500;
export const toastMs = (text: string): number => Math.min(TOAST_MAX_MS, Math.max(TOAST_MS, text.trim().split(/\s+/).filter(Boolean).length * TOAST_WORD_MS));
/** A toast with a button stays long enough to reach it. */
export const ACTION_MS = 9000;

/** A press on a scrim (or a palette's backdrop) closes the sheet, and the scrim sits over the dock, so a press on the sheet's own opener (the Settings tab) lands on the scrim and the opener's click that follows
 *  finds the scrim gone and toggles the sheet straight back open (owner, 23 Nov, iPhone: tapping Settings again did not close it). `closeByPress` records the sheet it closed; `toggle` of that same sheet is
 *  then ignored until the next press starts (or PRESS_CLOSE_MS passes), so the tail of the closing tap never reopens what it closed. One rule for every opener of every sheet. */
export const PRESS_CLOSE_MS = 1500;
let pressClosed: { sheet: Place; at: number } | null = null;
if (typeof window !== 'undefined') window.addEventListener('pointerdown', () => { pressClosed = null; }, true);   // (capture: a new press clears it before any handler of that press sets it again)
const reopenedByTail = (sheet: Place): boolean => {
  const p = pressClosed; pressClosed = null;
  return !!p && p.sheet === sheet && clock.now() - p.at < PRESS_CLOSE_MS;
};

const NO_PANELS: Record<ShellPanelId, boolean> = { history: false, compare: false, why: false };
type Up = Pick<ShellState, 'sheet' | 'panels'>;
/** Whether `p` is up: a panel by its flag, a sheet by the slot. */
export const isUp = (s: Up, p: Place): boolean => (isShellPanel(p) ? s.panels[p] : s.sheet === p);
/** Any panel of the shell is up. */
export const anyShellPanel = (s: Pick<ShellState, 'panels'>): boolean => s.panels.history || s.panels.compare || s.panels.why;
/** The state that shows `p`: a panel joins the panels up and the sheet it was chosen from goes; a sheet takes the slot. */
const showing = (s: Up, p: Place): Partial<ShellState> => (isShellPanel(p) ? { panels: { ...s.panels, [p]: true }, sheet: null } : { sheet: p });
/** The state that puts `p` away (nothing changes when it is not up). */
const hiding = (s: Up, p: Place): Partial<ShellState> => (!isUp(s, p) ? {} : isShellPanel(p) ? { panels: { ...s.panels, [p]: false } } : { sheet: null });

export const useShell = create<ShellState>((set, get) => ({
  view: 'anatomic',
  ready: { circuit: true, anatomic: true, lobule: true, sinusoid: true },
  sheet: null, panels: NO_PANELS, dialog: null, aboutSection: null, menuTab: 'present', menuQuery: '', helpSection: null, settingsPage: null, cameFrom: null, toast: null, toastRun: null,
  figure: loadFigure(),
  transport: { running: false, speed: 1, lapse: 0, time: '0:00', day: 0 },
  patientId: 'healthy',
  refit: 0,
  set: (p) => set(p),
  open: (sheet) => set(showing(get(), sheet)),
  goFrom: (from, to, page) => {
    const s = get(), left = { ...s, ...hiding(s, from.sheet) };
    set({ ...hiding(s, from.sheet), ...showing(left, to), settingsPage: to === 'settings' ? (page ?? null) : null, cameFrom: { to, from } });
  },
  returnBack: (here) => {
    const s = get(), at = here ?? s.sheet;
    if (!at || !isUp(s, at)) return;
    const left = { ...s, ...hiding(s, at) };
    if (s.cameFrom && s.cameFrom.to === at) set({ ...hiding(s, at), ...showing(left, s.cameFrom.from.sheet), settingsPage: s.cameFrom.from.page ?? null, cameFrom: null });
    else set(hiding(s, at));
  },
  close: () => { if (get().sheet) set({ sheet: null }); },
  closePanel: (id) => { const s = get(); if (s.panels[id]) set(hiding(s, id)); },
  closeAll: () => { const s = get(); if (s.sheet || anyShellPanel(s)) set({ sheet: null, panels: NO_PANELS }); },
  closeByPress: () => { const sheet = get().sheet; if (!sheet) return; pressClosed = { sheet, at: clock.now() }; set({ sheet: null }); },
  toggle: (sheet) => {
    const s = get();
    if (!isUp(s, sheet) && reopenedByTail(sheet)) return;
    set(isUp(s, sheet) ? hiding(s, sheet) : showing(s, sheet));
  },
  say: (text, tone = 'info', action, sticky = false) => {
    clock.cancel(toastTimer);
    // (a sticky note, the first-run hint, stays until its owner closes it, as 2D's toast with `sticky`)
    toastSticky = sticky; toastHeld = false;   // (a new note is timed on its own, even when the pointer still rests where the last one was)
    const ms = action ? ACTION_MS : toastMs(text);
    toastTotal = ms; toastDue = clock.now() + ms;
    set({ toast: { id: ++toastId, text, tone, ...(action ? { action } : {}) }, toastRun: sticky ? null : { seq: ++runSeq, ms, from: 1, paused: false } });
    if (!sticky) { const id = toastId; toastTimer = clock.after(() => { if (get().toast?.id === id) set({ toast: null, toastRun: null }); }, ms); }
  },
  holdToast: (on) => {
    if (!get().toast || toastSticky || on === toastHeld) { toastHeld = on; return; }
    toastHeld = on;
    clock.cancel(toastTimer);
    if (on) {
      toastLeft = Math.max(0, toastDue - clock.now());
      set({ toastRun: { seq: ++runSeq, ms: toastLeft, from: toastLeft / toastTotal, paused: true } });
      return;
    }
    // let go: the rest of its time, and never less than TOAST_LINGER_MS to finish reading; the rule picks up where it stopped
    const ms = Math.max(toastLeft, TOAST_LINGER_MS), id = toastId;
    toastDue = clock.now() + ms;
    set({ toastRun: { seq: ++runSeq, ms, from: toastLeft / toastTotal, paused: false } });
    toastTimer = clock.after(() => { if (get().toast?.id === id) set({ toast: null, toastRun: null }); }, ms);
  },
  dismissToast: () => {
    if (!get().toast) return;
    clock.cancel(toastTimer); toastHeld = false;
    set({ toast: null, toastRun: null });
  },
  setFigure: (p) => { const f = { ...get().figure, ...p }; set({ figure: f }); saveFigure(f); },
  markViewReady: (v) => set({ ready: { ...get().ready, [v]: true } }),
}));

// An origin belongs to the sheet or panel it was made for: when that is no longer up, it is gone (a menu opened over a panel leaves the panel's origin as it was).
useShell.subscribe((s) => { const c = s.cameFrom; if (c && !isUp(s, c.to)) useShell.setState({ cameFrom: null }); });
