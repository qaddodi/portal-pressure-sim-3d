// The uniforms every shader of the organ veil reads: ONE set, shared by reference (the way organs/layer.ts shares ORGAN_CUT), written by the scene each frame (scene.ts render) and by nothing else.
import { DataTexture, RGBAFormat, UnsignedByteType, Vector4, type Texture } from 'three';

const one = (r: number, g: number, b: number, a: number): DataTexture => { const t = new DataTexture(new Uint8Array([r, g, b, a]), 1, 1, RGBAFormat, UnsignedByteType); t.needsUpdate = true; return t; };
/** Placeholders until the map is drawn: no organ anywhere (depth 1, coverage 0). */
export const NO_ORGAN_COL = one(0, 0, 0, 0), NO_ORGAN_DEP = one(255, 255, 255, 255), NO_BACK = one(0, 0, 0, 0);

export interface OrganVeilUniforms {
  /** the organs drawn into a texture half the size of the figure's: their colour over the page, and their coverage in alpha */
  tOrgCol: { value: Texture };
  /** the nearest organ's depth there (the camera's own depth values) */
  tOrgDep: { value: Texture };
  /** x the vessel veil's strength now (0: nothing runs), y the gap it starts at, z the gap it is whole at */
  ovlP: { value: Vector4 };
  /** x the camera's near, y its far, z and w one over the target's width and height in device px */
  ovlC: { value: Vector4 };
  /** the organs behind (kidney, spleen, caudate) as a mask, and x the show-through's strength now, y its largest share, z and w one over the target's size */
  tSeeMask: { value: Texture };
  seeP: { value: Vector4 };
}
export const ORGAN_VEIL_U: OrganVeilUniforms = {
  tOrgCol: { value: NO_ORGAN_COL }, tOrgDep: { value: NO_ORGAN_DEP }, ovlP: { value: new Vector4(0, 0, 1, 0) }, ovlC: { value: new Vector4(1, 2, 1, 1) },
  tSeeMask: { value: NO_BACK }, seeP: { value: new Vector4(0, 0.55, 1, 1) },
};

/** Back to the placeholders and strength 0 (a scene that goes away, a view that is not the figure). */
export function resetOrganVeil(): void {
  ORGAN_VEIL_U.tOrgCol.value = NO_ORGAN_COL; ORGAN_VEIL_U.tOrgDep.value = NO_ORGAN_DEP; ORGAN_VEIL_U.tSeeMask.value = NO_BACK;
  ORGAN_VEIL_U.ovlP.value.x = 0; ORGAN_VEIL_U.seeP.value.x = 0;
}
