// The SAAG and ascitic protein plane (2D: tool-saag.js, host 'saag'; AASLD 2021 Table 4). Cut-offs from the engine copy (ascites-cuts.js), words from the 2D file.
import { SAAG_PORTAL, TP_HIGH, saagPortal, tpHigh } from '../../../engine/hales/portal/ascites-cuts.js';
import { NO_ASC } from '../tiles.generated.ts';
import { fmt } from '../fmt.ts';
import { wrapWords } from '../trial/model.ts';
import type { Measure } from '../flows/layout.ts';

export { SAAG_PORTAL, TP_HIGH };
export const SAAG_MAX = 3, TP_MAX = 5;
export const SOURCE = 'AASLD 2021 ascites guidance, Table 4.';
export const ZONE_WORDS = { portal: 'Portal hypertension', none: 'No portal hypertension' };
export const FLOOR = 12;

export const TYPE: Record<string, readonly [number, number]> = {
  'saag.ql': [600, 0.85], 'saag.ax': [500, 0.92], 'saag.axl': [600, 0.92], 'saag.pl': [600, 1], 'saag.pls': [500, 0.85], 'saag.read': [500, 1], 'saag.src': [500, 0.85],
};
export const sizeOf = (look: string, f: number) => Math.max(FLOOR, TYPE[look]![1] * f);

export interface Pt { id?: string; name: string; saag: number; tp: number; own: boolean; modeled: boolean }
export const readingOf = (saag: number, tp: number): string => {
  const a = fmt(saag, 1), b = fmt(tp, 1);
  if (!saagPortal(+a)) return `SAAG ${a} is under ${SAAG_PORTAL}: portal hypertension is not the cause. Look for peritoneal disease.`;
  return tpHigh(+b) ? `SAAG ${a} with protein ${b}, over ${TP_HIGH}: portal hypertension with a protein-rich fluid points to the heart or the hepatic veins.`
    : `SAAG ${a} with protein ${b}: portal hypertension with a low-protein fluid, the pattern of cirrhosis.`;
};

export interface Row { id?: string; name: string; f: { saag?: number | null; tp?: number | null; asc?: number | null } | null }
export function pointsOf(rows: readonly Row[], extra: readonly { id?: string; name: string; saag: number; tp: number }[] = [], own: string | null = null): Pt[] {
  const out: Pt[] = [];
  for (const r of rows) {
    const f = r.f;
    if (!f || !Number.isFinite(f.saag) || !Number.isFinite(f.tp) || !(f.asc! >= NO_ASC)) continue;
    out.push({ id: r.id, name: r.name, saag: f.saag!, tp: f.tp!, own: !!own && r.id === own, modeled: true });
  }
  for (const x of extra) if (Number.isFinite(x?.saag) && Number.isFinite(x?.tp)) out.push({ id: x.id || x.name, name: x.name, saag: x.saag, tp: x.tp, own: false, modeled: false });
  return out;
}
export const saagWords = (pts: readonly Pt[]) => `SAAG against ascitic fluid protein, g/dL. ${pts.length ? pts.map((p) => `${p.name}${p.modeled ? '' : ' (not modeled)'}: SAAG ${fmt(p.saag, 1)}, protein ${fmt(p.tp, 1)}`).join('; ') : 'No patient with fluid to tap.'}.`;

export interface GText { x: number; y: number; t: string; look: string; anchor: 'start' | 'middle' | 'end' }
export interface GRect { x: number; y: number; w: number; h: number; r: number; look: string }
export interface GLine { pts: number[]; look: string }
export interface GDot { cx: number; cy: number; r: number; look: string }
export interface SaagLayout { texts: GText[]; rects: GRect[]; lines: GLine[]; dots: GDot[]; H: number; plot: { L: number; T: number; pw: number; ph: number } }

/** The plane's drawing at width W and card type size f. Pure. plotH: the plot's height when the card's room asks for less than the width gives (never under 100). */
export function saagLayout(W: number, f: number, meas: Measure, pts: readonly Pt[], { read = null, source = true, plotH = 0 }: { read?: string | null; source?: boolean; plotH?: number } = {}): SaagLayout {
  const texts: GText[] = [], rects: GRect[] = [], lines: GLine[] = [], dots: GDot[] = [];
  const px = (look: string) => sizeOf(look, f), wt = (look: string) => TYPE[look]![0];
  const mt = (s: string, look: string) => meas(s, px(look), wt(look));
  const say = (x: number, y: number, t: string, look: string, anchor: GText['anchor'] = 'start') => texts.push({ x, y, t, look, anchor });
  const tk = px('saag.ax'), axl = px('saag.axl'), ql = px('saag.ql'), pl = px('saag.pl'), pls = px('saag.pls');
  const L = Math.ceil(mt('0.0', 'saag.ax') + f * 0.9), R = Math.ceil(f * 0.5), T = Math.ceil(axl * 1.5);
  const pw = W - L - R, ph = plotH > 0 ? Math.round(plotH) : Math.round(Math.min(Math.max(pw * 0.62, 130), 280));
  const X = (p: number) => L + (Math.min(Math.max(p, 0), TP_MAX) / TP_MAX) * pw, Y = (s: number) => T + (1 - Math.min(Math.max(s, 0), SAAG_MAX) / SAAG_MAX) * ph;
  const r = Math.max(4, Math.round(f * 0.4)), rc = Math.round(r * 1.3);
  const yc = Y(SAAG_PORTAL), xc = X(TP_HIGH);
  rects.push({ x: L, y: T, w: xc - L, h: yc - T, r: 4, look: 'saag.zone' }, { x: xc, y: T, w: L + pw - xc, h: yc - T, r: 4, look: 'saag.zone.hi' });
  lines.push({ pts: [L, yc, L + pw, yc], look: 'saag.cut' }, { pts: [xc, T, xc, T + ph], look: 'saag.cut' }, { pts: [L, T, L, T + ph, L + pw, T + ph], look: 'saag.axis' });
  say(L + f * 0.4, T + ql * 1.15, ZONE_WORDS.portal, 'saag.ql');
  say(L + f * 0.4, T + ph - ql * 0.4, ZONE_WORDS.none, 'saag.ql');
  for (const s of [0, SAAG_PORTAL, SAAG_MAX]) say(L - f * 0.4, Y(s) + tk * 0.34, String(s), 'saag.ax', 'end');
  for (const p of [0, TP_HIGH, TP_MAX]) say(X(p), T + ph + tk * 1.15, String(p), 'saag.ax', 'middle');
  say(L, axl * 0.9, 'SAAG, g/dL', 'saag.axl');
  say(L + pw / 2, T + ph + tk * 1.15 + axl * 1.35, 'Ascitic protein, g/dL', 'saag.axl', 'middle');
  let y = T + ph + tk * 1.15 + axl * 1.35 + f * 0.3;
  const placed = pts.map((p) => ({ p, x: X(p.tp), y: Y(p.saag), w: Math.max(mt(p.name, 'saag.pl'), p.modeled ? 0 : mt('not modeled', 'saag.pls')), rr: p.own ? rc : r, side: 'start' as 'start' | 'end', ly: 0 }));
  for (const q of placed) q.side = q.x + q.rr + f * 0.35 + q.w <= W ? 'start' : 'end';
  const lh = pl * 1.2 + pls * 1.2;
  placed.sort((a, b) => a.y - b.y);
  placed.forEach((q, i) => {
    q.ly = q.y;
    for (let j = 0; j < i; j++) {
      const o = placed[j]!;
      if (o.side === q.side && Math.abs(o.ly - q.ly) < (q.p.modeled && o.p.modeled ? pl * 1.25 : lh) && Math.abs(o.x - q.x) < Math.max(o.w, q.w) + f * 3) q.ly = o.ly + (o.p.modeled ? pl * 1.25 : lh);
    }
    q.ly = Math.min(Math.max(q.ly, T + pl * 0.8), T + ph - pls * 0.4);
  });
  for (const q of placed) {
    dots.push({ cx: q.x, cy: q.y, r: q.p.modeled ? q.rr : q.rr - 0.75, look: !q.p.modeled ? 'saag.ptx' : q.p.own ? 'saag.pt.cur' : 'saag.pt' });
    const tx = q.side === 'start' ? q.x + q.rr + f * 0.35 : q.x - q.rr - f * 0.35;
    say(tx, q.ly + pl * 0.34, q.p.name, 'saag.pl', q.side);
    if (!q.p.modeled) say(tx, q.ly + pl * 0.34 + pls * 1.2, 'not modeled', 'saag.pls', q.side);
  }
  if (read) {
    const rl = wrapWords(read, W, px('saag.read'), wt('saag.read'), meas, 4), rh = px('saag.read') * 1.32;
    rl.forEach((l, i) => say(0, y + px('saag.read') * 0.9 + i * rh, l, 'saag.read'));
    y += rl.length * rh + f * 0.3;
  }
  if (source) {
    const sl = wrapWords(SOURCE, W, px('saag.src'), wt('saag.src'), meas, 2);
    sl.forEach((l, i) => say(0, y + px('saag.src') * (0.9 + i * 1.3), l, 'saag.src'));
    y += sl.length * px('saag.src') * 1.3;
  }
  return { texts, rects, lines, dots, H: Math.ceil(y + f * 0.2), plot: { L, T, pw, ph } };
}
