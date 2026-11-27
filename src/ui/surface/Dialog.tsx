// The dialog shell (menu unification, stage 5: reports/menu-unification.md 3.2 "Dialog shell"; owner, 27 Nov: Guide and Search become dialogs). Every dialog is drawn by this, so
// Reset, the deck dialogs, the case guard, About, References, Privacy, the Guide and Search come, stand, go and close the same way; each passes only its content and how it is cancelled.
//   where     one scrim (the layer itself); centred where surfaces float. In sheet mode (surface/mode.ts) a size-l dialog is a sheet from the foot that rests on the dock or, while
//             it is up, on the on-screen keyboard (dialog-fit.ts; Search's visualViewport fit, now every dialog's); a size-s one stays centred.
//   motion    always in the page, faded: the box fades and rises by opacity and transform over --d-small (surface/motion.ts leaveMs('dialog')), and the scrim's colour eases with it.
//             The layer never fades as a whole: the box is glass, and an ancestor with opacity would leave it unblurred while it fades (glass.css).
//   closing   Esc, a press outside, the X (CloseX) and, on a phone's sheet, a pull down all cancel, through dialog-stack.ts: no dialog listens for Esc itself.
//   focus     into the dialog in the very commit that shows it (a layout effect inside the gesture that opened it, which iOS needs to raise the keyboard for a field), Tab kept
//             inside, and back to the opener when it closes, unless something else has taken it by then. A ring is the keyboard's (shell/focus-ring.css, return-focus.ts): the
//             shell only moves focus and never draws one; a page dialog's box holds focus itself (tabindex -1, no ring) so the arrow keys scroll it.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { useSurfaceMode, surfaceModeNow } from './mode.ts';
import { leaveMs } from './motion.ts';
import { CloseX, GrabBar } from './parts.tsx';
import { keyboardFit, type CancelBy, type DialogId, type DialogSize } from './dialog-fit.ts';
import { openDialog, focusables } from './dialog-stack.ts';
import { useSheetSwipe } from '../shell/use-sheet-swipe.ts';
import { clock } from '../../clock/frame.ts';
import './dialog.css';

export interface DialogProps {
  id: DialogId;
  size: DialogSize;
  open: boolean;
  label: string;
  /** a question that must be answered (Reset, the case guard) is an alertdialog */
  role?: 'dialog' | 'alertdialog';
  onCancel(by: CancelBy): void;
  /** what takes focus as it opens (Search's field, the guard's Stay); by default a question's first control, and a page's own box */
  initialFocus?: RefObject<HTMLElement | null>;
  /** the class the content's stylesheet draws the box by (`sh-dialog`, the 2D `modal` and `pal`) */
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

const focusOf = (box: HTMLElement, size: DialogSize, initial: HTMLElement | null | undefined): HTMLElement =>
  initial ?? (size === 's' ? focusables(box)[0] : null) ?? box;

export function Dialog({ id, size, open, label, role = 'dialog', onCancel, initialFocus, className, style, children }: DialogProps) {
  const mode = useSurfaceMode();
  const layer = useRef<HTMLDivElement>(null), box = useRef<HTMLDivElement>(null), opener = useRef<HTMLElement | null>(null);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  // on the stack while open: Esc, a press outside and Tab are the shell's (dialog-stack.ts)
  useLayoutEffect(() => (open ? openDialog({ id, box: () => box.current, cancel: (by) => cancel.current(by) }) : undefined), [open, id]);
  // focus in, in the commit that shows it; back to the opener as it closes, when focus is still in the dialog (or nowhere): a surface that took it meanwhile keeps it
  useLayoutEffect(() => {
    const el = box.current;
    if (!open || !el) return;
    const was = document.activeElement as HTMLElement | null;
    opener.current = was && was !== document.body && !el.contains(was) ? was : null;
    focusOf(el, size, initialFocus?.current).focus({ preventScroll: true });
    return () => {
      const back = opener.current, now = document.activeElement;
      opener.current = null;
      if (back?.isConnected && !back.closest('[inert]') && (!now || now === document.body || el.contains(now))) back.focus({ preventScroll: true });
    };
  }, [open]);
  // a second look once the commit has settled: a menu that closed as this opened may have handed focus back to its own button
  useEffect(() => {
    const el = box.current;
    if (open && el && !el.contains(document.activeElement)) focusOf(el, size, initialFocus?.current).focus({ preventScroll: true });
  }, [open]);
  // the on-screen keyboard: the room ends at its top (--dlg-kb) and a phone's list keeps the visible height (--dlg-vh). Event-driven, from the visual viewport; nothing per frame.
  useLayoutEffect(() => {
    const el = layer.current;
    if (!open || !el) return;
    const vv = window.visualViewport;
    let last = '';
    const fit = () => {
      const { kb, vh } = keyboardFit(innerHeight, vv ?? null);
      if (`${kb} ${vh}` === last) return;
      last = `${kb} ${vh}`;
      el.style.setProperty('--dlg-kb', `${kb}px`); el.style.setProperty('--dlg-vh', `${vh}px`);
    };
    fit();
    vv?.addEventListener('resize', fit); vv?.addEventListener('scroll', fit);
    return () => { vv?.removeEventListener('resize', fit); vv?.removeEventListener('scroll', fit); };
  }, [open]);
  // a phone's sheet follows a pull down and closes past a short one
  useSheetSwipe(box, () => cancel.current('pull'), () => size === 'l' && surfaceModeNow() === 'sheet');
  return (
    <div ref={layer} className="sf-layer" data-surface={id} data-size={size} data-mode={mode} data-open={open} inert={!open}>
      <div ref={box} className={`sf-dialog${className ? ` ${className}` : ''}`} role={role} aria-modal="true" aria-label={label} tabIndex={-1} style={style}>
        {size === 'l' && <GrabBar />}
        {children}
      </div>
    </div>
  );
}

/** Whether a dialog's content is in the page: while open, and for its leave after (leaveMs('dialog')), so it never blanks before it has faded. */
export function useDialogPresence(open: boolean): boolean {
  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);
  useEffect(() => {
    if (open || !present) return;
    const t = clock.after(() => setPresent(false), leaveMs('dialog', surfaceModeNow()), 'dialog-leave');
    return () => clock.cancel(t);
  }, [open, present]);
  return open || present;
}

/** A page dialog's head and body (the 2D dialog's own markup, util.js openModal: header with the title, a line under it and the X; then .body), so About, References, Privacy
 *  and the Guide read alike. The head stays in view over a long page, and a hairline marks its edge once the page has scrolled under it. `section` is scrolled to as it opens. */
export function DialogPage({ open, title, sub, section, onClose, bodyClass, children }: {
  open: boolean; title: string; sub?: string | null; section?: string | null; onClose(): void; bodyClass?: string; children: ReactNode;
}) {
  const mark = useRef<HTMLDivElement>(null), head = useRef<HTMLElement>(null);
  useEffect(() => {
    const m = mark.current, root = m?.closest<HTMLElement>('.sf-dialog');
    if (!open || !m || !root || typeof IntersectionObserver !== 'function') return;
    const io = new IntersectionObserver(([e]) => head.current?.classList.toggle('scrolled', !e!.isIntersecting), { root, rootMargin: '2px 0px 0px 0px' });
    io.observe(m);
    return () => io.disconnect();
  }, [open]);
  useEffect(() => {
    const root = mark.current?.closest<HTMLElement>('.sf-dialog');
    if (!open || !root) return;
    const el = section ? root.querySelector<HTMLElement>(`[data-sec="${section}"]`) : null;
    if (el) el.scrollIntoView({ block: 'start' }); else root.scrollTop = 0;
  }, [open, section]);
  return (
    <>
      <div ref={mark} className="modal-top-mark" aria-hidden="true" style={{ height: 1, marginBottom: -1 }} />
      <header ref={head}>
        <div style={{ flex: 1, minWidth: 0 }}><h2>{title}</h2>{sub ? <div className="sub">{sub}</div> : null}</div>
        <CloseX onClose={onClose} />
      </header>
      <div className={`body${bodyClass ? ` ${bodyClass}` : ''}`}>{children}</div>
    </>
  );
}
