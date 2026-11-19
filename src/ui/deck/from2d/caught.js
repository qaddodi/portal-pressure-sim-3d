// The 2D app's counter of caught errors (src/ui/caught.js), as a small local file: every error the copied presenter files catch and go on from is named by its tag
// (its file and place) and counted; under ?perf the first of each kind is written to the console. Nothing is shown to the person.
const log = new Map();
export function caught(tag, e) {
  let r = log.get(tag);
  if (!r) { r = { n: 0, last: '' }; log.set(tag, r); if (typeof location !== 'undefined' && /[?&]perf\b/.test(location.search)) console.warn(`caught (${tag}):`, e); }
  r.n++; r.last = e?.message ?? String(e);
}
export const caughtNow = () => Object.fromEntries([...log].map(([k, v]) => [k, { ...v }]));
