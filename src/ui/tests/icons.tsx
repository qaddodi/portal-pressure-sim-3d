// The Tests tabs' icons, in the shell's stroke family (24 px grid, 1.8 stroke, round caps), drawn inline so nothing loads. The 2D tabs use these meanings: activity, chart,
// catheter, doppler, endoscope, needle, gauge, grid, book.
const P: Record<string, string> = {
  activity: 'M3 12h4l2.5-6 4 12 2.5-6H21',
  chart: 'M4 19V5M4 19h16M7.5 15l3.5-4 3 2.5L19 8',
  catheter: 'M4 5c5 0 5 7 8 7s3 7 8 7M18.5 17.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0z',
  doppler: 'M3 12c2.5 0 2.5-6 5-6s2.5 12 5 12 2.5-6 5-6M19 12h2',
  endoscope: 'M5 20c0-6 4-6 6-9s2-6 6-7M17 4l3 3M14.5 6.5l3 3',
  needle: 'M5 19l9-9M14 10l3-3 3 3-3 3zM4 20l1.5-3.5',
  gauge: 'M4 16a8 8 0 1 1 16 0M12 16l4-5',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  book: 'M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15H7.5A2.5 2.5 0 0 0 5 20.5zM5 20.5A2.5 2.5 0 0 0 7.5 18H19',
  close: 'M6 6l12 12M18 6L6 18',
};
/** The icon of each instrument tab (dock.js INFO[id][0]). */
export const TAB_ICON: Record<string, string> = { profile: 'activity', scope: 'chart', hvpg: 'catheter', doppler: 'doppler', endoscopy: 'endoscope', abdomen: 'needle', fibroscan: 'gauge', readouts: 'grid', trials: 'book' };
export function TIcon({ n }: { n: string }) {
  return <svg className="t-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={P[n] ?? P.chart} /></svg>;
}
