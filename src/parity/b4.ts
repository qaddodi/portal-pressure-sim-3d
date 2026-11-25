// B4 (organs, disease and collaterals): the organs the figure draws (from the organ file's own manifest: an organ is claimed while the file has its mesh) and each disease look, claimed while the
// code that draws it is in the app. Nothing is "match 2D" here until the owner checks it on his device (matches.ts).
import { ORGAN_IDS } from '../scene/organs/meshes.ts';
import { ORGAN_STYLE } from '../scene/organs/layer.ts';
import { septumAt } from '../scene/organs/liver-shape.ts';
import { infarctAt } from '../scene/organs/vertex-paint.ts';
import { ClampLayer } from '../scene/disease/clamps.ts';
import { Landmarks } from '../scene/disease/landmarks.ts';
import { RED_WALE } from '../scene/disease/strands.ts';
import { AscitesLayer } from '../scene/disease/ascites.ts';
import { BleedLayer } from '../scene/disease/bleed.ts';
import { ClotLayer } from '../scene/disease/clots.ts';
import { StrandLayer } from '../scene/disease/strands.ts';
import { B4_ROWS } from './b4-rows.ts';
import type { Claim } from './claim.ts';

const built: Record<string, boolean> = {
  'liver-cirrhosis': typeof septumAt === 'function', 'liver-congestion': 'liver' in ORGAN_STYLE, 'spleen-size': 'spleen' in ORGAN_STYLE, 'spleen-removed': 'spleen' in ORGAN_STYLE,
  'spleen-infarct': typeof infarctAt === 'function', 'ascites-pool': typeof AscitesLayer === 'function', 'ascites-flank': typeof Landmarks === 'function', 'caput-umbilicus': typeof Landmarks === 'function',
  'stenosis-clamp': typeof ClampLayer === 'function', 'thrombus-clot': typeof ClotLayer === 'function', 'cavernoma': typeof StrandLayer === 'function', 'varices-bands': typeof StrandLayer === 'function',
  'varix-bead': typeof StrandLayer === 'function', 'red-wale': RED_WALE.length === 3, 'bleed-stream': typeof BleedLayer === 'function', 'bleed-pool': 'stomach' in ORGAN_STYLE,
  'sin-strands': typeof StrandLayer === 'function', 'lens-grey': 'liver' in ORGAN_STYLE,
};
export const claims: readonly Claim[] = B4_ROWS.filter((r) => r.id.startsWith('organ:') ? ORGAN_IDS.includes(r.id.slice(6)) : built[r.id.slice(7)]).map((r) => ({ id: r.id, wired: true }));
