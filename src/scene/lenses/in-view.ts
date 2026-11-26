// Which colour lens each view can show, and what its colour means there: the ONE table the lens menu, the colour key, the lens key's cycling (L) and each view's painter read, so a
// view can never offer a lens it does not draw, nor draw one its key does not name (owner, 26 Nov: "unify the lenses so all the other lenses are also available in the sinusoid view").
//
// Each row is a lens, each column a view; a cell says in plain words what that lens colours in that view, or null where the lens has no meaning there. A view that is asked for a lens it does not
// define shows the one it falls back to (`shownLens`), and its key names that one, never the lens that was asked for.
//
// The Sinusoid's cells, from first principles (one stretch from the middle of one sinusoid, ~100 µm of it; the engine's sinusoid node is that "average" sinusoid):
//   Pressure, Change, Congestion, Since   the lumen, by the sinusoid's pressure (P2), or its change from the reference: the pressure the plates and the space of Disse sit under.
//   Pressure drop                         the lumen, by the pressure lost across the sinusoidal bed (P2 - P3): the share of the gradient the sinusoids hold.
//   Flow volume                           the lumen, by the flow through the whole sinusoidal bed (the Lobule's own number): one sinusoid carries nanolitres, so no number for it alone.
//   Velocity                              the lumen, by the blood's speed against healthy, the speed the red cells already run at.
//   Flow direction                        the lumen, toward the central vein or reversed (the cells already run the way it says).
//   Oxygen                                the lumen, by the saturation at the sinusoid node (between zone 1's and zone 3's).
//   Blood origin, First pass              not the lumen: portal and arterial blood have MIXED by the time they are in a sinusoid, so there are no streams side by side to draw. Each red cell
//                                         instead wears its source's colour, in the shares the model gives halfway along the sinusoid (First pass: halfway through being cleared).
//                                         The lumen goes grey under them, as the Lobule's does.
//   System (a slide's)                    no meaning: the sinusoid is where the portal and the caval systems meet, it belongs to neither. Falls back to Pressure.
//   Anatomy (no colour)                   the 2D sinusoid's own pressure colour (it has no uncoloured lumen). Falls back to Pressure.
//
// The experiment flag: LENSES_EVERYWHERE = false puts the Sinusoid back to Pressure only (its lens button locked, as before 26 Nov). Nothing else reads it.
import type { LensId } from './model.ts';

/** The experiment (owner, 26 Nov): every lens of the menu in the Sinusoid view too. False: the Sinusoid shows Pressure only, as before. */
export const LENSES_EVERYWHERE = true;

/** The figure's views (the shell's ViewId: ui/shell/views.ts). */
export type LensView = 'circuit' | 'anatomic' | 'lobule' | 'sinusoid';
export const LENS_VIEWS: readonly LensView[] = ['circuit', 'anatomic', 'lobule', 'sinusoid'];

type Row = Record<LensView, string | null>;
const vessels = (what: string, lobule: string, sinusoid: string | null): Row => ({ circuit: what, anatomic: what, lobule, sinusoid });

/** What each lens colours in each view (null: the lens has no meaning there). */
export const LENS_IN_VIEW: Readonly<Record<LensId, Row>> = {
  pressure: vessels('Each vein by its pressure', 'The portal venule to the central vein, by pressure', 'The lumen, by the sinusoid’s pressure'),
  delta: vessels('Each vein by its change in pressure', 'The lobule’s vessels, by their change in pressure', 'The lumen, by the sinusoid’s change in pressure'),
  heat: vessels('Each vein by its pressure above the reference', 'The lobule’s vessels, by pressure above the reference', 'The lumen, by pressure above the reference'),
  drop: vessels('Each vein by the pressure lost along it', 'Each bed by the pressure lost across it', 'The lumen, by the pressure lost across the sinusoids'),
  flow: vessels('Each vein by how much blood it carries', 'Each bed by how much blood it carries', 'The lumen, by the flow through all the sinusoids'),
  velocity: vessels('Each vein by its speed against its own normal', 'Each bed by its speed against normal', 'The lumen, by the blood’s speed against normal'),
  direction: vessels('Each vein toward the liver or away', 'Each bed forward or reversed', 'The lumen, forward to the central vein or reversed'),
  oxygen: vessels('Each vessel by its oxygen saturation', 'Zone 1 to zone 3, by oxygen saturation', 'The lumen, by the saturation in the sinusoid'),
  origin: vessels('Each vein in streams by where its blood comes from', 'Each bed in streams by where its blood comes from', 'Mixed by here: each red cell wears its source’s colour'),
  firstpass: vessels('Gut blood raw or cleared by the liver', 'Gut blood raw or cleared by the liver', 'Being cleared here: each red cell raw or clear'),
  since: vessels('Each vein by its change since the slide before', 'The lobule’s vessels, by change since the slide before', 'The lumen, by its change since the slide before'),
  // (the Lobule drew the pressure's colours under System while its key named the three systems: it has no meaning there, so it shows Pressure and says so)
  system: { circuit: 'Each vein by its system: portal, systemic, or between them', anatomic: 'Each vein by its system: portal, systemic, or between them', lobule: null, sinusoid: null },
  neutral: { circuit: 'No colour: the vessels’ own tones', anatomic: 'No colour: the vessels’ own tones', lobule: 'The lobule’s own tones', sinusoid: null },
};

/** The lens a view shows when it has none of its own for the one asked (every view defines Pressure). */
export const FALLBACK_LENS: LensId = 'pressure';

/** The Sinusoid's cells when the experiment is off: Pressure only. */
const SINUSOID_BEFORE = new Set<LensId>(['pressure']);

/** What `lens` colours in `view`, in plain words; null where it means nothing there (or the experiment is off for it). */
export function lensIn(view: LensView, lens: LensId, everywhere = LENSES_EVERYWHERE): string | null {
  const row = LENS_IN_VIEW[lens];
  if (!row) return null;
  if (view === 'sinusoid' && !everywhere && !SINUSOID_BEFORE.has(lens)) return null;
  return row[view];
}
/** Whether `view` draws `lens` as itself. */
export const lensOffered = (view: LensView, lens: LensId, everywhere = LENSES_EVERYWHERE): boolean => lensIn(view, lens, everywhere) != null;
/** The lens `view` actually draws when `lens` is the figure's lens: the lens itself where it is defined, Pressure otherwise. The key, the lens button's name and the painter all read this. */
export const shownLens = (view: LensView, lens: LensId, everywhere = LENSES_EVERYWHERE): LensId => (lensOffered(view, lens, everywhere) ? lens : FALLBACK_LENS);
/** The lenses of `menu` (the Layers menu's, in its order) that `view` offers. */
export const lensesFor = (view: LensView, menu: readonly LensId[], everywhere = LENSES_EVERYWHERE): LensId[] => menu.filter((l) => lensOffered(view, l, everywhere));
/** Whether a view's lens button has anything to pick (two or more lenses): with one it is a key only, locked. */
export const lensPickable = (view: LensView, menu: readonly LensId[], everywhere = LENSES_EVERYWHERE): boolean => lensesFor(view, menu, everywhere).length > 1;
/** The menu row's second line in `view`: what the lens colours there, where that differs from the menu's own words (the micro views); null keeps the menu's note. */
export const lensNoteIn = (view: LensView, lens: LensId, everywhere = LENSES_EVERYWHERE): string | null => (view === 'sinusoid' ? lensIn(view, lens, everywhere) : null);
