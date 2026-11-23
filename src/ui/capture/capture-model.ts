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
  | { k: 'img'; x: number; y: number; w: number; h: number; src: CanvasImageSource; alpha: number; clips?: ClipRect[] };

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
