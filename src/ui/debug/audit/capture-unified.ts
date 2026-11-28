// The capture's zips (the Mac capture, and the capture in the audit page) in the audit's one format: each keeps its own folders of pictures and state files, and gets README-FIRST.md,
// REPORT.md, sections/, findings.json and manifest.json at the top (request/bundle.ts), made from the card record in each slide's state file. Nothing is photographed again.
import type { ZipFile } from '../../capture/zip.ts';
import { cardChecks, isProblem } from '../stress/report.ts';
import { NOT_JUDGED, pictureScope, unifiedFiles } from '../request/gpu.ts';
import type { LayoutEnd, Shot } from '../request/shots.ts';
import { appWorld } from '../request/world.ts';

/** A slide's capture state file, the part read here. */
interface SlideState { deck?: unknown; deckTitle?: string; stop?: unknown; title?: string; card?: string; cards?: { card: string; box: number; content: number; past: number }[]; link?: string }

const dec = new TextDecoder();
/** The shots of every slide's state file among `names`: `<folder>/<slide>.json` with its picture beside it. `labelOf` names the layout a file belongs to. */
export async function slideShots(names: readonly string[], read: (name: string) => Promise<Uint8Array | null>, labelOf: (name: string) => string): Promise<{ shots: Shot[]; unread: string[] }> {
  const shots: Shot[] = [], unread: string[] = [], have = new Set(names);
  for (const name of names.filter((n) => n.endsWith('.json') && !/manifest\.json$/.test(n))) {
    const raw = await read(name);
    let j: SlideState | null = null;
    try { j = raw ? (JSON.parse(dec.decode(raw)) as SlideState) : null; } catch { j = null; }
    // (a state file that is not a slide's, a history case's for one, is not judged here)
    if (!j || typeof j.deck !== 'string' || typeof j.stop !== 'number') continue;
    const stem = name.replace(/\.json$/, ''), picture = have.has(`${stem}.jpg`) ? `${stem}.jpg` : have.has(`${stem}.png`) ? `${stem}.png` : null;
    if (!picture) { unread.push(name); continue; }
    const view = /-(untucked|tucked)(?:-|$)/.exec(stem)?.[1], up = view === 'untucked' ? 'card up' : view === 'tucked' ? 'card tucked' : '';
    shots.push({
      picture, layout: labelOf(name), kind: 'slides', deck: j.deck, title: `${j.deckTitle ?? j.deck} ${j.stop}: ${j.title ?? ''}${j.card ? ` (${j.card})` : ''}${up ? ` [${up}]` : ''}`,
      state: `${j.deck} slide ${j.stop}${up ? `, ${up}` : ''}${j.card ? `, the card ${j.card}` : ''}`, ...(j.link ? { link: j.link } : {}),
      checks: cardChecks(j.cards).map((c) => ({ check: 'layout' as const, name: c.name, ok: c.ok, ...(c.detail ? { detail: c.detail } : {}) })), issues: [],
    });
  }
  return { shots, unread };
}

export interface CaptureBundle {
  search: string;
  names: readonly string[];
  read: (name: string) => Promise<Uint8Array | null>;
  labelOf: (name: string) => string;
  /** the sizes taken, as the app names them, when they are the device table's (the stress layouts and the capture's frames share its ids) */
  sizes?: readonly string[];
  /** the slides taken when the form (not the request) picked them */
  slides?: readonly string[];
  ends: readonly LayoutEnd[];
  build: string;
  startedAt: string;
  seconds: number;
  device: string;
  /** the page's speed (1 is its own) and whether the sizes ran side by side */
  speed: number;
  sideBySide: boolean;
  stopped: boolean;
  /** cases were played too: their state files are not judged */
  cases: boolean;
}

/** The top-level files of a capture zip, ready to add beside its folders; null when the request cannot be read. */
export async function captureUnified(o: CaptureBundle): Promise<ZipFile[] | null> {
  const scope = pictureScope(o.search, appWorld(), { checks: ['layout', 'pictures'], ...(o.slides ? { slides: o.slides } : {}), ...(o.sizes ? { sizes: o.sizes } : {}) });
  if (!scope) return null;
  const { shots, unread } = await slideShots(o.names, o.read, o.labelOf);
  const speed = o.speed > 1
    ? `The page\'s clock ran at ${o.speed}x: a card photographed at speed can be short of its height, so confirm a finding by taking that slide again at its own speed before fixing it.`
    : 'Taken at the page\'s own speed.';
  const validity = [
    'A real GPU run on the device named above.', speed,
    ...(o.sideBySide ? ['Each size ran in its own frame, side by side in one page, so the sizes slowed one another a little.'] : []),
    'The only check is of the card record in each slide\'s state file: a card\'s content past its foot. A pass means no card overflowed in these pictures, not that the slide is right.',
    ...(o.stopped ? ['The run was stopped early: only what was finished is here.'] : []),
  ];
  const notJudged = [...NOT_JUDGED(scope.line), 'Transitions are not photographed by the capture; `?stress` takes frames inside them.',
    ...(o.cases ? ['History cases were played too: their pictures are in the folders, their state files are not judged here.'] : []),
    ...unread.map((n) => `${n}: its picture is missing, so it is not judged.`)];
  const build = { commit: o.build, branch: '' };
  return unifiedFiles({ scope, build, startedAt: o.startedAt, seconds: o.seconds, device: o.device, shots, ends: o.ends, checks: scope.checks, validity, notJudged, isProblem });
}
