// The icons the action cards and Treat use that the shell's set has not: one stroke family (24 px grid, 1.8 stroke, round caps), inline paths so nothing loads and nothing
// flashes in. A verb names its icon as the 2D app does ('pinch', 'clot', 'stent'…); an icon with no drawing here falls back to a dot, and a test names it.
const P: Record<string, string> = {
  pinch: 'M4 8c5 0 4 3 8 3s3-3 8-3M4 16c5 0 4-3 8-3s3 3 8 3',
  clot: 'M5 12c0-3 3-5 6-4 2-2 6-1 7 2 2 1 2 5-1 6-2 2-6 2-8 0-3 0-4-2-4-4z',
  stent: 'M4 8h16M4 16h16M7 8l3 8M11 8l3 8M15 8l3 8M10 8L7 16M14 8l-3 8M18 8l-3 8',
  occlude: 'M12 4v16M5 12h14M7 7l10 10',
  band: 'M12 6a6 3 0 1 0 0 .01M6 6v6a6 3 0 0 0 12 0V6M6 12v4a6 3 0 0 0 12 0v-4',
  balloon: 'M12 3c4 0 6 3 6 6.5S15 15 12 15 6 13 6 9.5 8 3 12 3zM12 15v6M10 21h4',
  needle: 'M4 20l10-10M14 10l3-3 3 3-3 3M12 12l-2 2',
  doppler: 'M4 12h3l2-6 3 12 2-8 2 4h4',
  drop: 'M12 3.5s6 6.2 6 10.3a6 6 0 0 1-12 0C6 9.7 12 3.5 12 3.5z',
  catheter: 'M20 4a4 4 0 0 0-4 4v8a4 4 0 0 1-4 4H4M17 7l3-3',
  endoscope: 'M5 20c0-5 3-8 8-8h2a5 5 0 0 0 5-5V4M17 4h3M5 20h.01',
  explore: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4.2-4.2M8.5 11h5M11 8.5v5',
  vessel: 'M4 9c4 0 4 6 8 6s4-6 8-6M4 15c4 0 4 0 8 0s4 0 8 0',
  close: 'M6 6l12 12M18 6L6 18', reset: 'M4 12a8 8 0 1 0 2.6-5.9M4 4v4h4', check: 'M5 12.5l4.5 4.5L19 7.5',
  info: 'M12 11v6M12 7.5v.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'chev-right': 'M9 6l6 6-6 6', 'chev-left': 'M15 6l-6 6 6 6',
  fibroscan: 'M5 5h14v6H5zM9 11v5a3 3 0 0 0 6 0v-5', lobule: 'M12 3l7 4v7l-7 4-7-4V7zM12 9a3 3 0 1 0 0 .01',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.500-7 10-7 10z', spleen: 'M6 18c-1-8 2-13 8-13 3 0 5 2 4 5-1 5-5 9-12 8z',
  zones: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
  probe: 'M4 20l7-7M11 13l-2-2 6-6a2 2 0 0 1 3 0l1 1a2 2 0 0 1 0 3l-6 6z',
  fibrosis: 'M4 7c3 3 5-3 8 0s5-3 8 0M4 12c3 3 5-3 8 0s5-3 8 0M4 17c3 3 5-3 8 0s5-3 8 0',
  clock: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2',
  liver: 'M4 11c0-3 3-5 7-5 5 0 9 2 9 6 0 4-4 6-8 6-4 0-8-3-8-7z', gauge: 'M4 16a8 8 0 1 1 16 0M12 16l4-5',
};
export const hasIcon = (n: string): boolean => n in P;
export function OrderIcon({ n, className }: { n: string; className?: string }) {
  const d = P[n] ?? 'M12 12h.01';
  return <svg className={className} viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}
