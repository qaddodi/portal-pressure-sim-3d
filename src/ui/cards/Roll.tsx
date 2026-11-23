import { useRef, useState, useLayoutEffect } from 'react';

/** A number that rolls when its text changes (the old one goes up and out, the new one comes up from below; 400 ms; transform and opacity only).
 *  The first text appears without a roll. The box keeps the width of `reserve` (a reading's widest form), else of the longest text it has shown, so the line never jitters. */
export function Roll({ text, className, still = false, reserve, after }: { text: string; className?: string; still?: boolean; /** the text the box is as wide as (roll-reserve.ts): a reading's width is the same for every value it can take, so a tick never re-wraps its line */ reserve?: string; /** the stop that follows the reading in the line (, . ; : or a closing bracket): set right after the digits INSIDE the box, so the box's spare width (the reserve is wider than a short value) falls after the stop, never between the number and its stop, and the stop can never wrap away from it */ after?: string }) {
  const [shown, setShown] = useState<{ cur: string; prev: string | null; n: number }>({ cur: text, prev: null, n: 0 });
  const mounted = useRef(false);
  useLayoutEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    // (`still`: a number that follows a running clock, a time-lapse's days, changes in place: a roll on every poll would never finish before the next)
    if (still) { setShown((s) => (s.cur === text && s.prev === null ? s : { cur: text, prev: null, n: s.n })); return; }
    setShown((s) => (s.cur === text ? s : { cur: text, prev: s.cur, n: s.n + 1 }));
  }, [text, still]);
  const latest = shown.cur === text ? shown : { ...shown, cur: text };
  return (
    <span className={`dk-roll${className ? ` ${className}` : ''}`}>
      <span className="dk-roll-sizer" aria-hidden="true">{reserve ?? (latest.prev && latest.prev.length > latest.cur.length ? latest.prev : latest.cur)}{after}</span>
      {latest.prev !== null && <span key={`o${latest.n}`} className="dk-roll-out" aria-hidden="true" onAnimationEnd={() => setShown((s) => (s.n === latest.n ? { ...s, prev: null } : s))}>{latest.prev}{after && <span className="dk-roll-stop">{after}</span>}</span>}
      <span key={`i${latest.n}`} className={latest.n ? 'dk-roll-in' : 'dk-roll-now'}>{latest.cur}{after && <span className="dk-roll-stop">{after}</span>}</span>
    </span>
  );
}
