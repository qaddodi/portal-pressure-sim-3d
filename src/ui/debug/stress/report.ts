// ?stress: the written report of a run, built from what each layout's frame found (stress/run.ts). Pure: tests/stress-report.test.ts runs it in node.
// Files: REPORT.md at the top (the build, counts, the issues first), one notes file a section (slides.md, animations.md, menus.md) listing every picture with its state, its checks and its issues,
// and manifest.json (everything, for a tool).
import { SECTIONS, type SectionId } from './plan.ts';

export interface Check { name: string; ok: boolean; detail?: string }
/** One picture. `file` is its path inside its layout's folder. */
export interface Entry {
  section: SectionId;
  layout: string;
  file: string;
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
/** `request` and `random`: the audit request this run was made from (request/grammar.ts) and its seeded draw, printed so the same slides can be asked for again; both absent for the default plan. */
export interface Meta { build: string; at: string; stopped: boolean; request?: string; random?: { n: number; seed: number; spread: boolean; picked: string[] } | null }
/** The lines that say what was asked for: the request, the seed and how to ask for the same slides again. Empty for the default plan. */
export function requestLines(meta: Meta): string[] {
  if (!meta.request) return [];
  const r = meta.random, again = r ? `random:${r.n}@${r.seed}${r.spread ? '/deck' : ''}` : '';
  if (!r) return [`Request: ${meta.request}`];
  const how = `${r.n} slides, seed ${r.seed}${r.spread ? ', spread over the talks' : ''}`;
  return [`Request: ${meta.request}`, `Random: ${how}; ask for the same slides again with ${again}`, `Slides: ${r.picked.join(', ')}`];
}

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

const mark = (e: Entry): string => (bad(e) ? 'FAIL' : 'pass');
const entryMd = (e: Entry): string => [
  `### ${e.layout}: ${e.title}  [${mark(e)}]`,
  `- picture: \`${e.layout}/${e.file}\``,
  `- state: ${e.state}`,
  ...(e.link ? [`- reopen: ${e.link}`] : []),
  ...e.checks.map((c) => `- ${c.ok ? 'pass' : 'FAIL'}: ${c.name}${c.detail ? ` (${c.detail})` : ''}`),
  ...e.issues.map((i) => `- ISSUE: ${i}`),
  '',
].join('\n');

/** One section's notes file. */
export function sectionMd(id: SectionId, runs: readonly LayoutRun[]): string {
  const s = SECTIONS.find((x) => x.id === id)!;
  const es = runs.flatMap((r) => r.entries.filter((e) => e.section === id));
  const f = es.filter(bad).length;
  return [`# ${s.title}`, '', `${es.length} pictures, ${f} with a failed check or an issue.`, '', ...es.map(entryMd)].join('\n');
}

/** REPORT.md: what ran, the counts, the issues first, then each layout's own notes. */
export function reportMd(runs: readonly LayoutRun[], meta: Meta): string {
  const all = runs.flatMap((r) => r.entries), f = all.filter(bad);
  const out: string[] = [
    '# Stress capture report', '',
    `Build: ${meta.build}`, ...requestLines(meta), `Made: ${meta.at}`, `Layouts: ${runs.map((r) => r.label).join(', ')}`,
    `Run time: ${Math.round(runs.reduce((n, r) => n + r.secs, 0))} s${meta.stopped ? ' (stopped early: what was finished is here)' : ''}`,
    '',
    '## Summary', '',
    `- ${all.length} pictures: ${all.length - f.length} clean, ${f.length} with a failed check or an issue.`,
    ...SECTIONS.map((s) => { const es = all.filter((e) => e.section === s.id); return `- ${s.title}: ${es.length} pictures, ${es.filter(bad).length} with a problem (notes: ${s.file}).`; }),
    '', '## Issues (worst first)', '',
  ];
  const noted = runs.flatMap((r) => r.notes.filter(isProblem).map((n) => `${r.label}: ${n}`));
  if (!f.length && !noted.length) out.push('None: every check passed.');
  for (const n of noted) out.push(`- ${n}`);
  // (a failed check outranks a note; within them, the order of the run)
  for (const e of [...f].sort((a, b) => failed(b).length - failed(a).length)) {
    out.push(`- ${e.layout} / ${e.title} (\`${e.layout}/${e.file}\`)`);
    for (const c of failed(e)) out.push(`  - FAIL ${c.name}${c.detail ? `: ${c.detail}` : ''}`);
    for (const i of e.issues) out.push(`  - ${i}`);
  }
  out.push('', '## The checks', '',
    '- Cards fit their boxes: no card\'s drawn content reaches more than 2 px past its foot (from the capture\'s card record).',
    '- Cards keep their size after they land: inside a transition every card is measured on every frame once it stands; none may change size (project rule 12).',
    '- Notes the capture itself made (a picture that was not still, a picture that did not load) are issues.',
    '- What this cannot see: text overlap and clipping by eye, whether a number is right, how smooth the motion plays. Read the pictures for those.');
  for (const r of runs) {
    out.push('', `## ${r.label}`, '', `${r.entries.length} pictures in ${Math.round(r.secs)} s${r.ended ? `; ended early: ${r.ended}` : ''}.`);
    for (const n of r.notes) out.push(`- ${n}`);
  }
  out.push('');
  return out.join('\n');
}

/** manifest.json: the whole run for a tool. */
export function manifestJson(runs: readonly LayoutRun[], meta: Meta): string {
  const layouts = runs.map((r) => ({ layout: r.layout, label: r.label, secs: r.secs, ended: r.ended ?? null, notes: r.notes, entries: r.entries }));
  return JSON.stringify({ v: 1, runner: 'gpu', ...meta, layouts }, null, 1);
}
