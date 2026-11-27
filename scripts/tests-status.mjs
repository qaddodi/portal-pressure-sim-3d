// The full test suite's last result (W6 of the 25 Nov review). scripts/tests-daily.mjs writes tests-status.json at the repo root and prints testsNote() in its log. Nothing stamps it on the site or the
// preview pill any more (27 Nov, Mohammad: beta testers see the pill). Pure parts only, so tests/tests-status.test.ts can pin them.

/** The counts of a node:test TAP run ("# tests 845", "# fail 14", "# cancelled 0"): a cancelled test did not pass either, so it counts as failing. Null when the run printed no summary (it was killed). */
export function parseTapSummary(text) {
  const n = (k) => { const m = new RegExp(`^# ${k} (\\d+)\\s*$`, 'm').exec(text); return m ? Number(m[1]) : null; };
  const total = n('tests'), fail = n('fail');
  if (total === null || fail === null) return null;
  return { total, failing: fail + (n('cancelled') ?? 0) };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/**
 * The log line for a status ({ failing, date, commit } as tests-status.json holds it): "tests: 14 failing (at 0d79f780)".
 * The full run is made once a day, so a count is the result at the commit it ran on, not at the build the pill is on: the commit is always named (25 Nov, "tests: 16 failing" stayed on the pill for hours
 * after the failures were fixed), and the day is added once the run is older than 36 hours. Empty for no status (it then says nothing about tests, rather than something untrue).
 */
export function testsNote(status, now = Date.now()) {
  if (!status || !Number.isInteger(status.failing) || status.failing < 0) return '';
  const when = Date.parse(status.date);
  const old = Number.isFinite(when) && now - when > 36 * 3600 * 1000;
  const d = new Date(when);
  const commit = /^[0-9a-f]{7,40}$/.test(String(status.commit ?? '')) ? String(status.commit) : '';
  const day = old ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` : '';
  const at = commit && day ? `at ${commit} on ${day}` : commit ? `at ${commit}` : day;
  return `tests: ${status.failing} failing${at ? ` (${at})` : ''}`;
}
