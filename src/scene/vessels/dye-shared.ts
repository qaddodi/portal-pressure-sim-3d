// What every vessel shares for the dye (docs/approved/dye.md, look A): the bolus's concentration as one float texture (a row per engine edge, DYE_BINS bins along the vessel's own direction), the dye colour and the body's
// dissolve. disease/dye.ts writes them; the tube and the junction skin read them in their own fragment shaders (glsl-shared.ts DYE_GLSL). Module-level, like the blood's shared textures: made once, on first use.
import { Color, DataTexture, FloatType, LinearSRGBColorSpace, NearestFilter, RedFormat } from 'three';
import { EDGES } from '../../engine/hales/portal/topology.js';
import { DYE_BINS } from '../disease/copied/dye-bolus.js';

export { DYE_BINS };
/** The 2D figure's --blood-dye (css2d/tokens.css). */
export const DYE_COLOUR = '#C7F533';
export const DYE_EDGES = (EDGES as unknown[]).length;

const n = parseInt(DYE_COLOUR.slice(1), 16);
const rows = new Float32Array(DYE_BINS * DYE_EDGES);
const tex = new DataTexture(rows, DYE_BINS, DYE_EDGES, RedFormat, FloatType);
tex.minFilter = tex.magFilter = NearestFilter; tex.needsUpdate = true;

export const dyeShared = {
  tex, rows,
  /** the colour as the shaders read colours: the sRGB numbers as they are (materials/cel.ts rawColor) */
  col: { value: new Color().setRGB(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, LinearSRGBColorSpace) },
  /** the body's dissolve (disease/index.ts setFade): the dye is laid on the anatomy's vessels, so the Circuit does not keep it */
  amount: { value: 1 },
  texU: { value: tex },
};
