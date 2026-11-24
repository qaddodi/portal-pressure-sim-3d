// Every talk's slides as the player frames them (hp/cams.ts camPlan, the one path all 42 talks play through): each body slide's shot and the box of what it names, in whichever
// anatomy the process holds (PPS_ANATOMY). Run as a script it prints them as JSON, so a placed-mode test can read today's numbers from a second process
// (`node tests/anatomy/slide-frames.ts`): the switch is read once at load, so one process holds one anatomy.
import { camPlan, DEFAULT_CAM } from '../../src/decks/hp/cams.ts';
import { namesPlaced } from '../../src/decks/rw/cams.ts';
import { boxOfNames, subjectOfBox2, FIGURE_NAMES, HIDDEN_EDGES, REGION_SUBJECTS, PLACED, type Box3 } from '../../src/scene/anatomy/source.ts';
import { HP_IDS, loadHpDeck } from '../../src/decks/hp/index.ts';
import { AG_IDS, loadAgDeck } from '../../src/decks/ag/index.ts';
import { DECKS } from '../../src/decks/rw/copied/all.ts';
import { RW_IDS } from '../../src/decks/rw/copied/index.ts';
import type { Shot } from '../../src/scene/camera/shots.ts';

export interface SlideFrame { cam: string; shot: Pick<Shot, 'yaw' | 'pitch' | 'r' | 'target' | 'half'>; subject: Box3 }

/** What a slide camera names (the same reading the placed cameras make): a region's subjects, a raw box's subject, an `{ on, near }` list, or the whole figure. */
export function subjectNames(cam: unknown): string[] {
  if (cam == null || cam === 'fit') return [...FIGURE_NAMES];
  if (typeof cam === 'string') return [...REGION_SUBJECTS[cam]!];
  if (Array.isArray(cam) && cam.length === 4 && cam.every((n) => typeof n === 'number')) return subjectOfBox2(cam as unknown as readonly [number, number, number, number], HIDDEN_EDGES);
  if (Array.isArray(cam)) return cam.flatMap((r) => [...REGION_SUBJECTS[r as string]!]);
  const o = cam as { on: string[]; near?: string };
  return [...namesPlaced(o.on).names, ...(o.near ? REGION_SUBJECTS[o.near]! : [])];
}

interface Slide { cam?: unknown; view?: unknown; zone?: unknown; visual?: unknown }
/** Every body slide of every talk, by `deck/slide number`: its shot and its subject's box in this process's anatomy. */
export async function slideFrames(): Promise<Record<string, SlideFrame>> {
  const decks: { id: string; slides: Slide[] }[] = [
    ...await Promise.all(HP_IDS.map((id) => loadHpDeck(id))), ...await Promise.all((AG_IDS as readonly string[]).map((id) => loadAgDeck(id as never))),
    ...(RW_IDS as readonly string[]).map((id) => DECKS[id]!),
  ] as never;
  const out: Record<string, SlideFrame> = {};
  for (const d of decks) d.slides.forEach((s, i) => {
    const cam = s.cam == null && s.view === 'circuit' && !s.visual && typeof s.zone === 'string' ? s.zone : s.cam;
    const p = camPlan(cam as never, s.view as never);
    if (p.kind !== 'body') return;
    const named = cam ?? DEFAULT_CAM;
    const { box } = boxOfNames(subjectNames(named), PLACED);
    const { yaw, pitch, r, target, half } = p.shot;
    out[`${d.id}/${i + 1}`] = { cam: JSON.stringify(named), shot: { yaw, pitch, r, target, half }, subject: box! };
  });
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) process.stdout.write(JSON.stringify(await slideFrames()));
