// The one place the debug tools read the page's address (the 2D app's flags.js, for the flags the 3D app has). Every flag is a row of FLAGS, with where it works
// (`gate`: 'live' everywhere, 'local' the preview copy or a local run) and its old spellings. A file asks `flagOn('perf')` or `flagValue('debug')`; it never matches
// location.search itself (tests/debug-flags.test.ts counts such reads in src/ui/debug). The table is the flags section of docs/debug.md (`npm run debug -- doc`).
// Pure and dependency-free: a Node test loads it.
import { isPreview } from './gate.ts';

export type Gate = 'live' | 'local';
export interface Flag { id: string; group: 'Measure' | 'Pages' | 'Open'; gate: Gate; meaning: string; alias?: string }

export const FLAGS: readonly Flag[] = Object.freeze([
  { id: 'perf', group: 'Measure', gate: 'live', meaning: "The clock's frame panel: median, p95 and worst frame work, the frames over 20 ms with the phase and who asked for them; Copy (src/ui/perf)." },
  { id: 'gl', group: 'Measure', gate: 'live', meaning: "Every shader program the app can use, compiled on this device: one line each, green or red, with the driver's own log and Copy (src/debug/gl-check.tsx). Open it once per build on the iPhone, the iPad and the Mac." },
  { id: 'watch', group: 'Measure', gate: 'local', meaning: 'The motion recorder (preview copy or a local run): keeps 20 seconds of camera, label and card numbers, judges them with the motion rules and shows a red dot with the findings (src/ui/debug/watch).' },
  { id: 'debug', group: 'Pages', gate: 'local', meaning: 'The debug page (the card gallery, with Report and Full check on its bar; the motion recorder is on by default). ?debug=check is the Phone check, ?debug=full its long walk, ?debug=frame the device frame.' },
  { id: 'gallery', group: 'Pages', gate: 'local', alias: 'debug', meaning: 'The old spelling of ?debug (?gallery&sweep=... runs the Sweep; the sweeps still open it so).' },
  { id: 'check', group: 'Pages', gate: 'local', alias: 'debug=check', meaning: 'The old spelling of ?debug=check, the Phone check (?check=full for the long walk).' },
  { id: 'sweep', group: 'Pages', gate: 'local', meaning: 'The debug page: run the Sweep over these specimens (a list, or affected).' },
  { id: 'look', group: 'Pages', gate: 'local', meaning: 'The Mac look board (bare ?look; ?look&twod adds the 2D app beside each row): walks about 40 fixed states (patient, view, look, device) in one frame, reads the figure canvas in the frame that draws it, shows it beside the saved baseline and the difference (src/debug/look-board.ts, look/README.md).' },
  { id: 'twod', group: 'Pages', gate: 'local', meaning: 'The look board: a button per row opens the 2D app\'s preview of the same patient in the row.' },
  { id: 'capture', group: 'Open', gate: 'local', meaning: 'One look-board state (the look board\'s own frame opens it): ?capture&look=dark&preset=cirr-decomp&view=circuit&chevrons=0&orbit=25 applies it in memory (nothing saved) and window.__look hands out the canvas (src/debug/look-app.ts).' },
  { id: 'liver', group: 'Open', gate: 'local', meaning: 'The cirrhotic liver\'s cel mock-ups: ?liver=cel1 (tawny ochre), cel2 (olive-tan), cel3 (rust), cel4 (straw); none shows the standing surface (src/scene/organs/liver-texture.ts).' },
  { id: 'only', group: 'Pages', gate: 'live', meaning: 'The Phone check or the Sweep: just these journeys or specimens (comma list).' },
  { id: 'steps', group: 'Pages', gate: 'live', meaning: 'The Phone check: steps=0 leaves out the per-step rows.' },
  { id: 'fresh', group: 'Pages', gate: 'live', meaning: 'The Phone check: fresh=1 forgets a walk the browser was part way through.' },
  { id: 'parity', group: 'Pages', gate: 'live', meaning: "The build's progress page: how much of the 2D app the 3D app has, per batch and area (src/parity)." },
  { id: 'charts', group: 'Pages', gate: 'live', meaning: 'The charts gallery (src/ui/charts/gallery).' },
  { id: 'script', group: 'Open', gate: 'live', meaning: 'Open this deck (with ?slide=N).' },
  { id: 'slide', group: 'Open', gate: 'live', meaning: 'Open this slide of ?script.' },
  { id: 'preset', group: 'Open', gate: 'live', meaning: 'Open this patient preset.' },
  { id: 'home', group: 'Open', gate: 'live', meaning: 'Open Patients or Present (?home=explore|present).' },
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
/** Every flag, for the doc table and the tests. */
export const knownFlags = () => FLAGS.map((f) => ({ id: f.id, group: f.group, gate: f.gate, meaning: f.meaning, alias: f.alias ?? null }));

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

/** The rest of an address's query once these flags are taken out, in its order (the device frame keeps everything but `debug`, `gallery` and `device`, so the page inside it opens as the address asked). */
export function queryWithout(search: string, drop: readonly string[]): string {
  const q = new URLSearchParams(search || '');
  for (const k of drop) q.delete(k);
  return q.toString();
}
