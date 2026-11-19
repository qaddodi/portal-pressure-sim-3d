// What a tap on an organ opens, as the 2D app decides it (stage-hover.js organAt / ORGAN_OF, stage.js pick). Only three organs take a tap: the liver, the right heart (its
// atrium too) and the spleen; the stomach, bowel, colon, duodenum and kidney are drawn but never picked, so a tap on them (or on the gut over the liver) falls through to the organ
// beneath, or to nothing. The belly's fluid is the fourth target ('abdomen', below the ascites surface), which opens the Ascites instrument rather than a card.
export const LIVER_SPLIT_X = 640;   // anatomy.js: the liver's right lobe lies left of this 2D x, the left lobe right of it

/** The 2D organ ids that take a tap, and the card each opens (stage-hover.js ORGAN_OF: heart-ra is the heart's). */
export const PICK_OF: Readonly<Record<string, 'liver' | 'heart' | 'spleen'>> = { liver: 'liver', heart: 'heart', 'heart-ra': 'heart', spleen: 'spleen' };

export type FigureHit =
  | { type: 'edge'; id: string }
  | { type: 'organ'; id: 'liver' | 'heart' | 'spleen' | 'abdomen'; lobe?: 'L' | 'R' };

/** The liver lobe at a 2D x (the patient's right is the viewer's left). */
export const lobeAt = (x2d: number): 'L' | 'R' => (x2d < LIVER_SPLIT_X ? 'R' : 'L');

/** The target of a tap on organ `og` at 2D x (the liver also says its lobe, as 2D's selection does). */
export function organHit(og: 'liver' | 'heart' | 'spleen' | 'abdomen', x2d: number): FigureHit {
  return og === 'liver' ? { type: 'organ', id: og, lobe: lobeAt(x2d) } : { type: 'organ', id: og };
}
