// The view pills (Circuit, Anatomy, Lobule, Sinusoid) and what a tap on one does, as the 2D app does it (view-tap.js and main.js wireViewSeg):
//  - a second tap on the active view refits it (Mohammad, 17 Nov: "Second tap on active view = refit");
//  - the pill shows the current view and its neighbours on the path Circuit - Anatomy - Lobule - Sinusoid (20 Nov: Circuit has Anatomy, Anatomy has Circuit and Lobule, Lobule has Anatomy and Sinusoid, Sinusoid has Lobule);
//  - A turns the figure between Anatomy and Circuit (not in the sinusoid).
import { UI } from '../strings.generated.ts';

export type ViewId = 'circuit' | 'anatomic' | 'lobule' | 'sinusoid';
/** The pills, left to right, with the 2D app's words. */
export const VIEWS: readonly { id: ViewId; label: string }[] = UI.views.map((v) => ({ id: v.id as ViewId, label: v.label }));

export type ViewTap = { type: 'refit' } | { type: 'go'; view: ViewId; from: ViewId };

/** What a tap on pill `tapped` does while the view is `cur`. */
export function tapView(tapped: ViewId, cur: ViewId): ViewTap {
  if (tapped === cur && cur !== 'sinusoid') return { type: 'refit' };   // (inside the sinusoid even its own pill does not refit: the 2D rule)
  return { type: 'go', view: tapped, from: cur };
}

/** The views as a path, in the pill's order: Circuit - Anatomy - Lobule - Sinusoid. A view is one step from the one beside it, and no more (Mohammad, 20 Nov). */
export const VIEW_PATH: readonly ViewId[] = ['circuit', 'anatomic', 'lobule', 'sinusoid'];

/** The views one step from `cur` along the path: Circuit has Anatomy; Anatomy has Circuit and Lobule; Lobule has Anatomy and Sinusoid; Sinusoid has Lobule. */
export function neighbours(cur: ViewId): ViewId[] {
  const i = VIEW_PATH.indexOf(cur);
  return [VIEW_PATH[i - 1], VIEW_PATH[i + 1]].filter((v): v is ViewId => !!v);
}

/** The pill shows the view it is on, selected, and its neighbours; nothing else (one rule for every view). */
export const pillHidden = (id: ViewId, cur: ViewId): boolean => id !== cur && !neighbours(cur).includes(id);

/** The A key: Anatomy and Circuit turn into each other; nothing from the lobule or the sinusoid views (the 2D app's key does not apply there either). */
export function toggleKey(cur: ViewId): ViewId | null {
  if (cur === 'circuit') return 'anatomic';
  if (cur === 'anatomic') return 'circuit';
  return null;
}

/** Zoom in is off inside the sinusoid; its zoom buttons read other words there (the 2D app's ZOOM_TITLES). */
export const zoomInDisabled = (cur: ViewId): boolean => cur === 'sinusoid';
