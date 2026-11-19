import { useRef, useState, useLayoutEffect } from 'react';

/** A number that rolls when its text changes (the old one goes up and out, the new one comes up from below; 400 ms; transform and opacity only).
 *  The first text appears without a roll. The box keeps the width of the longest text it has shown so the line never jitters. */
export function Roll({ text, className }: { text: string; className?: string }) {
  const [shown, setShown] = useState<{ cur: string; prev: string | null; n: number }>({ cur: text, prev: null, n: 0 });
  const mounted = useRef(false);
  useLayoutEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    setShown((s) => (s.cur === text ? s : { cur: text, prev: s.cur, n: s.n + 1 }));
  }, [text]);
  const latest = shown.cur === text ? shown : { ...shown, cur: text };
  return (
    <span className={`dk-roll${className ? ` ${className}` : ''}`}>
      <span className="dk-roll-sizer" aria-hidden="true">{latest.prev && latest.prev.length > latest.cur.length ? latest.prev : latest.cur}</span>
      {latest.prev !== null && <span key={`o${latest.n}`} className="dk-roll-out" aria-hidden="true" onAnimationEnd={() => setShown((s) => (s.n === latest.n ? { ...s, prev: null } : s))}>{latest.prev}</span>}
      <span key={`i${latest.n}`} className={latest.n ? 'dk-roll-in' : 'dk-roll-now'}>{latest.cur}</span>
    </span>
  );
}
