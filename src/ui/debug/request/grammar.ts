// The audit request: ONE line that every runner reads the same way (node, layout, gpu). Pure, no DOM and no node: the node runner (scripts/audit.mjs), ?stress and the capture all import this file.
//
//   <what> [checks=<a,b,...>] [runner=<node|layout|gpu>]
//
//   what   = part { "+" part }       app | deck:<id> | slide:<deck>:<n> | case:<id> | lens:<id> | look:<id> | layout:<size> | feature:<name> | random:<n>@<seed>[/deck]
//   checks = layout motion numbers junctions perf a11y pictures types lint        (left out: every check the runner can do)
//   runner = node (no browser, no approval) | layout (npm run layout-check) | gpu (the person's own device)
//
// `feature:junctions+layout:iphone`, `deck:tips-complete+look:dark`, `random:12@4471`, `random:12@4471/deck` (spread over as many talks as it can), `app checks=numbers,perf`.
// A request is never guessed at: a part this file does not know is an error that names it, and `parseRequest` says what the line could have been.

export const CHECKS = ['layout', 'motion', 'numbers', 'junctions', 'perf', 'a11y', 'pictures', 'types', 'lint'] as const;
export type CheckId = typeof CHECKS[number];
export const RUNNERS = ['node', 'layout', 'gpu'] as const;
export type RunnerId = typeof RUNNERS[number];

/** What each runner can judge. A check the runner cannot do is never run and never reported as passed: the README says it was not judged (resolve.ts `skipped`). */
export const RUNNER_CHECKS: Readonly<Record<RunnerId, readonly CheckId[]>> = Object.freeze({
  node: ['layout', 'motion', 'numbers', 'junctions', 'perf', 'a11y', 'types', 'lint'],
  layout: ['layout', 'a11y'],
  gpu: ['layout', 'motion', 'numbers', 'junctions', 'perf', 'a11y', 'pictures'],
});
/** What a runner is, in a line (the README and the picker). */
export const RUNNER_WORDS: Readonly<Record<RunnerId, string>> = Object.freeze({
  node: 'node: no browser, no GPU, no pictures; runs the repo\'s own node tests, the scene audit, the typecheck and the lint (npm run audit)',
  layout: 'layout: the no-GPU headless run of the whole page (npm run layout-check); one approved run each time',
  gpu: 'gpu: the page on the person\'s own device with its real GPU (?audit, ?stress); pictures and motion',
});

export type Part =
  | { kind: 'app' }
  | { kind: 'deck'; id: string }
  | { kind: 'slide'; deck: string; n: number }
  | { kind: 'case'; id: string }
  | { kind: 'lens'; id: string }
  | { kind: 'look'; id: string }
  | { kind: 'layout'; size: string }
  | { kind: 'feature'; id: string }
  | { kind: 'random'; n: number; seed: number; spread: boolean };

export interface Request { what: Part[]; checks: CheckId[] | null; runner: RunnerId }
export type Parsed = { ok: true; request: Request } | { ok: false; error: string };

const ID = /^[a-z0-9][a-z0-9-]*$/;
const KINDS = 'app, deck:<id>, slide:<deck>:<n>, case:<id>, lens:<id>, look:<id>, layout:<size>, feature:<name>, random:<n>@<seed>';

/** One part (`deck:tips-complete`). */
export function parsePart(s: string): { ok: true; part: Part } | { ok: false; error: string } {
  const bad = (why: string) => ({ ok: false as const, error: `"${s}": ${why}` });
  if (s === 'app') return { ok: true, part: { kind: 'app' } };
  const i = s.indexOf(':');
  if (i < 1) return bad(`not a part of a request (the parts are ${KINDS})`);
  const k = s.slice(0, i), v = s.slice(i + 1);
  if (k === 'random') {
    const m = /^(\d+)@(\d+)(\/deck)?$/.exec(v);
    if (!m) return bad('a random part is random:<n>@<seed>, with /deck after it to take from as many talks as it can (random:12@4471/deck)');
    const n = Number(m[1]), seed = Number(m[2]);
    if (n < 1 || n > 999) return bad('the count is 1 to 999');
    if (!Number.isSafeInteger(seed) || seed > 0xffffffff) return bad('the seed is a whole number up to 4294967295');
    return { ok: true, part: { kind: 'random', n, seed, spread: !!m[3] } };
  }
  if (k === 'slide') {
    const m = /^([a-z0-9][a-z0-9-]*):(\d+)$/.exec(v);
    if (!m) return bad('a slide is slide:<deck>:<n>, counted from 1 (slide:tips-complete:17)');
    return { ok: true, part: { kind: 'slide', deck: m[1]!, n: Number(m[2]) } };
  }
  if (k === 'deck' || k === 'case' || k === 'lens' || k === 'look' || k === 'feature') {
    if (!ID.test(v)) return bad(`${k} wants a name of lower-case letters, digits and hyphens`);
    return { ok: true, part: { kind: k, id: v } as Part };
  }
  if (k === 'layout') {
    if (!ID.test(v)) return bad('layout wants a size name (iphone, iphone-landscape, ipad, ipad-portrait, mac)');
    return { ok: true, part: { kind: 'layout', size: v } };
  }
  return bad(`"${k}" is not a kind of part (the parts are ${KINDS})`);
}

/** The line a request is, written the one way (parts in the order given, checks in the table's order), so the same request is the same text everywhere and in the zip. */
export function formatRequest(r: Request): string {
  const part = (p: Part): string => {
    switch (p.kind) {
      case 'app': return 'app';
      case 'slide': return `slide:${p.deck}:${p.n}`;
      case 'layout': return `layout:${p.size}`;
      case 'random': return `random:${p.n}@${p.seed}${p.spread ? '/deck' : ''}`;
      default: return `${p.kind}:${p.id}`;
    }
  };
  const out = [r.what.map(part).join('+')];
  if (r.checks) out.push(`checks=${CHECKS.filter((c) => r.checks!.includes(c)).join(',')}`);
  if (r.runner !== 'node') out.push(`runner=${r.runner}`);
  return out.join(' ');
}

/** Reads one request line. The what is the first word with no `=`; `checks=` and `runner=` may come in any order. An empty line is `app`. */
export function parseRequest(line: string): Parsed {
  const words = line.trim().split(/\s+/).filter(Boolean);
  let what: string | null = null, checks: CheckId[] | null = null, runner: RunnerId = 'node';
  for (const w of words) {
    const eq = w.indexOf('=');
    if (eq > 0 && !w.slice(0, eq).includes(':')) {
      const k = w.slice(0, eq), v = w.slice(eq + 1);
      if (k === 'checks') {
        const list = v.split(',').filter(Boolean);
        const unknown = list.filter((c) => !(CHECKS as readonly string[]).includes(c));
        const what = unknown.length ? `"${unknown.join('", "')}" is not a check` : 'no check named';
        if (!list.length || unknown.length) return { ok: false, error: `checks=${v}: ${what} (the checks are ${CHECKS.join(', ')})` };
        checks = [...new Set(list)] as CheckId[];
      } else if (k === 'runner') {
        if (!(RUNNERS as readonly string[]).includes(v)) return { ok: false, error: `runner=${v}: the runners are ${RUNNERS.join(', ')}` };
        runner = v as RunnerId;
      } else return { ok: false, error: `"${k}=" is not part of a request (checks= and runner= are)` };
    } else if (what === null) what = w;
    else return { ok: false, error: `"${w}": a request has one what (join parts with +, not a space)` };
  }
  const parts: Part[] = [];
  for (const s of (what ?? 'app').split('+')) {
    const p = parsePart(s);
    if (!p.ok) return { ok: false, error: p.error };
    parts.push(p.part);
  }
  return { ok: true, request: { what: parts, checks, runner } };
}
