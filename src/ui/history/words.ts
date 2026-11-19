// The words History says, from the 2D app (src/ui/timeline.js markerRows, historyRows); tests/compare-words.test.ts finds each in the 2D source when PPS_2D_REPO points at a checkout.
export const HIST = {
  title: 'History', start: 'Start', goBack: 'Go back here', backHere: 'Back to this moment', compare: 'Compare with now',
  nothing: 'Nothing has happened yet.', nothingHint: ' Change something on the figure, or jump ahead in time.',
  nogo: 'Can’t go back here: the model did not save this moment.',
  patient: (label: string) => `Patient: ${label}`,
} as const;
