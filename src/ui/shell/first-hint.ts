// The first-run hint, as 2D's main.js showFirstHint has it: once per device, one note at the foot ("Click a vessel or the liver to change it.", "Tap" where the pointer is a finger),
// sticky until the first vessel, organ or lobule part is picked or the person closes it; never over a talk or a phone sheet (it comes again on a later visit then, as 2D's does), never under
// automation (the browser checks start from a fresh browser every time). The shell starts it once the figure is up; its words are 2D's.
import { STORAGE_PREFIX } from '../../state/settings.ts';
import { useSelection } from '../action/selection.ts';
import { useShell } from './store.ts';

export const HINT_KEY = `${STORAGE_PREFIX}hint`;
/** 2D's wording: Click where a mouse points, Tap where a finger does. */
export const hintText = (fine: boolean): string => `${fine ? 'Click' : 'Tap'} a vessel or the liver to change it.`;

interface Env { seen(): boolean; mark(): void; fine(): boolean; webdriver(): boolean; phone(): boolean }
const realEnv = (): Env => ({
  seen: () => { try { return !!localStorage.getItem(HINT_KEY); } catch { return true; } },   // (storage unavailable: no hint)
  mark: () => { try { localStorage.setItem(HINT_KEY, '1'); } catch { /* kept for this visit */ } },
  fine: () => typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches,
  webdriver: () => typeof navigator !== 'undefined' && !!navigator.webdriver,
  phone: () => typeof document !== 'undefined' && document.querySelector('.sh-root')?.getAttribute('data-device') === 'phone',
});

/** Start the hint (after `delayMs`, 2D's 600). Returns the remover. */
export function startFirstHint(env: Env = realEnv(), delayMs = 600): () => void {
  if (env.webdriver() || env.seen()) return () => {};
  let off: (() => void) | null = null, timer: ReturnType<typeof setTimeout> | undefined;
  const show = () => {
    const sh = useShell.getState();
    if (useSelection.getState().sel || sh.mode !== 'free' || (env.phone() && sh.sheet)) return;
    const text = hintText(env.fine());
    sh.say(text, 'info', undefined, true);
    const mine = () => useShell.getState().toast?.text === text;
    const close = (read: boolean) => {
      off?.(); off = null;
      if (mine()) useShell.setState({ toast: null });
      if (read) env.mark();
    };
    const offSel = useSelection.subscribe((s) => { if (s.sel) close(true); });
    // a talk or a sheet over the figure takes it away without counting it read: it comes again on a later visit
    const offShell = useShell.subscribe((s) => { if (s.mode !== 'free' || (env.phone() && s.sheet)) close(false); else if (!mine()) close(true); });
    off = () => { offSel(); offShell(); };
  };
  timer = setTimeout(show, delayMs);
  return () => { clearTimeout(timer); off?.(); off = null; };
}
