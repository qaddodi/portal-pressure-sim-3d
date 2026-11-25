// The full test suite's last result (W6 of the 25 Nov review: "tests: 14 failing" on the preview pill beside the typecheck and the lint).
// scripts/tests-daily.mjs writes tests-status.json at the repo root; scripts/build.mjs reads it and stamps testsNote() on the pill and in build-info.txt. Pure parts only, so tests/tests-status.test.ts can pin them.

/** The counts of a node:test TAP run ("# tests 845", "# fail 14", "# cancelled 0"): a cancelled test did not pass either, so it counts as failing. Null when the run printed no summary (it was killed). */
export function parseTapSummary(text) {
  const n = (k) => { const m = new RegExp(`^# ${k} (\\d+)\\s*$`, 'm').exec(text); return m ? Number(m[1]) : null; };
  const total = n('tests'), fail = n('fail');
  if (total === null || fail === null) return null;
  return { total, failing: fail + (n('cancelled') ?? 0) };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** The pill's words for a status ({ failing, date } as tests-status.json holds it): "tests: 14 failing", with the day it was run once it is older than 36 hours. Empty for no status (the pill then says nothing about tests, rather than something untrue). */
export function testsNote(status, now = Date.now()) {
  if (!status || !Number.isInteger(status.failing) || status.failing < 0) return '';
  const when = Date.parse(status.date);
  const old = Number.isFinite(when) && now - when > 36 * 3600 * 1000;
  const d = new Date(when);
  return `tests: ${status.failing} failing${old ? ` (${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]})` : ''}`;
}
