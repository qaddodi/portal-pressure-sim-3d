// The picture runs (?stress, the Mac capture, the capture in the audit page) in the audit's one zip format (bundle.ts). They take pictures and, with each, a few checks of the card record
// (a card's content reaches past its foot; a card changes size after it lands); this turns those into items and findings with stable ids, so a thread fed the zip reads it the way it reads
// the node runner's. Pure: shots in, a `RunResult` out. The pages add the pictures themselves; the files here are the text.
import { RUNNER_CHECKS, type CheckId } from './grammar.ts';
import { requestFlag } from './address.ts';
import { idsOf, withIds, type FindingInput, type Severity } from './finding.ts';
import type { CheckRun, Item, RunInfo, RunResult, State } from './bundle.ts';
import type { Scope } from './resolve.ts';

/** One check made of one picture. */
export interface ShotCheck { check: CheckId; name: string; ok: boolean; detail?: string }
/** One picture and what was found about it. */
export interface Shot {
  /** where the picture is inside the zip */
  picture: string;
  /** the layout it was taken in (`iPhone`) */
  layout: string;
  kind: 'slides' | 'moves' | 'menus';
  /** the talk, for a slide */
  deck?: string;
  title: string;
  state: string;
  /** a link that reopens the exact view */
  link?: string;
  checks: ShotCheck[];
  /** things found about this picture that are not a check (the capture's own notes) */
  issues: string[];
}
/** What a picture run ended with, per layout: a frame that did not finish, and the capture's own notes. */
export interface LayoutEnd { layout: string; ended?: string; notes: string[] }

/** The check a card-record check belongs to. */
export const checkOf = (name: string): CheckId => (/keep their size/i.test(name) ? 'motion' : 'layout');

/** The scope of a picture run: the request's own, run by the gpu runner, with the slides and sizes the page took (a plan can differ from the request: the default stress plan's key slides). */
export function gpuScope(scope: Scope, o: { checks: readonly CheckId[]; slides?: readonly string[]; sizes?: readonly string[] }): Scope {
  const slides = o.slides ? [...o.slides] : scope.slides, decks = [...new Set(slides.map((k) => k.split(':')[0]!))];
  const checks = o.checks.filter((c) => RUNNER_CHECKS.gpu.includes(c));
  return { ...scope, runner: 'gpu', checks, skipped: [], slides, decks: o.slides ? decks : scope.decks, sizes: o.sizes ? [...o.sizes] : scope.sizes };
}

const SEVERITY: Record<CheckId, Severity> = { layout: 'high', motion: 'high', pictures: 'medium', numbers: 'high', junctions: 'high', perf: 'medium', a11y: 'medium', types: 'high', lint: 'low' };
const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const again = (s: Shot): string => (s.link ? `open ${s.link}` : `take the picture again: ${s.picture}`);
const sectionOf = (s: Shot): string => (s.kind === 'slides' ? `deck:${s.deck ?? 'other'}` : `pictures:${s.kind}`);
const FRAMES = 'pictures:frames';
const TITLES: Record<string, string> = { 'pictures:moves': 'Frames inside the transitions', 'pictures:menus': 'Menus and sheets', [FRAMES]: 'Frames and capture notes' };
const spoken = (c: ShotCheck): string => `${c.ok ? 'pass' : 'FAIL'}: ${c.name}${c.detail ? ` (${c.detail})` : ''}`;
const stateOf = (cs: readonly ShotCheck[], c: CheckId): State => {
  const mine = cs.filter((x) => x.check === c);
  return !mine.length ? 'n/a' : mine.every((x) => x.ok) ? 'pass' : 'fail';
};
const askAgain = (scope: Scope): string[] => [
  `Ask the same runner for the same request: put \`&${requestFlag(scope.line)}\` on the page's address (\`?stress\` or \`?audit=frames&capture=1\`).`,
  `The code-side checks of the same request need no browser: \`npm run audit -- "${scope.line}"\`.`,
];

export interface ShotsRun {
  scope: Scope;
  info: RunInfo;
  shots: readonly Shot[];
  ends: readonly LayoutEnd[];
  /** the checks this kind of run makes: a capture makes no transition check */
  checks: readonly CheckId[];
  validity: readonly string[];
  notJudged: readonly string[];
  /** a note of the capture that means a picture is not to be trusted (stress/report.ts isProblem) */
  isProblem(note: string): boolean;
}

const WORDS: Partial<Record<CheckId, string>> = {
  layout: 'a card\'s content reaches no more than 2 px past its foot', motion: 'no card changes size after it lands', pictures: 'every picture was taken, still, and says it shows its slide',
};

/** A picture run as the audit's result: one item a picture, one finding a failed check, issue, problem note or frame that did not end. */
export function resultOfShots(r: ShotsRun): RunResult {
  const inputs: FindingInput[] = [], items: Item[] = [];
  const note = (input: FindingInput): number => { inputs.push(input); return inputs.length - 1; };
  const own: number[][] = [];
  for (const s of r.shots) {
    const section = sectionOf(s), mine: number[] = [], where = `${s.layout} / ${s.title}`;
    for (const c of s.checks.filter((x) => !x.ok)) {
      mine.push(note({
        rule: `picture:${slug(c.name)}`, check: c.check, severity: SEVERITY[c.check], target: where, owner: '', where: s.picture, state: c.detail ?? c.name,
        message: `${c.name}: ${c.detail ?? 'failed'}`, repro: again(s), section,
      }));
    }
    for (const i of s.issues) {
      mine.push(note({ rule: 'picture:issue', check: 'pictures', severity: 'medium', target: where, owner: '', where: s.picture, state: i, message: i, repro: again(s), section }));
    }
    own.push(mine);
  }
  const unattached: number[] = [];
  for (const e of r.ends) {
    if (e.ended && e.ended !== 'stopped') {
      const message = `the ${e.layout} frame did not finish: ${e.ended}`;
      const base = { check: 'pictures' as const, owner: '', where: e.layout, repro: 'take the run again', section: FRAMES };
      unattached.push(note({ ...base, rule: 'picture:frame-ended', severity: 'high', target: e.layout, state: e.ended, message }));
    }
    for (const n of e.notes.filter(r.isProblem)) {
      const cut = n.indexOf(': '), about = cut > 0 ? n.slice(0, cut) : n, what = cut > 0 ? n.slice(cut + 2) : n;
      const target = `${e.layout} / ${about}`;
      const base = { check: 'pictures' as const, owner: '', where: e.layout, repro: 'take the run again', section: FRAMES };
      unattached.push(note({ ...base, rule: 'picture:capture-note', severity: 'medium', target, state: what, message: n }));
    }
  }
  // (ids are made over all findings together, in the order found, so two alike get .2 and .3; the list is then worst first)
  const ids = idsOf(inputs), sorted = withIds(inputs);
  r.shots.forEach((s, n) => {
    const section = sectionOf(s);
    const checks: Item['checks'] = {};
    for (const c of r.checks) {
      if (c === 'pictures') checks.pictures = s.issues.length ? 'fail' : 'pass';
      else if (c === 'layout' || c === 'motion') checks[c] = stateOf(s.checks, c);
    }
    const item: Item = {
      section, id: s.picture, label: `${s.layout}: ${s.title}`, checks, findings: own[n]!.map((k) => ids[k]!),
      detail: [`picture: \`${s.picture}\``, `state: ${s.state}`, ...(s.link ? [`reopen: ${s.link}`] : []), ...s.checks.map(spoken), ...s.issues.map((i) => `ISSUE: ${i}`)],
    };
    items.push(item);
  });
  if (unattached.length) items.push({ section: FRAMES, id: 'frames', label: 'Frames and capture notes', checks: { pictures: 'fail' }, findings: unattached.map((k) => ids[k]!) });
  const bad = (c: CheckId): number => r.shots.filter((s) => s.checks.some((x) => x.check === c && !x.ok)).length;
  const checks: CheckRun[] = r.checks.map((id) => ({
    id, ran: true, seconds: 0,
    summary: id === 'pictures'
      ? `${r.shots.length} pictures, ${r.shots.filter((s) => s.issues.length).length} with an issue; ${unattached.length} frame or capture notes`
      : `${r.shots.length} pictures, ${bad(id)} failed (${WORDS[id] ?? id})`,
  }));
  return {
    info: r.info, scope: r.scope, checks, items, findings: sorted,
    validity: [...r.validity], notJudged: [...r.notJudged], pictures: r.shots.map((s) => s.picture), titles: TITLES, again: askAgain(r.scope),
  };
}
