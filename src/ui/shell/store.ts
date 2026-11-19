// The shell's own state: what is showing (free play or a talk), the view, which sheet or menu is open, the toast, and the figure's switches
// (Blood menu, Layers, the colour lens). Nothing here is per-frame: a frame never writes to it. The engine's numbers reach it only when a displayed word changes.
import { create } from 'zustand';
import { UI } from '../strings.generated.ts';
import { STORAGE_PREFIX } from '../../state/settings.ts';
import type { ViewId } from './views.ts';
import type { LensId } from '../../scene/lenses/model.ts';

export type Sheet = 'menu' | 'settings' | 'search' | 'help' | 'history' | 'compare' | 'why' | 'guide' | 'blood' | 'layers' | 'lens' | 'speed' | 'jump' | null;
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
export const FIGURE_DEFAULTS: Figure = { chevrons: true, keyChevrons: false, chips: true, collaterals: true, labels: true, labelLevel: 'key', zones: false, lymph: true, bile: false };

export interface Toast { id: number; text: string; tone: 'info' | 'bad' }
export interface Transport { running: boolean; speed: number; lapse: number; time: string; day: number }

interface ShellState {
  /** free play (the figure and the bars) or a talk; the app opens in free play, as the 2D app does */
  mode: 'free' | 'deck';
  view: ViewId;
  /** the views the scene can draw (Anatomy now; the Circuit and the lobule batches turn theirs on with `markViewReady`) */
  ready: Record<ViewId, boolean>;
  sheet: Sheet;
  /** a small dialog over everything (Reset everything?) */
  dialog: 'reset' | null;
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
  say(text: string, tone?: 'info' | 'bad'): void;
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

let toastId = 0, toastTimer: ReturnType<typeof setTimeout> | undefined;
export const TOAST_MS = 3200;

export const useShell = create<ShellState>((set, get) => ({
  mode: 'free',
  view: 'anatomic',
  ready: { circuit: true, anatomic: true, lobule: true, sinusoid: true },
  sheet: null, dialog: null, menuTab: 'present', menuQuery: '', helpSection: null, toast: null,
  figure: loadFigure(),
  transport: { running: false, speed: 1, lapse: 0, time: '0:00', day: 0 },
  patientId: 'csph',
  refit: 0,
  set: (p) => set(p),
  open: (sheet) => set({ sheet }),
  close: () => { if (get().sheet) set({ sheet: null }); },
  toggle: (sheet) => set({ sheet: get().sheet === sheet ? null : sheet }),
  say: (text, tone = 'info') => {
    clearTimeout(toastTimer);
    set({ toast: { id: ++toastId, text, tone } });
    toastTimer = setTimeout(() => { if (get().toast?.id === toastId) set({ toast: null }); }, TOAST_MS);
  },
  setFigure: (p) => { const f = { ...get().figure, ...p }; set({ figure: f }); saveFigure(f); },
  markViewReady: (v) => set({ ready: { ...get().ready, [v]: true } }),
}));
