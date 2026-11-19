// The look board's pixel reading: a picture (a Blob or an address) into RGBA bytes, and RGBA bytes into a picture. A 2D canvas only (no GL context: the board page holds one app frame, tests/webgl-budget.test.ts);
// used by the board page on a click or a finished capture, never per frame.
export interface Pixels { w: number; h: number; data: Uint8ClampedArray; img: ImageBitmap }

export async function readPixels(src: Blob | string): Promise<Pixels | null> {
  try {
    const blob = typeof src === 'string' ? await (await fetch(src, { cache: 'no-store' })).blob() : src;
    if (!blob.type.startsWith('image/')) return null;
    const img = await createImageBitmap(blob);
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(img, 0, 0);
    return { w: img.width, h: img.height, data: g.getImageData(0, 0, img.width, img.height).data, img };
  } catch { return null; }
}

/** A canvas showing bytes (the difference image) or a decoded picture (the baseline). */
export function picture(src: ImageBitmap | { w: number; h: number; data: Uint8ClampedArray }): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  if ('data' in src) { c.width = src.w; c.height = src.h; g.putImageData(new ImageData(new Uint8ClampedArray(src.data), src.w, src.h), 0, 0); }
  else { c.width = src.width; c.height = src.height; g.drawImage(src, 0, 0); }
  return c;
}
