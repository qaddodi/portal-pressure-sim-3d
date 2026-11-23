// The ultrasound probe's look: approved 23 Nov 2026 as "1A", the classic curvilinear probe (docs/approved/us-probe.md, mock /mnt/project-files/us-probe-mocks/option1-variants/). Pure numbers, no three:
// the body's outline (a convex face, a head, a waist, a grip, a boot), the bands of other colour that lie flush on it (the lens, the accent ring, the rubber boot), the seams between them, the status bead and
// the short cable that fades out. Units are the 2D app's device px along the probe's axis from the face (the app draws them at PROBE.SCALE), y across.
//
// WHERE the probe stands is the layout search's (copied/dop-probe.copied.js: PROBE.LEN 84 and HALF 17.5 are its room); this file only says what is drawn there.

/** One station of a revolved body: x along the axis from the face's apex, r the radius there. */
export interface Station { x: number; r: number }

/** r(x) through the keys: a monotone cubic (it never overshoots a key), the same curve the mock was drawn with. */
export function monotone(keys: readonly (readonly [number, number])[]): (x: number) => number {
  const n = keys.length, xs = keys.map((k) => k[0]), ys = keys.map((k) => k[1]);
  const d: number[] = [], m: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1]! - ys[i]!) / (xs[i + 1]! - xs[i]!));
  m[0] = d[0]!; m[n - 1] = d[n - 2]!;
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1]! * d[i]! <= 0 ? 0 : (d[i - 1]! + d[i]!) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i]! / d[i]!, b = m[i + 1]! / d[i]!, h = Math.hypot(a, b);
    if (h > 3) { m[i] = (3 * a / h) * d[i]!; m[i + 1] = (3 * b / h) * d[i]!; }
  }
  return (x: number): number => {
    if (x <= xs[0]!) return ys[0]!;
    if (x >= xs[n - 1]!) return ys[n - 1]!;
    let i = 0; while (i < n - 2 && x > xs[i + 1]!) i++;
    const h = xs[i + 1]! - xs[i]!, t = (x - xs[i]!) / h, t2 = t * t, t3 = t2 * t;
    return Math.max(0, (2 * t3 - 3 * t2 + 1) * ys[i]! + (t3 - 2 * t2 + t) * h * m[i]! + (-2 * t3 + 3 * t2) * ys[i + 1]! + (t3 - t2) * h * m[i + 1]!);
  };
}

/** The convex face: a circular arc of footprint half width `FACE_HALF` whose edge lies `FACE_SAG` behind its apex. */
export const FACE_HALF = 12.5, FACE_SAG = 4.5;
const FACE_R = (FACE_HALF * FACE_HALF + FACE_SAG * FACE_SAG) / (2 * FACE_SAG);
const faceR = (x: number): number => { const c = FACE_R - x; return Math.sqrt(Math.max(0, FACE_R * FACE_R - c * c)); };

/** Behind the face: the head (13.3 wide at its fullest), the shoulder, the waist, the grip, the boot's taper. */
const KEYS: readonly (readonly [number, number])[] = [[4.5, 12.5], [7, 12.9], [15, 13.3], [19, 11.9], [23, 8.3], [28, 7.3], [39, 7.5], [43, 6.2], [47, 4.8], [54, 3.9]];
const behind = monotone(KEYS);
/** The boot ends in a short round cap (a CLOSED end: an open end of a revolved body has no outline, the line and the rim stop short of it, owner 23 Nov: "the outline seems not to include the tip"): from x = BOOT_FLAT the radius
 *  closes to nothing over CAP px, an ellipse. */
export const BOOT_FLAT = 54, CAP = 2.2, BODY_END = BOOT_FLAT + CAP;
const BOOT_R = 3.9;
const capR = (x: number): number => { const t = (x - BOOT_FLAT) / CAP; return BOOT_R * Math.sqrt(Math.max(0, 1 - t * t)); };
/** The probe's radius at x (0 at the apex, 3.9 at the boot's end BOOT_FLAT, closed again at BODY_END). */
export const radiusAt = (x: number): number => (x <= FACE_SAG ? faceR(Math.max(0, x)) : x <= BOOT_FLAT ? behind(x) : capR(x));
/** Rings of the face's dome and of the body behind it. */
const DOME_RINGS = 14, CAP_RINGS = 6, STEP = 1.25;

/** Stations of a stretch [x0, x1] of the body: the dome by angle (so the apex is round), the rest every STEP; both ends exact. */
export function stations(x0: number, x1: number): Station[] {
  const out: Station[] = [];
  const add = (x: number) => { if (!out.length || x - out[out.length - 1]!.x > 1e-6) out.push({ x, r: radiusAt(x) }); };
  add(x0);
  if (x0 < FACE_SAG) {
    const a1 = Math.asin(Math.min(1, radiusAt(Math.min(x1, FACE_SAG)) / FACE_R));
    for (let i = 1; i <= DOME_RINGS; i++) { const x = FACE_R * (1 - Math.cos((i / DOME_RINGS) * a1)); if (x > x0 + 1e-6 && x <= Math.min(x1, FACE_SAG) + 1e-6) add(Math.min(x, x1)); }
  }
  for (let x = Math.max(x0, FACE_SAG) + STEP; x < Math.min(x1, BOOT_FLAT) - 1e-6; x += STEP) add(x);
  if (x1 > BOOT_FLAT) {
    add(Math.max(x0, BOOT_FLAT));
    for (let i = 1; i < CAP_RINGS; i++) { const a = (i / CAP_RINGS) * (Math.PI / 2), x = BOOT_FLAT + CAP * Math.sin(a); if (x > x0 + 1e-6 && x < x1 - 1e-6) add(x); }
  }
  add(x1);
  return out;
}

/** The whole body, the apex to the boot's end. */
export const bodyStations = (): Station[] => stations(0, BODY_END);

/** A band of other colour, flush on the body between x0 and x1. */
export interface Band { id: 'lens' | 'ring' | 'boot'; x0: number; x1: number }
export const BANDS: readonly Band[] = [{ id: 'lens', x0: 0, x1: 7 }, { id: 'ring', x0: 21.4, x1: 24.4 }, { id: 'boot', x0: 42.2, x1: BODY_END }];
/** The seams across the body: the lens's end is inked like the old face band's edge (1.4 px, the head's ink), the others are a soft dark hairline (0.9 px). */
export const SEAMS: readonly { x: number; ink: boolean }[] = [{ x: 7, ink: true }, { x: 21.4, ink: false }, { x: 24.4, ink: false }, { x: 42.2, ink: false }];
export const SEAM_INK_PX = 1.4, SEAM_SOFT_PX = 0.9;

/** The status bead on the grip, and its radius (px). */
export const BEAD = { x: 29, r: 1.2 } as const;

/** The cable: a cubic Bezier leaving the boot (px along the axis, across), its width, and how much of its length from the free end fades out (it is never cut off). */
export const CABLE = { pts: [[53.5, 0], [57.5, 0], [60, 1.5], [63, 5]] as const, w: 2.0, fade: 0.6, rings: 14 } as const;
export function cableAt(t: number): { x: number; y: number } {
  const [p0, p1, p2, p3] = CABLE.pts, u = 1 - t;
  return { x: u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], y: u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1] };
}

/** The probe's colours per look scheme (hex): the mock's swatches. The accent is the look's own (LOOKS[look].accent); the rest is a device colour, the same on every look of a scheme. */
export interface ProbeSwatch { shell: string; lens: string; boot: string }
export const SWATCH: Record<'light' | 'dark', ProbeSwatch> = {
  light: { shell: '#F5F2EA', lens: '#33447A', boot: '#6C7079' },
  dark: { shell: '#ECE8DE', lens: '#1B2646', boot: '#8E939E' },
};
/** The soft seam's colour over the shell: the mock's rgba(30,30,40,.45) on Light, rgba(0,0,0,.5) on Dark, taken over the shell colour. */
export const SEAM_SOFT: Record<'light' | 'dark', { rgb: readonly [number, number, number]; a: number }> = { light: { rgb: [30, 30, 40], a: 0.45 }, dark: { rgb: [0, 0, 0], a: 0.5 } };
