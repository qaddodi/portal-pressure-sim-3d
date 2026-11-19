// The shell's icons: one stroke family (24 px grid, 1.8 stroke, round caps), drawn as inline paths so nothing loads and nothing flashes in.
const P: Record<string, string> = {
  menu: 'M4 7h16M4 12h16M4 17h10',
  play: 'M8 5.5v13l11-6.5z', pause: 'M8 5v14M16 5v14', playlapse: 'M8 5.5v13l11-6.5z',
  reset: 'M4 12a8 8 0 1 0 2.6-5.9M4 4v4h4', ffwd: 'M4 6l8 6-8 6zM13 6l8 6-8 6z',
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', compare: 'M9 4v16M15 4v16M4 8h5M15 16h5',
  gear: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 4.5v5M8 14.5v5', search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4.2-4.2',
  pill: 'M8.5 15.5l7-7a3.5 3.5 0 0 1 5 5l-7 7a3.5 3.5 0 0 1-5-5zM12 12l4 4', gauge: 'M4 16a8 8 0 1 1 16 0M12 16l4-5',
  drop: 'M12 3.5s6 6.2 6 10.3a6 6 0 0 1-12 0C6 9.7 12 3.5 12 3.5z', layers: 'M12 4l9 5-9 5-9-5zM3 14l9 5 9-5',
  'chev-down': 'M6 9l6 6 6-6', 'chev-right': 'M9 6l6 6-6 6', 'chev-left': 'M15 6l-6 6 6 6', plus: 'M12 5v14M5 12h14', minus: 'M5 12h14',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5', rotate: 'M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5', close: 'M6 6l12 12M18 6L6 18', check: 'M5 12.5l4.5 4.5L19 7.5',
  info: 'M12 11v6M12 7.5v.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', book: 'M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15H7.5A2.5 2.5 0 0 0 5 20.5zM5 20.5A2.5 2.5 0 0 0 7.5 23H19', grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3', case: 'M4 8h16v11H4zM9 8V5h6v3', mail: 'M4 6h16v12H4zM4 7l8 6 8-6', help: 'M9.5 9a2.5 2.5 0 1 1 3.6 2.2c-.8.5-1.1 1-1.1 1.8M12 17v.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5', sliders: 'M5 6h8M17 6h2M5 12h2M11 12h8M5 18h10M19 18h0M15 4v4M9 10v4M17 16v4', projector: 'M4 8h16v8H4zM9 16v3M15 16v3M12 12h.01',
  chevrons: 'M7 7l5 5-5 5M13 7l5 5-5 5', tag: 'M4 12l8-8h8v8l-8 8zM15.5 8.5h.01', route: 'M5 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM19 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM7 16c6 0 4-8 10-8', liver: 'M4 11c0-3 3-5 7-5 5 0 9 2 9 6 0 4-4 6-8 6-4 0-8-3-8-7z',
  zones: 'M4 12a8 8 0 1 0 16 0 8 8 0 0 0-16 0zM8 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0z', lymph: 'M12 4v5M12 15v5M5 12h5M14 12h5', bile: 'M12 3.5s5 5.5 5 9a5 5 0 0 1-10 0c0-3.5 5-9 5-9z',
  share: 'M12 4v11M8 8l4-4 4 4M5 14v6h14v-6', download: 'M12 4v11M8 11l4 4 4-4M5 20h14', print: 'M7 9V4h10v5M7 17H4v-7h16v7h-3M7 14h10v6H7z', scenario: 'M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 20c0-4 3-6 7-6s7 2 7 6',
};

/** The 2D app's own glyphs (its icon atlas, one mask per icon); a name the atlas lacks falls back to the stroke paths above. */
export const ATLAS = new Set(['select', 'probe', 'pinch', 'clot', 'fibrosis', 'stent', 'band', 'occlude', 'balloon', 'catheter', 'doppler', 'endoscope', 'needle', 'play', 'playlapse', 'lapse', 'ffwd', 'pause', 'settle', 'ff', 'undo', 'rewind', 'redo', 'share', 'theme', 'help', 'layers', 'panel', 'clock', 'gear', 'search', 'sliders', 'gauge', 'chart', 'book', 'case', 'compare', 'explore', 'tools', 'plus', 'minus', 'rotate', 'fit', 'fullscreen', 'shrink', 'close', 'camera', 'chev-down', 'chev-right', 'chev-left', 'arrow-left', 'menu', 'more', 'info', 'reset', 'check', 'alert', 'bulb', 'scenario', 'projector', 'drop', 'pill', 'heart', 'liver', 'vessel', 'bell', 'download', 'print', 'grid', 'activity', 'chevrons', 'tag', 'zones', 'lymph', 'route', 'mail', 'lock']);
export function Icon({ n, className }: { n: string; className?: string }) {
  const cls = `sh-ic${className ? ` ${className}` : ''}`;
  if (ATLAS.has(n)) return <i className={`${cls} ic ic-${n}`} aria-hidden="true" />;
  const d = P[n] ?? P.info;
  return <svg className={cls} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

/** An icon of the 2D atlas as its markup has it, `<i class="ic ic-NAME">` (no wrapper class of ours: the 2D stylesheet sizes it in each place). */
export const I = ({ n, className = '' }: { n: string; className?: string }) => <i className={`ic ic-${n}${className ? ` ${className}` : ''}`} aria-hidden="true" />;
