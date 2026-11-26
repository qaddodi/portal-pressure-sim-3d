// Playing a model patient's case (docs/approved/play-the-case.md): the shapes. A stop is a key moment of the story (timeline/story.ts) where the case waits; its shot is a slide's scene
// fields (the view, the named camera, the lens, the labels), so the camera does there exactly what a slide's would. Plain data: no engine, no page.
import type { ViewId } from '../shell/views.ts';

/** The state a Look closer card opens in, where its label names one (look-pane.ts applies it through each pane's own store). A look that names a site or a mode must set it: the pane
 *  otherwise opens as the last visit left it (the portal vein for a stent's Doppler, Measure for the stent's pressures, 10 s for a pregnancy's days, an empty HVPG tracing). */
export interface LookPane {
  /** IR (hvpg): the TIPS tab, on this stent */
  stent?: 'TIPS' | 'DIPS';
  /** IR (hvpg): the Measure tab with the HVPG measurement already running, so its tracing is not empty */
  measure?: true;
  /** Doppler: the vessel (an edge id of the Doppler's own list) the probe samples */
  probe?: string;
  /** Over time (scope): the range on screen */
  range?: 'beats' | 'minutes' | 'days';
}

/** "Look closer here": a Tests card or a view worth opening at this stop (up to three). `tool` is a Tests tool's id or a view's ('circuit', 'lobule', ...); `pane` the state the card opens in. */
export interface CaseLook { tool: string; label: string; pane?: LookPane }

/** Where the camera goes at a stop: a view, a slide's named camera in it ('bleed', 'tips', 'lobule:sinusoid' ... decks/hp/cams.ts), the lens, the stations it labels. */
export interface StopShot { view: ViewId; cam: string; lens?: string; labels?: string[] }

/** A course's own word on one of its stops (courses.ts `play.stops`), where the default is not right: anchored as a chapter is, to a step's id or to a day the story headlines.
 *  `drop` takes the stop out; the rest replaces the default's fields. A stop where nothing happens is added as a course step with a `note` (a key moment of its own, so it keeps the model). */
export interface CaseStopIn {
  at: string | { day: number };
  drop?: boolean;
  view?: ViewId; cam?: string; lens?: string; labels?: string[];
  look?: CaseLook[];
  /** an authored line in place of the story's own sentence */
  say?: string;
}
/** The same, baked: anchored to its day (index.generated.ts, as the chapters are). */
export type CaseStopBaked = Omit<CaseStopIn, 'at'> & { day: number };

/** The disease moving by itself between stops (a course's ramps, baked): `key` eased from a to b over the days from..to. */
export interface CaseRamp { key: string; from: number; to: number; a: number; b: number }

/** One stop of the case, resolved from the story and the course. */
export interface Stop {
  /** the story moment's key (story-view.ts momentKey) */
  key: string;
  type: 'start' | 'key' | 'today';
  day: number;
  /** the History entry that keeps the model at this stop (the last of its day with a snapshot) */
  entry: number;
  title: string;
  /** the card's kicker: the moment's kind ('Medicine', 'Procedure', 'Emergency', 'Event', 'Change'), or the start's and today's */
  kind: string;
  shot: StopShot;
  look: CaseLook[];
  say: string | null;
  /** where the course's own clock stands (pregnancy: "18 weeks", "4 weeks after delivery"), or '' when the course has none (when.ts) */
  when?: string;
}

/** Where the case is: not playing, waiting at a stop, on the way to the next, or left (the patient is the learner's own from a stop on, with the way back kept). */
export type CasePhase = 'off' | 'stop' | 'travel' | 'left';
