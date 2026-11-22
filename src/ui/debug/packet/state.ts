// The state link of a bug packet (the 2D app's packet/state.js): an address that puts the app back where it was when someone pressed "What's wrong here?". The 3D app has no
// share link, so the link is its own deep link (`?script=&slide=` or `?preset=`, src/ui/shell/deep-link.ts) with the rest of the screen in a `#x=` part (the look, the lens,
// the view, the label level, the figure's switches, the screen's size). The deep link reader leaves `#x` alone, so the link opens in any build; applyExtras puts it on after boot.
// `captureState` reads the stores, `cleanExtras` is read from an address anyone can edit, so it keeps only what the app can apply. Pure of the page except those two.
import type { AppSnapshot } from '../screen/app.ts';

export const STATE_V = 1;
const LOOK_IDS = ['light', 'soft', 'dark', 'navy', 'black'];
const LABELS = ['key', 'all', 'none'];
const VIEWS = ['anatomic', 'lobule', 'sinusoid'];
const ID = /^[\w-]{1,40}$/;
/** The sheets a link may open: the tools that read the figure and nothing that takes typing or a decision (N4) */
export const SHARE_SHEETS = ['compare', 'layers', 'blood', 'lens'];
const FIGURE_FLAGS = ['chevrons', 'keyChevrons', 'chips', 'collaterals', 'labels', 'zones', 'lymph', 'bile'];
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

export interface Cam { orbit: number; k: number; x: number; y: number }
export interface Extras {
  /** the tool open on the screen (one of SHARE_SHEETS) */
  sheet?: string;
  look?: string; lens?: string; view?: string; labels?: string; figure?: Record<string, boolean>; running?: boolean; speed?: number; vw?: number; vh?: number; dpr?: number;
  /** the figure's turn (degrees), zoom and pan (the 2D share link's `cam`, with the turn the 3D figure adds) */
  cam?: Cam;
  /** the vessel picked (a topology edge id) */
  sel?: string;
  /** what was changed from the patient's own settings: the sliders (the 2D share link's `params`, a nested difference, not the whole tree) */
  params?: Record<string, unknown>;
}
export interface PacketState { v: number; preset: string | null; script?: string; slide?: number; x: Extras }

const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);
const KEY = /^[\w .:-]{1,48}$/;
const MAX_NODES = 400, MAX_DEPTH = 8, MAX_STR = 80, MAX_ARR = 64;

/** Settings that differ between two parameter trees (the 2D app's diffParams): the nested object of what is different (arrays and leaves replaced whole), or null for none. */
export function diffParams(base: unknown, now: unknown): Record<string, unknown> | null {
  if (!isObj(now)) return null;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(now)) {
    if (UNSAFE.has(k)) continue;
    const a = isObj(base) ? base[k] : undefined, b = now[k];
    if (isObj(b)) { const d = diffParams(isObj(a) ? a : {}, b); if (d) out[k] = d; } else if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = b;
  }
  return Object.keys(out).length ? out : null;
}

/** The same difference as a flat list for people: { 'a.b.c': [was, now] } (the 2D app's changedFrom). */
export function changedFrom(base: unknown, now: unknown, path = '', out: Record<string, [unknown, unknown]> = {}): Record<string, [unknown, unknown]> {
  if (!isObj(now)) return out;
  for (const k of Object.keys(now)) {
    const p = path ? `${path}.${k}` : k, a = isObj(base) ? base[k] : undefined, b = now[k];
    if (isObj(b)) changedFrom(a, b, p, out); else if (JSON.stringify(a) !== JSON.stringify(b)) out[p] = [a === undefined ? null : a, b];
  }
  return out;
}

/** A parameter difference read from an address anyone can edit: plain objects, finite numbers, booleans, short strings and short arrays of those; no prototype keys, bounded in depth and size. Null when nothing is left. */
export function cleanParams(x: unknown): Record<string, unknown> | null {
  let nodes = 0;
  const leaf = (v: unknown): unknown => (typeof v === 'number' ? (Number.isFinite(v) ? v : undefined) : typeof v === 'boolean' ? v : typeof v === 'string' ? (v.length <= MAX_STR ? v : undefined) : v === null ? null : undefined);
  const walk = (o: Record<string, unknown>, depth: number): Record<string, unknown> | null => {
    if (depth > MAX_DEPTH) return null;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) {
      if (UNSAFE.has(k) || !KEY.test(k) || ++nodes > MAX_NODES) continue;
      const v = o[k];
      if (isObj(v)) { const d = walk(v, depth + 1); if (d) out[k] = d; }
      else if (Array.isArray(v)) { if (v.length <= MAX_ARR && v.every((e) => typeof e === 'number' ? Number.isFinite(e) : typeof e === 'boolean' || (typeof e === 'string' && e.length <= MAX_STR))) { nodes += v.length; out[k] = [...v]; } }
      else { const l = leaf(v); if (l !== undefined) out[k] = l; }
    }
    return Object.keys(out).length ? out : null;
  };
  return isObj(x) ? walk(x, 0) : null;
}

/** Keeps only what the app can apply from a link's `#x` (it is read from an address anyone can edit). */
export function cleanExtras(x: unknown): Extras {
  if (!isObj(x)) return {};
  const o: Extras = {};
  if (typeof x.look === 'string' && LOOK_IDS.includes(x.look)) o.look = x.look;
  if (typeof x.lens === 'string' && /^[a-z-]{1,24}$/.test(x.lens)) o.lens = x.lens;
  if (typeof x.view === 'string' && VIEWS.includes(x.view)) o.view = x.view;
  if (typeof x.labels === 'string' && LABELS.includes(x.labels)) o.labels = x.labels;
  if (isObj(x.figure)) { const f: Record<string, boolean> = {}; for (const k of FIGURE_FLAGS) if (typeof x.figure[k] === 'boolean') f[k] = x.figure[k] as boolean; if (Object.keys(f).length) o.figure = f; }
  if (typeof x.sheet === 'string' && SHARE_SHEETS.includes(x.sheet)) o.sheet = x.sheet;
  if (typeof x.running === 'boolean') o.running = x.running;
  if (typeof x.speed === 'number' && Number.isFinite(x.speed) && x.speed >= 0 && x.speed <= 1000) o.speed = x.speed;
  for (const k of ['vw', 'vh'] as const) { const v = x[k]; if (typeof v === 'number' && Number.isFinite(v) && v >= 200 && v <= 5000) o[k] = Math.round(v); }
  if (typeof x.dpr === 'number' && Number.isFinite(x.dpr) && x.dpr >= 0.5 && x.dpr <= 5) o.dpr = Math.round(x.dpr * 100) / 100;
  if (isObj(x.cam)) {
    const c = x.cam, n = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
    const orbit = n(c.orbit, -25, 25), k = n(c.k, 0.2, 20), px = n(c.x, -8000, 8000), py = n(c.y, -8000, 8000);
    if (orbit != null && k != null && px != null && py != null) o.cam = { orbit: Math.round(orbit * 10) / 10, k: Math.round(k * 1000) / 1000, x: Math.round(px), y: Math.round(py) };
  }
  if (typeof x.sel === 'string' && ID.test(x.sel)) o.sel = x.sel;
  const params = cleanParams(x.params);
  if (params) o.params = params;
  return o;
}

/** What the app shows now, from the screen's own snapshot (the stores) and the figure's switches. */
export function captureState(app: AppSnapshot, extra: { figure?: Record<string, unknown>; labels?: string; running?: boolean; speed?: number; params?: unknown } = {}): PacketState {
  const x: Record<string, unknown> = { look: app.look, lens: app.lens, view: app.view, labels: extra.labels, vw: app.vp.w, vh: app.vp.h, dpr: app.dpr };
  if (extra.figure) x.figure = extra.figure;
  if (extra.running != null) x.running = extra.running;
  if (extra.speed != null && extra.speed !== 1) x.speed = extra.speed;
  // the camera, only when the hand has moved it (a slide's own framing is the deep link's); the sliders as the difference from the patient's own settings
  const cam = app.camera;
  if (cam.orbitDeg !== 0 || cam.zoom !== 1 || cam.pan[0] !== 0 || cam.pan[1] !== 0) x.cam = { orbit: cam.orbitDeg, k: cam.zoom, x: cam.pan[0], y: cam.pan[1] };
  if (app.picked) x.sel = app.picked;
  // (in a talk the slide sets the patient's settings itself, so the sliders are not part of the link)
  if (extra.params && app.mode !== 'deck') x.params = extra.params;
  const state: PacketState = { v: STATE_V, preset: app.patient, x: cleanExtras(x) };
  if (app.mode === 'deck' && app.deck?.id) { state.script = app.deck.id; state.slide = app.deck.number; }
  return state;
}

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

/** The address for a state: the page's own path, the deep link, and `#x=` for the rest. */
export function stateLink(state: PacketState, base: string): string {
  const u = new URL(base);
  for (const k of ['script', 'slide', 'preset', 'home', 'back']) u.searchParams.delete(k);
  if (state.script) { u.searchParams.set('script', state.script); u.searchParams.set('slide', String(state.slide || 1)); } else if (state.preset) u.searchParams.set('preset', state.preset);
  const x = cleanExtras(state.x);
  u.hash = Object.keys(x).length ? `#x=${b64(JSON.stringify(x))}` : '';
  return u.href;
}

/** The state an address carries, checked as the app reads its own links. */
export function readStateLink(href: string): PacketState {
  const u = new URL(href);
  const m = u.hash.match(/#x=([\w-]+)/);
  let x: Extras = {};
  try { x = m ? cleanExtras(JSON.parse(unb64(m[1]!))) : {}; } catch { x = {}; }
  const out: PacketState = { v: STATE_V, preset: u.searchParams.get('preset') && ID.test(u.searchParams.get('preset')!) ? u.searchParams.get('preset') : null, x };
  const script = u.searchParams.get('script');
  if (script && /^[\w-]{1,60}$/.test(script)) { out.script = script; out.slide = Math.max(1, parseInt(u.searchParams.get('slide') ?? '', 10) || 1); }
  return out;
}

/** The base of a state link: the page's own address without its query and hash. */
export const baseOf = (loc: { origin: string; pathname: string }): string => `${loc.origin}${loc.pathname}`;
