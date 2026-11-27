// The one presence of a surface that is in the page only while it is shown (menu unification, stage 4: reports/menu-unification.md 3.2 "one motion set").
// Why mount-on-open for the menus, not "always in the page and faded": every menu's entrance is the 2D stylesheet's own keyframes (`.menu` slide-from-edge, `.umenu`
// slide-from-edge, a sheet's mn-sheet-in), which play when the element is put in the page; and their content starts on mount (From readings builds its 2D form when its
// body mounts, the main menu wires its tab swipe and keyboard on it). A menu kept in the page would need those 2D entrances rewritten as transitions and every content
// hook re-keyed on "open". So every menu is mounted on open and kept for its leave through this one hook, with the leave time of its kind and mode (surface/motion.ts).
import { useEffect, useState } from 'react';
import { clock } from '../../clock/frame.ts';

/** Mounted while shown; `leaving` for the length of the exit (`ms`, from surface/motion.ts leaveMs, or a motion.ts token for a part inside a surface). */
export function usePresence(open: boolean, ms: number): { shown: boolean; leaving: boolean } {
  const [shown, setShown] = useState(open);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (open) { setShown(true); setLeaving(false); return; }
    if (!shown) return;
    setLeaving(true);
    const t = clock.after(() => { setShown(false); setLeaving(false); }, ms, 'presence');
    return () => clock.cancel(t);
  }, [open, shown, ms]);
  return { shown: shown || open, leaving: leaving && !open };
}
