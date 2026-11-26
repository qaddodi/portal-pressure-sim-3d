// ?audit's case pass (capture-cases.ts): the parts of it that need no page. Which cases an address asks for, what each picture is called, the checks a stop's screen is held to, and the manifest
// (the zip's index of every case, its stops and the pictures of each) with the README. Pure: tests/capture-cases.test.ts runs it in node.
import { slug } from '../../capture/capture-model.ts';
import { deckFolder } from './capture-pick.ts';
import type { StopShot } from '../../case/types.ts';

/** What a capture takes: the slides of the talks, every history case played, or both. */
export type CaptureWhat = 'slides' | 'cases' | 'both';

/** The model patients an address asks for: `cases=all` (or `1`) is every one, a comma list names them (`cases=hist-bleed,hist-tips`); names that are not model patients are dropped.
 *  Null when the address does not ask for cases. A list of names that are all unknown is null too (never "every case" by mistake). */
export function parseCases(v: string | null | undefined, every: readonly string[]): string[] | null {
  if (v == null || v === '') return null;
  if (v === 'all' || v === '1') return [...every];
  const known = new Set(every), want = v.split(',').map((s) => s.trim()).filter((s) => known.has(s));
  return want.length ? every.filter((id) => want.includes(id)) : null;
}

/** What the address says to take: cases alone when it names cases (and says nothing of slides), both when it adds `slides=1` or names slides (`pick`, `decks`), else the slides as always. */
export function whatOf(a: { cases: boolean; slides: string | null; pick: boolean; decks: boolean }): CaptureWhat {
  if (!a.cases) return 'slides';
  return a.slides === '1' || a.pick || a.decks ? 'both' : 'cases';
}

/** A case's folder inside the zip's `cases/`: its number among every model patient in the menu's order, then its id (`01-hist-bleed`). The number never depends on which cases a run takes. */
export const caseFolder = (every: readonly string[], id: string): string => deckFolder(every, id);

const pad2 = (n: number): string => String(n).padStart(2, '0');
/** The name (no extension) of a stop's picture: its number among the stops, its day, its title (`03-day070-banding-session`). */
export const stopBase = (n: number, day: number, title: string): string => `${pad2(n)}-day${String(Math.max(0, Math.round(day))).padStart(3, '0')}-${slug(title)}`;
/** A stop's picture with its card pulled up (the iPhone's sheet: Look closer here and the figure's line). */
export const pulledBase = (base: string): string => `${base}-pulled-up`;
/** A look-closer picture of a stop: the stop's name, then which look it is and its label (`03-day070-banding-session-look02-liver-stiffness`). */
export const lookBase = (base: string, j: number, label: string): string => `${base}-look${pad2(j + 1)}-${slug(label)}`;

export interface Box { left: number; top: number; right: number; bottom: number }

/** What is wrong with a stop's screen, from the boxes of what stands on it: the stop's card (null when none is up) and the case bar,
 *  against the screen. Each finding is one plain sentence. The screen's own
 *  rules (fit, edge, labels, glass) are the self-test's; these are the three that say the CASE is laid out: the card is up, it is whole on the screen, and it does not stand on the bar. */
export function stopIssues(card: Box | null, bar: Box | null, vp: { w: number; h: number }): string[] {
  const out: string[] = [];
  if (!bar) out.push('the case bar is not up');
  if (!card) { out.push('no stop card is up'); return out; }
  const slack = 1;
  if (card.left < -slack || card.top < -slack || card.right > vp.w + slack || card.bottom > vp.h + slack) {
    out.push(`the stop card is not whole on the screen (it runs ${Math.round(Math.max(0, -card.left, -card.top, card.right - vp.w, card.bottom - vp.h))} px past an edge)`);
  }
  if (bar) {
    const w = Math.min(card.right, bar.right) - Math.max(card.left, bar.left), h = Math.min(card.bottom, bar.bottom) - Math.max(card.top, bar.top);
    if (w > slack && h > slack) out.push(`the stop card stands ${Math.round(h)} px over the case bar`);
  }
  return out;
}

export interface LookRec {
  tool: string; label: string;
  /** the picture's name in the zip, null when it was not taken */
  file: string | null;
  /** the card or view the button names did come up */
  opened: boolean;
}
export interface StopRec {
  n: number; day: number; title: string; kind: string; type: string; key: string; shot: StopShot;
  /** how the case reached it: 'first' (the case opened there), 'played' (Continue ran the days), 'jumped' (Play did not land in time and the stop was gone to) */
  arrived: 'first' | 'played' | 'jumped';
  picture: string | null; pulled: string | null;
  looks: LookRec[]; issues: string[];
}
export interface CaseRec { id: string; name: string; folder: string; preset: string; group: string; stops: StopRec[]; sheet: string | null; notes: string[] }
export interface Manifest {
  kind: 'portal-pressure-cases'; version: 1;
  build: string; made: string; screen: string; ratio: number; speed: number; walk: 'play';
  looks: boolean; stopped: boolean;
  cases: CaseRec[];
  totals: { cases: number; stops: number; pictures: number; looks: number; issues: number };
  notes: string[];
}

/** The pictures a case record names (its stops', their pulled-up ones and their looks'). */
export const picturesOf = (c: CaseRec): string[] => c.stops.flatMap((s) => [s.picture, s.pulled, ...s.looks.map((l) => l.file)]).filter((f): f is string => !!f);

export function totalsOf(cases: readonly CaseRec[]): Manifest['totals'] {
  let pictures = 0, looks = 0, issues = 0, stops = 0;
  for (const c of cases) {
    stops += c.stops.length; pictures += picturesOf(c).length;
    for (const s of c.stops) { looks += s.looks.filter((l) => l.file).length; issues += s.issues.length + s.looks.filter((l) => !l.opened).length; }
  }
  return { cases: cases.length, stops, pictures, looks, issues };
}

export const manifestJson = (m: Manifest | ReturnType<typeof joinManifests>): string => JSON.stringify(m, null, 1);

const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;
/** The README of the cases folder: what is in it, how it was made and what the pass found. */
export function casesReadme(m: Manifest): string {
  const t = m.totals, lines = [
    'Portal pressure simulator: every model patient\'s case, played',
    `Build: ${m.build}`, `Made: ${m.made} on ${m.screen} at ${m.ratio}x (the pictures are made at the device's own sharpness, 2x at most)`,
    `${plural(t.cases, 'case')}, ${plural(t.stops, 'stop')}, ${plural(t.pictures, 'picture')}${m.looks ? `, ${t.looks} of them look-closer shots` : ''}${m.stopped ? ' (stopped early)' : ''}`,
    `Took the page's clock at ${m.speed}x. Each case is played with Play the case's own Continue, stop to stop; every stop is photographed once the camera, the cards and the model have settled.`,
    '', 'Layout: cases/manifest.json lists every case, its stops, their pictures and what was found; each case has a folder (its number in the menu, then its id) with:',
    '  NN-dayDDD-<stop title>.jpg   the figure with the stop card and the case bar; .json beside it: the state the picture was taken in',
    '  NN-dayDDD-<stop title>-pulled-up.jpg   on a phone, the sheet pulled up (Look closer here, the figure line)',
    '  NN-dayDDD-<stop title>-lookNN-<label>.jpg   Look closer here: each button pressed, the card or view it opens, then put back',
    '  00-contact-sheet.png   every picture of the case on one sheet',
  ];
  const found = m.cases.flatMap((c) => c.stops.flatMap((s) => {
    const at = `${c.name}, stop ${s.n} (Day ${s.day})`;
    return [...s.issues.map((i) => `${at}: ${i}`), ...s.looks.filter((l) => !l.opened).map((l) => `${at}: "${l.label}" did not open ${l.tool}`)];
  }));
  lines.push('', found.length ? `FOUND (${found.length}):` : 'Found: nothing the case pass checks (the card is up and whole, clear of the bar, every look opens).', ...found.map((f) => `  ${f}`));
  if (m.notes.length) lines.push('', 'NOTES:', ...m.notes.map((n) => `  ${n}`));
  return lines.join('\n');
}

/** One manifest per size, joined for the whole zip (the outer page's `cases-manifest.json`): each size's manifest under its id, and the totals of all. */
export function joinManifests(bySize: Readonly<Record<string, Manifest>>): { kind: 'portal-pressure-cases-sizes'; version: 1; sizes: Record<string, Manifest>; totals: Manifest['totals'] } {
  const all = Object.values(bySize).flatMap((m) => m.cases);
  return { kind: 'portal-pressure-cases-sizes', version: 1, sizes: { ...bySize }, totals: totalsOf(all) };
}
