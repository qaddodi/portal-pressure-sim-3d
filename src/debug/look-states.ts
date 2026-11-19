// The look board's fixed states (atlas look plan 8.3): a patient, a view, a look and a device size, each opened from the app's own address. Pure and dependency-light, so a
// Node test loads it. The board page (look-board.ts) steps through them, the app inside (look-app.ts) applies one and hands back its canvas.
//
//   stateId(s)        'cirr-decomp.circuit.dark.iphone'   (also the PNG's name)
//   stateAddress(s)   '/preview/?capture&look=dark&preset=cirr-decomp&view=circuit&chevrons=0'
//   parseState(q)     the other way round, for the app inside the frame
import { GALLERY_DEVICES } from '../ui/debug/devices.ts';
import { LOOK_IDS } from '../looks/looks.ts';

export type LookView = 'anatomic' | 'circuit' | 'lobule' | 'sinusoid';
export const LOOK_VIEWS: readonly LookView[] = ['anatomic', 'circuit', 'lobule', 'sinusoid'];
export interface LookState { preset: string; view: LookView; look: string; device: string; /** degrees the figure is turned about its vertical axis (the anatomic view); 0 when absent */ orbit?: number }

const S = (preset: string, view: LookView, look: string, device: string, orbit?: number): LookState => (orbit ? { preset, view, look, device, orbit } : { preset, view, look, device });

/** About 40 states: every look once on the healthy figure, the disease looks in Light, Dark and on the three devices, every view, the Circuit (the map) on its own, one turned figure. */
export const LOOK_STATES: readonly LookState[] = Object.freeze([
  // the five looks on the healthy anatomy, on the Mac
  ...LOOK_IDS.map((l) => S('healthy', 'anatomic', l, 'mac')),
  // a patient across the three devices, Light and Dark
  ...(['mac', 'ipad', 'iphone'] as const).flatMap((d) => (['light', 'dark'] as const).map((l) => S('cirr-decomp', 'anatomic', l, d))),
  // the disease looks, one patient each (Light on the Mac; the reversed flow, the bundles and the clot are what the Dark look is checked on)
  ...['cirr-comp', 'csph', 'masld-csph', 'cirr-decomp-tips', 'cirr-hepatofugal', 'gastric-varix', 'pvt-acute', 'pvt-chronic', 'svt', 'schisto', 'psvd', 'budd-chiari', 'ivc-web', 'rhf', 'constrictive', 'pregnancy'].map((p) => S(p, 'anatomic', 'light', 'mac')),
  S('cirr-hepatofugal', 'anatomic', 'dark', 'mac'), S('gastric-varix', 'anatomic', 'dark', 'mac'), S('pvt-chronic', 'anatomic', 'dark', 'mac'),
  // the Circuit
  S('healthy', 'circuit', 'light', 'mac'), S('healthy', 'circuit', 'dark', 'mac'),
  S('cirr-decomp', 'circuit', 'light', 'mac'), S('cirr-decomp', 'circuit', 'dark', 'iphone'), S('cirr-decomp-tips', 'circuit', 'light', 'ipad'),
  // the two micro-views
  S('healthy', 'lobule', 'light', 'mac'), S('cirr-decomp', 'lobule', 'dark', 'mac'), S('cirr-decomp', 'lobule', 'light', 'iphone'),
  S('healthy', 'sinusoid', 'light', 'mac'), S('cirr-decomp', 'sinusoid', 'dark', 'mac'),
  // the figure turned (the quiet-depth rule)
  S('cirr-decomp', 'anatomic', 'light', 'mac', 25),
]);

export const stateId = (s: LookState): string => [s.preset, s.view, s.look, s.device, ...(s.orbit ? [`turn${s.orbit}`] : [])].join('.');
export const stateFile = (s: LookState): string => `${stateId(s)}.png`;
export const stateTitle = (s: LookState): string => `${s.preset} · ${s.view} · ${s.look} · ${s.device}${s.orbit ? ` · turned ${s.orbit}°` : ''}`;

/** Does the state name a real look, view and device? (A bad row would open the app on something else.) */
export function stateProblems(s: LookState): string[] {
  const out: string[] = [];
  if (!LOOK_IDS.includes(s.look as never)) out.push(`look ${s.look}`);
  if (!LOOK_VIEWS.includes(s.view)) out.push(`view ${s.view}`);
  if (!GALLERY_DEVICES.some((d) => d.id === s.device)) out.push(`device ${s.device}`);
  return out;
}

/** The address of the app for a state: `capture` makes it apply the rest and hand its canvas out (look-app.ts); chevrons are off so the figure stands still. */
export function stateAddress(s: LookState, pathname = './'): string {
  const q = new URLSearchParams({ capture: '', look: s.look, preset: s.preset, view: s.view, chevrons: '0' });
  if (s.orbit) q.set('orbit', String(s.orbit));
  return `${pathname}?${q.toString().replace('capture=', 'capture')}`;
}

/** What an address with `capture` asks for (the app inside the frame). null when it has no `capture`. */
export function parseState(search: string): (Partial<LookState> & { chevrons: boolean }) | null {
  const q = new URLSearchParams(search || '');
  if (!q.has('capture')) return null;
  const look = q.get('look') ?? undefined, view = q.get('view') ?? undefined, orbit = Number(q.get('orbit') ?? 0);
  return {
    preset: q.get('preset') || undefined,
    view: view && LOOK_VIEWS.includes(view as LookView) ? (view as LookView) : undefined,
    look: look && LOOK_IDS.includes(look as never) ? look : undefined,
    orbit: Number.isFinite(orbit) ? orbit : 0,
    chevrons: q.get('chevrons') !== '0',
  };
}

/** The 2D app's preview of the same patient (the same origin on github.io, so the board can hold both). */
export const TWO_D_PREVIEW = 'https://qaddodi.github.io/portal-pressure-simulator/preview/';
export const twoDAddress = (s: LookState): string => `${TWO_D_PREVIEW}?preset=${encodeURIComponent(s.preset)}`;

/** The states in the order the board visits them: by device, so the frame is made again only when the size changes (the app inside applies the rest in place). */
export function visitOrder(states: readonly LookState[] = LOOK_STATES): LookState[] {
  const rank = new Map(GALLERY_DEVICES.map((d, i) => [d.id, i]));
  return states.map((s, i) => ({ s, i })).sort((a, b) => (rank.get(a.s.device) ?? 99) - (rank.get(b.s.device) ?? 99) || a.i - b.i).map((x) => x.s);
}
