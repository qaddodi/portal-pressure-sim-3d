// The words Compare says, from the 2D app (src/ui/compare.js, timeline.js, main.js renderBanner); tests/compare-words.test.ts finds each in the 2D source when PPS_2D_REPO points at a checkout.
export const CMP = {
  then: 'Then', now: 'Now', change: 'Change',
  pinned: 'Moment pinned. Change something, then switch between Then and Now.',   // 2D timeline.js togglePin
  stopped: 'Stopped comparing.',
  stop: 'Stop comparing', from: 'Compare from here', tableBtn: 'Differences', tableTitle: 'Every value, then and now, in a table',
  nowLive: 'Now · live', live: 'The live model',
  hint: 'Switch the figure between then, now and the change in the figure header. The pressure profile overlays then as a dotted line.',
  noChanges: 'No changes from the scenario',
  metric: 'Metric',
} as const;
export const comparing = (when: string) => `Comparing with ${when}`;
export const comparingAria = (when: string) => `Comparing with ${when}: show`;
export const thenTitle = (when: string) => `The model at ${when}`;
export const changeTitle = (when: string) => `Change from ${when} to now`;
export const showing = (when: string) => `Showing ${when}`;
export const thenKicker = (when: string) => `Then · ${when}`;
export const pinnedMoment = (label: string) => `Moment pinned: ${label}.`;   // 2D timeline.js (History's "Compare with now")
