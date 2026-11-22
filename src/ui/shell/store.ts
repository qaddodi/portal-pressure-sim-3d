// The shell's own state: what is showing (free play or a talk), the view, which sheet or menu is open, the toast, and the figure's switches
// (Blood menu, Layers, the colour lens). Nothing here is per-frame: a frame never writes to it. The engine's numbers reach it only when a displayed word changes.
import { create } from 'zustand';
import { UI } from '../strings.generated.ts';
import { STORAGE_PREFIX } from '../../state/settings.ts';
import type { ViewId } from './views.ts';
import type { LensId } from '../../scene/lenses/model.ts';

import { clock, type TimerId } from '../../clock/frame.ts';
export type Sheet = 'menu' | 'settings' | 'search' | 'help' | 'history' | 'compare' | 'why' | 'guide' | 'blood' | 'layers' | 'lens' | 'speed' | 'jump' | 'readings' | null;
export type MenuTab = 'present' | 'patients';
/** The ten lenses of the 2D menu, in its order (the scene's own list also holds the two a slide uses). */
export const LENS_IDS: readonly LensId[] = UI.lenses.map((l) => l.id as LensId);
export type LabelLevel = 'key' | 'all' | 'none';

export interface Figure {
  /** Blood menu › Moving blood */
  chevrons: boolean; keyChevrons: boolean;
  /** Blood menu › Show on the figure */
  chips: boolean; collaterals: boolean; labels: boolean;
  labelLevel: LabelLevel;
  /** Layers (the lobule view) */
  zones: boolean; lymph: boolean; bile: boolean;
}
export const FIGURE_DEFAULTS: Figure = { chevrons: true, keyChevrons: false, chips: true, collaterals: true, labels: true, labelLevel: 'key', zones: false, lymph: true, bile: true };

export interface ToastAction { label: string; run(): void }
export interface Toast { id: number; text: string; tone: 'info' | 'bad'; action?: ToastAction }
export interface Transport { running: boolean; speed: number; lapse: number; time: string; day: number }

interface ShellState {
  view: ViewId;
  /** the views the scene can draw (Anatomy now; the Circuit and the lobule batches turn theirs on with `markViewReady`) */
  ready: Record<ViewId, boolean>;
  sheet: Sheet;
  /** a small dialog over everything (Reset everything?) */
  dialog: 'reset' | 'about' | 'privacy' | null;
  /** the About page's section to scroll to (References) */
  aboutSection: 'refs' | null;
  menuTab: MenuTab;
  menuQuery: string;
  helpSection: 'keys' | 'present' | null;
  toast: Toast | null;
  figure: Figure;
  transport: Transport;
  patientId: string;
  /** a number that rises on every refit ask (second tap on the active view, Fit, the 0 key): the scene's camera follows it */
  refit: number;
  /** a card or other sheet outside the shell is open (Esc closes that first) */
  set(p: Partial<ShellState>): void;
  open(sheet: Exclude<Sheet, null>): void;
  close(): void;
  toggle(sheet: Exclude<Sheet, null>): void;
  /** One line at the foot; with an `action` it stays ACTION_MS and carries a button (Send feedback's "Copy the full report"). */
  say(text: string, tone?: 'info' | 'bad', action?: ToastAction, sticky?: boolean): void;
  /** A finger or the pointer is on the note (true) or has left it (false): it stays while held, then fades TOAST_LINGER_MS after. A sticky note is never timed. */
  holdToast(on: boolean): void;
  setFigure(p: Partial<Figure>): void;
  markViewReady(v: ViewId): void;
}

const KEY = `${STORAGE_PREFIX}figure.v1`;
function loadFigure(): Figure {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || '{}');
    const b = (k: keyof Figure) => (typeof o[k] === 'boolean' ? o[k] : (FIGURE_DEFAULTS[k] as boolean));
    return { chevrons: b('chevrons'), keyChevrons: b('keyChevrons'), chips: b('chips'), collaterals: b('collaterals'), labels: b('labels'), labelLevel: ['key', 'all', 'none'].includes(o.labelLevel) ? o.labelLevel : 'key', zones: b('zones'), lymph: b('lymph'), bile: b('bile') };
  } catch { return { ...FIGURE_DEFAULTS }; }
}
const saveFigure = (f: Figure) => { try { localStorage.setItem(KEY, JSON.stringify(f)); } catch { /* kept for this visit */ } };

let toastId = 0, toastTimer: TimerId | undefined, toastSticky = false, toastHeld = false;
/** The least a note stays (also 2D's own 3.2 s). */
export const TOAST_MS = 3200;
/** A note stays about a word's reading time per word (250 ms), never under TOAST_MS or over TOAST_MAX_MS, so a long one is not gone mid-sentence. */
export const TOAST_WORD_MS = 250, TOAST_MAX_MS = 10000;
/** How long a note lingers after the finger or pointer that held it lets go. */
export const TOAST_LINGER_MS = 1500;
export const toastMs = (text: string): number => Math.min(TOAST_MAX_MS, Math.max(TOAST_MS, text.trim().split(/\s+/).filter(Boolean).length * TOAST_WORD_MS));
/** A toast with a button stays long enough to reach it. */
export const ACTION_MS = 9000;

export const useShell = create<ShellState>((set, get) => ({
  view: 'anatomic',
  ready: { circuit: true, anatomic: true, lobule: true, sinusoid: true },
  sheet: null, dialog: null, aboutSection: null, menuTab: 'present', menuQuery: '', helpSection: null, toast: null,
  figure: loadFigure(),
  transport: { running: false, speed: 1, lapse: 0, time: '0:00', day: 0 },
  patientId: 'healthy',
  refit: 0,
  set: (p) => set(p),
  open: (sheet) => set({ sheet }),
  close: () => { if (get().sheet) set({ sheet: null }); },
  toggle: (sheet) => set({ sheet: get().sheet === sheet ? null : sheet }),
  say: (text, tone = 'info', action, sticky = false) => {
    clock.cancel(toastTimer);
    set({ toast: { id: ++toastId, text, tone, ...(action ? { action } : {}) } });
    // (a sticky note, the first-run hint, stays until its owner closes it, as 2D's toast with `sticky`)
    toastSticky = sticky; toastHeld = false;   // (a new note is timed on its own, even when the pointer still rests where the last one was)
    if (!sticky && !toastHeld) toastTimer = clock.after(() => { if (get().toast?.id === toastId) set({ toast: null }); }, action ? ACTION_MS : toastMs(text));
  },
  holdToast: (on) => {
    toastHeld = on;
    if (!get().toast || toastSticky) return;
    clock.cancel(toastTimer);
    if (!on) { const id = toastId; toastTimer = clock.after(() => { if (get().toast?.id === id) set({ toast: null }); }, TOAST_LINGER_MS); }
  },
  setFigure: (p) => { const f = { ...get().figure, ...p }; set({ figure: f }); saveFigure(f); },
  markViewReady: (v) => set({ ready: { ...get().ready, [v]: true } }),
}));
