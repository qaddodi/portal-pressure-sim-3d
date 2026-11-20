// The camera layers of the two passes the scene draws (scene.ts render): layer 0 the organs and the body, then, over the cleared depth, VESSEL_LAYER: the vessels and everything in them (the catheters, the
// stents, the Tests devices, the varices). A device left on layer 0 is drawn BEFORE the vessels and the vessels, drawing after it, cover it (a catheter "behind" its vein, a stent with no mesh in it).
import type { Object3D } from 'three';

export const VESSEL_LAYER = 1;
/** Puts an object and everything under it on the vessels' pass. Call it for whatever is added after the scene was built (a catheter made when its procedure first plays). */
export function inVesselPass<T extends Object3D>(o: T): T { o.traverse((c) => c.layers.set(VESSEL_LAYER)); return o; }
