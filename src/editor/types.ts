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
export interface OrganEdit { move?: V3; rotY?: number; scale?: number; strokes?: readonly Stroke[] }
export interface Overrides { version: 1; nodes?: Record<string, NodeMove>; vessels?: Record<string, VesselEdit>; organs?: Record<string, OrganEdit> }
export const EMPTY: Overrides = { version: 1 };
/** Limits (scene units, radians): an organ moves at most this far from its reference; a liquified vertex at most LIQUIFY_LIMIT from its reference place. */
export const ORGAN_LIMITS = { move: 0.15, rotY: 0.35, scaleMin: 0.85, scaleMax: 1.15 } as const;
export const LIQUIFY_LIMIT = 0.04;
