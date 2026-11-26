// What the scene's parts share: its constants and small helpers, moved from scene.ts as they were (scene.ts re-exports the ones other files import).
import { type BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { type NetVessel, NETWORK } from '../vessels/network.ts';
import { originsOf } from '../vessels/starts.ts';
import { type JoinsMode } from '../vessels/skin/joins-mode.ts';
import { neighbourAttr, NBR_STRIDE } from '../vessels/neighbour.ts';
import { type FlowMarkMode } from '../flow.ts';
import { type LookId } from '../palette.ts';
import { EDGES } from '../../engine/hales/portal/topology.js';
import { type ModelSource } from '../model-source.ts';
import { LOBULE_SCALE, lobuleWorld, sinusoidWorld } from '../lobule/frames.ts';
import { LOBULE_R, LOBULE_T, SINUSOID_L } from '../lobule/shots.ts';
import type { Vec3 } from '../anatomy/vessels.ts';
import { VB_CIRC } from '../circuit/data.copied.ts';


/**
 * A hepatic vein that opens into the cava dissolves over the last 0.8 of a cava radius before its wall (shaders.ts cavA) and is not there inside it: its flow marks are
 * held back from where the dissolve starts, 1.8 cava radii from the vein's end (times the marks' ramp, 2.0 to 3.6, shaders.ts markK), so no chevron is ever caught half
 * faded in it (eyes, v11).
 */
export const CAVA_BURY = 0.9;

/** The ascending lumbar collateral, drawn like the cava (fades.ts CAVA_LIKE) but named on its own. */
export const LUMBAR_ID = 'C9';

export const CIRC_MID: readonly [number, number] = [VB_CIRC[0] + VB_CIRC[2] / 2, VB_CIRC[1] + VB_CIRC[3] / 2];

/** What the figure shows: the body, the Circuit (the body's vessels flown onto a flat map), the liver lobule (hexagon) or one sinusoid. The two small views stand INSIDE the liver (the lobule in the liver, the sinusoid in the lobule). */
export type FigureView = 'body' | 'circuit' | 'lobule' | 'sinusoid';

/** Baseline engine flows (mL/s, topology Q) the scene shows until an engine frame binds real data. */
export const STUB_Q: Record<string, number> = {
  V_SPL: 5, SV_MID: 5, SV_CONF: 6.7, SMV_CONF: 10, LGV_CONF: 1.6, PV_TRUNK: 18.3, PVH_R: 11, PVH_L: 7.3,
  RHV_IVC: 9, MHV_IVC: 8.2, LHV_IVC: 7, IVC_IS: 34.3, IVCS_RA: 59.3, SVC_RA: 24,
};

/** The body dissolves as the camera goes into the liver: whole at DIVE_OUT scene units from the lobule's place, gone at DIVE_IN (the right lobe's surface is about 0.85 from it). */
// (DIVE_IN follows the lobule's scale: the body is gone only when the camera is a few lobule-fits away, where the lobule's field starts to fill the screen. A fixed 0.7 left
//  the screen showing the bare page between the body going and the 1/1500 lobule growing: the near-white flash in the Anatomy -> Lobule dive.)
/** The dive share (sinusoid/view.ts diveShare) below which nothing of the sinusoid is drawn on the way in from the lobule. */
export const SIN_SHOW_FROM = 0.2;
   // (the focus pull's start, sinusoid3d FOCUS[0]: the scene is up, its parts not yet drawn, its blur band working)
/** The dive share from which the 3D lobule stands aside under the sinusoid: once the sinusoid (sinusoid3d.ts, whole from 0.86) covers it. */
export const LOBULE_UNDER_FROM = 0.7;

export const DIVE_OUT = 1.9, DIVE_IN = 40 * LOBULE_SCALE;
/** The figure's front (scene z): every organ's front face is at or behind it (organs/meshes.ts) and every vessel lies behind it too (frame2d.ts TIER_Z, the radius included). */
// (the dive's body is gone before the camera reaches this plane: nothing the camera flies through is ever drawn. Before, the body was still a third drawn when the camera went
//  through the liver's surface and then the right sinusoids' bed, and each surface was cut by the near plane for a frame: a straight-edged dark sheet across the screen, Mohammad 26 Nov)
export const FIGURE_FRONT_Z = 0.26;
/** How far before that plane the last of the body has gone (a share of the distance to it): the dissolve's tail is never at the surface. */
export const FRONT_MARGIN = 1.15;

/** How much of the body is drawn with the camera `d` scene units from the lobule's place: 1 whole, 0 gone (smoothstep between DIVE_IN and DIVE_OUT). */
// (in log distance: the zoom is geometric, so the dissolve runs evenly through the whole dive instead of all at once at its end)
export function bodyFade(d: number, inner = DIVE_IN): number { const t = d <= 0 ? 0 : Math.min(1, Math.max(0, Math.log(d / inner) / Math.log(DIVE_OUT / inner))); return t * t * (3 - 2 * t); }

/** The corners (scene units) of the lobule's box and of the sinusoid's: what the hand's pan and zoom keep on screen while each is the view. */
export function lobuleCorners(): Vec3[] {
  const out: Vec3[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) out.push(lobuleWorld([sx * LOBULE_R, sy * LOBULE_R * 0.866, sz * LOBULE_T / 2]) as Vec3);
  return out;
}

export function sinusoidCorners(): Vec3[] {
  const out: Vec3[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) out.push(sinusoidWorld([sx * (SINUSOID_L / 2 + 0.3), sy * 1.4, sz * 1.0]) as Vec3);
  return out;
}

/** Healthy diameter of every topology edge (mm), the reference the engine's live diameter swells against. */
export const BASE_D = new Map<string, number>((EDGES as { id: string; d?: number }[]).map((e) => [e.id, e.d ?? 1]));

export interface SceneOptions {
  look?: LookId;
  phone?: boolean;
  flowMode?: FlowMarkMode;
  reduceMotion?: boolean;
  /** Which junction method to draw (vessels/skin/joins-mode.ts): the page's `?joins` and the default when left out. A test hands one in. */
  joins?: JoinsMode;
  /** Where the patient is read from: the engine's shared state by default; the split orbit's second figure hands in its own (model-source.ts). */
  source?: ModelSource;
  /** Build in slices (boot): the constructor makes nothing; `finishSliced` runs the build one small step per task, and `finishNow` all of it at once. Left out, the constructor builds everything (every test, the split orbit's twin). */
  sliced?: boolean;
}

/** A fork's two tubes know each other (vessels/neighbour.ts): `nbr` on every vertex. */
export function withNeighbour(id: string, g: BufferGeometry): void {
  // (every tube carries it, zeros where it has no mate: a junction is a fork only with Smooth vessel joins on, and a toggle rewrites the tubes in place, which needs the attribute to be there either way)
  const a = neighbourAttr(id, g.getAttribute('position').array) ?? new Float32Array(g.getAttribute('position').count * NBR_STRIDE);
  g.setAttribute('nbr', new Float32BufferAttribute(a, NBR_STRIDE));
}

/** How long one slice of the micro views' preparation keeps taking small steps (ms): under a quarter of a frame. */
export const SLICE_MS = 4;

/** How long the body takes to hand over to the dive's parts if they become ready with the camera already inside (ms). */
export const DIVE_READY_MS = 350;

export const NETWORK_MATE: ReadonlyMap<string, NetVessel> = new Map(NETWORK.map((v) => [v.id, v]));

export const ORIGIN_FED: readonly NetVessel[] = NETWORK.filter((v) => !v.feeder && originsOf(v.id).length > 0);

/** The camera layer of everything drawn over the organs: the vessels, the catheter, the varices. */
/** The organs a tap opens a card for in the body view (2D ORGAN_KEYS: the heart, the liver, the spleen; the heart is two meshes). */

/** Where each named place is: the vessel's id and how far along its 2D course (0 to 1). */
export const ANCHORS = {
  ra: ['SVC_RA', 1], ivc: ['IVC_IS', 0.5], rhv: ['RHV_IVC', 0.5], pv: ['PV_TRUNK', 0.5], spleen: ['V_SPL', 0],
} as const satisfies Record<string, readonly [string, number]>;

/** 0 below a, 1 above b, smooth between. */
export function smoothstep01(a: number, b: number, x: number): number { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

export const _bA = new Vector3(), _bB = new Vector3(), _bE0 = new Vector3(), _bE1 = new Vector3(), _bEnds = { mid: new Vector3(), f0: new Vector3(), f1: new Vector3() };
