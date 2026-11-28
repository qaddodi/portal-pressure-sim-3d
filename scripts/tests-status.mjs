// The full test suite's last result (W6 of the 25 Nov review). scripts/tests-daily.mjs writes tests-status.json at the repo root and prints testsNote() in its log. Nothing stamps it on the site or the
// preview pill any more (27 Nov, Mohammad: beta testers see the pill). Pure parts only, so tests/tests-status.test.ts can pin them.

/** The counts of a node:test TAP run ("# tests 845", "# fail 14", "# cancelled 0"): a cancelled test did not pass either, so it counts as failing. Null when the run printed no summary (it was killed). */
export function parseTapSummary(text) {
  const n = (k) => { const m = new RegExp(`^# ${k} (\\d+)\\s*$`, 'm').exec(text); return m ? Number(m[1]) : null; };
  const total = n('tests'), fail = n('fail');
  if (total === null || fail === null) return null;
  return { total, failing: fail + (n('cancelled') ?? 0) };
}

/** How many named failures tests-status.json keeps (a run where everything fails would otherwise write a megabyte); the log line says how many more there were. */
export const MAX_FAILURES = 200;

/**
 * Reads a node:test TAP stream a chunk at a time and keeps ONLY the failing tests, so a 40-minute run's output is never held in memory (C1, 27 Nov review: the old run kept all of it and printed a count).
 * A failure is a `not ok` line (a skipped or TODO test is not one) with the `location:` and `failureType:` of the block under it.
 * A parent that failed only because a child did ('subtestsFailed') is dropped and the child carries its name ("parent > child"); a file that crashed is named by its file.
 * @param root  the repo's absolute path with a trailing slash, taken off a location so it reads `tests/x.test.ts:12`
 */
export function createTapReader(root = '') {
  const entries = []; let tail = '', cur = null; const totals = {};
  const close = () => { cur = null; };
  const line = (raw) => {
    const head = /^(\s*)(not ok|ok) \d+ - (.*)$/.exec(raw);
    if (head) {
      close();
      if (head[2] === 'not ok' && !/ # (SKIP|TODO)\b/i.test(head[3])) { cur = { indent: head[1].length, name: head[3].trim(), file: '', line: 0, kind: '' }; entries.push(cur); }
      return;
    }
    if (/^\s*# Subtest:/.test(raw)) { close(); return; }
    const sum = /^# (tests|fail|cancelled) (\d+)\s*$/.exec(raw);
    if (sum) { totals[sum[1]] = Number(sum[2]); return; }
    if (!cur) return;
    const loc = /^\s+location: '(.*)'\s*$/.exec(raw);
    if (loc && !cur.file) {
      const m = /^(?:file:\/\/)?(.*?)(?::(\d+):\d+)?$/.exec(loc[1]);
      cur.file = m[1].startsWith(root) && root ? m[1].slice(root.length) : m[1]; cur.line = Number(m[2] ?? 0);
      return;
    }
    const kind = /^\s+failureType: '(.*)'\s*$/.exec(raw);
    if (kind && !cur.kind) cur.kind = kind[1];
  };
  return {
    write(chunk) { const parts = (tail + chunk).split('\n'); tail = parts.pop(); for (const l of parts) line(l); },
    end() {
      if (tail) line(tail); tail = '';
      // a parent line comes AFTER its children and at a smaller indent: it takes the children inside its indent as its own and, when it only failed because of them, steps aside
      const kept = [];
      for (const e of entries) {
        const children = [];
        while (kept.length && kept[kept.length - 1].indent > e.indent) children.unshift(kept.pop());
        for (const c of children) { c.name = `${e.name} > ${c.name}`; c.indent = e.indent; kept.push(c); }
        if (!(e.kind === 'subtestsFailed' || (children.length && !e.kind))) kept.push(e);
      }
      const failures = kept.map((e) => ({ file: e.file, line: e.line, name: e.name, kind: e.kind || 'failed' }));
      const failing = 'tests' in totals && 'fail' in totals ? { total: totals.tests, failing: totals.fail + (totals.cancelled ?? 0) } : null;
      return { summary: failing, failures };
    },
  };
}

/** The same over a whole text (tests use this; the daily run feeds the reader as the output arrives). */
export function parseTapFailures(text, root = '') { const r = createTapReader(root); r.write(text); return r.end(); }

/** One log line per failing test, `FAIL tests/x.test.ts:12  parent > child`, at most `limit`, with a closing line for the rest. */
export function failureLines(failures, limit = MAX_FAILURES) {
  const shown = failures.slice(0, limit).map((f) => `FAIL ${f.file || '(no file)'}${f.line ? `:${f.line}` : ''}  ${f.name}${f.kind && f.kind !== 'testCodeFailure' && f.kind !== 'failed' ? `  [${f.kind}]` : ''}`);
  if (failures.length > limit) shown.push(`... and ${failures.length - limit} more`);
  return shown;
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
