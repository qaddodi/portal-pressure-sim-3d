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
const FIGURE_FLAGS = ['chevrons', 'keyChevrons', 'chips', 'collaterals', 'labels', 'zones', 'lymph', 'bile'];
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

export interface Extras { look?: string; lens?: string; view?: string; labels?: string; figure?: Record<string, boolean>; running?: boolean; speed?: number; vw?: number; vh?: number; dpr?: number }
export interface PacketState { v: number; preset: string | null; script?: string; slide?: number; x: Extras }

/** Keeps only what the app can apply from a link's `#x` (it is read from an address anyone can edit). */
export function cleanExtras(x: unknown): Extras {
  if (!isObj(x)) return {};
  const o: Extras = {};
  if (typeof x.look === 'string' && LOOK_IDS.includes(x.look)) o.look = x.look;
  if (typeof x.lens === 'string' && /^[a-z-]{1,24}$/.test(x.lens)) o.lens = x.lens;
  if (typeof x.view === 'string' && VIEWS.includes(x.view)) o.view = x.view;
  if (typeof x.labels === 'string' && LABELS.includes(x.labels)) o.labels = x.labels;
  if (isObj(x.figure)) { const f: Record<string, boolean> = {}; for (const k of FIGURE_FLAGS) if (typeof x.figure[k] === 'boolean') f[k] = x.figure[k] as boolean; if (Object.keys(f).length) o.figure = f; }
  if (typeof x.running === 'boolean') o.running = x.running;
  if (typeof x.speed === 'number' && Number.isFinite(x.speed) && x.speed >= 0 && x.speed <= 1000) o.speed = x.speed;
  for (const k of ['vw', 'vh'] as const) { const v = x[k]; if (typeof v === 'number' && Number.isFinite(v) && v >= 200 && v <= 5000) o[k] = Math.round(v); }
  if (typeof x.dpr === 'number' && Number.isFinite(x.dpr) && x.dpr >= 0.5 && x.dpr <= 5) o.dpr = Math.round(x.dpr * 100) / 100;
  return o;
}

/** What the app shows now, from the screen's own snapshot (the stores) and the figure's switches. */
export function captureState(app: AppSnapshot, extra: { figure?: Record<string, unknown>; labels?: string; running?: boolean; speed?: number } = {}): PacketState {
  const x: Record<string, unknown> = { look: app.look, lens: app.lens, view: app.view, labels: extra.labels, vw: app.vp.w, vh: app.vp.h, dpr: app.dpr };
  if (extra.figure) x.figure = extra.figure;
  if (extra.running != null) x.running = extra.running;
  if (extra.speed != null && extra.speed !== 1) x.speed = extra.speed;
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
