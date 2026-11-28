// One finding of an audit, the same shape from every runner. Its id is made from what it is (the rule, the thing it is about and, where a thing can fail two ways, which way), never from where it
// was seen or when: not a line number, a duration, a picture name or the run's time. So the same fault has the same id in every run, and a fixing thread can say "F-3a91c2 is fixed".
// Pure.
import type { CheckId } from './grammar.ts';

export type Severity = 'high' | 'medium' | 'low' | 'info';
export const SEVERITIES: readonly Severity[] = ['high', 'medium', 'low', 'info'];
export const severityRank = (s: Severity): number => SEVERITIES.indexOf(s);

export interface Finding {
  /** F-xxxxxx: from rule, target and state */
  id: string;
  /** the rule that failed: `test-fails`, `tsc:TS2345`, `lint:long-line`, `scene:pop`, ... */
  rule: string;
  check: CheckId;
  severity: Severity;
  /** the thing it is about: a test (`tests/x.test.ts > name`), a file, a slide (`deck:n`), a vessel */
  target: string;
  /** which way the target fails when there are several (an error's text with its numbers taken out); part of the id */
  state: string;
  /** the file that owns the behaviour, when one can be named */
  owner: string;
  /** where it was seen, for a person: line, step, size. Not part of the id. */
  where: string;
  message: string;
  /** the command that shows it again */
  repro: string;
  /** the section of the zip it is in: `features`, `decks`, `code`, `scene` */
  section: string;
}

/** FNV-1a over the text, 32 bits. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
/** Numbers in a message are the run's, not the fault's ("3 of 40", "412 ms"): they are taken out before a state is hashed. */
export const plainState = (s: string): string => s.replace(/\d+(\.\d+)?/g, '#').replace(/\s+/g, ' ').trim().slice(0, 200);

export const findingId = (rule: string, target: string, state = ''): string => `F-${fnv1a(`${rule}\u0000${target}\u0000${state}`).toString(16).padStart(8, '0').slice(0, 6)}`;

export type FindingInput = Omit<Finding, 'id' | 'state'> & { state?: string };

/** The ids of findings, in the order given: two alike get `.2`, `.3` in that order. */
export function idsOf(inputs: readonly FindingInput[]): string[] {
  const seen = new Map<string, number>();
  return inputs.map((f) => {
    const base = findingId(f.rule, f.target, plainState(f.state ?? '')), n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}.${n}`;
  });
}

/**
 * Findings with their ids. Two findings with the same rule, target and state (two lines of one file with the same error) get `.2`, `.3` in the order given;
 * a rerun in the same order gets the same ids. Worst first, then by id.
 */
export function withIds(inputs: readonly FindingInput[]): Finding[] {
  const ids = idsOf(inputs);
  const out = inputs.map((f, i): Finding => ({ ...f, state: plainState(f.state ?? ''), id: ids[i]! }));
  return out.sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
