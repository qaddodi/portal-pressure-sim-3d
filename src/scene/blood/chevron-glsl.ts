// THE ONE CHEVRON (Mohammad, 20 Nov: "use the same chevron shape as the anatomy; chevrons unified. also the blood chevrons black; just like anatomy"): the 2D app's flow head (chevron-glsl.js chevHead:
// a slim head with a notched back, its point leading the way the blood goes, a hard-edged ring round it), the same in the Anatomy's vessels (vessels/shaders.ts) and in the 3D lobule and sinusoid tubes
// (micro3d/cel3d.ts). Its tone on blood is the Anatomy's: dark ink (the look's chevron ink mixed a little with the lumen's own colour) on a light lumen, cream on a dark one, decided by the lumen's luminance with a latch
// (hysteresis) and a short ease so a head never flips back and forth or pops (lenses/chevron-ink.ts), and always the dark ring. The GLSL is one chunk; tests/b3-chevron-unified.test.ts pins that both sites include it.
//   chevD(u, ay, hw)                       the head's signed distance (u along, toward the point; ay across; hw its half width)
//   chevHead(u, ay, hw, px, rev)           (coverage, ring) of one head, px the pixel in the same unit
//   chevCreamSoft(drawn)                   how cream (1) or dark (0) a head is on a lumen drawn in colour `drawn`, a short eased step on its luminance (where no vessel has a latched value)
//   chevInk(cream, markDark, markLight)    the head's core tone: dark ink to cream by `cream` (the vessel's own latched, eased value, lenses/chevron-ink.ts; or chevCreamSoft)
//   chevLattice(arc, across, pitch, px, dir)  heads every `pitch` along `arc`, in a tube whose face runs -1 .. 1 across: heads over the middle 0.55 of it (never near the wall), pointing toward `dir`
/** The Anatomy's, the Circuit's and the micro tubes' heads, ONE shape in every view (Mohammad, 20 Nov: "the chevrons should not be 100% of the width of the vessel, elegant and sharp"): a SLIM, SHARP head, centred in the lumen with clear blood on both
 *  sides, never touching the ink. Its width is SHARE (55 percent) of the lumen's, never over SHARE_MAX (60 percent), at least MIN_W_PX CSS px wide on a thin tube (4 px: on a tube under 6.7 px across the floor would pass SHARE_MAX, and then 60 percent wins);
 *  its length along the vessel is LEN_OF_W x its width (1.4: a narrow point of about 39 degrees, the tip sharp, never rounded); its edge is ramped EDGE_PX px and its ring is RING_PX px wide at most. Spacing: the lattice's spacing is PITCH_PX at the level where a head is added and
 *  1.33 x PITCH_PX where the finer ones have just left (chevKeep), on every tube from MIN_R_PX of radius (under 3 px across there is none). */
/** WHEN a head is dark ink and when it is cream (external review, 20 Nov: "chevron ink flips dark/cream at a hard luminance threshold"; Mohammad: nothing pops). The linear luminance of the lumen as DRAWN: 2D's step at AT (0.26: cream is 3:1 or more up to it, near
 *  black above it). A vessel's ink is LATCHED (chevron-ink.ts): cream once its mean luminance falls under AT - HYST, dark once it rises over AT + HYST, and kept as it was between the two, so a pressure that hovers at the threshold never flickers it. The
 *  change eases over EASE_MS (a head's tone glides, never snaps). Where no vessel has a latched value (the stream lenses' lanes, the plain anatomy) the tone is a short eased step of +-BAND about AT: narrow, so a head is never a grey halfway. */
export const CHEV_INK = { AT: 0.26, HYST: 0.04, BAND: 0.02, EASE_MS: 200 } as const;
/** The row of the lens colour texture the latched, eased ink is read from (lenses/model.ts GRAD_ROWS; written by lenses/chevron-ink.ts, read by vessels/shaders.ts chevCreamOf). */
export const CHEV_INK_ROW = 4;
/** The linear luminance the shaders judge a lumen by (chevLum): sRGB 0..1 in, Rec. 709 weights on the 2.2 power. */
export const chevLum = (c: readonly number[]): number => 0.2126 * Math.max(c[0]!, 0) ** 2.2 + 0.7152 * Math.max(c[1]!, 0) ** 2.2 + 0.0722 * Math.max(c[2]!, 0) ** 2.2;
/** The twin of chevCreamSoft: 1 (cream) under AT - BAND, 0 (dark) over AT + BAND, smooth between. */
export const chevCreamSoftJs = (lum: number): number => { const t = Math.min(1, Math.max(0, (lum - (CHEV_INK.AT - CHEV_INK.BAND)) / (2 * CHEV_INK.BAND))); return 1 - t * t * (3 - 2 * t); };
/** The latch (a Schmitt trigger): was the ink cream (true) and the lumen now `lum`? Cream under AT - HYST, dark over AT + HYST, else unchanged. */
export const chevLatchJs = (wasCream: boolean, lum: number): boolean => (lum < CHEV_INK.AT - CHEV_INK.HYST ? true : lum > CHEV_INK.AT + CHEV_INK.HYST ? false : wasCream);
export const CHEV = { PITCH_PX: 130, MIN_R_PX: 1.5, SHARE: 0.55, SHARE_MAX: 0.6, MIN_W_PX: 4, LEN_OF_W: 1.4, EDGE_PX: 0.7, RING_PX: 1, SIZE_MIN: 0.4, ALPHA_KEEP: 0.12 } as const;
/** The twin of chevSize / chevAlpha: how big and how opaque a head that keeps `keep` (0 to 1) of itself is drawn. Whole at 1; at SIZE_MIN of its size and fully inked until the last ALPHA_KEEP of its keep, then gone: never half transparent. */
export const chevSizeJs = (keep: number): number => CHEV.SIZE_MIN + (1 - CHEV.SIZE_MIN) * keep;
export const chevAlphaJs = (keep: number): number => { const t = Math.min(1, Math.max(0, keep / CHEV.ALPHA_KEEP)); return t * t * (3 - 2 * t); };
/** The twin of chevHw in the shaders: a head's half width, CSS px, on a lumen of radius `R` CSS px. */
export const chevHalfWidthPx = (R: number): number => Math.min(CHEV.SHARE_MAX * R, Math.max(CHEV.SHARE * R, 0.5 * CHEV.MIN_W_PX));
/** The finest octave of the lattice (Mohammad, 20 Nov: "too many chevrons when I zoom in and not many when zoomed out, spaced equally no matter what zoom"). The spacing is held in SCREEN px by octaves: the lattice level is lv = log2(PITCH_PX in world units / the base pitch),
 *  its heads stand at base x 2^floor(lv) along the stream (a coarser octave's heads are every other head of the finer one, so a head never moves when the octave changes), and the in-between heads of the finer octave fade out as lv rises through the octave
 *  (chevKeep: the odd heads keep exp2(1 - f) - 1 of themselves, 1 at the octave's start and 0 at its end, which holds the DENSITY at one head per PITCH_PX at every zoom): the full heads are 1 to 2 x PITCH_PX apart (60 to 120 px) and the whole lattice 0.5 to 1 x
 *  (30 to 60 px) at every zoom. No floor short of this many octaves (about 1000x of zoom): there used to be one at -1, past which a zoom-in only stretched the spacing. */
export const CHEV_LEVEL_MIN = -10;
/** The twin of the shaders' level: `ptWorld` the pitch in world units (PITCH_PX x the world units under one CSS px), `baseWorld` the lattice's base pitch (28 figure units; the micro tubes' uFlowPitch). */
export function chevLevel(ptWorld: number, baseWorld: number): { lv: number; n0: number; f: number; P: number } {
  const lv = Math.max(CHEV_LEVEL_MIN, Math.log2(ptWorld / baseWorld)), n0 = Math.floor(lv);
  return { lv, n0, f: lv - n0, P: baseWorld * Math.pow(2, n0) };
}
/** The twin of chevKeep: how much of head j (of the lattice of level n0) shows at level lv. Every other head (j even) belongs to the next octave and stays whole; the odd heads fade over the octave. */
export function chevKeepJs(j: number, n0: number, lv: number): number {
  let q = Math.abs(j), m = 0;
  for (let i = 0; i < 10; i++) { if (q < 0.5 || q % 2 > 0.5) break; q *= 0.5; m += 1; }
  if (q < 0.5) m = 10;
  return Math.min(1, Math.max(0, Math.pow(2, 1 - (lv - n0 - m)) - 1));
}
/** The head's outline as chevD draws it, in shares of its length L (2 x LEN_OF_W x its half width): the point stands TIP of L ahead of the middle, the back BACK of L behind it, and the notch cuts NOTCH of L into the back. One set, read by the shader and by the flat marks that point at a stenosis (labels/clamp-marks.ts). */
export const CHEV_SHAPE = { TIP: 0.55, BACK: 0.45, NOTCH: 0.32 } as const;
/** A head of half width `hw` as a polygon in its own frame: the point at the origin, the head's back running along +x (so it points the way -x), the corners and the notch as chevD draws them. */
export function chevPolygon(hw: number): [number, number][] {
  const L = 2 * CHEV.LEN_OF_W * hw, tipU = CHEV_SHAPE.TIP * L, backU = -CHEV_SHAPE.BACK * L, notchU = backU + CHEV_SHAPE.NOTCH * L;
  return [[0, 0], [tipU - backU, hw], [tipU - notchU, 0], [tipU - backU, -hw]];
}
export const CHEVRON_GLSL = /* glsl */ `
// a head's half width: SHARE of the lumen's radius, at least MIN_W_PX wide (wpc: the units under one CSS px), never over SHARE_MAX of the radius
float chevHw(float R, float wpc) { return min(${CHEV.SHARE_MAX} * R, max(${CHEV.SHARE} * R, ${(0.5 * CHEV.MIN_W_PX).toFixed(1)} * wpc)); }
float chevD(float u, float ay, float hw) {
  float L = ${(2 * CHEV.LEN_OF_W).toFixed(1)} * hw, tip = ${CHEV_SHAPE.TIP} * L, back = -${CHEV_SHAPE.BACK} * L, notch = ${CHEV_SHAPE.NOTCH} * L, k = L / hw;
  float side = (u - tip + ay * k) / sqrt(1.0 + k * k);
  float rear = back + notch * (1.0 - clamp(ay / hw, 0.0, 1.0)) - u;
  return max(max(side, rear), ay - hw);
}
vec2 chevHead(float u, float ay, float hw, float px, float rev) {
  float d = chevD(u, ay, hw);
  float c = 1.0 - smoothstep(-${CHEV.EDGE_PX / 2} * px, ${CHEV.EDGE_PX / 2} * px, d);   // (an edge ramp of EDGE_PX px: crisp)
  float rw = ${CHEV.RING_PX.toFixed(1)} * px;   // the head's ring: a hard-edged outline this wide at most, never a halo
  float rim = 1.0 - smoothstep(rw - ${CHEV.EDGE_PX / 2} * px, rw + ${CHEV.EDGE_PX / 2} * px, d);
  if (rev > 0.0) {
    float d2 = 0.6 * chevD((u + ${(0.68 * 2 * CHEV.LEN_OF_W).toFixed(3)} * hw) / 0.6, ay / 0.6, hw);
    c = max(c, rev * (1.0 - smoothstep(-${CHEV.EDGE_PX / 2} * px, ${CHEV.EDGE_PX / 2} * px, d2)));
    rim = max(rim, rev * (1.0 - smoothstep(rw - ${CHEV.EDGE_PX / 2} * px, rw + ${CHEV.EDGE_PX / 2} * px, d2)));
  }
  return vec2(c, rim * (1.0 - c));
}
// how much of head j of the lattice of level n0 shows at level lv (coarser heads are a subset of finer ones; nothing jumps)
float chevKeep(float j, float n0, float lv) {
  float m = 0.0, q = abs(j);
  for (int i = 0; i < 10; i++) { if (q < 0.5 || mod(q, 2.0) > 0.5) break; q *= 0.5; m += 1.0; }
  if (q < 0.5) m = 10.0;
  return clamp(exp2(1.0 - (lv - n0 - m)) - 1.0, 0.0, 1.0);
}
// the in-between heads of the finer octave leave by SHRINKING (chevSize: from whole to SIZE_MIN of themselves) and vanish in the last of their keep (chevAlpha), never by turning translucent: a half-faded head is a pale ghost
// chevron beside the dark ones (Mohammad, 20 Nov: "pale slabs"), a smaller one in the same ink is not
float chevSize(float keep) { return ${CHEV.SIZE_MIN} + ${(1 - CHEV.SIZE_MIN).toFixed(2)} * keep; }
float chevAlpha(float keep) { return smoothstep(0.0, ${CHEV.ALPHA_KEEP}, keep); }
// the head's ring: always the dark ink, never a pale ring
const vec3 CHEV_RIM = vec3(0.2314, 0.1725, 0.1333);
// the head's tone: dark ink on a light lumen, cream on a dark one, never a grey halfway. cream is 1 for cream and 0 for dark ink: the vessel's own latched, eased value (lenses/chevron-ink.ts, read from the lens texture's fifth row),
// or chevCreamSoft where it has none. (drawn is the lit tone the tube is DRAWN in, celTubeBase(lens colour): the dark looks cap it brighter, so the head's tone follows what is on screen)
float chevLum(vec3 c) { return dot(pow(max(c, vec3(0.0)), vec3(2.2)), vec3(0.2126, 0.7152, 0.0722)); }
float chevCreamSoft(vec3 drawn) { return 1.0 - smoothstep(${(CHEV_INK.AT - CHEV_INK.BAND).toFixed(3)}, ${(CHEV_INK.AT + CHEV_INK.BAND).toFixed(3)}, chevLum(drawn)); }
vec3 chevInk(float cream, vec3 markDark, vec3 markLight) {
  return mix(markDark * 0.5, markLight, cream);
}
vec2 chevLattice(float arc, float across, float pitch, float px, float dir) {
  float hw = pitch / 5.5;
  float x = mod(arc + 0.5 * pitch, pitch) - 0.5 * pitch;
  return chevHead(dir * x, abs(across) * hw / ${CHEV.SHARE}, hw, px, 0.0);
}
`;
/** The name the first lobule wiring used: the same chunk. */
export const CHEVRON_HEAD_GLSL = CHEVRON_GLSL;
