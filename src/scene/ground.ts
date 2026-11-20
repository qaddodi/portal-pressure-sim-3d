// The ground the renderer clears to. Straight to the canvas three converts a colour from its linear working space to sRGB itself, so the page's own colour lands as that hex. Into a render target (the
// anti-aliasing pass's texture, post-aa.ts) three writes the working space's numbers as they are, and the pass then writes the canvas the picture's numbers as they are (every shader of the figure
// writes sRGB numbers, materials/cel.ts rawColor): the ground would land as the LINEAR value of the page's colour (Light #F1EBE0 as #E0D4BE, Dark #1A1917 as near black), a plate behind the figure
// against the page's chrome. So into the texture the ground is stored as its own sRGB numbers, as rawColor does, and the picture's ground is the page's, to the byte.
import { Color, LinearSRGBColorSpace, SRGBColorSpace } from 'three';

const scratch = { r: 0, g: 0, b: 0 };

/** `c` (a colour as three holds it: set from a hex) turned, in place, into the colour to clear with: unchanged for the canvas, its own sRGB numbers kept as they are for a texture. */
export function groundFor(c: Color, intoTexture: boolean): Color {
  if (!intoTexture) return c;
  c.getRGB(scratch, SRGBColorSpace);
  return c.setRGB(scratch.r, scratch.g, scratch.b, LinearSRGBColorSpace);
}
