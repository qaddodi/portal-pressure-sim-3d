// Every surface of the app and its kind (menu unification: reports/menu-unification.md section 3). One table, so a new surface has to say what it is, and the rules
// that follow from the kind (what closes it, whether it takes the figure's room, where it stands) are the shells', never its own.
//   menu    choose something, then get back to the figure: closes on a press outside, stands over the figure, takes no room
//   panel   work beside the figure: never closes on a press outside, takes room from the figure (the camera pans to what is left); a column on a wide screen
//   dialog  answer or read before going on: a scrim, closes (cancels) on a press outside, Esc cancels
// Pure: no DOM, no imports beyond types, so node tests load it.

export type SurfaceKind = 'menu' | 'panel' | 'dialog';
/** Where a panel stands on a wide screen: the left column holds what you are looking at, the right the tools you opened, `full` spans the figure (the timeline chart). */
export type Column = 'left' | 'right' | 'full';

export interface SurfaceDef { kind: SurfaceKind; column?: Column; /** the right column's wide tier (Tests' own 500 to 600 px rule) */ wide?: boolean }

export const SURFACES = {
  // menus (useShell.sheet's one slot: one menu at a time)
  menu: { kind: 'menu' }, settings: { kind: 'menu' }, help: { kind: 'menu' }, readings: { kind: 'menu' },
  blood: { kind: 'menu' }, layers: { kind: 'menu' }, lens: { kind: 'menu' }, speed: { kind: 'menu' }, jump: { kind: 'menu' },
  slides: { kind: 'menu' }, 'tips-views': { kind: 'menu' },
  // panels
  tests: { kind: 'panel', column: 'right', wide: true }, treat: { kind: 'panel', column: 'right' },
  history: { kind: 'panel', column: 'right' }, compare: { kind: 'panel', column: 'right' }, why: { kind: 'panel', column: 'right' },
  timeline: { kind: 'panel', column: 'full' }, action: { kind: 'panel', column: 'left' }, stop: { kind: 'panel', column: 'left' },
  // dialogs
  search: { kind: 'dialog' }, guide: { kind: 'dialog' }, reset: { kind: 'dialog' }, about: { kind: 'dialog' }, privacy: { kind: 'dialog' },
  'deck-dialog': { kind: 'dialog' }, 'case-guard': { kind: 'dialog' },
} as const satisfies Record<string, SurfaceDef>;

export type SurfaceId = keyof typeof SURFACES;
export type PanelId = { [K in SurfaceId]: (typeof SURFACES)[K]['kind'] extends 'panel' ? K : never }[SurfaceId];

export const kindOf = (id: SurfaceId): SurfaceKind => SURFACES[id].kind;
export const columnOf = (id: SurfaceId): Column | null => ('column' in SURFACES[id] ? (SURFACES[id] as SurfaceDef).column ?? null : null);
export const isPanel = (id: string): id is PanelId => id in SURFACES && SURFACES[id as SurfaceId].kind === 'panel';

/** Whether a press outside the surface closes it: a menu's and a dialog's do, a panel's never does (the figure under it is what you work on). */
export const closesOnOutsidePress = (id: SurfaceId): boolean => kindOf(id) !== 'panel';

/** The accessible role a panel's box wears: a dialog that is not modal (the figure stays live under it). The shells set it (surface/wire.ts usePanelShell); the Tests card,
 *  which keeps its own place rule, spreads it from here, so no surface outside src/ui/surface/ writes a dialog role of its own (lint surface-outside-shell). */
export const PANEL_ROLE = 'dialog';

/** Whether the surface takes room from the figure (the camera frames the figure in what the panels leave). */
export const takesRoom = (id: SurfaceId): boolean => kindOf(id) === 'panel';
