// What a tap on the figure opens: the structure under the finger, as the 2D app's stage.js pick does it (a vessel first, then the organ under it; in the lobule, the part).
// Pure tables so the parity claims and the tests read the same ones the figure's tap uses.
import type { Sel } from './selection.ts';

/** The organ meshes a tap opens a card for, and the card each opens (2D ORGAN_KEYS: the heart, the liver, the spleen; the right atrium is part of the heart). */
export const ORGAN_TAP: Readonly<Record<string, string>> = { liver: 'liver', heart: 'heart', 'heart-ra': 'heart', spleen: 'spleen' };

/** The lobule view's parts a tap lands on, and the card part each opens. The cords are the hepatocytes (their zone is read from where the tap fell); the hepatic arteriole
 *  is drawn inside the portal tracts' group, so a tap there reads as the triad. */
export const LOBULE_TAP: Readonly<Record<string, string>> = {
  sinusoids: 'sin', inlets: 'in', 'portal-tracts': 'triad', 'central-vein': 'cv', lymph: 'lv', bile: 'bd', cords: 'zone',
};

/** Hepatocyte zone from the tap's distance from the centre (the central vein) in the lobule's own units: the triads stand at 1, the zones' labels at 0.82, 0.5 and 0.2. */
export const zoneAt = (x: number, y: number): 1 | 2 | 3 => { const r = Math.hypot(x, y); return r > 0.66 ? 1 : r > 0.33 ? 2 : 3; };

/** The selection a tap on a lobule part opens, or null (the neighbouring lobules, the tissue's edge, a part with no card). */
export function lobuleSelAt(part: string, x: number, y: number): Sel | null {
  const card = LOBULE_TAP[part];
  if (!card || Math.hypot(x, y) > 1.12) return null;
  return card === 'zone' ? { type: 'lobule', zone: zoneAt(x, y) } : { type: 'lobule', part: card };
}
/** The selection a tap on an organ mesh opens, or null. */
export const organSelOf = (meshId: string | null): Sel | null => (meshId && ORGAN_TAP[meshId] ? { type: 'organ', id: ORGAN_TAP[meshId]! } : null);
