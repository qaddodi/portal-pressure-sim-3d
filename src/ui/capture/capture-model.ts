// Capture (Settings > Capture screen): one picture of the whole screen as it is, for troubleshooting. The pure part is here and is tested in node (tests/capture.test.ts):
// what a screen is made of (the drawing list the page walk produces, capture-dom.ts), a box shadow read from a computed style, the file's name, the stamp in the corner,
// the size of the picture, and the record of the state that rides inside the PNG. Nothing here touches the page.
import type { Item } from '../shell/figure-image.ts';

/** A rectangle a drawing is cut to (an element with `overflow` other than visible), CSS px; `r` is its corner radius. */
export interface ClipRect { x: number; y: number; w: number; h: number; r: number }
/** One outer box shadow, CSS px (inset shadows are left out). */
export interface Shadow { ox: number; oy: number; blur: number; spread: number; color: string }
/** What the walk produces, in paint order: the figure's own pictures and the page's boxes, words, shapes. `clips`: every ancestor that cuts it, outermost first. */
export type ScreenItem =
  | (Item & { clips?: ClipRect[] })
  | { k: 'shadow'; x: number; y: number; w: number; h: number; r: number; shadows: Shadow[]; alpha: number; clips?: ClipRect[] }
  | { k: 'img'; x: number; y: number; w: number; h: number; src: CanvasImageSource; alpha: number; clips?: ClipRect[] }
  /** a frosted glass: what is already painted under this box is blurred (`radius` is the blur's standard deviation in CSS px, as `backdrop-filter: blur()` takes it); drawn just before the box's own fill. `clip` is a glass cut to a path. */
  | { k: 'blur'; x: number; y: number; w: number; h: number; r: number; radius: number; alpha: number; clips?: ClipRect[]; clip?: { d: string; x: number; y: number } }
  /** an element painted through a mask image (the icon atlas: a colour seen through a cell of a picture); `img` is filled once the picture has loaded */
  | { k: 'mask'; x: number; y: number; w: number; h: number; url: string; size: string; pos: string; color: string; alpha: number; clips?: ClipRect[]; img?: CanvasImageSource | null };

/** The commas of `s` that are not inside brackets split it. */
export function splitTop(s: string): string[] {
  const out: string[] = []; let d = 0, at = 0;
  for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === '(') d++; else if (c === ')') d--; else if (c === ',' && d === 0) { out.push(s.slice(at, i).trim()); at = i + 1; } }
  out.push(s.slice(at).trim());
  return out.filter(Boolean);
}

const COLOR = /[a-z-]+\((?:[^()]|\([^()]*\))*\)|#[0-9a-f]{3,8}\b/i;
/** A computed `box-shadow` as its outer shadows (offset x and y, blur, spread, colour); `none`, inset shadows and anything unreadable give none. */
export function parseShadows(css: string): Shadow[] {
  if (!css || css === 'none') return [];
  const out: Shadow[] = [];
  for (const part of splitTop(css)) {
    if (/\binset\b/.test(part)) continue;
    const m = COLOR.exec(part) ?? /^[a-z]+/i.exec(part);
    if (!m) continue;
    const nums = (part.replace(m[0], ' ').match(/-?[\d.]+(?:px)?/g) ?? []).map(parseFloat);
    if (nums.length < 2 || nums.some((n) => !Number.isFinite(n))) continue;
    out.push({ ox: nums[0]!, oy: nums[1]!, blur: Math.max(0, nums[2] ?? 0), spread: nums[3] ?? 0, color: m[0] });
  }
  return out;
}

/** The url of a computed `mask-image` ("url("https://...")"), or null (none, a gradient). */
export const maskUrl = (css: string): string | null => /^url\(\s*["']?(.*?)["']?\s*\)$/.exec((css || '').trim())?.[1] || null;

/** Where a mask picture lands in its box (CSS `mask-size` and `mask-position`, no-repeat): `nat` is the picture's own size. */
export function maskPlacement(size: string, pos: string, box: { w: number; h: number }, nat: { w: number; h: number }): { x: number; y: number; w: number; h: number } {
  const toks = (v: string) => (v || '').match(/calc\([^)]*\)|\S+/g) ?? [];
  const len = (t: string | undefined, of: number): number | null => {
    if (!t || t === 'auto') return null;
    const n = parseFloat(t.replace(/^calc\(/, ''));
    return !Number.isFinite(n) ? null : /%/.test(t) ? (of * n) / 100 : n;
  };
  const st = toks(size);
  let w: number, h: number;
  if (st[0] === 'contain' || st[0] === 'cover') {
    const k = (st[0] === 'contain' ? Math.min : Math.max)(box.w / (nat.w || 1), box.h / (nat.h || 1));
    w = nat.w * k; h = nat.h * k;
  } else {
    const a = len(st[0], box.w), b = len(st[1], box.h);
    w = a ?? (b != null ? (b * nat.w) / (nat.h || 1) : nat.w); h = b ?? (a != null ? (a * nat.h) / (nat.w || 1) : nat.h);
  }
  const KEY: Record<string, string> = { left: '0%', top: '0%', center: '50%', right: '100%', bottom: '100%' };
  const pt = toks(pos).map((t) => KEY[t] ?? t);
  const at = (t: string | undefined, space: number) => { if (!t) return space * 0.5; const n = parseFloat(t.replace(/^calc\(/, '')); return !Number.isFinite(n) ? 0 : /%/.test(t) ? (space * n) / 100 : n; };
  return { x: at(pt[0], box.w - w) + 0, y: at(pt[1], box.h - h) + 0, w, h };
}

/** `text-transform` applied to a run of words (the canvas draws the characters, not the style). */
export function transformed(text: string, mode: string): string {
  return mode === 'uppercase' ? text.toUpperCase() : mode === 'lowercase' ? text.toLowerCase() : mode === 'capitalize' ? text.replace(/(^|\s)(\S)/g, (_m, a: string, b: string) => a + b.toUpperCase()) : text;
}

/** The scale the picture is made at: the device's pixel ratio (what the person sees), kept inside what a phone's canvas can hold (one side, and pixels in all). */
export function captureScale(vp: { w: number; h: number }, dpr: number, maxSide = 8192, maxPixels = 12e6): number {
  if (vp.w <= 0 || vp.h <= 0) return 1;
  return Math.max(1, Math.min(Math.max(1, dpr || 1), maxSide / Math.max(vp.w, vp.h), Math.sqrt(maxPixels / (vp.w * vp.h))));
}

const pad = (n: number) => String(n).padStart(2, '0');
/** "2026-11-23 15:38:08" in the device's own time (what the person's clock said when they pressed Capture). */
export const stampTime = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
/** The small line in the picture's corner: the build and the time. */
export const stampText = (build: string, at: Date): string => `${build} · ${stampTime(at)}`;

/** The file's name: what the picture shows, the build and the time, so a folder of captures reads. */
export function captureFileName(view: string, patient: string | null, commit: string, at: Date): string {
  const part = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const when = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
  return ['portal-pressure-capture', part(view), patient ? part(patient) : '', part(commit), when].filter(Boolean).join('-') + '.png';
}

/** The most the state record may weigh inside the PNG (a runaway log never makes the file heavy). */
export const RECORD_MAX = 48000;
/** What rides inside the picture: when and where it was made, the link that reopens this exact view, and the state behind it (patient, slide, look, lens, camera, sliders). */
export interface CaptureRecord { v: 1; at: string; build: string; screen: string; link: string; state: unknown }
export function captureRecord(p: { at: Date; build: string; screen: string; link: string; state: unknown }): CaptureRecord {
  const rec: CaptureRecord = { v: 1, at: p.at.toISOString(), build: p.build, screen: p.screen, link: p.link, state: p.state };
  // a state too big for the chunk is dropped before the link (the link alone reopens the view)
  return JSON.stringify(rec).length > RECORD_MAX ? { ...rec, state: null } : rec;
}

/** Where the picture goes: a touch device with a share sheet that takes files shares it (Photos, Messages, Mail, Files); anything else downloads it. */
export function deliverWay(env: { touchPoints: number; canShareFiles: boolean }): 'share' | 'download' {
  return env.touchPoints > 1 && env.canShareFiles ? 'share' : 'download';
}

/** The shortcut: Alt (Option) + Shift + S, read by its place on the board (Option makes another character on a Mac). */
export const isCaptureKey = (e: { code?: string; key?: string; altKey?: boolean; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; repeat?: boolean }): boolean =>
  !!e.altKey && !!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.repeat && (e.code === 'KeyS' || (e.key ?? '').toLowerCase() === 's');

/** A contact sheet of one deck's slides: a header with the deck's name, then a grid of the slides, each with its number and title under it. Landscape screens go three across, portrait ones five. */
export function collageLayout(count: number, shot: { w: number; h: number }): { cols: number; cellW: number; cellH: number; labelH: number; gap: number; pad: number; headH: number; width: number; height: number; cells: { x: number; y: number }[] } {
  const landscape = shot.w >= shot.h, cols = Math.max(1, Math.min(count || 1, landscape ? 3 : 5)), cellW = landscape ? 480 : 300;
  const cellH = Math.round((cellW * shot.h) / Math.max(1, shot.w)), labelH = 34, gap = 14, pad = 20, headH = 48;
  const rows = Math.max(1, Math.ceil(count / cols));
  const cells = Array.from({ length: count }, (_, i) => ({ x: pad + (i % cols) * (cellW + gap), y: pad + headH + Math.floor(i / cols) * (cellH + labelH + gap) }));
  return { cols, cellW, cellH, labelH, gap, pad, headH, width: pad * 2 + cols * cellW + (cols - 1) * gap, height: pad * 2 + headH + rows * (cellH + labelH) + (rows - 1) * gap, cells };
}

/** A name safe in a file path: lower case, letters and digits, dashes, at most 40 characters. */
export const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'slide';

/** The standard deviation, in CSS px, of the first `blur()` of a computed `backdrop-filter` (0 for none). */
export const backdropBlur = (css: string): number => { const m = /blur\(\s*([\d.]+)px/.exec(css || ''); return m ? parseFloat(m[1]!) || 0 : 0; };

/** How a blur of `sigma` device px is made without a canvas filter (Safari has none on a canvas): the region is halved this many times (each halving averages 2 x 2), then grown back the same way,
 *  which is a smooth blur of about the right width. Two and a half sigma of shrink is a Gaussian's reach. */
export const blurHalvings = (sigma: number, w: number, h: number): number => {
  let n = 0, f = 1, ww = w, hh = h;
  while (f * 2 <= Math.max(1, sigma * 1.2) && ww > 4 && hh > 4) { ww = Math.round(ww / 2); hh = Math.round(hh / 2); f *= 2; n++; }
  return n;
};

/** The words a computed `content` value holds: `"01"`, `"· mmHg"` (quotes and escapes taken off); '' for none, a picture or an empty string. A counter that the browser has not resolved (`counter(dko, decimal-leading-zero)`) is returned as is: `counterCall` reads it. */
export function contentString(content: string): string {
  const v = (content ?? '').trim();
  if (!v || v === 'none' || v === 'normal' || /^url\(/.test(v)) return '';
  const q = v.match(/^(["'])([\s\S]*)\1$/);
  if (!q) return v;
  return q[2]!.replace(/\\(["'\\])/g, '$1').replace(/\\([0-9a-f]{1,6})\s?/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)));
}
/** A `counter(name, style)` in a content value: its name and style, or null. */
export function counterCall(s: string): { name: string; style: string } | null {
  const m = s.match(/^counter\(\s*([-\w]+)\s*(?:,\s*([-\w]+)\s*)?\)$/);
  return m ? { name: m[1]!, style: m[2] ?? 'decimal' } : null;
}
/** A counter's number in its list style (decimal, decimal-leading-zero). */
export const counterText = (n: number, style: string): string => (style === 'decimal-leading-zero' && n >= 0 && n < 10 ? `0${n}` : String(n));
/** How a `counter-increment` / `counter-reset` value changes `name`: its step (default 1), or null when it does not name it. */
export function counterStep(value: string, name: string): number | null {
  const parts = (value ?? '').trim().split(/\s+/);
  for (let i = 0; i < parts.length; i++) if (parts[i] === name) { const n = Number(parts[i + 1]); return Number.isFinite(n) && parts[i + 1] !== undefined && parts[i + 1] !== '' ? n : 1; }
  return null;
}

/** The glyphs a web font may not hold and a canvas then draws as a block: arrows and a tick. Drawn as strokes instead. */
export const SYMBOLS = /[↑↓←→✓✔]/;
/** The stroke of a symbol in the box `x,y,w,h` of its letter (the line's width is `sw`): a polyline's path data. */
export function symbolPath(ch: string, x: number, y: number, w: number, h: number): string {
  const cx = x + w / 2, cy = y + h / 2, a = Math.min(w, h) * 0.34, half = h * 0.3;
  const f = (n: number) => +n.toFixed(2);
  switch (ch) {
    case '↑': return `M${f(cx)} ${f(cy + half)}L${f(cx)} ${f(cy - half)}M${f(cx - a)} ${f(cy - half + a)}L${f(cx)} ${f(cy - half)}L${f(cx + a)} ${f(cy - half + a)}`;
    case '↓': return `M${f(cx)} ${f(cy - half)}L${f(cx)} ${f(cy + half)}M${f(cx - a)} ${f(cy + half - a)}L${f(cx)} ${f(cy + half)}L${f(cx + a)} ${f(cy + half - a)}`;
    case '←': return `M${f(cx + half)} ${f(cy)}L${f(cx - half)} ${f(cy)}M${f(cx - half + a)} ${f(cy - a)}L${f(cx - half)} ${f(cy)}L${f(cx - half + a)} ${f(cy + a)}`;
    case '→': return `M${f(cx - half)} ${f(cy)}L${f(cx + half)} ${f(cy)}M${f(cx + half - a)} ${f(cy - a)}L${f(cx + half)} ${f(cy)}L${f(cx + half - a)} ${f(cy + a)}`;
    default: return `M${f(cx - h * 0.26)} ${f(cy + h * 0.02)}L${f(cx - h * 0.08)} ${f(cy + h * 0.22)}L${f(cx + h * 0.28)} ${f(cy - h * 0.24)}`;   // a tick
  }
}
