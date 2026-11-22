// The one contract the vessel-geometry threads share (docs: /mnt/project-files/recs-22nov/vessel-geometry-review.md, "net/types.ts"). Everything under net/ is the `?geom=net` path; the old
// tubes and skins stay the default until Mohammad has seen it. WP0 (skeleton.ts) produces a `Skeleton`; WP2 (mesh.ts) turns it into a `NetMesh`; WP1 packs bones and edge state into textures.
import type { Vec3 } from '../../anatomy/vessels.ts';
import type { NetTone, Tier } from '../network.ts';

/** One sample of an edge's centreline (a "bone"): its place in both poses (body, map), its rest radius in both, and the frame it is swept in. */
export interface Bone { edge: number; u: number; pos: [Vec3, Vec3]; r: [number, number]; frame: [Vec3, Vec3, Vec3] /* t, n, b at body pose; map frame derived */ }
/** A vessel's centreline between two nodes: `bones` is [first, count] in `Skeleton.bones`. */
export interface SkelEdge { id: string; from: string; to: string; bones: [number, number] /* first, count */; tone: NetTone; tier: Tier }
/** A junction (or a free end): one position per pose. `edges` lists the edge ends that start or end exactly here; `runOn` the two of them (indices into `edges`) that carry on into one another. */
export interface SkelNode { id: string; pos: [Vec3, Vec3]; edges: { edge: number; end: 0 | 1 }[]; runOn?: [number, number] }
export interface Skeleton { nodes: SkelNode[]; edges: SkelEdge[]; bones: Bone[] }
export interface NetMesh { position: Float32Array; bone: Uint16Array /* 4 per vertex */; weight: Float32Array /* 4 */; offset: Float32Array /* 4 × vec3, unit-radius bone frame */; normal: Float32Array /* 4 × vec3: the rest normal in each bound bone's frame (t, n, b components), unit; rotated by the same blend and renormalised, never derived on screen */; index: Uint32Array }
