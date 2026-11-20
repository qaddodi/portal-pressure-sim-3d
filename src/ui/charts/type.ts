// The type sizes a chart draws in, from the card type scale of the device (docs/look-and-feel.md section 5): data text is never under 12 px, and a chart's
// words never shrink to fit; a chart that needs room takes it from its plot.
import { typeFor, FLOORS, type DeviceClass } from '../layout/device.ts';
import { layoutOf, cardScale } from '../layout/rules2d.ts';

// A representative screen per device class (the card type scale depends on the screen's size; the cards thread's `typeFor(w, h)` is the one table).
const SCREEN: Record<DeviceClass, [number, number]> = { desktop: [1280, 800], 'tablet-portrait': [834, 1112], 'phone-portrait': [390, 844], 'phone-landscape': [844, 390] };

export interface ChartType {
  /** the chart's words: tick numbers, names, units (the data-text size, 13 px; 12 on a sideways phone) */
  sm: number;
  /** a reading set large in a chart (a share, a number on a bar) */
  val: number;
  /** a title inside a chart card */
  name: number;
}

export function chartType(d: DeviceClass): ChartType {
  const t = typeFor(...SCREEN[d]);
  const sm = Math.max(FLOORS.data, d === 'phone-landscape' ? 12 : t.data);
  return { sm, val: Math.round(sm * 1.7), name: Math.round(sm * 1.25) };
}

/** A chart in a full-screen panel (2D `.pz-panel`: the plane, the walls, the six ladders) draws in the panel's own caption size, the live screen's (2D `--s-cap`, `clamp(12px, 1.733 pzh, 21px)`), not the
 *  representative screen's: on a 1170 px high Mac that is 20 px, where `chartType` gave the 13 px of a 1280 by 800 window and the words looked tiny under a card that took the whole screen
 *  (Mohammad, 20 Nov). A stacked screen keeps `base`, which is already its own scale. Never under `base`. */
export function panelType(w: number, h: number, base: ChartType): ChartType {
  const lay = layoutOf(w, h);
  if (lay === 'stack' || lay === 'tab') return base;
  const sm = Math.max(base.sm, Math.round(cardScale({ vw: w, vh: h, layout: lay, part: 'panel' }).cap * 10) / 10);
  return { sm, val: Math.round(sm * 1.7), name: Math.round(sm * 1.25) };
}

/** A chart in the Tests card (2D `.instrument-workspace`, not inside a `.pz`): 2D draws it at the card scale of a wide screen whatever the device, `--pz-sm` = max(12, 0.74 x the caption size)
 *  (chart-ctx.js chartCtx finds no `.pz`, so layout 'wide', part 'data'; fittedType then grows it to 12 at the least). That is 12 px on every phone and on a Mac up to a screen about 940 px tall, and grows
 *  with a taller screen. 3D gave it `chartType`'s 13.8 px on a phone, 15 % wider than 2D's, so the Fibro strip's platelets and verdict wrapped to two rows and the pane ran taller than 2D's
 *  (20 Nov play-test, 390 x 844: 164 px against 126). Never under 12 px. */
export function toolType(w: number, h: number): ChartType {
  const sm = Math.max(12, Math.round(cardScale({ vw: w, vh: h, layout: 'wide', part: 'data' }).sm * 10) / 10);
  return { sm, val: Math.round(sm * 1.7), name: Math.round(sm * 1.25) };
}
