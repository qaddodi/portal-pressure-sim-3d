// A card that changes what it says never changes it in place (docs/HUMANIZED-DESIGN.md section 2: the old card out, then the new one in): when its key changes while it is up, it
// goes out first, takes the new content while out of sight, and comes back. One clock: the wait is clock.after.
import { useEffect, useRef, useState } from 'react';
import { clock, type TimerId } from '../../clock/frame.ts';
import { D_SMALL } from '../motion.ts';

/** How long a card takes to go (case.css: a card goes in --d-small, and the next waits that long to come). */
export const OUT_MS = D_SMALL;

interface Shown<T> { shown: T; key: string; on: boolean }

/** What the card shows (`shown`, the value of the last key it took) and whether it is up (`on`): `want` false takes it out, a new `key` swaps it through out. */
export function useSwap<T>(value: T, key: string, want: boolean): { shown: T; on: boolean } {
  const [state, setState] = useState<Shown<T>>({ shown: value, key, on: false });
  const cur = useRef(state);
  const timer = useRef<TimerId | null>(null);
  const put = (s: Shown<T>) => { cur.current = s; setState(s); };
  useEffect(() => {
    clock.cancel(timer.current);
    timer.current = null;
    const s = cur.current;
    if (!want) { if (s.on) put({ ...s, on: false }); return; }
    // (the same stop: the words may have moved on, the card stays; out of sight already: the new content comes in at once; up with another: out first, then in)
    if (s.key === key || !s.on) { if (!(s.on && s.key === key && s.shown === value)) put({ shown: value, key, on: true }); return; }
    put({ ...s, on: false });
    timer.current = clock.after(() => { timer.current = null; put({ shown: value, key, on: true }); }, OUT_MS, 'case-card-swap');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, key, want]);
  useEffect(() => () => { clock.cancel(timer.current); }, []);
  return { shown: state.shown, on: state.on };
}
