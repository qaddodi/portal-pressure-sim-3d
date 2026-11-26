// The camera layers of the two passes the scene draws (scene.ts render): layer 0 the organs and the body, then, over the cleared depth, VESSEL_LAYER: the vessels and everything in them (the catheters, the
// stents, the Tests devices, the varices). A device left on layer 0 is drawn BEFORE the vessels and the vessels, drawing after it, cover it (a catheter "behind" its vein, a stent with no mesh in it).
import type { Object3D } from 'three';

// ONE REGISTRY, ONE NUMBER PER LAYER (owner, 26 Nov: "when I click on the tips, the whole figure is glowing").
// ROOT CAUSE: the vessels' glow mask pass and the organ veil's map each took layer 3 (and the organs' glow mask and the veil's
// "behind" mask each took 4), so every organ's fill, which sits on the veil's layers, was drawn into the glow's mask
// the moment any vessel was lit: every organ got a halo. Every camera layer is made here and nowhere else,
// and tests/camera-layers.test.ts holds them all different.
export const VESSEL_LAYER = 1;
/** The camera layer nothing is drawn from: the cava's solid mesh, kept only to be picked. */
export const FAINT_ONLY_LAYER = 2;
/** Puts an object and everything under it on the vessels' pass. Call it for whatever is added after the scene was built (a catheter made when its procedure first plays). */
export function inVesselPass<T extends Object3D>(o: T): T { o.traverse((c) => c.layers.set(VESSEL_LAYER)); return o; }

/** The organ veil's camera layers (organ-veil/): the organs' fills (and the gut's depth pass) are ALSO drawn into a map half the figure's size, which the vessels read to know what lies in front of them; the organs that let others show through
 *  them (kidney, spleen, caudate: the ones behind) are drawn flat into a mask. Nothing else is on these layers, and no pass of the figure draws them. */
export const ORGAN_MAP_LAYER = 3;
export const ORGAN_BACK_LAYER = 4;

/** The camera layer the vessels' glow mask pass draws (the vessels' glow meshes live on it and nowhere else; the figure's own passes never draw it). */
export const GLOW_LAYER = 5;
/** The camera layer of a tapped or pinned ORGAN's glow mask (organs/glow-mask.ts): its own pass and textures, so the vessels' glow and the organs' never paint each other's. */
export const ORGAN_GLOW_LAYER = 6;

/** Every named camera layer (the figure's own, layer 0, is the default and is not listed): all different, so a pass that draws one can never draw another's objects. */
export const CAMERA_LAYERS = { VESSEL_LAYER, FAINT_ONLY_LAYER, ORGAN_MAP_LAYER, ORGAN_BACK_LAYER, GLOW_LAYER, ORGAN_GLOW_LAYER } as const;
