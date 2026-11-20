// Which stations the figure names in free play, as the 2D app decides it (stage-label-solve.js 551-585, stage-labels.js flagged): the Key level names the three key stations (CONF, SIN_R, RHV), the
// stations the patient's findings flag, and the hepatic artery; every other chip station is `minor` on a wide screen (shown whole beside its vessel, with no leader, or not at all); zoomed in, or at
// the All level, the rest of the stations (ANAT_EXTRA) stand too, each only where 80 px (64 compact) around its dot is free of every other. A label level of none names nothing. A slide names exactly
// what it asks for (the controller's `presenting` branch), never this set. Pure: node judges it (tests/labels-free-set.test.ts).
import { LABEL_NAMES as N } from './names.copied.ts';

export const KEY_NODES: readonly string[] = ['CONF', 'SIN_R', 'RHV'];
/** The anatomy's stations on a vein that can reverse: one whose flow has reversed is named (its label carries the mark). */
export const REV_FLAG: readonly string[] = ['CONF', 'SMV', 'SV', 'LPV', 'RPV', 'RHV', 'MHV', 'LHV', 'IMV', 'LGV', 'IVCI'];
export const CHIP_NODES: readonly string[] = N.CHIP_NODES;
export const ANAT_EXTRA: readonly string[] = N.ANAT_EXTRA;
/** The right atrial pressure (mmHg) above which the Findings flag it. */
export const RA_FLAG = 10;
/** The zoom (over the shot's own framing) past which the figure counts as zoomed in (2D: labelRestK > homeAt.k * 1.3), and where it counts as out again (a hand's pinch hovering at the line never flickers the names). */
export const ZOOM_IN = 1.3, ZOOM_OUT = 1.2;
/** The room an extra station needs round its dot, px (2D: 64 on a compact screen, else 80). */
export const extraRoom = (compact: boolean): number => (compact ? 64 : 80);
/** A compact screen (2D: the stage under 700 px wide). */
export const COMPACT_W = 700;

export type LabelLevel = 'none' | 'key' | 'all';

export interface FreeEnv {
  level: LabelLevel;
  zoomed: boolean;
  compact: boolean;
  /** The varices (VAR) and the fundal varices (GV) exist now. */
  hasVar: boolean; hasGv: boolean;
  /** The right atrial pressure now (mmHg), or null. */
  ra: number | null;
  /** Whether the blood in a flagged-able station's vein runs backwards now. */
  reversed(id: string): boolean;
  /** The stations either side of a narrowed vessel (the patient's stenoses). */
  stenosed: readonly string[];
  /** The station the viewer has picked (its id), or null. */
  picked: string | null;
}

export interface FreeSet {
  /** Every station asked for, in 2D's order. */
  show: Set<string>;
  /** The ones never left out for want of room (the flagged, and at the All level every one). */
  must: Set<string>;
  /** Shown whole beside their vessel or not at all. */
  minor: Set<string>;
  /** Stations that stand only where 80 px round their dot is free (in ANAT_EXTRA's order). */
  extra: string[];
  flagged: string[];
}

/** The stations the patient's findings flag (2D `flagged`). */
export function flaggedStations(env: Pick<FreeEnv, 'hasVar' | 'hasGv' | 'ra' | 'reversed' | 'stenosed'>): string[] {
  const out: string[] = [];
  if (env.hasVar) out.push('VAR');
  if (env.hasGv) out.push('GV');
  if (env.ra != null && env.ra > RA_FLAG) out.push('RA');
  for (const id of REV_FLAG) if (env.reversed(id) && !out.includes(id)) out.push(id);
  for (const id of env.stenosed) if (CHIP_NODES.includes(id) && !out.includes(id)) out.push(id);
  return out;
}

export function freeSet(env: FreeEnv): FreeSet {
  const flagged = flaggedStations(env);
  const lvl = env.level, zoomed = env.zoomed;
  const show = new Set<string>(lvl === 'none' ? [] : lvl === 'key' && !zoomed ? [...KEY_NODES, ...flagged] : [...CHIP_NODES, ...flagged]);
  // no varices, no varices callout: a healthy patient's node is only the balance between the coronary vein and the azygos
  if (!env.hasVar) show.delete('VAR');
  if (lvl !== 'none' && env.hasGv) show.add('GV');
  // the hepatic artery is named at every size and zoom (a plain label, the last of the named stations to give way)
  if (lvl !== 'none') show.add('HA');
  const must = new Set<string>(flagged);
  if (lvl === 'all') for (const id of show) must.add(id);
  const minor = new Set<string>(lvl === 'key' && !zoomed && !env.compact ? CHIP_NODES.filter((id) => !show.has(id) && id !== 'VAR') : []);
  for (const id of minor) show.add(id);
  if (env.picked) { show.add(env.picked); minor.delete(env.picked); }
  const extra = lvl !== 'none' && (zoomed || lvl === 'all') ? ANAT_EXTRA.filter((id) => !show.has(id)) : [];
  return { show, must, minor, extra, flagged };
}

/** Which of the extra stations stand: each, in order, only where no other shown station's dot (nor an extra already kept) is within `room` px (2D: a hand's zoom makes room as it comes in). */
export function keepExtras(extra: readonly string[], dots: ReadonlyMap<string, { x: number; y: number }>, others: readonly string[], room: number): string[] {
  const kept: string[] = [];
  const at = (id: string) => dots.get(id);
  for (const id of extra) {
    const a = at(id);
    if (!a) continue;
    if ([...others, ...kept].some((o) => { const b = at(o); return !!b && Math.hypot(b.x - a.x, b.y - a.y) < room; })) continue;
    kept.push(id);
  }
  return kept;
}
