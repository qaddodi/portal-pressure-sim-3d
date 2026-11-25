// A vessel in cross-section (2D: tool-lumen.js, host 'lumen'): the open lumen in the vessel's colour, a clot shaped by its grade (EASL 2025), a narrowing as a
// thicker wall, a stent as a fine ring, and the open share as a percentage. Pure: the picture's numbers from the model's params, the clot's outline, the words,
// and the follower that moves the picture from one state of the model to the next (explicit `now`, so a test can step it).
import { EDGES, STENT_SITES as SITE_U, edgeById, tightSite, JUNCTION_PIECES } from '../../../engine/hales/portal/topology.js';
import { endSiteOf, geomOf, kindOf, profileAt } from '../../../engine/hales/portal/stent-geom.js';
import { MOTION } from '../../../clock/tween.ts';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export interface LumenParams { stenosis?: Record<string, number>; thrombus?: Record<string, number>; stentGeom?: Record<string, unknown>; stenosisSite?: Record<string, string> }

// ── How the picture follows the model: a stream of small steps (a time-lapse, a slider) is followed in a straight line over the stream's own interval; a jump glides ──
export const FOLLOW_JUMP = 0.12, FOLLOW_LONE = 0.01;
export const FOLLOW_STREAM_MS = 320, FOLLOW_MIN_MS = 16, FOLLOW_MAX_MS = 300, FOLLOW_GAP0 = 45;
/** a jump glides over a card's arrival time (the 2D app's D_SURFACE is 420 ms; the 3D app's motion scale gives its cards 280) */
export const FOLLOW_GLIDE_MS = MOTION.cardInMs;
const arrive = (k: number) => 1 - (1 - k) ** 3;

export interface Follow {
  /** the pair shown now: stenosis and thrombus */
  a: number; b: number; ta: number; tb: number; moving: boolean; ms: number; glide: boolean;
  snap(a: number, b: number): void;
  /** the model's value now; true while the picture is still moving */
  goal(a: number, b: number, now: number): boolean;
  /** write the shown pair at `now`; true while it is still moving */
  at(now: number): boolean;
}
export function createFollow(): Follow {
  let fa = 0, fb = 0, t0 = 0, last = -Infinity, gap = FOLLOW_GAP0;
  const f: Follow = {
    a: 0, b: 0, ta: 0, tb: 0, moving: false, ms: 0, glide: false,
    snap(a, b) { f.a = fa = f.ta = a; f.b = fb = f.tb = b; f.moving = false; f.ms = 0; },
    goal(a, b, now) {
      if (a === f.ta && b === f.tb) return f.moving;
      f.at(now);
      const d = Math.max(Math.abs(a - f.a), Math.abs(b - f.b)), since = now - last, stream = since < FOLLOW_STREAM_MS;
      if (stream) gap += (Math.min(FOLLOW_MAX_MS, Math.max(FOLLOW_MIN_MS, since)) - gap) * 0.35; else gap = FOLLOW_GAP0;
      last = now;
      f.glide = d >= FOLLOW_JUMP || (!stream && d >= FOLLOW_LONE);
      f.ms = f.glide ? FOLLOW_GLIDE_MS : gap;
      fa = f.a; fb = f.b; f.ta = a; f.tb = b; t0 = now; f.moving = true;
      return true;
    },
    at(now) {
      if (!f.moving) return false;
      const k = f.ms > 0 ? Math.min(1, Math.max(0, (now - t0) / f.ms)) : 1;
      if (k >= 1) { f.a = f.ta; f.b = f.tb; f.moving = false; return false; }
      const e = f.glide ? arrive(k) : k;
      f.a = fa + (f.ta - fa) * e; f.b = fb + (f.tb - fb) * e;
      return true;
    },
  };
  return f;
}

const STENTS = new Set(['TIPS', 'DIPS']);
export const hasStent = (id: string, stented: readonly string[] | null | undefined) => STENTS.has(id) || (Array.isArray(stented) && stented.includes(id));
const SYSTEMIC = new Set(['RHV_IVC', 'RHV_IVC_1', 'MHV_IVC', 'LHV_IVC', 'IVCS_RA', 'IVCI', 'IVCS']);
export type Kind = 'portal' | 'systemic' | 'artery';
export const kindOfVessel = (id: string): Kind => (SYSTEMIC.has(id) ? 'systemic' : id.startsWith('A_') ? 'artery' : 'portal');

/** A vein split in pieces where a shunt joins it is one vein to a reader: each piece takes its host's entry. */
function withPieces<T>(table: Record<string, T>): Record<string, T> {
  for (const [host, ids] of Object.entries(JUNCTION_PIECES as Record<string, string[]>)) if (table[host] !== undefined) for (const id of ids) if (table[id] === undefined) table[id] = table[host]!;
  return table;
}
const NAME = withPieces<string>({ PV_TRUNK: 'main portal vein', PVH_R: 'right portal vein', PVH_L: 'left portal vein', SV_CONF: 'splenic vein', SV_MID: 'splenic vein', V_SPL: 'splenic vein',
  SMV_CONF: 'superior mesenteric vein', RHV_IVC: 'right hepatic vein', MHV_IVC: 'middle hepatic vein', LHV_IVC: 'left hepatic vein', IVCS_RA: 'inferior vena cava', TIPS: 'TIPS', DIPS: 'DIPS' });
export const lumenName = (id: string): string => NAME[id] || (EDGES as { id: string; label?: string }[]).find((e) => e.id === id)?.label?.toLowerCase() || 'portal vein';
const LABEL = withPieces<string>({ PV_TRUNK: 'Portal vein', PVH_R: 'Right PV', PVH_L: 'Left PV', SV_CONF: 'Splenic vein', SV_MID: 'Splenic vein', V_SPL: 'Splenic vein',
  SMV_CONF: 'SMV', RHV_IVC: 'Right HV', MHV_IVC: 'Middle HV', LHV_IVC: 'Left HV', IVCS_RA: 'IVC', IVCI: 'IVC', IVCS: 'IVC' });
export const STENT_SITES = ['proximal', 'mid', 'distal'] as const;
export type Site = (typeof STENT_SITES)[number];
export const lumenSite = (params: LumenParams, id: string, site?: string | null): Site => ((STENT_SITES as readonly string[]).includes(site ?? '') ? (site as Site) : (tightSite(params, id) as Site));
const CUT_G = { len: 0, waist: 0, trans: 0, red: 0 };
/** A stent's narrowing where it is cut at `site` (0 to 1 of the diameter). */
export function stentCut(params: LumenParams, id: string, site: Site): number {
  const kind = kindOf(edgeById(id));
  if (!kind) return clamp(+(params?.stenosis?.[id] ?? 0) || 0, 0, 1);
  const g = (geomOf as (p: unknown, id: string, k: unknown, out: unknown) => never)(params, id, kind, CUT_G), s = clamp(+(params?.stenosis?.[id] ?? 0) || 0, 0, 1);
  return 1 - profileAt(g, s, (SITE_U as Record<string, number>)[endSiteOf(params, id)]!, (SITE_U as Record<string, number>)[site] ?? 0.5);
}
export const lumenLabel = (id: string, name?: string | null, site: Site = 'distal'): string => (typeof name === 'string' && name.trim())
  || (STENTS.has(id) ? `${site[0]!.toUpperCase()}${site.slice(1)} ${id}` : LABEL[id]) || ((s: string) => s.charAt(0).toUpperCase() + s.slice(1))(lumenName(id));

export interface Lumen { stenosis: number; thrombus: number; occlusion: number; open: number; stent: boolean }
export function lumenOf(params: LumenParams | null | undefined, id: string): Lumen {
  const st = clamp(+(params?.stenosis?.[id] ?? 0) || 0, 0, 1), th = clamp(+(params?.thrombus?.[id] ?? 0) || 0, 0, 1);
  const occlusion = 1 - (1 - st) * (1 - th);
  return { stenosis: st, thrombus: th, occlusion, open: 1 - occlusion, stent: STENTS.has(id) };
}

/** The thrombus a vessel had in the params of an earlier slide (tool.was), or null when it had none: the picture's dashed ghost of what has gone. */
export const ghostThrombus = (params: LumenParams | null | undefined, id: string): number | null => { const t = lumenOf(params, id).thrombus; return t >= 0.05 ? t : null; };

/** The picture in a 100-unit box: the wall's outer edge R, the lumen inside any narrowing (ri), a clot rising from the lower wall to a height of clot × the lumen's diameter. */
export const LUMEN_R = 46, LUMEN_WALL = 5;
export function lumenShape({ stenosis = 0, thrombus = 0 }: { stenosis?: number; thrombus?: number }) {
  const R0 = LUMEN_R - LUMEN_WALL, ri = R0 * clamp(1 - stenosis, 0, 1), t = clamp(thrombus, 0, 1);
  return { cx: 50, cy: 50, R: LUMEN_R, R0, ri, bot: 50 + ri, top: 50 + ri - 2 * ri * t, t };
}
const smooth = (a: number, b: number, x: number) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
export const CLOT_N = 48, CLOT_ARC = 48;
/** The clot's top edge, N + 1 points from the left wall to the right (x, y pairs), its character set by its grade as EASL 2025 draws them. */
function clotEdge(buf: number[], cx: number, cy: number, ri: number, top: number, bot: number, t: number) {
  const N = CLOT_N, level = smooth(0.32, 0.62, t), T = bot - top;
  const amp = Math.min(2.6, ri * 0.13) * Math.sin(Math.PI * t);
  for (let i = 0; i <= N; i++) {
    const u = -Math.cos((Math.PI * i) / N), x = u * ri, half = Math.sqrt(Math.max(0, 1 - u * u)) * ri;
    const lo = cy + half, hi = cy - half, bump = amp * (Math.sin(u * 5.3) * 0.7 + Math.sin(u * 9.1 + 0.4) * 0.3 - Math.sin(0.4) * 0.3);
    const layer = lo - T * Math.pow(Math.max(0, 1 - u * u), 1.6) + bump * (1 - u * u);
    const flat = top + bump * Math.sqrt(Math.max(0, 1 - u * u));
    buf[2 * i] = cx + x; buf[2 * i + 1] = clamp(layer + (flat - layer) * level, hi, lo);
  }
}
/** The clot's outline as points in the 100-unit box: the top edge, then the lumen's lower half back to the left wall. Always the same number of points (a full clot is the whole circle), so a clot that grows glides. */
export const CLOT_POINTS = CLOT_N + 1 + CLOT_ARC;
export function clotPoints(g: { cx: number; cy: number; ri: number; top: number; bot: number; t: number }): number[] {
  const buf: number[] = new Array(2 * CLOT_POINTS).fill(0);
  clotEdge(buf, g.cx, g.cy, g.ri, g.top, g.bot, Math.min(g.t, 1));
  let n = CLOT_N + 1;
  for (let j = 1; j <= CLOT_ARC; j++, n++) { const a = (Math.PI * j) / CLOT_ARC; buf[2 * n] = g.cx + g.ri * Math.cos(a); buf[2 * n + 1] = g.cy + g.ri * Math.sin(a); }
  return buf;
}

/** The words for the state: EASL 2025's grades (Table 4). */
export function lumenWords({ thrombus, stenosis, occlusion, stent }: { thrombus: number; stenosis: number; occlusion: number; stent: boolean }): string {
  if (occlusion >= 0.995) return thrombus >= stenosis ? 'Completely occlusive' : stent ? 'Stent closed' : 'Closed';
  if (thrombus >= 0.05 && thrombus >= stenosis) return thrombus > 0.5 ? 'Partially occlusive' : 'Minimally occlusive';
  if (stenosis >= 0.05) return stent ? 'Stent narrowed' : 'Narrowed';
  return 'Open';
}
const pct = (x: number) => `${Math.round(clamp(x, 0, 1) * 100)}`;
export function lumenFacts({ thrombus = 0, stenosis = 0 }: { thrombus?: number; stenosis?: number }, stentD: number | null = null): string {
  const out: string[] = [];
  if (stentD != null) out.push(`${stentD} mm stent`);
  if (thrombus >= 0.005 && stenosis >= 0.005) out.push(`Clot ${pct(thrombus)}%`, `narrowing ${pct(stenosis)}%`);
  return out.join(' · ');
}
export const pctI = (x: number) => Math.round(clamp(x, 0, 1) * 100);
/** Where the name sits for a filled share: at the centre with nothing filled, easing up as a clot appears; the % and "occluded" fade in under it once it is there. */
export const LUMEN_NAME_Y = 35, LUMEN_NUM_Y = 52, LUMEN_WORD_Y = 68;
export const lumenNameY = (occlusion: number) => 50 + (LUMEN_NAME_Y - 50) * smooth(0, 0.5, Math.max(0, occlusion) / 0.06);
export const lumenNumOpacity = (occlusion: number) => smooth(0.5, 1, Math.max(0, occlusion) / 0.06);
/** The name's and "occluded"'s size in units of the 100-unit picture, for u px per unit: 12 px on screen, held between 9 and 12 units. */
export const wordSize = (u: number) => Math.max(9, Math.min(12, 12 / (u || 1.4)));

/** What the picture says, for a screen reader. */
export const lumenAria = (id: string, occ: number, thr: number, ste: number, stent: boolean) =>
  `${lumenName(id)} in cross-section${stent ? ' with a stent' : ''}: ${occ}% of the lumen occluded, thrombus ${thr}%, stenosis ${ste}%`;

/** The picture's size in the box: 62% of the card's width, at most 176 px and at least 100 (the words stay 12 px on a phone held sideways). */
export const pictureSize = (w: number) => Math.round(Math.max(100, Math.min(0.62 * w, 176)));
