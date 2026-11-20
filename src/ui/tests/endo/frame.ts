// The scope's picture as a frame (Tests › Endoscopy). A lumen seen down its axis: the wall at depth z is a ring of radius 1 / (z · T) about the centre, so the mucosa is one radial gradient
// lit by the tip (field.ts, a colour at each depth, blended between), with the soft Z-line and the dark lumen beyond; the four varix columns wind along it as grids, a colour at every point of
// their length and width (the shader's profile exp(-|u|^2.6) lit as a bulge: bright crest, shaded flanks, a soft shadow where it leaves the wall), with red wale marks and cherry spots on them;
// a band stands as a dusky knuckle with a dark ring at its base. Nothing is stepped: every surface is smooth between its sample points (Mohammad, 20 Nov: "need to be smooth, and bulging"). The esophageal balloon, the bleed
// (bleed.ts) and the bezel go over it, all inside the circle of the lumen. Pure: (state, size, palette) → Frame.
import { withAlpha, type Rgba } from '../../charts/colour.ts';
import type { Palette } from '../../charts/palette.ts';
import type { Frame, Shape } from '../../charts/scene.ts';
import { SCOPE_TOKENS } from '../copied/scope-tokens.copied.js';
import { parseColour } from '../../charts/colour.ts';
import { scopeTear } from '../copied/endo-motion.copied.js';
import { bleedShapes } from './bleed.ts';
import { mottlePatches, netFade, netLines, patchRadius } from './mucosa.ts';
import {
  INK, TAU, bead, centreAt, h2, knuckleAt, lit, mucosa, nz, profile, rhoOf, sstep, varixColour, veinWeight, w0, wallLight, zLineAt,
  type FieldState,
} from './field.ts';

const tk = (n: string): Rgba => parseColour((SCOPE_TOKENS as Record<string, string>)[n]!);
const mix = (a: readonly number[], b: readonly number[], t: number): [number, number, number] => [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t];

/** What goes over the field. */
export interface OverlayState { balloon: number; jet: number; pool: number; rate?: number; hr?: number; seconds: number; tearGrow: number }
export interface ScopeView { field: FieldState; over: OverlayState }

/** A column is sampled across its width at NU points from -U_MAX to U_MAX widths from the crest, and along its length at ROWS depths: the picture blends between them. */
const NU = 17, U_MAX = 1.9, ROWS = 46, Z_NEAR = 0.6, Z_FAR = 9.6, Z_END = 7.2;
const zAt = (i: number) => Z_NEAR * Math.pow(Z_END / Z_NEAR, i / (ROWS - 1));
void Z_FAR;
const WALL_STOPS = 40;
/** The bulge of a column at u widths from its crest: its normal's share facing the lens (a half-cylinder 1.45 wide), and the contact shadow where it leaves the wall. */
const facing = (u: number) => { const q = Math.abs(u) / 1.45; return q >= 1 ? 0 : Math.sqrt(1 - q * q); };
const shadow = (u: number) => { const a = Math.abs(u); return Math.exp(-Math.pow((a - 1.35) / 0.32, 2)) * (1 - sstep(1.65, 1.9, a)); };

/** The frame, `size` px a side. R, the lumen's radius, is the 2D app's: half the box less 4 px for the bezel's outer edge. */
export function scopeFrame(v: ScopeView, size: number, pal: Palette): Frame {
  const cx = size / 2, cy = size / 2, R = size / 2 - 4;
  const st = v.field, shapes: Shape[] = [];
  const P = (rho: number, th: number): [number, number] => [cx + Math.cos(th) * rho * R, cy + Math.sin(th) * rho * R];
  const out = (s: Shape) => shapes.push(s);
  shapes.push({ k: 'clip', x: cx - R, y: cy - R, w: 2 * R, h: 2 * R, r: R });
  // ── the wall: rings from the lens in, then the Z-line and the lumen ──
  out({ k: 'circle', cx, cy, r: R * 1.03, fill: lit(mucosa(0.66), 0.66, 1) });
  const zMax = 4.8, zIn = 0.632;
  const wall: { r: number; c: Rgba }[] = [];
  for (let i = 0; i <= WALL_STOPS; i++) { const z = zIn * Math.pow(zMax / zIn, i / WALL_STOPS); wall.push({ r: R * rhoOf(z), c: lit(mucosa(z), z, rhoOf(z)) }); }
  out({ k: 'radial', cx, cy, stops: wall.reverse() });
  // the Z-line (the squamocolumnar junction): irregular, then the cardia's salmon-red, then the dark lumen
  const ZL = INK.zline;
  // (laid in a few translucent layers, each a little nearer the lens than the last: the junction grades in over a hand's breadth, as the shader's smoothstep does)
  const zring = (dz: number, k: number, a: number) => {
    const pts: number[] = [];
    for (let j = 0; j < 72; j++) { const th = (j / 72) * TAU, [x, y] = P(rhoOf(zLineAt(th) + dz), th); pts.push(x, y); }
    const z = 5.2 + dz;
    out({ k: 'path', pts, closed: true, fill: withAlpha(lit(mix(mucosa(z), ZL, k), z, rhoOf(z)), a) });
  };
  for (let j = 0; j < 7; j++) { const t = j / 6; zring(-0.9 + 0.9 * t, 0.15 + 0.7 * t, 0.42); }
  // the mucosal mottling (the shader's 0.93 + 0.12 · mott: the wall is not one flat pink): soft patches lighter or darker than the wall's mean, then the fine submucosal vessels (the shader's
  // two ridged noises): a thin red-violet net along the wall, lost with depth. Both lie under the columns, as the shader mixes the vein over them.
  for (const m of mottlePatches()) {
    const rho = rhoOf(m.z), [x, y] = P(rho, m.th);
    out({ k: 'circle', cx: x, cy: y, r: Math.max(1.5, patchRadius(rho) * R), fill: m.d > 0 ? [1, 1, 1, Math.min(0.14, m.d * 1.5)] : [0, 0, 0, Math.min(0.1, -m.d)] });
  }
  const netW = Math.max(1, R * 0.008);
  for (const ln of netLines()) {
    const pts: number[] = [];
    for (let k = 0; k < ln.pts.length; k += 2) { const [x, y] = P(rhoOf(ln.pts[k + 1]!), ln.pts[k]!); pts.push(x, y); }
    const c = lit(INK.vessels, ln.z, rhoOf(ln.z));
    out({ k: 'path', pts, pen: { color: [c[0], c[1], c[2], Math.min(0.5, ln.weight * 1.9 * netFade(ln.z))], w: netW, cap: 'round', join: 'round' } });
  }
  const deep = mix(mucosa(6), ZL, 0.85), dstops: { r: number; c: Rgba }[] = [];
  for (let i = 0; i <= 14; i++) { const z = 5.9 * Math.pow(22 / 5.9, i / 14), c = lit(deep, z, rhoOf(z)); dstops.push({ r: R * rhoOf(z), c: i === 0 ? withAlpha(c, 0) : c }); }
  dstops.splice(1, 0, { r: dstops[0]!.r * 0.93, c: lit(deep, 5.9 / 0.93, rhoOf(5.9 / 0.93)) });
  dstops.push({ r: 0, c: dstops[dstops.length - 1]!.c });
  out({ k: 'radial', cx, cy, stops: dstops.reverse() });
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
    // how much the column stands out of the wall: it swells with its size and the visibility, and a strangulated one lies down
    const bulgeK = st.vis * (0.4 + 0.6 * st.grow) * (1 - 0.6 * df);
    // the body: a colour at every point of a grid (depth × width). The vein shows by its profile where the wall is thin over it, lit as a half-cylinder (bright crest, darker flanks) with a soft
    // shadow where it leaves the wall, and fades into the lumen's dark at its far end.
    const pts: number[] = [], cols: Rgba[] = [];
    for (let i = 0; i < ROWS; i++) {
      const z = zAt(i), rho = rhoOf(z), t = centreAt(c, z, st), bw = w00 * bead(c, z, st.grow), far = 1 - sstep(4.6, Z_END, z);
      for (let j = 0; j < NU; j++) {
        const u = -U_MAX + (2 * U_MAX * j) / (NU - 1), [x, y] = P(rho, t + u * bw);
        pts.push(x, y);
        const vw = veinWeight(profile(u), st.vis, st.grow, df);
        const base = mix(mucosa(z), varixColour(st.grow, Math.exp(-Math.pow(Math.abs(u) / 0.55, 2))), vw);
        const col = lit(base, z, rho, { ao: 1 - 0.34 * bulgeK * shadow(u), lift: 1 + bulgeK * (0.3 * facing(u) - 0.1 * (1 - facing(u))) * Math.min(1, vw * 3) });
        cols.push([col[0], col[1], col[2], far]);
      }
    }
    out({ k: 'grid', rows: ROWS, cols: NU, pts, colors: cols });
    // the wet highlight along the crest, patchy: a thin ribbon, clear at its edges and ends
    {
      const hp: number[] = [], hc: Rgba[] = [], off = -w00 * 0.2;
      let any = false;
      for (let i = 0; i < ROWS; i++) {
        const z = zAt(i), t = centreAt(c, z, st) + off, hw = w00 * 0.2 * bead(c, z, st.grow), rho = rhoOf(z);
        const wet = sstep(0.35, 0.75, nz((centreAt(c, z, st) / TAU) * 20, z * 1.4, 20)) * 0.8 + 0.2;
        const k = z > 6.2 ? 0 : Math.min(0.5, (st.vis * st.vis) * wallLight(z).atten * 0.34 * wet * (0.5 + st.grow) * (1 - sstep(4, 6.2, z)));
        if (k >= 0.02) any = true;
        for (const q of [-1, 0, 1]) { const [x, y] = P(rho, t + q * hw); hp.push(x, y); hc.push(withAlpha([INK.glint[0] / 255, INK.glint[1] / 255, INK.glint[2] / 255, 1], q === 0 ? k : 0)); }
      }
      if (any) out({ k: 'grid', rows: ROWS, cols: 3, pts: hp, colors: hc });
    }
    // red wale marks along the crest and cherry-red spots (the stigmata): they come in with the wall stress (rs) and are lost on a deflated, banded column
    const rsc = rs * (1 - df);
    if (rsc > 0.01 && st.grow > 0.1) {
      const strength = sstep(0, 0.5, rsc) * sstep(0.1, 0.3, st.grow);
      const wale: Rgba = [INK.wale[0] / 255, INK.wale[1] / 255, INK.wale[2] / 255, 1];
      const WR = ROWS * 2;
      for (const line of [0, 1] as const) {
        const wp: number[] = [], wc: Rgba[] = [];
        let any = false;
        for (let i = 0; i < WR; i++) {
          const zm = Z_NEAR * Math.pow(4.8 / Z_NEAR, i / (WR - 1)), off = 0.32 * (nz(c * 7, zm * 0.8, 4096) - 0.5);
          const sv = line === 0 ? sstep(0.66, 0.86, nz(c * 13 + 5, zm * 2.6, 4096)) : sstep(0.66, 0.84, nz(c * 17 + 9, zm * 3.4, 4096)) * 0.8;
          const u = line === 0 ? off : -0.35 + off;
          const k = sv < 0.05 ? 0 : sv * 0.6 * strength * veinWeight(profile(u), st.vis, st.grow, df) / 0.74;
          const w = w00 * bead(c, zm, st.grow), hw = w * 0.12, a = Math.min(0.9, k * wallLight(zm).diff * 0.9) * (1 - sstep(4, 4.8, zm));
          if (a > 0.02) any = true;
          const t = centreAt(c, zm, st) + u * w;
          for (const q of [-1, 0, 1]) { const [x, y] = P(rhoOf(zm), t + q * hw); wp.push(x, y); wc.push(withAlpha(wale, q === 0 ? a : 0)); }
        }
        if (any) out({ k: 'grid', rows: WR, cols: 3, pts: wp, colors: wc });
      }
      // cherry-red spots: soft round dots on the varix, more of them as the wall nears its limit
      for (let i = 0; i < 40; i++) {
        const z = Z_NEAR * 1.1 * Math.pow(4.6 / (Z_NEAR * 1.1), i / 40);
        for (let uj = -3; uj <= 3; uj++) {
          const u = uj * 0.28 + (h2(c * 97 + i, uj + 11) - 0.5) * 0.2, th = centreAt(c, z, st) + u * w00 * bead(c, z, st.grow);
          const spot = sstep(0.95 - 0.05 * rsc, 0.98 - 0.03 * rsc, nz((th / TAU) * 220, z * 11, 220)) * sstep(0.2, 0.7, rsc);
          const vn = veinWeight(profile(u), st.vis, st.grow, df) / 0.74;
          if (spot * vn < 0.15) continue;
          const [x, y] = P(rhoOf(z), th), r = Math.max(1.6, 0.013 * R * Math.min(2.4, 0.9 + 1.3 * rhoOf(z) * 2)), a = Math.min(0.9, 0.75 * spot * Math.min(1, vn * 1.4) * strength * 1.2);
          out({ k: 'radial', cx: x, cy: y, stops: [{ r: 0, c: withAlpha(wale, a) }, { r: r * 0.55, c: withAlpha(wale, a * 0.9) }, { r: r * 1.15, c: withAlpha(wale, 0) }] });
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
      // the congested halo round the base (soft: it fades out into the wall), then the dusky strangulated tissue (darker at the edge, paler and violet toward the tip, a smooth dome), then the band as a tight ring
      const halo: Rgba = [INK.halo[0] / 255, INK.halo[1] / 255, INK.halo[2] / 255, 1];
      out({ k: 'radial', cx: x, cy: y, stops: [{ r: 0, c: withAlpha(halo, 0.38 * kn) }, { r: r * 1.2, c: withAlpha(halo, 0.34 * kn) }, { r: r * 1.8, c: withAlpha(halo, 0) }] });
      const dome = (g: number): Rgba => {
        const tip = sstep(0.55, 0.95, g);
        const rgb: [number, number, number] = [(g * 44 + 84 + 0.6 * tip * (196 - (84 + g * 44))) , (g * 28 + 34 + 0.6 * tip * (150 - (34 + g * 28))), (g * 36 + 76 + 0.6 * tip * (172 - (76 + g * 36)))];
        return lit(rgb, K.z, rhoOf(K.z), { lift: 1.15 });
      };
      const sc = 0.6 + 0.4 * ease, A = Math.min(1, kn * 1.4);
      out({ k: 'radial', cx: x, cy: y, stops: [[0, 0.98], [0.2, 0.95], [0.34, 0.92], [0.6, 0.65], [0.82, 0.35], [1, 0]].map(([f, g]) => ({ r: r * f! * sc, c: withAlpha(dome(g!), A) })) });
      out({ k: 'radial', cx: x - r * 0.18, cy: y - r * 0.22, stops: [{ r: 0, c: [INK.glint[0] / 255, INK.glint[1] / 255, INK.glint[2] / 255, Math.min(0.5, 0.9 * light * kn)] }, { r: Math.max(1, r * 0.3 * ease), c: [INK.glint[0] / 255, INK.glint[1] / 255, INK.glint[2] / 255, 0] }] });
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
    out({ k: 'radial', cx: cx - R * 0.2, cy: cy - R * 0.2, stops: [{ r: 0, c: withAlpha(hi, o.balloon * 0.8) }, { r: R * 0.26, c: withAlpha(hi, o.balloon * 0.6) }, { r: R * 0.62, c: withAlpha(hi, 0) }] });
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
