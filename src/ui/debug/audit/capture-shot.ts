// One picture of the screen as it stands, for the slide pass (capture-all.ts) and the case pass (capture-cases.ts): the screen drawn at the device's sharpness, its encoding
// started at once (the encoder
// takes its own copy and works off this thread while the next picture is reached), a small copy for a contact sheet, and the page's state record. Nothing here waits for the
// page to be still: the caller does.
import { drawScreen, type Drawn } from '../../capture/capture.ts';
import { collageLayout } from '../../capture/capture-model.ts';
import { blobOf, bytesOf } from './capture-settle.ts';

export interface Shot {
  /** the picture's bytes when its encoding ends (null if the encoder gave none) */
  encoded: Promise<Uint8Array | null>;
  /** a copy of twice the contact sheet's cell (a sharp one when the sheet is zoomed); 1 px when `thumb` is off */
  thumb: HTMLCanvasElement;
  /** the picture's size in px */
  shape: { w: number; h: number };
  record: Drawn['record'];
  /** pictures of the page that would not load and are left out of this one */
  missing: string[];
}

/** Draw the screen. `ratio`: its pixel ratio; `png`: a PNG (the promotion set) and not a JPEG; `thumb`: also a small copy for a contact sheet. Null when the page cannot be drawn. */
export async function drawShot(o: { ratio: number; png?: boolean; thumb?: boolean }): Promise<Shot | null> {
  const drawn = await drawScreen(new Date(), { ratio: o.ratio });
  if (!drawn) return null;
  const encoded = (o.png ? blobOf(drawn.canvas, 'image/png') : blobOf(drawn.canvas, 'image/jpeg', 0.85)).then(async (b) => (b ? bytesOf(b) : null));
  const shape = { w: drawn.canvas.width, h: drawn.canvas.height };
  const L = collageLayout(1, shape), thumb = document.createElement('canvas');
  const small = o.thumb !== false;
  thumb.width = small ? L.cellW * 2 : 1; thumb.height = small ? L.cellH * 2 : 1;
  if (small) thumb.getContext('2d')?.drawImage(drawn.canvas, 0, 0, thumb.width, thumb.height);
  // (let the big picture go before the next)
  drawn.canvas.width = 0; drawn.canvas.height = 0;
  return { encoded, thumb, shape, record: drawn.record, missing: drawn.missing };
}
