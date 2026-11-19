// The plexuses (collateral channels that leave a vessel and rejoin it): the cavernoma around a clotted portal trunk (C8, drawn in the trunk's frame as the 2D figure does,
// cavernoma-strand.js), the periesophageal channels of the esophageal varices (C1a), the leash of the fundal varices (C2), the gastroesophageal route (C4) and the
// retroperitoneal veins (C7). Each strand is a tube that leaves its vessel and rejoins it, bowed by `off` over the stretch the 2D figure gives it (anatomy.js STRANDS, stage-paths.js braid).
//   - a cavernoma channel grows in whole, joined at both ends, from the recruitment it begins at (CAV_CHANNELS r0, over CAV_GROW of the recruitment), never a free end
//   - the esophageal strands go as bands close them (the count drawn follows the model's whole count in a moment: band-ease.js)
//   - the varices bead with their size (varix-bead.js beadRadius); the fundal ones on a longer period
//   - a plexus draws on and retracts with its vessel (the presence the vessels use), so nothing pops
import { BufferAttribute, type BufferGeometry, Float32BufferAttribute, Group, Vector3 } from 'three';
import { CAV_CHANNELS, SIN_EDGES, STRANDS, STRAND_FROM, STRAND_SOFT } from './copied/anatomy-b4.ts';
import { cavGrow, cavStrand, trunkFrame } from './copied/cavernoma-strand.js';
import { BEAD_SITE, beadLambda, beadRadius, varixBead } from './copied/varix-bead.js';
import { SIN_PERFUSION, sinStrandRadius } from './copied/sin-perfusion.js';
import { CelObject, type CelShared } from '../materials/cel.ts';
import type { Palette } from '../palette.ts';
import { x2d, x3, y2d, y3 } from '../frame2d.ts';
import { hostCourse } from './course.ts';
import { mix, rgbOf, type RGB } from '../organs/organ-look.ts';
import { recolour } from './paint.ts';
import { ringTube, sampleAlong } from './tube.ts';

const N = 44;
// (the sinusoids' own strands, SIN_RR and SIN_LL, are drawn faint and fine: sin-perfusion.js)
const HOSTS = Object.keys(STRANDS);
/** The red wale's colour (tokens.css --red-wale), and where along the strand it lies: over the middle, easing in and out over 15% of its length at each end (stage-vessels.js). */
export const RED_WALE = rgbOf('#E8404A');
export const waleEnvelope = (u: number): number => { const k = (a: number, b: number) => { const t = Math.min(1, Math.max(0, (u - a) / (b - a))); return t * t * (3 - 2 * t); }; return k(0.1, 0.25) * (1 - k(0.75, 0.9)); };
/** The faint colour of a sinusoid strand: the portal tone most of the way to the plate (SIN_PERFUSION.fade, 0.4 of its strength). */
const faint = (tone: RGB, plate: RGB): RGB => mix(plate, tone, SIN_PERFUSION.fade);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export interface StrandInputs {
  /** a vessel's presence 0..1 (the vessels' own, drawing on and retracting) */
  presence(id: string): number;
  /** a collateral's recruitment 0..1 (network.ts recruitFrac) */
  recruit(id: string): number;
  /** whole bands on the esophageal varices, as shown (eased) */
  bands: number;
  /** the model's varix diameters (mm) by metrics key, or null */
  varixD: { varix: number | null; gastricVarix: number | null };
  /** the esophageal strands' share of the red wale colour, 0..WALE_MAX (varixWale: 0 off the pressure lens) */
  wale?: number;
}

interface Strand { host: string; i: number; obj: CelObject | null; key: string; pts: Vector3[]; chan: (typeof CAV_CHANNELS.C8)[number] | null; k: number; ph: number; off: number; ua: number | null; ub: number | null }

/** One strand's samples in the figure's plane (2D units), from its host course (stage-paths.js braid: a span's one chord normal, otherwise the local normal). */
export function strandPoints(host: Vector3[], off: number, u0: number, span: [number, number] | null, ph: number, soft: boolean): Vector3[] {
  const pts = sampleAlong(host, Array.from({ length: N }, (_, i) => i / (N - 1)));
  const A = pts[0]!, B = pts[N - 1]!, cl = Math.hypot(B.x - A.x, B.y - A.y) || 1, cx = -(B.y - A.y) / cl, cy = (B.x - A.x) / cl;
  const o = off / 300;
  return pts.map((p, i) => {
    const t = i / (N - 1);
    if (span) {
      const v = (t - span[0]) / (span[1] - span[0]);
      if (v <= 0 || v >= 1) return p.clone();
      const s = o * Math.sin(Math.PI * v) ** 1.4 * (1 + 0.1 * Math.sin(3 * Math.PI * v + ph));
      return new Vector3(p.x + cx * s, p.y + cy * s, p.z);
    }
    const a = pts[Math.max(0, i - 1)]!, b = pts[Math.min(N - 1, i + 1)]!;
    let nx = -(b.y - a.y), ny = b.x - a.x; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    if (soft) { nx = cx; ny = cy; }
    const s = Math.sin(Math.PI * Math.min(1, Math.max(0, (t - u0) / (1 - u0))));
    const w = o * (soft ? s * s : s);
    return new Vector3(p.x + nx * w, p.y + ny * w, p.z);
  });
}

export class StrandLayer {
  readonly group = new Group();
  private strands: Strand[] = [];
  private shown = new Map<string, number>();
  private palette: Palette | null = null;
  private shared: CelShared;
  private trunk: ReturnType<typeof trunkFrame> | null = null;
  private trunkZ = 0.46;
  constructor(shared: CelShared) {
    this.shared = shared;
    for (const host of HOSTS) {
      const c = hostCourse(host);
      if (!c) continue;
      STRANDS[host]!.forEach((row, i) => {
        const [off, ph, k, ua, ub] = row as [number, number, number, number | undefined, number | undefined];
        this.strands.push({ host, i, obj: null, key: '', pts: c.pts, chan: CAV_CHANNELS[host]?.[i] ?? null, k, ph, off, ua: ua ?? null, ub: ub ?? null });
      });
    }
    const t = hostCourse('PV_TRUNK');
    if (t) {
      this.trunkZ = t.pts[0]!.z;
      this.trunk = trunkFrame(t.ids.map((id) => hostCourse(id)!.pts.map((p) => [x2d(p.x), y2d(p.y)] as [number, number])));
    }
  }

  applyLook(p: Palette): void {
    this.palette = p;
    for (const s of this.strands) { if (!s.obj) continue; s.obj.applyPalette(p); if (SIN_EDGES.has(s.host)) recolour(s.obj, faint(rgbOf(p.tones.portal), rgbOf(p.body)), p); s.key = ''; }   // (a changed look paints the wale again)
  }
  setPhone(phone: boolean): void { for (const s of this.strands) s.obj?.setPhone(phone); }

  /** Steps the plexuses toward `in`; true while one is drawing on or retracting. */
  set(inp: StrandInputs, dtMs: number, instant = false): boolean {
    let moving = false;
    const k = instant ? 1 : Math.min(1, dtMs / 320);
    for (const host of new Set(this.strands.map((s) => s.host))) {
      const goal = clamp01(inp.presence(host));
      const cur = this.shown.get(host) ?? goal;
      const next = Math.abs(goal - cur) < 0.004 || k >= 1 ? goal : cur + (goal - cur) * k;
      this.shown.set(host, next);
      if (next !== goal) moving = true;
    }
    for (const s of this.strands) moving = this.update(s, inp) || moving;
    return moving;
  }

  private update(s: Strand, inp: StrandInputs): boolean {
    const base = hostCourse(s.host)!;
    const present = this.shown.get(s.host) ?? 0;
    let live = 1, grow = 1;
    if (s.chan) { grow = cavGrow(inp.recruit(s.host), s.chan.r0); live = clamp01(grow * 4); }
    if (s.host.startsWith('C1')) live = clamp01(s.i + 1 - inp.bands);
    const site = (BEAD_SITE as Record<string, string>)[s.host];
    const d = site ? (inp.varixD as Record<string, number | null>)[site] : null;
    const bead = site && d != null ? Math.round(varixBead(d) * 100) / 100 : 0;
    const amount = Math.round(present * live * grow * 50) / 50;
    const wale = s.host === 'C1a' ? Math.round((inp.wale ?? 0) * 100) / 100 : 0;
    const key = `${amount}|${bead}|${wale}`;
    if (key === s.key) return false;
    s.key = key;
    if (amount <= 0.01) { if (s.obj) s.obj.group.visible = false; return false; }
    const r = base.radius * s.k * Math.max(0.25, amount);
    let pts: Vector3[];
    if (s.chan && this.trunk) {
      const q = cavStrand(this.trunk, s.chan, N, 0, null) as [number, number][];
      pts = q.map(([x, y]) => new Vector3(x3(x), y3(y), this.trunkZ));
    } else pts = strandPoints(base.pts, s.off, STRAND_FROM[s.host] ?? 0, s.ua != null && s.ub != null ? [s.ua, s.ub] : null, s.ph, STRAND_SOFT.has(s.host));
    let len = 0; for (let i = 1; i < pts.length; i++) len += pts[i]!.distanceTo(pts[i - 1]!);
    const len2d = len * 300, lambda = beadLambda(s.host);
    const sin = SIN_EDGES.has(s.host), width2d = 2 * base.radius * 300;
    const radii = pts.map((_, i) => Math.max(1e-4, sin
      ? sinStrandRadius(base.radius * s.k * 300, width2d, i / (pts.length - 1), s.ua != null && s.ub != null ? [s.ua, s.ub] : null) / 300 * Math.max(0.25, amount)
      : beadRadius(r, bead, i / (pts.length - 1), len2d, s.ph, STRAND_FROM[s.host] ?? 0, lambda)));
    const g = ringTube(pts, radii, 9, true);
    if (s.host === 'C1a') this.paintWale(g, wale);
    if (!s.obj) {
      s.obj = new CelObject(g, { tone: 'portal', bands: 2, spec: 1, px: sin ? 0.6 : 0.9 }, this.shared);
      this.group.add(s.obj.group);
      if (this.palette) { s.obj.applyPalette(this.palette); if (sin) recolour(s.obj, faint(rgbOf(this.palette.tones.portal), rgbOf(this.palette.body)), this.palette); }
      if (s.host === 'C1a') s.obj.setInkAmount(1);
    } else for (const m of s.obj.group.children) { const mesh = m as import('three').Mesh; mesh.geometry.dispose(); mesh.geometry = g; }
    s.obj.group.visible = true;
    return amount !== present * live * grow;
  }

  /** The esophageal strands' own colour at each vertex: the portal tone, a share `wale` of the way to the red wale over the strand's middle (it is there on every esophageal strand, as the geometry's `ink` attribute the cel shader reads). */
  private paintWale(g: BufferGeometry, wale: number): void {
    const uv = g.getAttribute('uv') as BufferAttribute, n = uv.count, a = new Float32Array(n * 3), tone = this.palette ? rgbOf(this.palette.tones.portal) : [0.7, 0.2, 0.4] as RGB;
    for (let i = 0; i < n; i++) { const c = mix(tone, RED_WALE, wale * waleEnvelope(uv.getX(i))); a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; }
    g.setAttribute('ink', new Float32BufferAttribute(a, 3));
  }

  /** How many strands are drawn now, by vessel (for the tests and the parity table). */
  drawn(): Record<string, number> { const o: Record<string, number> = {}; for (const s of this.strands) if (s.obj?.group.visible) o[s.host] = (o[s.host] ?? 0) + 1; return o; }
  dispose(): void { for (const s of this.strands) s.obj?.dispose(); }
}
