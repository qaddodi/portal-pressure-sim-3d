// ?stress: the stress capture's plan. One small zip of the moments that matter: key slides, a few frames inside key transitions, the main menus, in a few layouts, with a written report.
// It reuses the capture's own parts (audit/capture-all.ts for the slides, audit/capture-promo-extra.ts for the menus and the history pages, the capture frame and store) and adds
// only what they lack: frames inside a transition (stress/run.ts) and the report (stress/report.ts). Pure here: tests/stress-plan.test.ts runs it in node.
// Sizes (Mohammad, 27 Nov 2026): about 200 pictures a run, 300 at most, one zip that is easy to save from a phone.

// The layouts: the capture frame's device ids (promo/slides.ts PROMO_SIZES). An upright iPhone and iPad take every instrument slide twice (the card
// up, then tucked: capture-model.ts captureViews).
export interface StressLayout {
  id: 'iphone' | 'ipad-portrait' | 'mac'; label: string;
  /** frames inside transitions */
  moves: boolean;
  /** the menus and sheets */
  menus: boolean;
  /** slides take two pictures (card up and tucked) */
  twoViews: boolean;
}
export const STRESS_LAYOUTS: readonly StressLayout[] = Object.freeze([
  { id: 'iphone', label: 'iPhone', moves: true, menus: true, twoViews: true },
  { id: 'ipad-portrait', label: 'iPad', moves: false, menus: false, twoViews: true },
  { id: 'mac', label: 'Mac', moves: true, menus: true, twoViews: false },
]);

/** The pixel ratio of each layout's pictures: the screen's own sharpness would double the zip, and a review does not need it. */
export const STRESS_RATIO = 1;

// Sixteen slides picked for what they risk: tables and charts that must fit a card, the circuit, the procedures, the bleed, the ascites belly, the
// Doppler strips and the long chart. `deck:number`, as the capture's `pick` has it.
export const STRESS_SLIDES: readonly { key: string; why: string }[] = Object.freeze([
  { key: 'circulation:1', why: 'The whole-body figure with a card: the baseline for framing.' },
  { key: 'lobule:4', why: 'The lobule view (made on demand): the figure swaps to another model.' },
  { key: 'hvpg:3', why: 'The catheter in the hepatic vein: a live reading on the card and the figure.' },
  { key: 'circuit:4', why: 'The pressure circuit: the figure, the card and the chart agree on one set of numbers.' },
  { key: 'hyperdynamic:5', why: 'The whole circulation, labelled: the densest set of labels.' },
  { key: 'varices:1', why: 'Collaterals lit on the figure.' },
  { key: 'variceal-bleed:2', why: 'The rupture: the bleed drawn in.' },
  { key: 'variceal-bleed:13', why: 'Figure, algorithm and pressure on one screen.' },
  { key: 'endoscopy:3', why: 'The endoscope view: another kind of picture.' },
  { key: 'ascites:6', why: 'SAAG with the belly filling: a live gauge on the figure.' },
  { key: 'shunts:11', why: 'The stent, the catheter and a live Doppler strip.' },
  { key: 'tips-complete:12', why: 'A procedure: the longest card.' },
  { key: 'tips-doppler:6', why: 'The Doppler instrument at work.' },
  { key: 'doppler:12', why: 'One table that must fit a card.' },
  { key: 'carvedilol:4', why: 'A treatment choice with its buttons on the card.' },
  { key: 'ten-years:18', why: 'The long chart: ten years on one chart.' },
]);

// A transition: the talk is taken to the END of slide `from` (its last beat), then Next is pressed, and the screen is photographed inside the move.
// `from` counts as a stop (the slide number the capture's pick has).
export interface StressMove { id: string; deck: string; from: number; why: string }
export const STRESS_MOVES: readonly StressMove[] = Object.freeze([
  { id: 'circulation-1-2', deck: 'circulation', from: 1, why: 'Slide to slide: the card leaves, the next lands, the camera flies.' },
  { id: 'lobule-3-4', deck: 'lobule', from: 3, why: 'Into the lobule: the figure swaps to a second model.' },
  { id: 'hvpg-2-3', deck: 'hvpg', from: 2, why: 'The catheter arrives.' },
  { id: 'circuit-3-4', deck: 'circuit', from: 3, why: 'The circuit redraws with new values.' },
  { id: 'variceal-bleed-1-2', deck: 'variceal-bleed', from: 1, why: 'The bleed starts.' },
  { id: 'ascites-5-6', deck: 'ascites', from: 5, why: 'The belly fills.' },
  { id: 'shunts-10-11', deck: 'shunts', from: 10, why: 'The stent and the Doppler strip appear.' },
  { id: 'tips-complete-11-12', deck: 'tips-complete', from: 11, why: 'The procedure card replaces the table.' },
  { id: 'doppler-11-12', deck: 'doppler', from: 11, why: 'A table card lands.' },
  { id: 'ten-years-17-18', deck: 'ten-years', from: 17, why: 'The long chart arrives.' },
]);
/** The menu opening is the eleventh transition (no talk: the menu sheet rises over the free figure). */
export const MENU_MOVE_ID = 'menu-open';

/** Where inside a move the pictures are taken: page milliseconds after the press, with the page's clock and every CSS animation slowed (stress/run.ts), then the settled end. */
export const MOVE_FRAMES: readonly { name: 'start' | 'middle'; at: number }[] = Object.freeze([{ name: 'start', at: 60 }, { name: 'middle', at: 300 }]);
/** The slowdown of the clock while a move plays out: a move of 700 ms then takes 14 s of wall time, so a picture (which takes a few hundred ms) moves it by a few ms. */
export const MOVE_SLOW = 0.05;
/** A move's pictures: start, middle, end. */
export const MOVE_SHOTS = MOVE_FRAMES.length + 1;

/** The menus and pages (promo/slides.ts keys: the menu on its tabs, one case's chart, timeline and fourth stop), and the sheets opened over the free figure. */
export const STRESS_MENUS: readonly string[] = Object.freeze(['overview', 'overview:patients', 'overview:histories', 'history:hist-ascites:chart',
  'history:hist-ascites:timeline', 'history:hist-ascites:4']);
export const STRESS_SHEETS: readonly ('settings' | 'help' | 'search')[] = Object.freeze(['settings', 'help', 'search']);

/** Never more pictures than this in one run. */
export const PICTURE_CAP = 300;

/** The progress units of a layout: a slide is one, a picture of a move is one, a menu or sheet is one. The outer page adds them up for the bar's percentage and ETA. */
export function layoutSteps(l: StressLayout): number {
  return STRESS_SLIDES.length + (l.moves ? (STRESS_MOVES.length + 1) * MOVE_SHOTS : 0) + (l.menus ? STRESS_MENUS.length + STRESS_SHEETS.length : 0);
}
/** About how many pictures a layout makes (a slide with no instrument card has one view, so this is a ceiling). */
export function layoutPictures(l: StressLayout): number {
  return STRESS_SLIDES.length * (l.twoViews ? 2 : 1) + (l.moves ? (STRESS_MOVES.length + 1) * MOVE_SHOTS : 0) + (l.menus ? STRESS_MENUS.length + STRESS_SHEETS.length : 0);
}
export const stressSteps = (ls: readonly StressLayout[] = STRESS_LAYOUTS): number => ls.reduce((n, l) => n + layoutSteps(l), 0);
export const stressPictures = (ls: readonly StressLayout[] = STRESS_LAYOUTS): number => ls.reduce((n, l) => n + layoutPictures(l), 0);

/** The sections of a run's notes, and the folder of each in a layout's folder. */
export const SECTIONS = [
  { id: 'slides', title: 'Key slides', file: 'slides.md' },
  { id: 'moves', title: 'Transitions', file: 'animations.md' },
  { id: 'menus', title: 'Menus and sheets', file: 'menus.md' },
] as const;
export type SectionId = (typeof SECTIONS)[number]['id'];

/** The address of a layout's frame: the capture frame (`?audit=capture`) asked for the stress run. */
export function stressFlag(l: StressLayout): string { return `stress=${l.id}`; }
/** The layout a `stress=` value names, or null. */
export const layoutOf = (v: string | null | undefined): StressLayout | null => STRESS_LAYOUTS.find((l) => l.id === v) ?? null;
