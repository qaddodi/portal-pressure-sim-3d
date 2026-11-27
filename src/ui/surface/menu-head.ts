// The menu shell's pure rules (surface/Menu.tsx), apart so node tests read them: which menus there are, the 2D class each one wears, its width tier, and what its head holds in each mode.
import type { SurfaceMode } from './mode.ts';
import { SURFACES, type SurfaceId } from './kinds.ts';

/** Every surface of kind `menu` (surface/kinds.ts). */
export type MenuId = { [K in SurfaceId]: (typeof SURFACES)[K]['kind'] extends 'menu' ? K : never }[SurfaceId];
export const MENU_IDS = (Object.keys(SURFACES) as SurfaceId[]).filter((k) => SURFACES[k].kind === 'menu') as MenuId[];

/**
 * The 2D markup each menu keeps, so its lifted stylesheet (src/ui/styles) still draws it: the frame's class, the class it wears as a sheet, the class it leaves by, the class of its
 * head row and of its X (2D's own, kept beside the shell's `sf-x`).
 *   menu   2D util.js popover / menuPush: `.menu`, `.as-sheet`, `.leaving`, `.sheet-head` (Settings, Help, From readings, Blood, Layers, lens, speed, jump to)
 *   umenu  2D menu.js: `.umenu`, `.sheet`, `.out`, `.um-top` with `.um-x` (the main menu)
 *   jump   2D presenter.js toggleJump: `.pz-jump`, `.pz-leave`, `.pzj-h` (the presenter's slide list; its sheet look is the deck's own `.pz.stack .pz-jump`)
 */
export const MENU_SKINS = {
  menu: { base: 'menu', sheet: 'as-sheet from-dock', leaving: 'leaving', head: 'sheet-head', title: 'sheet-t', x: '' },
  umenu: { base: 'umenu', sheet: 'sheet', leaving: 'out', head: 'um-top', title: '', x: 'um-x' },
  jump: { base: 'pz-jump stage-blocker', sheet: '', leaving: 'pz-leave', head: 'pzj-h', title: '', x: '' },
} as const;
export type MenuSkin = keyof typeof MENU_SKINS;

/** The width tiers (surface/menu.css --menu-s, --menu-m, --menu-l): popover rows; Settings, Help and Layers; the main menu and the slide list. A sheet is as wide as the dock. */
export type MenuWidth = 's' | 'm' | 'l';
export const MENU_WIDTH_PX: Record<MenuWidth, number> = { s: 280, m: 360, l: 460 };

export interface HeadOpts {
  /** the menu has a field that stands in its title's place (the main menu's search) */ field?: boolean;
  /** the head shows when it floats too (the slide list's deck title) */ always?: boolean;
}
export interface Head { grab: boolean; head: boolean; title: 'title' | 'field' | null; x: boolean }

/**
 * What the head of a menu holds. A sheet always has one grab bar, its title (or the field in the title's place) and one X: the X is never the only way to close it and a pull is
 * never the only way either (owner, 27 Nov, section 6 question 2). A floating menu has no head unless it has a field or asks for one (`always`); then it has the title or field and the X.
 */
export function headOf(mode: SurfaceMode, { field = false, always = false }: HeadOpts = {}): Head {
  const head = mode === 'sheet' || field || always;
  return { grab: mode === 'sheet', head, title: head ? (field ? 'field' : 'title') : null, x: head };
}
