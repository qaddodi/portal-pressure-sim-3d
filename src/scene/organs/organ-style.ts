// What each organ looks like by name (its tones, outline and layer) and which organs are the gut: plain data, apart from the organ layer (layer.ts, which draws with it and re-exports it), so the bake
// (organs/prepare.ts) reads these without reaching the layer's whole import graph (tests/organs-digest.test.ts: the camera fit is not an input of the organs).
import type { OrganTones2D } from '../../looks/organ-tones.copied.ts';
import { type ToneKey } from '../palette.ts';

type Og = keyof OrganTones2D['tones'];
/** The tone each 2D organ takes, its 2D painter's tones (--og-<og>-1/2/3; anatomy.js `tone`), the outline's width (2D: 1.1 px, the kidney 1.4) and alpha (.62, the kidney .95, the atrium .35),
 *  and which layer opacity it sits at (the gut at --gut-a, the kidney at its own, the rest at the organ layer's). */
export const ORGAN_STYLE: Record<string, { tone: ToneKey; og: Og; px: number; inkA: number; layer: 'organ' | 'gut' | 'kidney'; /** the soft AO seat 2D draws under a plain organ (.org-ao); not the atrium (part of the heart) and not the gut, which has its own */ ao?: true; /** the right atrium's own fainter shade and rim */ atrium?: true; /** no rim light in the see-through fill (the liver and the stomach, and the duodenum painted with the stomach's tones: too shiny) */ noRim?: true }> = {
  heart: { tone: 'heart', og: 'heart', px: 1.1, inkA: 0.62, layer: 'organ', ao: true }, 'heart-ra': { tone: 'heart', og: 'ra', px: 1.1, inkA: 0.35, layer: 'organ', atrium: true },
  liver: { tone: 'liver', og: 'liver', px: 1.1, inkA: 0.62, layer: 'organ', ao: true, noRim: true }, spleen: { tone: 'spleen', og: 'spleen', px: 1.1, inkA: 0.62, layer: 'organ', ao: true },
  /** the caudate lobe (caudate.ts): the mock's egg on the liver's back, in the liver's tones WITH the rim light, so it reads through the liver (round 15); shown only on a slide about it */
  caudate: { tone: 'liver', og: 'liver', px: 1.1, inkA: 0.62, layer: 'organ' },
  stomach: { tone: 'stomach', og: 'stomach', px: 1.1, inkA: 0.62, layer: 'organ', ao: true, noRim: true },
  /** the duodenum: the gut's tube from the stomach's cut, in the gut's tones and layer, wearing the stomach's look by the cut (organ-art.ts `tos`) */
  duodenum: { tone: 'gut', og: 'gut', px: 1.1, inkA: 0.62, layer: 'gut' },
  'kidney-l': { tone: 'kidney', og: 'kidney', px: 1.4, inkA: 0.95, layer: 'kidney', ao: true }, bowel: { tone: 'gut', og: 'gut', px: 1.1, inkA: 0.62, layer: 'gut' }, colon: { tone: 'gut', og: 'gut', px: 1.1, inkA: 0.62, layer: 'gut' },
};

/** The gut's tubes and the stomach: one surface (OrganLayer oneGutBox; prepare.ts bakes them as one part). */
export const GUT_GROUP: ReadonlySet<string> = new Set(['stomach', 'duodenum', 'bowel', 'colon']);
