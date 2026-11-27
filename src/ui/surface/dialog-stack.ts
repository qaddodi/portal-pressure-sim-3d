// The open dialogs, top last, and the one place that answers Esc, a press outside and Tab for them (menu unification, stage 5: reports/menu-unification.md 3.2 "Dialog shell").
// Before 27 Nov the deck dialogs and the case guard each caught Esc with a listener of their own, Search caught it in its field, the Reset dialog went through useKeys, and About and
// the Guide each closed on their own backdrop or outside press. Now a dialog says only how it is cancelled; the shell does the rest:
//   Esc      cancels the top dialog, and nothing else hears that key (a talk does not end, a toast stays): one Esc closes one thing, the dialog first (keys/escape.ts).
//   a press  outside the top dialog (its scrim, or the dock below a phone's sheet) cancels it; the press is the cancel, so the scrim needs no handler of its own.
//   Tab      walks the top dialog's controls and wraps (dialog-fit.ts trapStep).
// The listeners are on the window, in the capture phase, only while a dialog is open.
import { FOCUSABLE, trapStep, type CancelBy, type DialogId } from './dialog-fit.ts';

export interface OpenDialog {
  id: DialogId;
  /** the dialog's own box (presses inside it are its own) */
  box(): HTMLElement | null;
  cancel(by: CancelBy): void;
}

const stack: OpenDialog[] = [];

/** Whether a dialog is open (Esc's first step, keys/escape.ts). */
export const dialogOpen = (): boolean => stack.length > 0;
/** The dialog on top, or null. */
export const topDialog = (): OpenDialog | null => stack[stack.length - 1] ?? null;
/** The open dialogs' ids, bottom first. */
export const openDialogIds = (): DialogId[] => stack.map((d) => d.id);

/** Cancels the top dialog, as its Esc would; false when none is open. */
export function cancelTopDialog(by: CancelBy): boolean {
  const top = topDialog();
  if (!top) return false;
  top.cancel(by);
  return true;
}

type Ev = { key?: string; shiftKey?: boolean; isComposing?: boolean; target?: unknown; preventDefault(): void; stopImmediatePropagation(): void };

/** Esc and Tab for the top dialog; true when the key was the dialog's. Exported for node tests. */
export function dialogKey(e: Ev, doc: { activeElement: Element | null } | null = typeof document === 'undefined' ? null : document): boolean {
  const top = topDialog();
  if (!top || e.isComposing) return false;
  if (e.key === 'Escape') {
    e.preventDefault(); e.stopImmediatePropagation();
    top.cancel('esc');
    return true;
  }
  if (e.key !== 'Tab') return false;
  const box = top.box();
  if (!box) return false;
  const list = focusables(box);
  const at = list.indexOf(doc?.activeElement as HTMLElement);
  const step = trapStep(list.length, at, !!e.shiftKey);
  if (step === null) return false;
  e.preventDefault();
  (step === 'box' ? box : list[step]!).focus({ preventScroll: true });
  return true;
}

/** A press outside the top dialog cancels it; true when it did. Exported for node tests. */
export function dialogPress(target: unknown): boolean {
  const top = topDialog(), box = top?.box();
  if (!top || !box || box.contains(target as Node)) return false;
  top.cancel('press');
  return true;
}

/** The controls Tab walks in a dialog's box, in order. */
export const focusables = (box: HTMLElement): HTMLElement[] => [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(shown);

/** A control Tab can reach: not in a hidden or inert part of the dialog, and drawn (a palette's close button is display: none where the palette floats). */
function shown(el: HTMLElement): boolean {
  if (el.closest('[hidden], [inert]')) return false;
  return typeof el.checkVisibility === 'function' ? el.checkVisibility() : true;
}

const onKey = (e: KeyboardEvent) => { dialogKey(e); };
const onPress = (e: PointerEvent) => { dialogPress(e.target); };
let listening = false;
function listen(on: boolean): void {
  if (typeof window === 'undefined' || on === listening) return;
  listening = on;
  if (on) { window.addEventListener('keydown', onKey, true); window.addEventListener('pointerdown', onPress, true); }
  else { window.removeEventListener('keydown', onKey, true); window.removeEventListener('pointerdown', onPress, true); }
}

/** A dialog came up: it is the top one until it goes (or one opens over it). Returns its remover. */
export function openDialog(d: OpenDialog): () => void {
  stack.push(d);
  listen(true);
  return () => {
    const i = stack.indexOf(d);
    if (i >= 0) stack.splice(i, 1);
    if (!stack.length) listen(false);
  };
}
