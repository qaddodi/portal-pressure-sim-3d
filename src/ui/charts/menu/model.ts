// The treatment menu's model (2D tool-menu.js, its pure part): every treatment this patient could get, each worked out on the slide's own state by the engine's 'sequence' (one step a treatment, each
// from the slide's state), drawn as a dot at the PPG it reaches (up) against the liver's flow it costs (across). What is offered follows the patient (menuOptions): a treatment already in place is
// the ring, not a dot; a TIPS is not offered through a clotted trunk; the Meso-Rex only where the slides' own rule allows it; recanalization only for a clotted trunk. The surgical shunts are the same
// parameters the talks and the free sim set (scene/procedures/copied/surgical-shunts.js), so the model is one. The words and rules are the 2D file's.
import { SURGICAL_BY_ID } from '../../../scene/procedures/copied/surgical-shunts.js';
import { procLabel } from '../../../scene/procedures/copied/procedure-names.js';
import { RATE } from '../../deck/from2d/table-marks.js';
import { SEV_OF_RATE } from '../../../engine/hales/portal/pressure-cuts.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Params = Record<string, Any>;
export interface MenuOpt { id: string; name: string; short?: string; patch: Params; has(p: Params): boolean; can(p: Params): boolean }
export interface MenuPoint { id: string; name: string; short: string; ppg: number; liver: number; shunt: number }
export interface MenuWork { pts: MenuPoint[]; base: Record<string, number | null | undefined> | null; name: string }

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const occluded = (p: Params, id: string) => 1 - (1 - (p.stenosis?.[id] || 0)) * (1 - (p.thrombus?.[id] || 0));
const sh = SURGICAL_BY_ID as Record<string, Any>;
const surgical = (id: string, key: string, name: string, short?: string): MenuOpt => ({ id, name, short, patch: sh[key].apply({}), has: (p) => sh[key].on(p), can: (p) => !sh[key].blocked(p) });
const NO_TIPS = (p: Params) => !p.tips?.on && occluded(p, 'PV_TRUNK') < 0.8 && !p.dips?.on;

export const MENU: readonly MenuOpt[] = [
  { id: 'propranolol', name: 'Propranolol', patch: { drugs: { propranolol: true, carvedilol: false } }, has: (p) => !!p.drugs?.propranolol, can: () => true },
  { id: 'carvedilol', name: 'Carvedilol', patch: { drugs: { carvedilol: true, propranolol: false } }, has: (p) => !!p.drugs?.carvedilol, can: () => true },
  { id: 'pse', name: 'Splenic embolization', short: 'Embolization', patch: { splenicRx: 1 }, has: (p) => (p.splenicRx || 0) >= 1, can: (p) => !p.splenicRx },
  { id: 'recanalization', name: 'Recanalization', short: 'Recanalize', patch: { thrombus: { PV_TRUNK: 0 } }, has: () => false, can: (p) => (p.thrombus?.PV_TRUNK || 0) >= 0.5 },
  { id: 'tips8', name: 'TIPS, 8 mm', patch: { tips: { on: true, d: 8 } }, has: () => false, can: NO_TIPS },
  { id: 'tips10', name: 'TIPS, 10 mm', patch: { tips: { on: true, d: 10 } }, has: () => false, can: NO_TIPS },
  { ...surgical('warren', 'warren', procLabel('dsrs') as string), can: (p) => !sh.warren.on(p) },
  surgical('mesocaval', 'mesocaval', 'Mesocaval shunt', 'Mesocaval'),
  surgical('portocaval', 'pc-es', 'Portocaval shunt', 'Portocaval'),
  surgical('rex', 'rex', 'Meso-Rex bypass', 'Meso-Rex'),
];
const BY_ID = Object.fromEntries(MENU.map((m) => [m.id, m]));
/** The ids a slide's `rows` may name (a list offers only those). */
export const MENU_IDS: readonly string[] = MENU.map((m) => m.id);

/** The treatments offered to a patient (their settings): the menu's records in its order, less those already in place or not suited to him; `rows` (the slide's list of ids) offers only those. */
export function menuOptions(params: Params | null | undefined, rows: unknown = null): MenuOpt[] {
  const p = params || {}, want = Array.isArray(rows) ? (rows as string[]).filter((id) => BY_ID[id]) : null;
  return MENU.filter((m) => (!want || want.includes(m.id)) && !m.has(p) && m.can(p));
}
/** The ring's name: the patient with nothing done to him, or as he stands now when something already is. */
export const baseName = (params: Params | null | undefined): string => (MENU.some((m) => m.has(params || {})) ? 'As now' : 'No treatment');
/** The steps for the engine's sequence: each treatment its own change from the slide's state (every step starts again from it). */
export const menuSteps = (opts: readonly MenuOpt[]): { params: Params; restart: true }[] => opts.map((m) => ({ params: m.patch, restart: true }));
/** The dots, in shown units, from the run's states (a treatment the model gave no reading for is left out; null while the run is not whole). */
export function menuPoints(opts: readonly MenuOpt[], outs: readonly { fp?: Record<string, number | null | undefined> }[] | null): MenuPoint[] | null {
  if (!Array.isArray(outs) || outs.length !== opts.length) return null;
  return opts.map((m, i) => ({ id: m.id, name: m.name, short: m.short || m.name, ppg: outs[i]?.fp?.ppg as number, liver: outs[i]?.fp?.liver as number, shunt: outs[i]?.fp?.shunt as number }))
    .filter((q) => Number.isFinite(q.ppg) && Number.isFinite(q.liver));
}
/** The PPG's rating colour token for a dot ('ok', 'caution', 'danger'), from the app's own cut-offs. */
export const ratingTok = (ppg: number): 'ok' | 'caution' | 'danger' => ((SEV_OF_RATE as Record<string, string>)[(RATE as Any).ppg(ppg, {})[0]] || 'ok') as 'ok' | 'caution' | 'danger';
/** A dot's radius for the share of portal blood that bypasses the liver (0 to 1), in px at type size f. */
export const dotRadius = (shunt: number, f: number): number => f * (0.26 + 0.3 * clamp(Number.isFinite(shunt) ? shunt : 0, 0, 1));

/** What the slide's menu is worked out from: the slide's state and the rows it offers (the key a result is kept under). */
export const menuKey = (tool: Params, id: unknown): string => JSON.stringify([id ?? 0, tool.rows ?? null]);
