// The legend art of each colour lens: a swatch gradient for the lens menu and the top bar's key. Placeholder art for the 3D look until the lens batch (B3) draws the
// real legends from the scene's own ramps; the lens NAMES and notes are the 2D app's (strings.generated.ts).
import type { LensId } from '../../scene/lenses/model.ts';

export const LENS_ART: Partial<Record<LensId, string>> = {
  pressure: 'linear-gradient(90deg, #3F7FCB, #5FB3A4, #E3C04B, #D9722B, #B8326F)',
  delta: 'linear-gradient(90deg, #3F7FCB, #D8D3C8, #D9482B)',
  heat: 'linear-gradient(90deg, #E9E1D2, #E3B24B, #C23F2A)',
  drop: 'linear-gradient(90deg, #E9E1D2, #8E6BB5, #3F2A6B)',
  flow: 'linear-gradient(90deg, #D8D3C8, #5FA58F, #157A58)',
  velocity: 'linear-gradient(90deg, #3F7FCB, #5FB3A4, #E3C04B, #C23F2A)',
  direction: 'linear-gradient(90deg, #3F7FCB 50%, #D9722B 50%)',
  oxygen: 'linear-gradient(90deg, #4A5B9B, #B8326F, #E0503C)',
  origin: 'linear-gradient(90deg, #3F7FCB 20%, #5FA58F 20% 40%, #E3C04B 40% 60%, #D9722B 60% 80%, #B8326F 80%)',
  firstpass: 'linear-gradient(90deg, #3F7FCB 25%, #5FA58F 25% 50%, #E3C04B 50% 75%, #C23F2A 75%)',
};
