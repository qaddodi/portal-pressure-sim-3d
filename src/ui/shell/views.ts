// The view pills (Circuit, Anatomy, Lobule, Sinusoid) and what a tap on one does, as the 2D app does it (view-tap.js and main.js wireViewSeg):
//  - a second tap on the active view refits it (Mohammad, 17 Nov: "Second tap on active view = refit");
//  - the pill always shows every view of VIEWS (Mohammad, 26 Nov: "always have all the 4 options, since we can transition between all of them smoothly now"; it showed only the
//    current view and its neighbours on the path from 20 Nov, when the dive could not yet go from any view to any other);
//  - A turns the figure between Anatomy and Circuit (not in the sinusoid).
import { UI } from '../strings.generated.ts';

export type ViewId = 'circuit' | 'anatomic' | 'lobule' | 'sinusoid';
/** The pills, left to right, with the 2D app's words. */
export const VIEWS: readonly { id: ViewId; label: string }[] = UI.views.map((v) => ({ id: v.id as ViewId, label: v.label }));

/** The search's title for a view ("Sinusoid view"): the one rule, so the search lists every view of VIEWS and a new view is found the day it is added. */
export const viewCommandTitle = (v: ViewId): string => `${UI.views.find((x) => x.id === v)!.label} view`;
/** Extra words that find a view in the search (the 2D inventory's own words where it lists the view; the sinusoid is not in 2D's list). */
export const VIEW_WORDS: Record<ViewId, string> = {
  circuit: 'schematic map',
  anatomic: 'anatomy body',
  lobule: 'microcirculation lobule zoom',
  sinusoid: 'microcirculation sinusoid hepatocyte zoom lobule',
};

export type ViewTap = { type: 'refit' } | { type: 'go'; view: ViewId; from: ViewId };

/** What a tap on pill `tapped` does while the view is `cur`. */
export function tapView(tapped: ViewId, cur: ViewId): ViewTap {
  if (tapped === cur && cur !== 'sinusoid') return { type: 'refit' };   // (inside the sinusoid even its own pill does not refit: the 2D rule)
  return { type: 'go', view: tapped, from: cur };
}

/** The view pill shows every view of VIEWS from any view (one rule, one list: a view added to VIEWS is on the pill the same day). */
export const pillViews = (): readonly ViewId[] => VIEWS.map((v) => v.id);

/** The A key: Anatomy and Circuit turn into each other; nothing from the lobule or the sinusoid views (the 2D app's key does not apply there either). */
export function toggleKey(cur: ViewId): ViewId | null {
  if (cur === 'circuit') return 'anatomic';
  if (cur === 'anatomic') return 'circuit';
  return null;
}

/** Zoom in is off inside the sinusoid; its zoom buttons read other words there (the 2D app's ZOOM_TITLES). */
export const zoomInDisabled = (cur: ViewId): boolean => cur === 'sinusoid';
