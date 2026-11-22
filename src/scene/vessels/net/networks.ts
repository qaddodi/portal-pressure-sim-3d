// The connected networks of a skeleton, in a file of their own so the page can partition the figure without importing the mesher (mesh.ts re-exports it for the bake).
import type { Skeleton } from './types.ts';

/** The connected networks of a skeleton: each a list of edge indices (every edge sharing a node is in one). */
export function networksOf(skel: Skeleton): number[][] {
  const parent = skel.edges.map((_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]!]!; i = parent[i]!; } return i; };
  for (const nd of skel.nodes) for (let i = 1; i < nd.edges.length; i++) parent[find(nd.edges[i]!.edge)] = find(nd.edges[0]!.edge);
  const groups = new Map<number, number[]>();
  skel.edges.forEach((_, i) => { const r = find(i), g = groups.get(r); if (g) g.push(i); else groups.set(r, [i]); });
  return [...groups.values()];
}
