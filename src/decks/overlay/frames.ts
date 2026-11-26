// The camera policy the 3D app lays over a slide's copied 2D `cam` (framing rules F1, F5, S6 and S12, docs/approved/framing-rules.md): a slide whose copied camera is a whole region but whose
// subject is a small part of it is framed on that part. These are DATA ABOUT SLIDES, so they sit with the other 3D additions to a slide (src/decks/overlay.ts merges each entry onto its slide
// as the slide's own `frame` field); the camera code (hp/cams.ts) reads `slide.frame` and nothing else, and no deck is looked up by name anywhere.
import type { CopiedSlide } from '../hp/types.ts';

/** The camera name that means "the route, framed to the stations the slide labels" (hp/cams.ts routeBox). */
export const ROUTE_TO_STATIONS = 'route-stations';

/** FRAMING RULE F1 (Mohammad, 25 Nov, docs/approved/framing-rules.md): a slide whose copied 2D camera is a whole region but whose subject is a small part of it is framed on that part. Each entry names the slide, the 2D camera it
 *  replaces (so a re-copy that moves the camera is noticed: tests/camera-framing-rules.test.ts), the frame that replaces it, and the context floor (half extent, scene units: no tighter than this, F5). The 2D deck is never edited. */
export interface FrameFix { was: string; cam: CopiedSlide['cam']; floor: number }
export const CONTEXT_FLOOR = 0.45;
/** The hepatic veins and the caudate lobe, as a plate box: the Outflow talk's `hepatic` frame (410 to 800 by 40 to 340, half 0.65 x 0.50) moved 0.17 units down, so the caudate (placed y 0.60 to 0.98, no name a camera can point at) stands whole with 0.08 of air
 *  and the hepatic veins' mouths (to y 1.23) stay in. Same size as `hepatic`, so the two talks frame the veins alike (F10). */
const HV_CAUDATE: [number, number, number, number] = [410, 100, 800, 400];
const LPV_STENT: CopiedSlide['cam'] = { on: ['lpv', 'TIPS'] };
export const FRAME_FIXES: Record<string, FrameFix> = {
  // Budd-Chiari: the hepatic veins and the caudate lobe (the liver frame was the whole liver; 0.86 x 0.60 half against 0.45 floor, 1.3 times closer on a Mac)
  'budd-chiari/dx': { was: 'liver', cam: HV_CAUDATE, floor: CONTEXT_FLOOR },
  'budd-chiari/ladder': { was: 'liver', cam: HV_CAUDATE, floor: CONTEXT_FLOOR },
  'budd-chiari/anticoag': { was: 'liver', cam: HV_CAUDATE, floor: CONTEXT_FLOOR },
  'budd-chiari/agent': { was: 'liver', cam: HV_CAUDATE, floor: CONTEXT_FLOOR },
  'budd-chiari/response': { was: 'liver', cam: HV_CAUDATE, floor: CONTEXT_FLOOR },
  'budd-chiari/alf': { was: 'liver', cam: HV_CAUDATE, floor: CONTEXT_FLOOR },
  'budd-chiari/hcc': { was: 'liver', cam: HV_CAUDATE, floor: CONTEXT_FLOOR },
  // the left portal vein and the stent: the slides read flow in the intrahepatic portal branches and at the stent
  'doppler/a5': { was: 'liver', cam: LPV_STENT, floor: 0.55 },
  'tips-doppler/left': { was: 'liver', cam: LPV_STENT, floor: 0.55 },
  'tips-doppler/warn': { was: 'liver', cam: LPV_STENT, floor: 0.55 },
};
/** FRAMING RULE F5: the declared close-ups, the only slides allowed a frame under the context floor (its longer half under CONTEXT_FLOOR) or a vein wider than a sixth of the room's short side. Mohammad, 25 Nov: "do it" to keeping all four, and to say if the baseline should pull back.
 *  A slide not listed that falls under either limit fails tests/camera-framing-rules.test.ts; a slide listed that no longer needs it fails the same test. (The nearest distance, NEAR 2.8, already stops the very smallest boxes at a vein 105 px wide on a Mac, 98 px on a phone.) */
export const CLOSE_UPS: readonly string[] = ['tips-complete/baseline', 'tips-doppler/jet', 'varices/burst'];
// Whole-figure overviews are for orientation (framing rule S12; Mohammad, 25 Nov): a slide that names parts of the body is framed on them.
const VARICES_SPLEEN: [number, number, number, number] = [540, -20, 1120, 580];   // the `varices` and `spleen` regions together
const FUNDUS_LIVER: [number, number, number, number] = [344, 166, 1110, 690];     // the `fundus` and `liver` regions together (the varices and the stent that treats them)
Object.assign(FRAME_FIXES, {
  'ncph/patient': { was: 'fit', cam: VARICES_SPLEEN, floor: 0 },
  'ncph/relation': { was: 'fit', cam: VARICES_SPLEEN, floor: 0 },
  'gastric-varices/tips': { was: 'fit', cam: FUNDUS_LIVER, floor: 0 },
  'tipping/injury': { was: 'fit', cam: 'liver', floor: 0 },
  'tipping/injury-card': { was: 'fit', cam: 'liver', floor: 0 },
} satisfies Record<string, FrameFix>);
const ROUTE_SLIDES = ['circulation/ladder', 'circulation/define', 'circulation/path-ladder', 'circulation/relation', 'doppler/a4', 'gradients/where', 'masld/under', 'masld/parts', 'prehepatic/gradients', 'same-gradient/ref', 'same-gradient/up', 'same-gradient/cost', 'sites/healthy', 'tips-candidacy/heart-stent', 'tips-complete/heart', 'two-lesions/together', 'two-lesions/measure'];
for (const k of ROUTE_SLIDES) FRAME_FIXES[k] = { was: 'route', cam: ROUTE_TO_STATIONS, floor: CONTEXT_FLOOR };
FRAME_FIXES['doppler/meal'] = { was: 'gut', cam: [360, 360, 1070, 900], floor: CONTEXT_FLOOR };
/** FRAMING RULE S6 (a whole route): the views that name a route from the gut to the heart and cannot draw its veins 8 px wide in the room a phone's cards leave, because the named route is longer than that room (circulation/series: gut veins to the right atrium, 2.9 units, 5.8 px).
 *  Nothing named is cropped for it; the test fails if one no longer needs the exemption. (varices/umbilical's recap of two routes was the other; Mohammad dropped that view, 25 Nov: scripts/source-edits.mjs VARICES_REVIEW.) */
export const WIDE_ROUTES: readonly string[] = ['circulation/series'];
