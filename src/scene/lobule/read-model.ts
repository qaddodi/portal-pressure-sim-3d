// The pressures the lobule's and the sinusoid's names print, one source for both views. On a slide the names read the slide's own state (its fingerprint's node pressures,
// `fp.at.P`: the breath and beat averaged readings the slide's cards print), never the live frame, whose pressure pulses with every beat: the sinusoid read 22.6 on the figure and 22.1
// on its card (Lobule deck, slide 5.2, 23 Nov). Off a slide (free play) the live model stands, as before, and moves with the pulse and the treatments.
import { NODES } from '../../engine/hales/portal/topology.js';

const NI: Record<string, number> = Object.fromEntries((NODES as { id: string }[]).map((n, i) => [n.id, i]));
/** The nodes the three names stand on (model.ts LOBE: the portal venule, the sinusoids, the central vein). */
const AT = { P1: NI.RPV!, P2: NI.SIN_R!, P3: NI.CV_R! } as const;

let slide: ArrayLike<number> | null = null;
/** The slide on screen gives its state's node pressures (null off a slide, or before its state is in). */
export function setSlidePressures(P: ArrayLike<number> | null): void { slide = P; }

/** The model the names read: the live one with its three pressures replaced by the slide's, when a slide's state is in. The same object when there is none. */
export function readModel<M extends { P1: number; P2: number; P3: number }>(m: M | null | undefined): M | null | undefined {
  if (!m || !slide) return m;
  const a = slide[AT.P1], b = slide[AT.P2], c = slide[AT.P3];
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return m;
  return { ...m, P1: a!, P2: b!, P3: c! };
}
