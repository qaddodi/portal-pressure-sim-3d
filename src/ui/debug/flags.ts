// The one place the debug tools read the page's address (the 2D app's flags.js, for the flags the 3D app has). Every flag is a row of FLAGS, with where it works
// (`gate`: 'live' everywhere, 'local' the preview copy or a local run) and its old spellings. A file asks `flagOn('perf')` or `flagValue('debug')`; it never matches
// location.search itself (tests/debug-flags.test.ts counts such reads in src/ui/debug). What each flag means is prose that only the doc table and `npm run debug -- flags` read, so it lives in flag-meanings.ts (the boot entry carries only this table: id, group, gate, spelling; tests/boot-entry.test.ts keeps it a stub).
// Pure and dependency-free: a Node test loads it.
import { isPreview } from './gate.ts';

export type Gate = 'live' | 'local';
export interface Flag { id: string; group: 'Measure' | 'Pages' | 'Open'; gate: Gate; alias?: string }

export const FLAGS: readonly Flag[] = Object.freeze([
  { id: 'perf', group: 'Measure', gate: 'live' },
  { id: 'joins', group: 'Measure', gate: 'local' },
  { id: 'inspect', group: 'Measure', gate: 'local' },
  { id: 'gl', group: 'Measure', gate: 'live' },
  { id: 'watch', group: 'Measure', gate: 'local' },
  { id: 'debug', group: 'Pages', gate: 'local' },
  { id: 'gallery', group: 'Pages', gate: 'local', alias: 'debug' },
  { id: 'check', group: 'Pages', gate: 'local', alias: 'debug=check' },
  { id: 'sweep', group: 'Pages', gate: 'local' },
  { id: 'audit', group: 'Pages', gate: 'local' },
  { id: 'layout', group: 'Pages', gate: 'local' },
  { id: 'promotion', group: 'Pages', gate: 'local' },
  { id: 'stress', group: 'Pages', gate: 'local' },
  { id: 'req', group: 'Pages', gate: 'local' },
  { id: 'go', group: 'Pages', gate: 'local' },
  { id: 'layouts', group: 'Pages', gate: 'local' },
  { id: 'safe', group: 'Pages', gate: 'local' },
  { id: 'promo', group: 'Pages', gate: 'local' },
  { id: 'extras', group: 'Pages', gate: 'local' },
  { id: 'sizes', group: 'Pages', gate: 'local' },
  { id: 'parallel', group: 'Pages', gate: 'local' },
  { id: 'depth', group: 'Pages', gate: 'local' },
  { id: 'speed', group: 'Pages', gate: 'local' },
  { id: 'sequence', group: 'Pages', gate: 'local' },
  { id: 'cases', group: 'Pages', gate: 'local' },
  { id: 'slides', group: 'Pages', gate: 'local' },
  { id: 'looks', group: 'Pages', gate: 'local' },
  { id: 'noglass', group: 'Pages', gate: 'local' },
  { id: 'look', group: 'Pages', gate: 'local' },
  { id: 'twod', group: 'Pages', gate: 'local' },
  { id: 'capture', group: 'Open', gate: 'local' },
  { id: 'liver', group: 'Open', gate: 'local' },
  { id: 'only', group: 'Pages', gate: 'local' },
  { id: 'steps', group: 'Pages', gate: 'local' },
  { id: 'fresh', group: 'Pages', gate: 'local' },
  { id: 'charts', group: 'Pages', gate: 'local' },
  { id: 'script', group: 'Open', gate: 'live' },
  { id: 'slide', group: 'Open', gate: 'live' },
  { id: 'preset', group: 'Open', gate: 'live' },
  { id: 'home', group: 'Open', gate: 'live' },
]);

/** `?debug` is the one name for the debug page; its value says which form. `?gallery` and `?check` are the old spellings and hear the new one. */
const DEBUG_FORMS: Record<string, Record<string, string>> = { gallery: { '': '', gallery: '', frame: 'frame' }, check: { check: '', full: 'full' } };

type Loc = { search: string; pathname: string; hostname: string };
type At = string | Loc | undefined;
const gateOpen = (id: string, loc: Loc): boolean => (FLAGS.find((f) => f.id === id)?.gate ?? 'live') === 'live' || isPreview(loc);
const here = (): Loc => (typeof location !== 'undefined' ? location : { search: '', pathname: '', hostname: '' });
const parts = (at: At): { search: string; loc: Loc | null } => (typeof at === 'string' ? { search: at, loc: null } : { search: (at ?? here()).search || '', loc: at ?? here() });

export const searchNow = (): string => here().search || '';

function item(id: string, search: string): string | null {
  const v = new URLSearchParams(search).get(id);
  return v === null ? null : v;
}

/** The text after "=" (decoded; '' for a bare flag), or null when the flag is absent or its gate is shut here. `at`: a Location-like or a plain search string (no gate then). */
export function flagValue(id: string, at?: At): string | null {
  const p = parts(at);
  if (p.loc && !gateOpen(id, p.loc)) return null;
  const own = item(id, p.search);
  if (own !== null) return own;
  const forms = DEBUG_FORMS[id];
  if (!forms) return null;
  const d = item('debug', p.search);
  if (d === null) return null;
  const v = forms[d];
  return v === undefined ? null : v;
}
/** True when the flag is in the address (and its gate is open here). */
export const flagOn = (id: string, at?: At): boolean => flagValue(id, at) !== null;
export const flagNumber = (id: string, at?: At): number | null => { const v = flagValue(id, at); const n = v === null || v === '' ? NaN : Number(v); return Number.isFinite(n) ? n : null; };
/** Whether the address asks for the inspector panel: `?inspect`, or `?joins=debug` (the diagnostics it replaced). */
export const inspectRequested = (at?: At): boolean => flagOn('inspect', at) || flagValue('joins', at) === 'debug';

/** Which debug page the address asks for: 'gallery' (?debug, ?gallery), 'check' (?debug=check, ?check), 'full' (?debug=full, ?check=full), 'frame', or null. */
export function debugPage(at?: At): 'gallery' | 'check' | 'full' | 'frame' | null {
  const p = parts(at);
  if (p.loc && !isPreview(p.loc)) return null;
  const d = item('debug', p.search), g = item('gallery', p.search), c = item('check', p.search);
  if (d === 'check' || (d === null && c === '')) return 'check';
  if (d === 'full' || c === 'full') return 'full';
  if (d === 'frame' || g === 'frame') return 'frame';
  if (d !== null || g !== null) return 'gallery';
  return null;
}

/** Which self-test the address asks for: 'frames' (the outer page that holds the app in sized frames, one after the other), 'here' (this screen only), 'run' (the app inside a frame, which starts at once and reports to its parent), or null.
 *  A bare ?audit is the frames page where a mouse is the pointer (a Mac) and 'here' on a touch screen (an iPhone or iPad runs its own size, never a frame of another). */
export function auditPage(at?: At, fine = false): 'frames' | 'here' | 'run' | 'capture' | null {
  const v = flagValue('audit', at);
  if (v === null) return null;
  if (v === 'run' || v === 'here' || v === 'frames' || v === 'capture') return v;
  return fine ? 'frames' : 'here';
}

/** The rest of an address's query once these flags are taken out, in its order (the device frame keeps everything but `debug`, `gallery` and `device`, so the page inside it opens as the address asked). */
export function queryWithout(search: string, drop: readonly string[]): string {
  const q = new URLSearchParams(search || '');
  for (const k of drop) q.delete(k);
  return q.toString();
}
