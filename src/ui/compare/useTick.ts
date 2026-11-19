// A re-render now and then while a panel is open (a timer, never a frame): the Differences table follows the live model at the pace its numbers can change.
import { useEffect, useState } from 'react';
export function useClock(on: boolean, ms: number): number {
  const [n, set] = useState(0);
  useEffect(() => { if (!on) return; const t = setInterval(() => set((x) => x + 1), ms); return () => clearInterval(t); }, [on, ms]);
  return n;
}
