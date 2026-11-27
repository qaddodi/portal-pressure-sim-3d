// The parts every surface shell shares (menu unification: reports/menu-unification.md 3.2): one close button and one grab bar, so a menu, a panel and a dialog close and
// are pulled by the same control on every device. The X shows everywhere (owner, 27 Nov, section 6 question 2): a pull is an extra, never the only way to close.
import { Icon } from '../shell/icons.tsx';

/** The one close button. `className` keeps the class a lifted 2D stylesheet places it by (`card-close`, `um-x`) while a surface moves onto its shell. */
export function CloseX({ label = 'Close', title = 'Close (Esc)', onClose, className }: { label?: string; title?: string; onClose(): void; className?: string }) {
  return (
    <button type="button" className={`ib sf-x${className ? ` ${className}` : ''}`} aria-label={label} title={title} onClick={onClose}><Icon n="close" /></button>
  );
}

/** The one grab bar of a sheet (drawn by sheet-swipe.css; hidden where the surface floats). */
export function GrabBar() {
  return <i className="sh-grabbar" aria-hidden="true" />;
}

/** The one grab bar of a panel's sheet with its button (stage 3, Tests' onGrab for every sheet): a tap takes Half to Full and back, and Peek up to Half (sheet-stops.ts grabStep).
 *  `className` keeps the class a lifted 2D stylesheet places it by (Tests' `sheet-grab`). */
// (`bar`: draw the bar; the action card draws its own in its flow)
export function SheetGrab({ label, onGrab, className, bar = true }: { label: string; onGrab(): void; className?: string; bar?: boolean }) {
  return (
    <>
      <button type="button" className={`sf-grab${className ? ` ${className}` : ''}`} aria-label={label} onClick={onGrab} />
      {bar && <GrabBar />}
    </>
  );
}
