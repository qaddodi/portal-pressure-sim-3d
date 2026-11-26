// The uniforms every program of the focus reveal reads: ONE set, shared by reference (as the organ veil's, organ-veil/uniforms.ts), written by the scene (parts/render.ts) and by nothing else.
import { Vector4 } from 'three';

export interface FocusRevealUniforms {
  /** the focus's segment on the screen, figure target px: (ax, ay, bx, by) */
  frvSeg: { value: Vector4 };
  /** x the strength now (0: nothing runs), y and z the band's inner and outer radius in figure px, w the occluder's largest share taken */
  frvP: { value: Vector4 };
  /** xy one over the size of the target drawn into now, zw the figure target's size */
  frvC: { value: Vector4 };
}
export const FOCUS_REVEAL_U: FocusRevealUniforms = { frvSeg: { value: new Vector4() }, frvP: { value: new Vector4(0, 1, 2, 0) }, frvC: { value: new Vector4(1, 1, 1, 1) } };

/** Strength 0: every program draws as if there were no reveal (a scene that goes away, the split orbit). */
export function resetFocusReveal(): void { FOCUS_REVEAL_U.frvP.value.x = 0; }
