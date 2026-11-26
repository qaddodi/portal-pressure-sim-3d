// FOCUS REVEAL (Mohammad, 26 Nov 2026): "the esophagus is not being seen through the liver edge ... give some fade to the tip of the liver (slowly fade it, transition to fade, not
// abruptly), and in normal
// situations, when we zoom into this area, maybe activate the fade if we're trying to look at the GE junction". Sheet: docs/approved/focus-reveal.md.
//
// ONE RULE, keyed to what is being looked at. A focus is a structure an organ hides (the GE junction behind the liver's left lobe). When the camera frames it (near the middle of the room the cards
// leave, and closer than the whole figure), the organ in front fades LOCALLY, over a soft band round the focus on the screen, and the hidden structure is drawn under the faded part. A slide that
// frames the varices, the bleed or the GE junction is that camera, and so is a hand zoom onto the same place in free exploration: the slide and the hand are not two cases, they are one camera.
// Nothing switches: the strength follows the camera on smooth curves and eases over time (FOCUS_TAU), so a cut to a slide that frames the junction still fades the tip in over a second.
//
// A new focus is one more row in FOCI (its segment, its occluders, the organs it shows); the organs, the shaders and the scene read the table, nothing else names the junction.
// Pure numbers here, no GPU: tests/focus-reveal.test.ts holds them.
import { esoAt } from '../anatomy/eso-wall.ts';
import type { Vec3 } from '../anatomy/vessels.ts';

export interface FocusRule {
  id: string;
  /** What it is, in plain words (the sheet and the tests name it). */
  what: string;
  /** The focus as a segment in the scene (its two ends): the fade runs round this segment on the screen. */
  a: Vec3; b: Vec3;
  /** The fade's band round the segment, scene units at the focus: whole within `inner`, gone at `outer` (smooth between). */
  inner: number; outer: number;
  /** How much of the occluder's fill is taken at the most (0.85: 15% of the wash is left, so the organ's place still reads, and its outline stays). */
  fadeMax: number;
  /** The organs that hide the focus (their fill fades) and the organs drawn under the fade (the hidden structure). */
  occluders: readonly string[];
  shows: readonly string[];
  /** A slide that labels any of these stations is ABOUT the focus (labels/stations.ts ids): it reveals it whenever the focus is in the room, however wide the frame (the varices frames stand
   *  only 1.2 times the whole figure close). */
  stations: readonly string[];
  /** "Being looked at": the focus's place in the room, as a share of the room's half from its middle to its edge (1 = on the edge), on at `centre[0]` or less, off from `centre[1]`. */
  centre: readonly [number, number];
  /** And how close: the camera's zoom over the whole-figure framing (rig.zoomOverWhole, the organ veil's measure), off at `zoom[0]` or less, on from `zoom[1]` (smooth on its log). */
  zoom: readonly [number, number];
}

/** How quickly the reveal follows the camera, seconds (an exponential's time constant: about 1.5 s to settle, "slowly fade it"). */
export const FOCUS_TAU = 0.5;

const eso = (y: number): Vec3 => { const s = esoAt(y); return [s.cx, y, s.cz]; };

/** The foci. The GE junction: the lower esophagus from where it stands clear above the liver's top (y 1.22) down to the cardia, where it meets the stomach behind the left lobe's tip. */
export const FOCI: readonly FocusRule[] = [
  {
    id: 'gej', what: 'the GE junction and the lower esophagus, behind the left lobe of the liver',
    a: eso(1.22), b: [0.335, 0.93, -0.05],
    // (the esophagus is 0.03 across each side and its varices lie on its wall, up to about 0.05 out: the band is whole over them all, and softens over the next 0.13)
    inner: 0.07, outer: 0.2, fadeMax: 0.85,
    occluders: ['liver'], shows: ['stomach'],
    // (the esophageal varices and the azygos they drain to: the slides that label them are about the lower esophagus)
    stations: ['VAR', 'AZY'],
    // (the varices, bleed, feeder and GE junction frames hold it within 0.5 of the middle at 2 to 3 times the whole figure; the fundus frames put it at the room's edge, the whole figure at zoom 1)
    centre: [0.5, 0.8], zoom: [1.15, 1.45],
  },
];

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
/** GLSL's smoothstep. */
export const smooth = (a: number, b: number, x: number): number => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** How much a rule's focus is being looked at, 0..1: `u` its place in the room (0 the middle, 1 the edge), `zoom` the camera's zoom over the whole figure, `about` true when the slide on
 *  show is about it
 *  (it labels one of the rule's stations): then the zoom does not count, only that the focus is in the room. */
export function lookShare(r: FocusRule, u: number, zoom: number, about = false): number {
  if (!(u >= 0) || !(zoom > 0)) return 0;
  const inRoom = 1 - smooth(r.centre[0], r.centre[1], u);
  const close = about ? 1 : smooth(Math.log(r.zoom[0]), Math.log(r.zoom[1]), Math.log(zoom));
  return inRoom * close;
}
/** The foci a slide is about, by the stations it labels (figure-calls.ts). */
export const focusOfStations = (labels: readonly string[]): string[] => FOCI.filter((r) => r.stations.some((s) => labels.includes(s))).map((r) => r.id);

/** One step of the reveal's ease toward `goal` over `dt` seconds (frame-rate free); lands within 0.002. */
export function easeReveal(cur: number, goal: number, dt: number, tau = FOCUS_TAU): number {
  if (cur === goal) return goal;
  const v = cur + (goal - cur) * -Math.expm1(-Math.max(0, dt) / tau);
  return Math.abs(goal - v) < 0.002 ? goal : v;
}

/** Distance from a point to a segment (2D, screen pixels): the JS twin of glsl.ts frvAt's. */
export function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey;
  const t = l2 > 0 ? clamp01(((px - ax) * ex + (py - ay) * ey) / l2) : 0;
  return Math.hypot(px - ax - ex * t, py - ay - ey * t);
}
/** The reveal at a pixel `d` px from the focus's segment: the strength now, whole within `inner` px, gone at `outer` px (the JS twin of glsl.ts frvAt). */
export const revealAt = (strength: number, d: number, inner: number, outer: number): number => (strength <= 0 ? 0 : strength * (1 - smooth(inner, outer, d)));
/** The occluder's fill left at that pixel (1: all of it): what the liver's shader multiplies its opacity by. */
export const occluderLeft = (r: FocusRule, strength: number, d: number, inner: number, outer: number): number => 1 - r.fadeMax * revealAt(strength, d, inner, outer);
