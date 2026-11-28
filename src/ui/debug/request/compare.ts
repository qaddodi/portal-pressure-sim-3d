// What changed since the last run of the same request: which findings are new, which are still there and which are fixed.
// A finding is the same finding when its id is the same (finding.ts), so a fixing
// thread can say "F-3a91c2 is fixed" and the next run says it for them.
// A finding counts as FIXED only when the same request was run again and its check ran this time: a finding of a check that did not run (or of a request that differs) is `unverified`, never fixed.
// Pure: the earlier run is read from its findings.json and manifest.json (`earlierRun`), the node runner finds the zip.
import type { CheckId } from './grammar.ts';
import type { Finding } from './finding.ts';

export interface EarlierFinding { id: string; rule: string; check: CheckId; severity: string; target: string; message: string }
export interface EarlierRun {
  /** the zip it came from, as the runner names it (a file name or path) */
  zip: string;
  request: string;
  build: string;
  startedAt: string;
  /** the checks that ran in it */
  ran: CheckId[];
  findings: EarlierFinding[];
}
export interface Comparison {
  against: { zip: string; request: string; build: string; startedAt: string; findings: number };
  sameRequest: boolean;
  /** in this run, not in the earlier one */
  new: string[];
  /** in both */
  still: string[];
  /** in the earlier one, gone now, and the same request ran its check again */
  fixed: EarlierFinding[];
  /** in the earlier one, gone now, but this run cannot say it is fixed: another request, or its check did not run */
  unverified: { finding: EarlierFinding; why: string }[];
}

export function compareRuns(earlier: EarlierRun, now: readonly Finding[], ran: readonly CheckId[], request: string): Comparison {
  const had = new Set(earlier.findings.map((f) => f.id)), has = new Set(now.map((f) => f.id)), same = earlier.request === request;
  const gone = earlier.findings.filter((f) => !has.has(f.id));
  const fixed: EarlierFinding[] = [], unverified: Comparison['unverified'] = [];
  for (const f of gone) {
    if (!same) unverified.push({ finding: f, why: `the earlier run was of another request (${earlier.request})` });
    else if (!ran.includes(f.check)) unverified.push({ finding: f, why: `${f.check} did not run this time` });
    else fixed.push(f);
  }
  return {
    against: { zip: earlier.zip, request: earlier.request, build: earlier.build, startedAt: earlier.startedAt, findings: earlier.findings.length },
    sameRequest: same,
    new: now.filter((f) => !had.has(f.id)).map((f) => f.id),
    still: now.filter((f) => had.has(f.id)).map((f) => f.id),
    fixed, unverified,
  };
}

/** An earlier run from the text of its findings.json and manifest.json; null when either is not a run of this format. */
export function earlierRun(zip: string, findingsJson: string, manifestJson: string): EarlierRun | null {
  try {
    const f = JSON.parse(findingsJson) as { schema?: number; findings?: EarlierFinding[] }, m = JSON.parse(manifestJson) as {
      schema?: number; request?: string; build?: { commit?: string }; startedAt?: string; checks?: { id: CheckId; ran: boolean }[];
    };
    if (f.schema !== 1 || m.schema !== 1 || !Array.isArray(f.findings) || typeof m.request !== 'string' || !Array.isArray(m.checks)) return null;
    return {
      zip, request: m.request, build: m.build?.commit ?? 'unknown', startedAt: m.startedAt ?? '', ran: m.checks.filter((c) => c.ran).map((c) => c.id),
      findings: f.findings.map((x) => ({ id: x.id, rule: x.rule, check: x.check, severity: x.severity, target: x.target, message: x.message })),
    };
  } catch { return null; }
}

/** The newest earlier run of the same request that started before `before`, or null: a run is only compared by itself with a run of its own request (`--against` names any other on purpose). */
export function pickEarlier(runs: readonly EarlierRun[], request: string, before: string): EarlierRun | null {
  const older = runs.filter((r) => r.startedAt < before).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  return older.find((r) => r.request === request) ?? null;
}
