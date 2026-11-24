// The anatomy editor's overrides (?editor, preview only): the ONE contract between the editor's workstreams (/mnt/project-files/editor-plan/PLAN.md).
// Units: vessel offsets are in 2D plan units (the units of paths.copied.ts, before frame2d x3/y3) plus a scene-unit depth dz; organ edits are in scene units.
export type V2 = readonly [number, number];
export type V3 = readonly [number, number, number];
/** A node (a junction in the engine topology, by node id) moved: every vessel end at that node follows, eased along each arm (smooth joins, no mesh). */
export interface NodeMove { dx: number; dy: number; dz?: number }
/** One vessel's course edited: control-point offsets at `u` (0..1 along its plan course), blended smoothly between neighbours; ends stay with their node. */
export interface VesselEdit { pts: readonly { u: number; dx: number; dy: number; dz?: number }[] }
/** One liquify stroke on an organ: vertices within `radius` of `at` move by `by` times a smooth falloff; total displacement is clamped by LIQUIFY_LIMIT. */
export interface Stroke { at: V3; radius: number; by: V3 }
/** One organ moved as a whole (constrained by ORGAN_LIMITS) and optionally liquified. */
/** A coarse free-form-deformation cage over an organ's reference bounding box (padded 10%): `n` control points per axis (2..5), `d` their offsets (scene units, x fastest: index i + nx*(j + ny*k)), blended by Bernstein polynomials, so a handle moves a large region smoothly. */
export interface Cage { n: readonly [number, number, number]; d: readonly V3[] }
/** Liquify strokes baked into a displacement grid (nothing is dropped and no per-stroke cost is paid at load): `n` samples per axis over the box `lo`..`hi` (reference frame), `d` the offsets (scene units, xyz per sample, x fastest), read back with a smooth Catmull-Rom blend; zero outside the box. */
export interface Grid { n: readonly [number, number, number]; lo: V3; hi: V3; d: readonly number[] }
export interface OrganEdit { move?: V3; rotY?: number; scale?: number; strokes?: readonly Stroke[]; cage?: Cage; grid?: Grid }
export interface Overrides { version: 1; nodes?: Record<string, NodeMove>; vessels?: Record<string, VesselEdit>; organs?: Record<string, OrganEdit> }
export const EMPTY: Overrides = { version: 1 };
/** Limits (scene units, radians): an organ moves at most this far from its reference; a liquified vertex at most LIQUIFY_LIMIT from its reference place. */
export const ORGAN_LIMITS = { move: 0.15, rotY: 0.35, scaleMin: 0.85, scaleMax: 1.15 } as const;
export const LIQUIFY_LIMIT = 0.04;
/** The cage's box is the organ's reference box grown by this share on every side; a handle moves at most this share of the padded box's size on an axis. */
export const CAGE_PAD = 0.1;
export const CAGE_LIMIT = 0.35;
/** More strokes than this on one organ are folded into its grid (the strokes' own cost is per vertex, the grid's is fixed); the grid's samples per axis; the most its offsets may add. */
export const FOLD_AT = 24;
export const GRID_N = 16;
export const GRID_LIMIT = 0.12;
