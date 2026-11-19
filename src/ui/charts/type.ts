// The type sizes a chart draws in, from the card type scale of the device (docs/look-and-feel.md section 5): data text is never under 12 px, and a chart's
// words never shrink to fit; a chart that needs room takes it from its plot.
import { TYPE, FLOORS, type DeviceClass } from '../layout/device.ts';

export interface ChartType {
  /** the chart's words: tick numbers, names, units (the data-text size, 13 px; 12 on a sideways phone) */
  sm: number;
  /** a reading set large in a chart (a share, a number on a bar) */
  val: number;
  /** a title inside a chart card */
  name: number;
}

export function chartType(d: DeviceClass): ChartType {
  const t = TYPE[d];
  const sm = Math.max(FLOORS.data, d === 'phone-landscape' ? 12 : t.data);
  return { sm, val: Math.round(sm * 1.7), name: Math.round(sm * 1.25) };
}
