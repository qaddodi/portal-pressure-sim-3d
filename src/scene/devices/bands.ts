// The ligation bands on the esophageal varices (visual style D8): a ring of platinum round the lower esophagus for each band the engine counts (up to four, `engine.band`), the first just above the cardia and the
// next ones a step up, each turned square to the esophagus's own lean and kept inside its walls (band-ring.js, copied). The model counts them whole and they slough over days; the figure's count follows it in a
// moment (band-ease.js `bandsStep`), so a band fades in as it is placed and out as it sloughs, never in one frame.
import { Group, Vector3 } from 'three';
import type { CelShared } from '../materials/cel.ts';
import type { Palette } from '../palette.ts';
import { TIER_Z, x3, y3 } from '../frame2d.ts';
import { DeviceObject } from './device-object.ts';
import { allocTube, makeRings, writeRings } from './tube-rings.ts';
import { BAND, bandRing } from '../procedures/copied/band-ring.js';
import { bandsStep } from '../procedures/copied/band-ease.js';

export const BANDS_MAX = 4;   // the engine's cap (engine.band)
const U = 300;
const N = 14;

export class Bands {
  readonly group = new Group();
  readonly rings: DeviceObject[] = [];
  /** the count drawn now (follows the model's in a moment) and the model's */
  shown: number | null = null;
  goal = 0;

  constructor(shared: CelShared) {
    for (let i = 0; i < BANDS_MAX; i++) {
      const b = bandRing(i, N) as { pts: [number, number][] };
      const pts = [...b.pts, b.pts[0]!];
      const g = allocTube(pts.length, 6), rings = makeRings(pts.length);
      for (let k = 0; k < pts.length; k++) {
        const p = pts[k]!, q = pts[(k + 1) % (pts.length - 1)]!, r = pts[(k + pts.length - 2) % (pts.length - 1)]!;
        rings[k]!.c.set(x3(p[0]), y3(p[1]), TIER_Z.mid + 0.02);
        rings[k]!.t.set(x3(q[0]) - x3(r[0]), y3(q[1]) - y3(r[1]), 0).normalize();
        rings[k]!.r = BAND.stroke / 2 / U;
      }
      writeRings(g, rings, 6);
      const o = new DeviceObject(g, 'platinum', shared, { px: 0.7, order: 5 }, 'ink');
      o.group.visible = false;
      this.rings.push(o); this.group.add(o.group);
    }
  }
  get objects(): DeviceObject[] { return this.rings; }
  applyPalette(p: Palette): void { for (const o of this.rings) o.applyPalette(p); }
  setPhone(phone: boolean): void { for (const o of this.rings) o.setPhone(phone); }

  /** The model's count of bands (the engine frame's `bands`). */
  want(count: number, instant = false): void { this.goal = Math.min(BANDS_MAX, Math.round(count || 0)); if (instant) this.shown = this.goal; }

  /** Follows the count; true while a band is fading. */
  update(dtMs: number, quiet = false): boolean {
    const next = bandsStep(this.shown, this.goal, dtMs / 1000, quiet) as number;
    const moved = next !== this.shown || this.shown === null;
    this.shown = next;
    for (let i = 0; i < BANDS_MAX; i++) {
      const a = Math.min(1, Math.max(0, next - i));
      const o = this.rings[i]!;
      o.group.visible = a > 0.002;
      if (o.group.visible) o.setAlpha(a);
    }
    return moved && next !== this.goal;
  }
  dispose(): void { for (const o of this.rings) o.dispose(); }
}
void Vector3;
