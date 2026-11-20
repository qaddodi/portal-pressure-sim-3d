// The steps a stacked pair of cards takes when it is too tall for the screen (2D presenter-ladders.js `layout`, a laptop or a tablet on its side): the words' card gives way first, only
// its title (--pz-tk: WIDE.title, then the floor that keeps it a title, card-type.js titleFloorK), the words never; then the data card's blocks step smaller (--pz-dk: DK), never so far
// that the tiles' names go under 12 px (dkFloorOf), the title ladder run again under each. 2D tries them in this order and keeps the first that fits (`steps()` inside `ladder()`).
// Pure: the card layer measures a step, asks whether the pair fits, and asks for the next. What is left when the last step still does not fit is the words' pages and the pair's rise
// into its top margin (layout/plan.ts), as before.
import { WIDE, TITLE_RATIO, titleFloorK, dkFloorOf } from '../layout/rules2d.ts';

/** The data card's block steps (presenter-ladders.js DK). */
export const DK = [0.9, 0.8, 0.7, 0.6] as const;

/** The sizes the ladder reads from the cards at the first step (px at --pz-tk 1 and --pz-dk 1; 0 when the card has no such part). */
export interface PairBase { titlePx: number; bodyPx: number; labelPx: number }
export interface PairStep { tk: number; dk: number }

/** Every step in 2D's order: the title's steps at the full size of the blocks, then at each smaller block step. The first is no step at all (1, 1). */
export function pairSteps({ titlePx, bodyPx, labelPx }: PairBase): PairStep[] {
  const f = titleFloorK(titlePx, bodyPx), a = Math.max(WIDE.title, f);
  const tks = [1, ...(a < 1 ? [a] : []), ...(f < a ? [f] : [])];
  const dkMin = dkFloorOf(labelPx);
  const dks = [1, ...DK.filter((s) => s >= dkMin - 1e-6)];
  return dks.flatMap((dk) => tks.map((tk) => ({ tk, dk })));
}

export { TITLE_RATIO };

/** The custom properties a step writes (the 2D names: the lifted stylesheets read them). Step 0 writes none. */
export const stepVars = (s: PairStep | undefined): Record<string, string | number> | undefined => (s && (s.tk !== 1 || s.dk !== 1) ? { '--pz-tk': s.tk, '--pz-dk': s.dk } : undefined);

/** The data card's own fit, the last step (2D presenter-zoom.js fitEach, dataFloor): the zoom that brings its height `h` to the room `cap` it has, never over 1 and never so far that its smallest
 *  lettering (`minPx`, at a zoom of 1) goes under 12 px on the screen (the floor, 0.5 at the least). A card whose lettering is already at 12 px or less keeps 2D's old floor, half: its last resort
 *  (Shunts 4 at 1024 x 768: the criteria's lettering is 12.0 px and the pair stood 25 px past its foot, a floor of 1 left it there). No height, no room or no lettering known: no fit. */
export function dataFitOf(h: number, cap: number, minPx: number): number {
  if (!(h > 0) || !(cap > 0) || h <= cap) return 1;
  const floor = !Number.isFinite(minPx) ? 1 : minPx > 12 ? Math.max(0.5, Math.ceil((12 / minPx) * 1000) / 1000) : 0.5;
  return Math.max(floor, Math.min(1, (cap / h) * 0.985));
}
