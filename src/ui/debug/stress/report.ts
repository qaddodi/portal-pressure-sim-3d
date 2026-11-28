// ?stress: what each layout's frame found (stress/run.ts): the checks of a card record and of a transition, and the pictures as the audit's shots (request/shots.ts), which the audit's one zip
// format turns into its report, sections and findings (request/bundle.ts). Pure: tests/stress-report.test.ts runs it in node.
import type { SectionId } from './plan.ts';
import { checkOf, type LayoutEnd, type Shot } from '../request/shots.ts';

export interface Check { name: string; ok: boolean; detail?: string }
/** One picture. `file` is its path inside its layout's folder. */
export interface Entry {
  section: SectionId;
  layout: string;
  file: string;
  /** the talk, for a slide (its section in the zip) */
  deck?: string;
  title: string;
  /** the state in words: the talk and stop, the frame inside a move, the menu tab */
  state: string;
  /** a link that reopens the exact view (the capture record's own) */
  link?: string;
  checks: Check[];
  /** things found about this picture that are not a check (the capture's own notes) */
  issues: string[];
}
export interface LayoutRun { layout: string; label: string; entries: Entry[]; notes: string[]; secs: number; ended?: string }
/** A card's content may not reach past its box foot by more than this many px (the card-boxes record: `past`). */
export const PAST_LIMIT = 2;
/** A card that lands may not change size after it first stands (rule 12: "a card lands at its final size and never changes size on screen"), beyond this many px. */
export const SIZE_DRIFT = 1;

/** Notes the capture makes that mean a picture is not to be trusted. */
export const isProblem = (n: string): boolean => /CAPTURE FAILED|still not still|did not load|could not be drawn|did not open|did not come|not captured|failed/i.test(n);

export const failed = (e: Entry): Check[] => e.checks.filter((c) => !c.ok);
const bad = (e: Entry): boolean => failed(e).length > 0 || e.issues.length > 0;

/** The checks a card record gives: nothing past a card's foot. */
export function cardChecks(cards: readonly { card: string; box: number; content: number; past: number }[] | undefined): Check[] {
  if (!cards || !cards.length) return [{ name: 'cards fit their boxes', ok: true, detail: 'no card on screen' }];
  const over = cards.filter((c) => c.past > PAST_LIMIT);
  const words = (c: (typeof cards)[number]): string => `${c.card}: content ${Math.round(c.content)} px in a box of ${Math.round(c.box)}, ${Math.round(c.past)} px past the foot`;
  const detail = over.length ? over.map(words).join('; ') : `${cards.length} card${cards.length > 1 ? 's' : ''}, none past its foot`;
  return [{ name: 'cards fit their boxes', ok: over.length === 0, detail }];
}
/** The check a move gives: each card's size from the moment it stands to the end. `sizes` maps a card to every {w,h} seen once it stood. */
export function driftCheck(sizes: ReadonlyMap<string, readonly { w: number; h: number }[]>): Check {
  const grew: string[] = [];
  for (const [card, seen] of sizes) {
    if (seen.length < 2) continue;
    const w = seen.map((s) => s.w), h = seen.map((s) => s.h), dw = Math.max(...w) - Math.min(...w), dh = Math.max(...h) - Math.min(...h);
    const r = (n: number): number => Math.round(n);
    if (dw > SIZE_DRIFT || dh > SIZE_DRIFT) grew.push(`${card}: width ${r(Math.min(...w))} to ${r(Math.max(...w))}, height ${r(Math.min(...h))} to ${r(Math.max(...h))}`);
  }
  const detail = grew.length ? grew.join('; ') : `${sizes.size} card${sizes.size === 1 ? '' : 's'} watched, none changed size`;
  return { name: 'cards keep their size after they land', ok: grew.length === 0, detail };
}

/** The pictures of a run as the audit's shots (request/shots.ts): each one at `pictures/<layout>/<file>` in the zip, its checks sorted into the audit's checks. */
export function shotsOf(runs: readonly LayoutRun[]): { shots: Shot[]; ends: LayoutEnd[] } {
  const shots = runs.flatMap((r) => r.entries.map((e): Shot => ({
    picture: `${PICTURES}/${r.layout}/${e.file}`, layout: r.label, kind: e.section, ...(e.deck ? { deck: e.deck } : {}), title: e.title, state: e.state, ...(e.link ? { link: e.link } : {}),
    checks: e.checks.map((c) => ({ check: checkOf(c.name), name: c.name, ok: c.ok, ...(c.detail ? { detail: c.detail } : {}) })), issues: e.issues,
  })));
  return { shots, ends: runs.map((r) => ({ layout: r.label, notes: r.notes, ...(r.ended ? { ended: r.ended } : {}) })) };
}
/** Where a run's pictures are in its zip, a folder a layout. */
export const PICTURES = 'pictures';
