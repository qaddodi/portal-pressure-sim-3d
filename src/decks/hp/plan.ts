// A copied 2D slide, planned for the 3D app: its camera shot, its view, its colour lens, the stations its words name, and what it needs from other batches.
// Nothing here is typed per slide: every field is derived from the 2D deck's own fields (src/decks/hp/data/*.copied.ts), so a deck changed in 2D and copied
// again is planned again, and a slide that asks for something this file cannot place fails a test instead of being dropped.
import type { Shot } from '../../scene/camera/shots.ts';
import type { LobuleCam } from '../../scene/lobule/shots.ts';
import { DEFAULT_LENS, LENS_IDS, type LensId } from '../../scene/lenses/model.ts';
import { STATIONS, TERM_STATIONS } from '../../scene/labels/stations.ts';
import { camPlan, type CamPlan } from './cams.ts';
import { needsOf, readiness, missingStations, missingTerms, type Readiness } from './hooks.ts';
import { stepOf, type Step } from './numbers.ts';
import type { CopiedDeck, CopiedSlide } from './types.ts';

export type FigureView = 'body' | 'lobule' | 'sinusoid' | 'circuit';

/** What the scene is asked to show for a slide. */
export interface SceneDirective {
  /** Where the camera goes (the scene fits it into the room the cards leave). */
  shot: Shot;
  /** The lobule or sinusoid camera name when the slide is in one of those views. */
  lobuleCam: LobuleCam | null;
  view: FigureView;
  lens: LensId;
  /** Stations the slide labels on the figure that the 3D labels know now. */
  labels: string[];
  /** Figure parts the slide's words point at (the 2D term targets: ra, ivc, lobule:sinusoid …), for the labels and the lobule's lit parts. */
  terms: string[];
}

export interface SlidePlan {
  deck: string;
  id: string;
  index: number;
  cam: CamPlan;
  scene: SceneDirective;
  /** The model step this slide asks of the engine (an empty step: the slide before's patient). */
  step: Step;
  needs: string[];
  readiness: Readiness;
  /** Names the slide uses that the 3D figure cannot place yet (each is a hook of batch B6, with a test). */
  missing: { stations: string[]; terms: string[] };
}

const STATION_IDS = new Set(STATIONS.map((s) => s.id));

/** The lens a slide asks for: the 2D name (absent is Pressure). A name the 3D lenses do not have throws, so none is silently ignored. */
export function lensOf(name: string | null | undefined): LensId {
  if (!name) return DEFAULT_LENS;
  if (!(LENS_IDS as readonly string[]).includes(name)) throw new Error(`no colour lens "${name}"`);
  return name as LensId;
}

export const termList = (t: CopiedSlide['terms']): string[] => (!t ? [] : Array.isArray(t) ? [...t] : [...new Set(Object.values(t))]);

export function planSlide(deck: string, s: CopiedSlide, index: number): SlidePlan {
  const cam = camPlan(s.cam, s.view);
  const view: FigureView = cam.kind === 'circuit' ? 'circuit' : cam.kind === 'lobule' ? (cam.name === 'sinusoid' ? 'sinusoid' : 'lobule') : 'body';
  const fit = camPlan("fit");
  const shot: Shot = cam.kind === "circuit" ? (fit as Extract<CamPlan, { kind: "body" }>).shot : cam.shot;   // (the Circuit view is batch B7's: until it lands the figure stays on the body)
  const scene: SceneDirective = {
    shot, lobuleCam: cam.kind === 'lobule' ? cam.name : null, view,
    lens: lensOf(s.lens), labels: (s.labels ?? []).filter((id) => STATION_IDS.has(id)), terms: termList(s.terms),
  };
  return { deck, id: s.id, index, cam, scene, step: stepOf(s), needs: needsOf(s), readiness: readiness(s), missing: { stations: missingStations(s), terms: missingTerms(s) } };
}

export function planDeck(d: CopiedDeck): SlidePlan[] { return d.slides.map((s, i) => planSlide(d.id, s, i)); }

/** Terms the labels table answers (the others wait for batch B6, or belong to the lobule view). */
export const knownTerm = (t: string) => t in TERM_STATIONS;
