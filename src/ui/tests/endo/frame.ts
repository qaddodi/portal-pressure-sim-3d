// The scope's picture as a frame (Tests › Endoscopy). A lumen seen down its axis: the wall at depth z is a ring of radius 1 / (z · T) about the centre, so the mucosa is a stack of flat rings
// lit by the tip (field.ts), with the serrated Z-line and the dark lumen beyond; the four varix columns wind along it as ribbons, each cut into pieces by depth and into four flat layers across
// (the shader's profile exp(-|u|^2.6) in steps), with red wale marks and cherry spots on them; a band stands as a dusky knuckle with a dark ring at its base. The esophageal balloon, the bleed
// (bleed.ts) and the bezel go over it, all inside the circle of the lumen. Pure: (state, size, palette) → Frame.
import { withAlpha, type Rgba } from '../../charts/colour.ts';
import type { Palette } from '../../charts/palette.ts';
import type { Frame, Shape } from '../../charts/scene.ts';
import { SCOPE_TOKENS } from '../copied/scope-tokens.copied.js';
import { parseColour } from '../../charts/colour.ts';
import { scopeTear } from '../copied/endo-motion.copied.js';
import { bleedShapes } from './bleed.ts';
import {
  INK, TAU, bead, centreAt, h2, knuckleAt, lit, mucosa, nz, profile, rhoOf, sstep, varixColour, veinWeight, w0, wallLight, zLineAt,
  type FieldState,
} from './field.ts';

const tk = (n: string): Rgba => parseColour((SCOPE_TOKENS as Record<string, string>)[n]!);
const mix = (a: readonly number[], b: readonly number[], t: number): [number, number, number] => [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t];

/** What goes over the field. */
export interface OverlayState { balloon: number; jet: number; pool: number; rate?: number; hr?: number; seconds: number; tearGrow: number }
export interface ScopeView { field: FieldState; over: OverlayState }

/** The layers a column is cut into across its width: where each ends (in widths from the crest), the profile there, and how the light treats it. */
const LAYERS = [
  { u: 1.75, uMid: 1.45, ao: 0.86, lift: 0.96 },
  { u: 1.15, uMid: 0.95, ao: 0.95, lift: 1.0 },
  { u: 0.65, uMid: 0.45, ao: 1.0, lift: 1.04 },
  { u: 0.28, uMid: 0.12, ao: 1.0, lift: 1.1 },
] as const;
const SEGS = 26, Z_NEAR = 0.6, Z_FAR = 9.6;
const zAt = (i: number) => Z_NEAR * Math.pow(Z_FAR / Z_NEAR, i / SEGS);
const RINGS = 28;

/** The frame, `size` px a side. R, the lumen's radius, is the 2D app's: half the box less 4 px for the bezel's outer edge. */
export function scopeFrame(v: ScopeView, size: number, pal: Palette): Frame {
  const cx = size / 2, cy = size / 2, R = size / 2 - 4;
  const st = v.field, shapes: Shape[] = [];
  const P = (rho: number, th: number): [number, number] => [cx + Math.cos(th) * rho * R, cy + Math.sin(th) * rho * R];
  const out = (s: Shape) => shapes.push(s);
  shapes.push({ k: 'clip', x: cx - R, y: cy - R, w: 2 * R, h: 2 * R, r: R });
  // ── the wall: rings from the lens in, then the Z-line and the lumen ──
  out({ k: 'circle', cx, cy, r: R * 1.03, fill: lit(mucosa(0.66), 0.66, 1) });
  const zMax = 4.8;
  for (let i = 0; i < RINGS; i++) {
    const z0 = 0.632 * Math.pow(zMax / 0.632, i / RINGS), z1 = 0.632 * Math.pow(zMax / 0.632, (i + 1) / RINGS), zm = Math.sqrt(z0 * z1);
    // each ring covers from its own radius in, the next one lays over it: so its colour is the wall's at the ring's outer edge's depth, middle of the band
    out({ k: 'circle', cx, cy, r: R * rhoOf(z0), fill: lit(mucosa(zm), zm, rhoOf(zm)) });
  }
  // the Z-line (the squamocolumnar junction): irregular, then the cardia's salmon-red, then the dark lumen
  const ZL = INK.zline;
  const zring = (dz: number, k: number) => {
    const pts: number[] = [];
    for (let j = 0; j < 72; j++) { const th = (j / 72) * TAU, [x, y] = P(rhoOf(zLineAt(th) + dz), th); pts.push(x, y); }
    const z = 5.2 + dz;
    out({ k: 'path', pts, closed: true, fill: lit(mix(mucosa(z), ZL, k), z, rhoOf(z)) });
  };
  zring(-0.25, 0.35); zring(0, 0.85);
  const deep = mix(mucosa(6), ZL, 0.85);
  for (let i = 0; i < 12; i++) {
    const z0 = 5.9 * Math.pow(22 / 5.9, i / 12), z1 = 5.9 * Math.pow(22 / 5.9, (i + 1) / 12), zm = Math.sqrt(z0 * z1);
    out({ k: 'circle', cx, cy, r: R * rhoOf(z0), fill: lit(deep, zm, rhoOf(zm)) });
  }
  // the wet film's patchy glints on the mucosa, a few arcs (the shader's `wet` and `glint` where there is no relief): short light slivers along the wall
  for (let j = 0; j < 14; j++) {
    const th = (j / 14) * TAU + 0.2, z = 1.1 + 2.6 * h2(j, 3), wet = sstep(0.35, 0.75, nz((th / TAU) * 20, z * 1.4, 20));
    if (wet < 0.5) continue;
    const rho = rhoOf(z), dth = 0.1 / Math.max(0.3, z) * 1.6, a = wallLight(z).atten * 0.22 * wet;
    const arc: number[] = [];
    for (let k = 0; k <= 4; k++) { const [x, y] = P(rho, th + dth * (k / 4 - 0.5)); arc.push(x, y); }
    out({ k: 'path', pts: arc, pen: { color: [INK.glint[0] / 255, INK.glint[1] / 255, INK.glint[2] / 255, Math.min(0.4, a)], w: Math.max(1, R * 0.012), cap: 'round' } });
  }
  // ── the four varix columns ──
  const rs = st.red;
  for (let c = 0; c < 4; c++) {
    const df = st.def[c] ?? 0, w00 = w0(c, st.grow, df);
    if (st.vis < 0.02) break;
    const col = (zm: number, rho: number, layer: (typeof LAYERS)[number]) => {
      const vw = veinWeight(profile(layer.uMid), st.vis, st.grow, df);
      const base = mix(mucosa(zm), varixColour(st.grow, Math.exp(-Math.pow(Math.abs(layer.uMid) / 0.55, 2))), vw);
      const ao = layer.ao * (layer === LAYERS[0] ? 1 - 0.16 * st.vis * st.vis : 1);
      return lit(base, zm, rho, { ao, lift: layer.lift });
    };
    for (const layer of LAYERS) {
      for (let i = 0; i < SEGS; i++) {
        const z0 = zAt(i), z1 = zAt(i + 1), zm = Math.sqrt(z0 * z1);
        if (zm > 7.2) continue;
        const b0 = bead(c, z0, st.grow), b1 = bead(c, z1, st.grow);
        const t0 = centreAt(c, z0, st), t1 = centreAt(c, z1, st);
        const h0 = w00 * b0 * layer.u, h1 = w00 * b1 * layer.u, r0 = rhoOf(z0), r1 = rhoOf(z1);
        const a = P(r0, t0 - h0), b = P(r0, t0 + h0), cc = P(r1, t1 + h1), d = P(r1, t1 - h1);
        out({ k: 'path', pts: [...a, ...b, ...cc, ...d], closed: true, fill: col(zm, rhoOf(zm), layer) });
      }
    }
    // the wet highlight along the crest, patchy
    for (let i = 0; i < SEGS; i++) {
      const z0 = zAt(i), z1 = zAt(i + 1), zm = Math.sqrt(z0 * z1);
      if (zm > 6) continue;
      const wet = sstep(0.35, 0.75, nz((centreAt(c, zm, st) / TAU) * 20, zm * 1.4, 20)) * 0.8 + 0.2;
      const k = (st.vis * st.vis) * wallLight(zm).atten * 0.3 * wet * (0.5 + st.grow);
      if (k < 0.04) continue;
      const hw = w00 * 0.1 * bead(c, zm, st.grow), off = -w00 * 0.18;
      const t0 = centreAt(c, z0, st) + off, t1 = centreAt(c, z1, st) + off;
      out({ k: 'path', pts: [...P(rhoOf(z0), t0 - hw), ...P(rhoOf(z0), t0 + hw), ...P(rhoOf(z1), t1 + hw), ...P(rhoOf(z1), t1 - hw)], closed: true, fill: [INK.glint[0] / 255, INK.glint[1] / 255, INK.glint[2] / 255, Math.min(0.5, k)] });
    }
    // red wale marks along the crest and cherry-red spots (the stigmata): they come in with the wall stress (rs) and are lost on a deflated, banded column
    const rsc = rs * (1 - df);
    if (rsc > 0.01 && st.grow > 0.1) {
      const strength = sstep(0, 0.5, rsc) * sstep(0.1, 0.3, st.grow);
      const wale: Rgba = [INK.wale[0] / 255, INK.wale[1] / 255, INK.wale[2] / 255, 1];
      for (let i = 0; i < SEGS * 2; i++) {
        const z0 = Z_NEAR * Math.pow(Z_FAR / Z_NEAR, i / (SEGS * 2)), z1 = Z_NEAR * Math.pow(Z_FAR / Z_NEAR, (i + 1) / (SEGS * 2)), zm = Math.sqrt(z0 * z1);
        if (zm > 4.8) continue;
        const off = 0.32 * (nz(c * 7, zm * 0.8, 4096) - 0.5);
        const s1 = sstep(0.66, 0.86, nz(c * 13 + 5, zm * 2.6, 4096)), s2 = sstep(0.66, 0.84, nz(c * 17 + 9, zm * 3.4, 4096)) * 0.8;
        for (const [s, u] of [[s1, off], [s2, -0.35 + off]] as const) {
          if (s < 0.05) continue;
          const k = s * 0.6 * strength * veinWeight(profile(u), st.vis, st.grow, df) / 0.74;
          const w = w00 * bead(c, zm, st.grow), hw = w * 0.1;
          const t0 = centreAt(c, z0, st) + u * w, t1 = centreAt(c, z1, st) + u * w;
          out({ k: 'path', pts: [...P(rhoOf(z0), t0 - hw), ...P(rhoOf(z0), t0 + hw), ...P(rhoOf(z1), t1 + hw), ...P(rhoOf(z1), t1 - hw)], closed: true, fill: withAlpha(wale, Math.min(0.9, k * wallLight(zm).diff * 0.9)) });
        }
      }
      // cherry-red spots: round dots on the varix, more of them as the wall nears its limit
      for (let i = 0; i < 40; i++) {
        const z = Z_NEAR * 1.1 * Math.pow(4.6 / (Z_NEAR * 1.1), i / 40);
        for (let uj = -3; uj <= 3; uj++) {
          const u = uj * 0.28 + (h2(c * 97 + i, uj + 11) - 0.5) * 0.2, th = centreAt(c, z, st) + u * w00 * bead(c, z, st.grow);
          const spot = sstep(0.95 - 0.05 * rsc, 0.98 - 0.03 * rsc, nz((th / TAU) * 220, z * 11, 220)) * sstep(0.2, 0.7, rsc);
          const vn = veinWeight(profile(u), st.vis, st.grow, df) / 0.74;
          if (spot * vn < 0.15) continue;
          const [x, y] = P(rhoOf(z), th);
          out({ k: 'circle', cx: x, cy: y, r: Math.max(1.3, 0.011 * R * Math.min(2.4, 0.9 + 1.3 * rhoOf(z) * 2)), fill: withAlpha(wale, Math.min(0.9, 0.75 * spot * Math.min(1, vn * 1.4) * strength * 1.2)) });
        }
      }
    }
  }
  // ── the band knuckles and their bands ──
  const band: Rgba = [INK.band[0] / 255, INK.band[1] / 255, INK.band[2] / 255, 1];
  for (let c = 0; c < 4; c++) {
    for (let k = 0; k < 4; k++) {
      const kn = st.kn[c * 4 + k] ?? 0;
      if (kn <= 0.001) continue;
      const K = knuckleAt(c, k, st), x = cx + K.x * R, y = cy + K.y * R, r = Math.max(2, K.r * R), light = wallLight(K.z).atten;
      const ease = kn * kn * (3 - 2 * kn);
      // the congested halo round the base, then the dusky strangulated tissue (darker at the edge, paler and violet toward the tip), then the band as a tight ring
      out({ k: 'circle', cx: x, cy: y, r: r * 1.75, fill: withAlpha([INK.halo[0] / 255, INK.halo[1] / 255, INK.halo[2] / 255, 1], 0.2 * kn) });
      out({ k: 'circle', cx: x, cy: y, r: r * 1.35, fill: withAlpha([INK.halo[0] / 255, INK.halo[1] / 255, INK.halo[2] / 255, 1], 0.2 * kn) });
      const dome = (g: number): Rgba => {
        const tip = sstep(0.55, 0.95, g);
        const rgb: [number, number, number] = [(g * 44 + 84 + 0.6 * tip * (196 - (84 + g * 44))) , (g * 28 + 34 + 0.6 * tip * (150 - (34 + g * 28))), (g * 36 + 76 + 0.6 * tip * (172 - (76 + g * 36)))];
        return lit(rgb, K.z, rhoOf(K.z), { lift: 1.15 });
      };
      for (const [f, g] of [[1.0, 0.0], [0.82, 0.35], [0.6, 0.65], [0.34, 0.92]] as const) out({ k: 'circle', cx: x, cy: y, r: r * f * (0.6 + 0.4 * ease), fill: withAlpha(dome(g), Math.min(1, kn * 1.4)) });
      out({ k: 'circle', cx: x - r * 0.18, cy: y - r * 0.22, r: r * 0.16 * ease, fill: [INK.glint[0] / 255, INK.glint[1] / 255, INK.glint[2] / 255, Math.min(0.5, 0.9 * light * kn)] });
      // the band cinches in from a wide loop (rr0 = 1 + (1 − kn) · 0.5) to the base of the knuckle
      const rr0 = 1 + (1 - kn) * 0.5;
      out({ k: 'circle', cx: x, cy: y, r: r * rr0, pen: { color: withAlpha(band, 0.8 * sstep(0, 0.25, kn)), w: Math.max(1.4, r * 0.2) } });
    }
  }
  // ── the esophageal balloon fills the view (the gastric one lies below it, in the stomach, and shows only as the jet easing out) ──
  const o = v.over;
  if (o.balloon > 0) {
    const hi = tk('scope-balloon-hi'), lo = tk('scope-balloon-lo');
    out({ k: 'circle', cx, cy, r: R * 0.82, fill: withAlpha(lo, o.balloon) });
    out({ k: 'circle', cx: cx - R * 0.12, cy: cy - R * 0.12, r: R * 0.55, fill: withAlpha(hi, o.balloon * 0.55) });
    out({ k: 'circle', cx: cx - R * 0.2, cy: cy - R * 0.2, r: R * 0.26, fill: withAlpha(hi, o.balloon * 0.6) });
    out({ k: 'circle', cx, cy, r: R * 0.82, pen: { color: [1, 1, 1, 0.5 * o.balloon], w: 2 } });
  }
  // ── the bleed ──
  if (o.jet > 0) {
    const tear = scopeTear(o.tearGrow) as { x: number; y: number };
    for (const s of bleedShapes({ cx, cy, R, jx: cx + tear.x * R, jy: cy + tear.y * R, t: o.seconds, a: o.jet, rate: o.rate, fill: o.pool, hr: o.hr })) out(s);
  }
  out({ k: 'unclip' });
  // ── the bezel: --scope-rim is one near-black on every look, which is gone on a dark one; there the ring gives 1 px of its 7 to a hairline on its outer edge ──
  const dark = pal.dark;
  out({ k: 'circle', cx, cy, r: R, pen: { color: tk('scope-rim'), w: dark ? 6 : 7 } });
  if (dark) out({ k: 'circle', cx, cy, r: R + 3.5, pen: { color: pal.tok('border'), w: 1 } });
  return { w: size, h: size, shapes, label: 'Endoscopic view' };
}
