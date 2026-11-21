// The surface rung for the shunts' nodes (FINAL-WELD-PLAN option A, 21 Nov 2026). A growing arm that fails to build on its trunk (the hull of the seam rings refuses, no ring clears the blend, the first sheet folds) is not dropped at once: the same junction is tried
// once more meshed from the surface itself (sheet.ts, `SkinJunction.surface`), its seams placed by the clearance alone. The Circuit does this for every node (circuit/skins.ts `surfaced`); the Anatomy does it for the nodes listed here, the distal splenorenal
// shunt's two ends, the DIPS and the TIPS, whose static full-size arms the owner asked to weld ("weld all"). A node that fails again loses its narrowest growing arm as before and is named.
import type { SkinJunction } from './types.ts';

/** The nodes whose failed growing arm gets the surface rung before it is dropped (a merged skin counts when one of its nodes is here). */
export const SURFACE_FIRST: ReadonlySet<string> = new Set(['SVD', 'LRV_S', 'PVH', 'RHV_T']);

export class SurfaceRung {
  private readonly nodes = new Set<string>();
  clear(): void { this.nodes.clear(); }
  /** Whether a junction (or the merge of nodes of which one is surfaced) is meshed from the surface: the hull of its seam rings is not asked for. */
  on(j: SkinJunction): boolean { return !!j.surface || j.node.split('+').some((n) => this.nodes.has(n)); }
  /** A junction that failed: puts its node on the rung when it may and has not been (true: plan it again as it is). */
  retry(node: string, j: SkinJunction): boolean {
    if (this.nodes.has(node) || !SURFACE_FIRST.has(node) || !j.arms.some((a) => a.grow)) return false;
    this.nodes.add(node); return true;
  }
  /** The plan with its junction marked `surface`, so the mesher starts the sheet on the surface (mesh.ts `fromSurface`). */
  mark<P extends { junction: SkinJunction }>(plan: P): P { return this.on(plan.junction) && !plan.junction.surface ? { ...plan, junction: { ...plan.junction, surface: true } } : plan; }
  /** The node leaves the rung (its growing arm was dropped: without it the hull may cover the rings again). */
  release(node: string): void { this.nodes.delete(node); }
}
