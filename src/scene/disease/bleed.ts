// Active variceal bleeding, as the 2D figure draws it (stage.js bleedSpray, blood.js bleedShapes: copied): a steady stream runs from the rupture (the esophageal varix, or the
// fundus for a gastric varix) down into the stomach, where it pools. It fades in on a rupture and out once the bleed stops (no pulse: BLEED_STEADY). The 3D stomach is
// opaque, so the pool is the stomach taking the blood's colour (organs/layer.ts, by poolFill), and the stream is a red thread in front of it.
import { Group, Mesh, Vector3 } from 'three';
import { SITES } from './copied/anatomy-b4.ts';
import { bleedShapes } from './copied/bleed-shapes.js';
import { CelObject, type CelShared } from '../materials/cel.ts';
import type { Palette } from '../palette.ts';
import type { LookId } from '../../looks/looks.ts';
import { x3, y3 } from '../frame2d.ts';
import { Eased } from './follow.ts';
import { bloodColour, recolour } from './paint.ts';
import { ringTube } from './tube.ts';

export const STREAM_Z = 0.36;
export interface BleedState { active: boolean; site: 'VAR' | 'GV'; rate: number; total: number }

export class BleedLayer {
  readonly group = new Group();
  private obj: CelObject | null = null;
  private fade = new Eased(0, 0.35, 0.003);
  private last: BleedState | null = null;
  private key = '';
  private palette: Palette | null = null; private look: LookId = 'light';
  private shared: CelShared;
  constructor(shared: CelShared) { this.shared = shared; this.group.visible = false; }
  applyLook(look: LookId, p: Palette): void { this.look = look; this.palette = p; if (this.obj) recolour(this.obj, bloodColour(look, p), p); }
  /** True while the stream fades or runs (a steady stream needs no frames of its own). */
  set(b: BleedState, dt: number, instant = false): boolean {
    if (b.active) this.last = { ...b };
    const moving = this.fade.to(b.active ? 1 : 0, dt, instant);
    const a = this.fade.value;
    this.group.visible = a > 0.003 && !!this.last;
    if (!this.group.visible) return moving;
    const s = this.last!;
    const rows = bleedShapes({ site: s.site, total: s.total }, s.rate, { varix: SITES.varix, fundus: SITES.fundus });
    const st = rows[1] as number[];   // [x0, y0, x1, y1, r0, r1, alpha, kind 2]
    const key = `${s.site}|${st[2]!.toFixed(0)}|${st[3]!.toFixed(0)}|${a.toFixed(2)}`;
    if (key !== this.key) {
      this.key = key;
      const pts: Vector3[] = [];
      for (let i = 0; i <= 12; i++) {
        const u = i / 12, x = st[0]! + (st[2]! - st[0]!) * u, y = st[1]! + (st[3]! - st[1]!) * u * (0.55 + 0.45 * u);   // (it leaves the tear and falls: a gentle curve)
        pts.push(new Vector3(x3(x), y3(y), STREAM_Z));
      }
      const r = Math.max(1e-4, (st[4]! / 300) * 1.35 * a);
      const g = ringTube(pts, pts.map((_, i) => r * (1 - 0.35 * (i / 12))), 8, true);
      if (!this.obj) {
        this.obj = new CelObject(g, { tone: 'heart', bands: 2, spec: 1, px: 0.8 }, this.shared);
        this.group.add(this.obj.group);
        if (this.palette) { this.obj.applyPalette(this.palette); recolour(this.obj, bloodColour(this.look, this.palette), this.palette); }
      } else for (const m of this.obj.group.children) { const mesh = m as Mesh; mesh.geometry.dispose(); mesh.geometry = g; }
    }
    return moving;
  }
  dispose(): void { this.obj?.dispose(); }
}
