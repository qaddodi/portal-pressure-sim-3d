// Tests > Ascites (2D instruments.js createAbdomen): the fluid as a belly that fills, the abdominal pressure as a dial and a slim bar, the tap's three numbers (SAAG, fluid protein,
// fluid albumin), and what the learner changes: serum albumin, diuretics, and paracentesis (litres, albumin, Drain). Pure here: the view of a frame, the belly's and the bar's fills as 2D writes them, and the dial's frame.
import type { Frame, Shape } from '../../charts/scene.ts';
import type { Palette } from '../../charts/palette.ts';
import type { Rgba } from '../../charts/colour.ts';
import { withAlpha } from '../../charts/colour.ts';
import { fmt, fmtG } from '../../charts/fmt.ts';
import { SAAG_PORTAL } from '../../../engine/hales/portal/ascites-cuts.js';
import { SEV, GRADE, GRADE_TIP, IAP_MAX, iapSev, IAP_WORD, IAP_SAY, r1 } from '../copied/abdomen-slice.copied.js';
import type { M } from '../frame.ts';

export const FLUID_MIN_ML = 150;   // (below this there is nothing to tap: 2D `a.volume > 150`)
export { IAP_MAX, IAP_SAY, IAP_WORD, GRADE, GRADE_TIP };

/** The 2D labels and tips this pane writes that are not tables (instruments.js createAbdomen). tests/b11-abdomen.test.ts checks each against the 2D source when it is at hand. */
export const WORDS = {
  drain: 'Drain', noAscites: 'No ascites', albumin: 'Albumin', optional: 'Optional', advised: 'Advised',
  serumAlbumin: 'Serum albumin', diuretics: 'Diuretics', diureticsSub: 'Spironolactone 100 mg + furosemide 40 mg',
  diureticsTip: 'Spironolactone + furosemide: natriuresis mobilizes ascites. Keep the 100:40 mg ratio.',
  iapKey: 'Intra-abdominal pressure', iapTip: '≥12 mmHg: intra-abdominal hypertension · ≥20 mmHg: abdominal compartment syndrome',
  dialTip: 'Intra-abdominal pressure (IAP). IAP ≥12 mmHg: intra-abdominal hypertension (IAH). IAP ≥20 mmHg: abdominal compartment syndrome.',
  paracentesis: 'Paracentesis', volumeToDrain: 'Volume to drain, liters', decrease: 'Decrease volume to drain', increase: 'Increase volume to drain',
  tiles: ['SAAG', 'Fluid protein', 'Fluid albumin'], unit: 'g/dL', none: 'No ascites to sample', little: 'Too little ascites to sample',
} as const;
export const albuminTip = (L: number, warn: boolean): string => (warn
  ? `For >5 L, give albumin (${Math.round(L * 8)} g, 8 g per liter of ascites removed) to prevent post-paracentesis circulatory dysfunction.`
  : 'Albumin 8 g per liter of ascites removed: advised for >5 L, optional for ≤5 L.');
const IAP_RESERVE_L = 20;
/** What a slide's paracentesis has taken off so far, in words (Ascites 13): the litres removed, and the albumin to give. Baveno VIII: 6 to 8 g per liter removed when more than 5 L is removed; under that it is optional. */
export const tapWords = (removedL: number): { removed: string; dose: string } => {
  const r = Math.max(0, Math.round(removedL * 10) / 10);
  return { removed: `${fmt(r, 1)} L removed`, dose: r > 5 ? `Albumin ${Math.round(r * 6)} to ${Math.round(r * 8)} g (6 to 8 g per liter)` : 'Albumin optional under 5 L' };
};
/** The longest and the shortest the two lines of a slide's paracentesis can read (nothing taken off, the most the belly holds): the lines' box holds the tallest and widest of them from the first frame, so the card never grows as the litres go. */
export const TAP_RESERVE: readonly { removed: string; dose: string }[] = [tapWords(0), tapWords(IAP_RESERVE_L)];
export const albuminText = (L: number, on: boolean): string => (on ? `${Math.round(L * 8)} g` : L > 5 ? WORDS.advised : WORDS.optional);

export interface AbView {
  num: string; grade: string; gradeTip: string; sev: string; trend: string; rate: string; rateDir: 'up' | 'down' | 'steady';
  iap: number; iapNum: string; iapWord: string; iapSev: string; iapFill: number;
  tapped: boolean; saag: string; protein: string; albumin: string; tipSaag: string | null; why: string;
  fluid: boolean; fill: number; serum: number | null; diuretics: boolean;
}

/** The daily balance in words. An empty belly (nothing to tap) with a rising balance is "Refilling": a bare "▲2,100 mL/day" under "None, 0.0 L" would read as fluid that is there. */
export const rateText = (b: number | null, tapped: boolean): string => (b == null ? '' : b === 0 ? 'Steady' : b > 0 && !tapped ? `Refilling ${fmtG(Math.abs(b), 0)}\u00a0mL/day` : `${fmtG(Math.abs(b), 0)} mL/day`);

/** The pane's readings from a frame's metrics and the patient's settings (2D createAbdomen update). `rate` is the held balance (balance-hold.js), or null before one. */
export function abView(m: M, params: M, held: number | null): AbView | null {
  const a = m?.ascites;
  if (!a) return null;
  const tapped = a.volume > FLUID_MIN_ML;
  const r = a.ratePerDay, trend = Math.abs(r) < 20 ? 'steady' : r > 0 ? 'building up' : 'resolving';
  const rk = Number.isFinite(r) ? Math.round(r) : r;
  const sev = iapSev(a.iap), p = params ?? {};
  const saag = r1(r1(p.albumin) - r1(a.albumin));
  const b = held;
  const iapN = Math.max(0, Math.round(a.iap) || 0);
  return {
    num: fmt(a.volume / 1000, 1), grade: a.grade === 0 ? 'No free fluid' : 'Ascites', gradeTip: '',   /* (the volume alone: a clinical grade needs an examination or an ultrasound, which a gauge has not done; reviewer, 24 Nov 2026) */ sev: (SEV as string[])[a.grade] || 'danger',
    trend: `${r > 0 ? '+' : ''}${fmt(rk, 0)} mL a day · ${trend}`,
    rate: rateText(b, tapped), rateDir: b == null || b === 0 ? 'steady' : b > 0 ? 'up' : 'down',
    iap: a.iap, iapNum: `${fmt(iapN, 0)} mmHg`, iapWord: (IAP_SAY as string[])[a.iap >= 20 ? 2 : a.iap >= 12 ? 1 : 0]!, iapSev: sev, iapFill: Math.max(0, Math.min(1, a.iap / IAP_MAX)),
    tapped, saag: tapped ? fmt(saag, 1) : '—', protein: tapped ? fmt(a.totalProtein, 1) : '—', albumin: tapped ? fmt(a.albumin, 1) : '—',
    tipSaag: tapped ? `SAAG ${fmt(r1(p.albumin), 1)} − ${fmt(r1(a.albumin), 1)} = ${fmt(saag, 1)} g/dL. SAAG ≥${SAAG_PORTAL} g/dL indicates portal hypertension.` : null,
    why: a.volume < 1 ? WORDS.none : WORDS.little,
    fluid: tapped, fill: Math.round(tapped ? 15 + Math.max(0, Math.min(1, a.volume / 8000)) * 70 : 0) / 100,
    serum: Number.isFinite(p.albumin) ? p.albumin : null, diuretics: !!p.diuretics,
  };
}

/** The belly's fluid, as 2D writes it (instruments.js riseTxt: risen by sliding up inside the belly, whole percents; `fill` is 0 to 1). */
export const riseTxt = (fill: number): string => `0px ${100 - Math.round(fill * 100)}%`;
/** The pressure bar's fill, as 2D writes it (instruments.js slideTxt: slid in from the left inside its track, tenths of a percent; `share` is 0 to 1). */
export const slideTxt = (share: number): string => `${Math.round(Math.max(0, Math.min(1, share)) * 1000) / 10 - 100}% 0px`;
/** The daily balance's arrow (2D rateLabel). */
export const RATE_ARROW = { up: '▲', down: '▼', steady: '' } as const;

const sevTok = (s: string): string => (s === 'danger' ? 'danger' : s === 'caution' ? 'caution' : 'ok');
const ink = (pal: Palette, tok: string): Rgba => (pal.has(`${tok}-ink`) ? pal.tok(`${tok}-ink`) : pal.tok(tok));

/** The dial's readout stack, in the drawing's own units (76 × 128): the number's centre, half the height its digits take (25 u type, digits about 0.85 of the em), and the gap under it before the unit.
 *  The unit's place is worked from the number's bottom edge, never from a fixed number: the small words grow when the dial is drawn small (the 12 px floor), and the old fixed 74 put them over the digits (Mohammad, iPhone, 21 Nov: "19 mmHg is overlapping"). */
export const DIAL_NUM_Y = 63, DIAL_NUM_HALF = 0.5 * 25 * 0.85, DIAL_GAP = 3.5;

/** The abdominal pressure as the left half of a dial: 0 at the bottom, 30 mmHg at the top, green below 12, amber to 20, red above; the coloured arc fills to the reading and a knob rides the ring.
 *  One drawing in a 76 × 128 box (2D iapDial), scaled to the box. `shown` is the knob's value as it glides, the reading otherwise. */
export function dialFrame(iap: number, shown: number, w: number, h: number, pal: Palette): Frame {
  const k = w / 76, C = 64, R = 56, TX = 42, X = (x: number) => (x + 12) * k, Y = (y: number) => y * k;
  const pt = (v: number, r: number): [number, number] => { const t = Math.PI / 2 + (v / IAP_MAX) * Math.PI; return [C + r * Math.cos(t), C + r * Math.sin(t)]; };
  const arc = (a: number, b: number, r: number): number[] => { const n = Math.max(2, Math.ceil((b - a) * 2)), out: number[] = []; for (let i = 0; i <= n; i++) { const [x, y] = pt(a + ((b - a) * i) / n, r); out.push(X(x), Y(y)); } return out; };
  const shapes: Shape[] = [];
  const n = Math.max(0, Math.round(iap) || 0), v = Math.min(n, IAP_MAX), sev = iapSev(v);
  const bands: [number, number, string][] = [[0, 12, 'ok'], [12, 20, 'caution'], [20, 30, 'danger']];
  for (const [a, b, s] of bands) {
    const a1 = a ? a + 0.3 : a, b1 = b < IAP_MAX ? b - 0.3 : b, col = pal.tok(sevTok(s));
    shapes.push({ k: 'path', pts: arc(a1, b1, R), pen: { color: withAlpha(col, 0.2), w: 7 * k }, key: `band-${s}` });
    const to = Math.min(b1, Math.max(a1, shown));
    if (to > a1 + 1e-6) shapes.push({ k: 'path', pts: arc(a1, to, R), pen: { color: col, w: 7 * k }, key: `live-${s}` });
  }
  const f = Math.max(12.2 * (76 / w) , 8.5) * k;   // (the small words are 12 px on the screen at least, however small the dial is drawn)
  for (const tv of [12, 20]) {
    const [x0, y0] = pt(tv, R + 5), [x1, y1] = pt(tv, R + 9);
    shapes.push({ k: 'line', x1: X(x0), y1: Y(y0), x2: X(x1), y2: Y(y1), pen: { color: pal.tok('text-3'), w: 1.2 * k, cap: 'round' } });
    const rr = Math.max(R + 5 + 0.5 * (f / k), Math.min(R + 10 + 0.65 * (f / k), (C - (-12 + 2) - 0.6 * (f / k)) / Math.max(1e-6, Math.abs(Math.cos(Math.PI / 2 + (tv / IAP_MAX) * Math.PI)))));
    const [lx, ly] = pt(tv, rr);
    shapes.push({ k: 'text', x: X(lx), y: Y(ly), s: String(tv), size: f, weight: 600, color: pal.tok('text-3'), anchor: 'middle', baseline: 'middle', key: `tl-${tv}` });
  }
  // the knob, pointing into the belly at the reading
  const [kx0, ky0] = pt(shown, R - 12), [kx1, ky1] = pt(shown, R - 6), [kx, ky] = pt(shown, R);
  shapes.push({ k: 'line', x1: X(kx0), y1: Y(ky0), x2: X(kx1), y2: Y(ky1), pen: { color: pal.tok('text-2'), w: 2 * k, cap: 'round' } });
  shapes.push({ k: 'circle', cx: X(kx), cy: Y(ky), r: 4.6 * k, fill: pal.tok('surface'), pen: { color: pal.tok(sevTok(sev)), w: 2.6 * k } });
  const sizeK = f / k;
  shapes.push({ k: 'text', x: X(TX), y: Y(43), s: 'IAP', size: Math.max(8.5, sizeK) * k, weight: 600, color: pal.tok('text-3'), anchor: 'middle', baseline: 'middle', ls: 0.06, key: 'key' });
  shapes.push({ k: 'text', x: X(TX), y: Y(DIAL_NUM_Y), s: String(n), size: 25 * k, weight: 600, color: pal.tok('text'), anchor: 'middle', baseline: 'middle', ls: -0.015, key: 'n' });
  const yu = DIAL_NUM_Y + DIAL_NUM_HALF + DIAL_GAP + 0.5 * Math.max(8.5, sizeK);   // (the unit stands under the number's own bottom edge, whatever size the small words are drawn at)
  shapes.push({ k: 'text', x: X(TX), y: Y(yu), s: 'mmHg', size: Math.max(8.5, sizeK) * k, weight: 500, color: pal.tok('text-3'), anchor: 'middle', baseline: 'middle', key: 'unit' });
  const yw = yu + 3.5 + 0.72 * Math.max(9, sizeK);
  const word = (IAP_WORD as Record<string, string>)[sev]!, fw = Math.max(9, sizeK) * k;
  const tw = word.length * 0.58 * fw, dy = Math.max(Math.abs(yw - C), Math.abs(yw - 0.72 * Math.max(9, sizeK) - C)), half = Math.sqrt(Math.max(0, (R - 4) ** 2 - dy * dy));
  // (the word under the unit is left out when it no longer fits inside the half circle; the number's colour and the arc still say how high it is)
  if (!(tw / 2 / k > C - TX || TX - tw / 2 / k < C - half)) shapes.push({ k: 'text', x: X(TX), y: Y(yw), s: word, size: fw, weight: 600, color: ink(pal, sevTok(sev)), anchor: 'middle', baseline: 'middle', key: 'word' });
  return { w, h, shapes, label: `Intra-abdominal pressure ${n} mmHg, ${word.toLowerCase()}` };
}
