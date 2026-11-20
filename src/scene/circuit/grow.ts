// How the liver's branches grow as the body turns into the map (and shrink back): the portal venules first, then the sinusoids, then the hepatic venules, each drawing on along its own flow
// (the shader's `reveal`) on the change's own eased share `t`, so they are timed to the camera's glide and never pop (Mohammad, 20 Nov: "those branches should morph into completing the sinusoids").
// Pure: node judges it.

export type GrowStage = 'portal' | 'sinusoid' | 'hepatic';
/** The share of the change each stage grows over: [from, to]. They overlap, so the next starts before the last has finished; all are whole by the time the map has landed. */
export const GROW: Readonly<Record<GrowStage, readonly [number, number]>> = { portal: [0.22, 0.6], sinusoid: [0.4, 0.8], hepatic: [0.58, 0.96] };

/** The stage an edge (or the parent of a branch tree) belongs to: the portal venules PRE_*, the sinusoids SIN_*, the hepatic venules POST_*; none for any other vessel. */
export function stageOf(id: string): GrowStage | null {
  if (id.startsWith('PRE_')) return 'portal';
  if (id.startsWith('SIN_')) return 'sinusoid';
  if (id.startsWith('POST_')) return 'hepatic';
  return null;
}

/** How much of a stage has grown at the change's share `t` (0 body, 1 map): a smoothstep over its window. */
export function growAt(stage: GrowStage, t: number): number {
  const [a, b] = GROW[stage];
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

/** An edge's growth at `t`, or null when it does not grow with the change (it is not one of the liver's branches). */
export function growOf(id: string, t: number): number | null {
  const s = stageOf(id);
  return s ? growAt(s, t) : null;
}
