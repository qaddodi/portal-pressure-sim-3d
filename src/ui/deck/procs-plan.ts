// What a slide asks of the figure's procedures, read from the copied 2D slide (pure: no scene, no clock). The 2D fields are `procedure` ('tips' | { kind, then?, auto?, target?, stented? }),
// `stented` (veins shown with a stent in them), `layers` (the lobule's layers the slide turns on), `wash` and `cath`/`cathKeep`. procs-link.ts carries each out on the scene; the node
// test (tests/deck-procs-link.test.ts) holds every slide of every deck to a procedure kind the layer can play and a scene call that exists.
import { procKindOf, specOf } from '../../scene/procedures/copied/proc-anim.js';
import { lensDistance, type Shot } from '../../scene/camera/shots.ts';
import type { CopiedSlide } from '../../decks/hp/types.ts';

type Spec = { name: string; T: { apply: number; end: number }; stops: number[]; steps: string[][]; graft?: boolean; route?: string; measure?: boolean; had(p: unknown): boolean; can(p: unknown, m?: unknown): string | false;
  apply(p: unknown): unknown; undo(p: unknown): unknown };
export const specFor = (kind: string): Spec | null => specOf(kind) as Spec | null;

export interface ProcPlan {
  /** the spec the slide plays ('brto' with a target plays that target's: 'brtoC6') */
  kind: string;
  /** a reading played after it on the same card ({ kind: 'tips', then: 'tipsgrad' }) */
  then: string | null;
  /** plays as the slide lands going forward (2D `auto`); every slide's Play button plays it */
  auto: boolean;
}

export function procPlanOf(s: { procedure?: unknown }): ProcPlan | null {
  const p = s.procedure as unknown;
  if (!p) return null;
  const kind = procKindOf(p) as string | null;
  if (!kind) return null;
  const o = typeof p === 'object' ? (p as { then?: string; auto?: boolean }) : {};
  return { kind, then: o.then ?? null, auto: !!o.auto };
}

/** The steps the card lists: the procedure's, then its reading's. */
export function stepsOfPlan(plan: ProcPlan): string[][] {
  return [...(specFor(plan.kind)?.steps ?? []), ...(plan.then ? specFor(plan.then)?.steps ?? [] : [])];
}

/** A procedure's moves, one per step: [from, to] ms of its own time, each step to its stop, the last on to the end (the catheter's way out). */
export function legsOf(kind: string): [number, number][] {
  const sp = specFor(kind);
  if (!sp) return [];
  const stops = [...new Set(sp.stops.filter((t) => t > 0 && t <= sp.T.end))].sort((a, b) => a - b);
  if (!stops.length || stops[stops.length - 1]! < sp.T.end) stops.push(sp.T.end);
  return stops.map((to, i) => [i ? stops[i - 1]! : 0, to] as [number, number]);
}

/** The veins a slide shows stented (edge ids; a `visual` slide shows none, as in 2D). */
export const stentedOf = (s: { stented?: unknown; visual?: unknown }): string[] => (!s.visual && Array.isArray(s.stented) ? (s.stented as unknown[]).filter((x): x is string => typeof x === 'string') : []);

/** The lobule layers a slide turns on. */
export const layersOf = (s: { layers?: unknown } | CopiedSlide): string[] => (Array.isArray(s.layers) ? (s.layers as unknown[]).filter((x): x is string => typeof x === 'string') : []);

/** The wedge's wash: only a slide that says `wash` and has no visual over the figure. */
export const washOf = (s: { wash?: unknown; visual?: unknown }): boolean => !!s.wash && !s.visual;

export type LayerKey = 'lymph' | 'zones' | 'bile';
export const LAYER_KEYS: readonly LayerKey[] = ['lymph', 'zones', 'bile'];

/** The lobule's layers on a slide (2D slideLayers): the viewer's own, with zones off and whatever the slide names on. */
export function layersWant(viewer: Record<LayerKey, boolean>, s: { layers?: unknown } | CopiedSlide): Record<LayerKey, boolean> {
  const want = { ...viewer, zones: false };
  for (const k of layersOf(s)) if ((LAYER_KEYS as readonly string[]).includes(k)) want[k as LayerKey] = true;
  return want;
}

/** Everything a slide asks of the figure's procedures, as a plain record (the test reads it, procs-link.ts carries it out). */
export interface ProcsAsk { procedure: ProcPlan | null; stented: string[]; layers: string[]; wash: boolean; cath: string | null }
export function askOf(s: CopiedSlide): ProcsAsk {
  return { procedure: procPlanOf(s), stented: stentedOf(s), layers: layersOf(s), wash: washOf(s), cath: typeof s.cath === 'string' ? s.cath : null };
}

/** The camera's own shots for a procedure's steps, on the tip (the 2D `way`, `tip`, `fill`, `work` legs). */
const SHOT_R: Record<string, number> = { way: 3.7, tip: 2.4, fill: 2.4, work: 2.8 };
const SHOT_HALF: Record<string, [number, number]> = { way: [0.9, 0.8], tip: [0.6, 0.5], fill: [0.6, 0.5], work: [0.7, 0.6] };
export function tipShot(name: string, at: { x: number; y: number; z: number }): Shot | null {
  const r = SHOT_R[name];
  return r ? { yaw: -0.12, pitch: 0.03, r: lensDistance(r), target: [at.x, at.y, at.z], half: SHOT_HALF[name]! } : null;
}

