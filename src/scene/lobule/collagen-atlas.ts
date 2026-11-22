// The collagen atlas's textures (Plan 31c): ONE resident atlas at rest, a second only while a look crossfades, and nothing of the pixels kept on the page after the GPU has them.
// The collagen is painted once per look (lobule3d.ts), so it needs no spare texture: the atlas of the old look is disposed the frame its crossfade ends, and the next look's is allocated when it arrives.
// Each atlas is 4096 x 2048 RGBA with mips (44.7 MB on the GPU); the bitmap or canvas it was uploaded from (32 MB) is closed or shrunk in the texture's own onUpdate, so it never stays resident.
// A lost GPU context takes the textures with it (three re-uploads from `image`, which is gone by then): `reset()` drops them and the owner paints the layer again.
import { LinearFilter, LinearMipmapLinearFilter, Texture } from 'three';

/** An image a texture was made from that can be let go once uploaded. */
type Letgo = { close?: () => void };
/** An atlas's GPU bytes: RGBA8 and its full mip chain (a third more). */
export const atlasBytes = (w: number, h: number): number => Math.round(w * h * 4 * (4 / 3));

export class CollagenAtlas {
  private front: Texture | null = null;
  private twin: Texture | null = null;
  /** The texture of the look on screen (null before the first, or after a lost context). */
  get now(): Texture | null { return this.front; }
  /** The texture of the look crossfading in, or the one on screen when none is. */
  get next(): Texture | null { return this.twin ?? this.front; }
  get crossing(): boolean { return this.twin !== null; }

  private make(image: unknown, premultiply: boolean, flip: boolean, free: () => void): Texture {
    const t = new Texture<unknown>(image);
    t.flipY = flip; t.premultiplyAlpha = premultiply; t.generateMipmaps = true; t.minFilter = LinearMipmapLinearFilter; t.magFilter = LinearFilter; t.anisotropy = 4;
    // (three calls onUpdate once the pixels are on the GPU: only then are they let go)
    t.onUpdate = () => { t.onUpdate = () => undefined; t.image = null; free(); };
    t.needsUpdate = true;
    return t;
  }
  /** The worker's bitmap (flipped and premultiplied already) as the look crossfading in. A twin not yet committed is replaced and disposed. */
  stageBitmap(bmp: ImageBitmap & Letgo): Texture {
    this.twin?.dispose();
    return (this.twin = this.make(bmp, false, false, () => bmp.close?.()));
  }
  /** A canvas painted on the page (the first look, a page with no worker, after a lost context): shown at once, the old atlas disposed, the canvas shrunk to nothing after its upload. */
  setCanvas(cv: { width: number; height: number }): Texture {
    this.twin?.dispose(); this.twin = null; this.front?.dispose();
    return (this.front = this.make(cv, true, true, () => { cv.width = 1; cv.height = 1; }));
  }
  /** The crossfade ended: the twin is the atlas, the old one is disposed (its GPU memory goes with it). */
  commit(): void {
    if (!this.twin) return;
    this.front?.dispose(); this.front = this.twin; this.twin = null;
  }
  /** The context was lost: the textures went with it, and their images are gone. */
  reset(): void { this.twin?.dispose(); this.front?.dispose(); this.twin = this.front = null; }
  dispose(): void { this.reset(); }
}
