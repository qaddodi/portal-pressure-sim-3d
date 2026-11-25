// The camera layers of the two passes the scene draws (scene.ts render): layer 0 the organs and the body, then, over the cleared depth, VESSEL_LAYER: the vessels and everything in them (the catheters, the
// stents, the Tests devices, the varices). A device left on layer 0 is drawn BEFORE the vessels and the vessels, drawing after it, cover it (a catheter "behind" its vein, a stent with no mesh in it).
import type { Object3D } from 'three';

export const VESSEL_LAYER = 1;
/** Puts an object and everything under it on the vessels' pass. Call it for whatever is added after the scene was built (a catheter made when its procedure first plays). */
export function inVesselPass<T extends Object3D>(o: T): T { o.traverse((c) => c.layers.set(VESSEL_LAYER)); return o; }

/** The organ veil's camera layers (organ-veil/): the organs' fills (and the gut's depth pass) are ALSO drawn into a map half the figure's size, which the vessels read to know what lies in front of them; the organs that let others show through
 *  them (kidney, spleen, caudate: the ones behind) are drawn flat into a mask. Nothing else is on these layers, and no pass of the figure draws them. */
export const ORGAN_MAP_LAYER = 3;
export const ORGAN_BACK_LAYER = 4;
