// The credit keeps off the sinusoid's vessel (phone play-test, 20 Nov 2026: on a 390 x 844 phone the Sinusoid view runs the vessel top to bottom through the middle of the screen and the credit printed over it).
// 2D's credit rule has an `avoid(box)` hook for art the credit must not take (credit.js, freeSpots): a spot over it is passed over like a covered one, and with no bare spot anywhere the credit is hidden. This is the art
// of the Sinusoid view: the lumen and its wall, as a strip across the whole screen (the sinusoid runs off both ends of it), padded a little. Pure: the scene's projection is passed in, so a test can give it a camera.
export interface Rect { l: number; t: number; r: number; b: number }

/** How far (px) the credit stays from the vessel's wall, as 2D's art test pads the art it avoids (18, then 8, then 4: the middle tier). */
export const VESSEL_PAD = 8;
/** The stretch (µm) either side of the view's middle that the strip is measured over: far past any screen's edge (a screen shows at most about 280 µm: 844 px at the 3 px per µm floor). */
const REACH_UM = 400;

/** The screen box of the vessel: where the places (±REACH_UM along, ±`half` µm across, `half` the lumen and its wall at their widest) land, as the smallest box that holds them. `project(x, y)` is a place in micrometres
 *  (x along the flow, y across) to the canvas in CSS px; the view's turn is in it, so a portrait screen's strip is the tall one and a wide screen's the flat one. */
export function vesselRect(project: (xUm: number, yUm: number) => readonly [number, number], half: number): Rect {
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (const x of [-REACH_UM, REACH_UM]) for (const y of [-half, half]) {
    const [px, py] = project(x, y);
    l = Math.min(l, px); r = Math.max(r, px); t = Math.min(t, py); b = Math.max(b, py);
  }
  return { l, t, r, b };
}

/** The widest the vessel's wall stands (µm from the axis) over the stretch the screen shows: from the view's own width function (`wall(x)`: lumen plus its lining). */
export function widestWall(wall: (xUm: number) => number, from = -120, to = 120, step = 6): number {
  let w = 0;
  for (let x = from; x <= to; x += step) w = Math.max(w, wall(x));
  return w;
}

/** 2D's `avoid`: true for a box of the credit that touches the vessel's box (grown by `pad`). */
export const avoidVessel = (v: Rect, pad = VESSEL_PAD) => (box: Rect): boolean => box.l < v.r + pad && box.r > v.l - pad && box.t < v.b + pad && box.b > v.t - pad;
