// The one place the debug tools read the page's address (the 2D app's flags.js, for the flags the 3D app has). Every flag is a row of FLAGS, with where it works
// (`gate`: 'live' everywhere, 'local' the preview copy or a local run) and its old spellings. A file asks `flagOn('perf')` or `flagValue('debug')`; it never matches
// location.search itself (tests/debug-flags.test.ts counts such reads in src/ui/debug). The table is the flags section of docs/debug.md (`npm run debug -- doc`).
// Pure and dependency-free: a Node test loads it.
import { isPreview } from './gate.ts';

export type Gate = 'live' | 'local';
export interface Flag { id: string; group: 'Measure' | 'Pages' | 'Open'; gate: Gate; meaning: string; alias?: string }

export const FLAGS: readonly Flag[] = Object.freeze([
  { id: 'perf', group: 'Measure', gate: 'live', meaning: "The clock's frame panel: median, p95 and worst frame work, the frames over 20 ms with the phase and who asked for them; Copy (src/ui/perf)." },
  { id: 'dust', group: 'Measure', gate: 'local', meaning: "Tunes the blood's dust (dust-panel.ts)." },
  { id: 'joins', group: 'Measure', gate: 'local', meaning: 'Vessel junctions as one merged mesh (docs/junction-skin-spec.md): on by default; ?joins=old is the old overlapping tubes, mesh only the SMV-SV confluence, mesh2 every junction; debug, nomarks, noink, nodust, noheads, dustblend: weld diagnostics (every one of them is a switch in the ?inspect panel, and debug opens it).' },
  { id: 'geom', group: 'Measure', gate: 'local', meaning: "?geom=net draws the body's vessels from one mesh per network (net/, docs/net-wiring.md); no flag: the tubes and skins. A corner badge says \"Mesh: network\" or \"Mesh: fallback (reason)\"." },
  { id: 'inspect', group: 'Measure', gate: 'local', meaning: "The inspector (src/ui/debug/inspect; ?joins=debug opens it too): an on-screen panel that turns the figure all the way round and changes the joins mode, the junction diagnostics (debug tint, no marks, no ink), the shade mode, the flow marks, the ink, the colours and the wireframe of the tubes and of the skins, and which layers are drawn, live, with Copy. The programs carry its hooks only on a page that asks for it." },
  { id: 'gl', group: 'Measure', gate: 'live', meaning: "Every shader program the app can use, compiled on this device: one line each, green or red, with the driver's own log and Copy (src/debug/gl-check.tsx). Open it once per build on the iPhone, the iPad and the Mac." },
  { id: 'watch', group: 'Measure', gate: 'local', meaning: 'The motion recorder (preview copy or a local run): keeps 20 seconds of camera, label and card numbers, judges them with the motion rules and shows a red dot with the findings (src/ui/debug/watch).' },
  { id: 'debug', group: 'Pages', gate: 'local', meaning: 'The debug page (the card gallery, with Report and Full check on its bar; the motion recorder is on by default). ?debug=check is the Phone check, ?debug=full its long walk, ?debug=frame the device frame.' },
  { id: 'gallery', group: 'Pages', gate: 'local', alias: 'debug', meaning: 'The old spelling of ?debug (?gallery&sweep=... runs the Sweep; the sweeps still open it so).' },
  { id: 'check', group: 'Pages', gate: 'local', alias: 'debug=check', meaning: 'The old spelling of ?debug=check, the Phone check (?check=full for the long walk).' },
  { id: 'sweep', group: 'Pages', gate: 'local', meaning: 'The debug page: run the Sweep over these specimens (a list, or affected).' },
  { id: 'audit', group: 'Pages', gate: 'local', meaning: "The self-test (src/ui/debug/audit): walks every view, sheet, patient and every slide of every talk by itself, measures layout spill and covered text, load times, fade lengths (snaps), frames a second, hitches and console errors, and ends in one report with Copy. Bare ?audit on a Mac runs the app in iPhone, iPad and Mac frames one after the other; ?audit=here runs this screen only (do this on the iPhone and iPad). No AI, nothing sent anywhere." },
  { id: 'sizes', group: 'Pages', gate: 'local', meaning: 'The self-test frames: which sizes (comma list of device ids: iphone, ipad-portrait, ipad, mac, mac-short, iphone-landscape).' },
  { id: 'parallel', group: 'Pages', gate: 'local', meaning: 'The self-test frames: parallel=1 runs every size at once (faster; frame rates and timings are then not valid).' },
  { id: 'depth', group: 'Pages', gate: 'local', meaning: 'The self-test: depth=quick walks the views, three slides of every talk and the collateral patients; depth=full (the default) walks everything.' },
  { id: 'speed', group: 'Pages', gate: 'local', meaning: 'The self-test: speed=N (1 to 20) runs the page\'s clock, its timers and every CSS animation N times faster. Layout, words, coverage, errors and settle times stay valid (page time); frame rates and GPU-bound never are (stalls are: frame gaps are measured in real time), and above 4 fade, snap and pop findings are left out too (the page draws only a frame or two of each ease). The report says what it dropped.' },
  { id: 'sequence', group: 'Pages', gate: 'local', meaning: 'The self-test: sequence=1 walks every talk with Next and Back one press at a time (Back and Next at each stop edge, headings, targets, tab selectors; also an element with data-audit-select counts as a selector); sequence=0 leaves it out. Default: on for depth=full, off for quick (the banner has the toggle "Walk every press").' },
  { id: 'noglass', group: 'Pages', gate: 'local', meaning: 'The self-test: noglass=1 turns the frosted-glass blur off for the run (html[data-noglass]), so a second run shows what the glass costs the talk-open frame rate.' },
  { id: 'look', group: 'Pages', gate: 'local', meaning: 'The Mac look board (bare ?look; ?look&twod adds the 2D app beside each row): walks about 40 fixed states (patient, view, look, device) in one frame, reads the figure canvas in the frame that draws it, shows it beside the saved baseline and the difference (src/debug/look-board.ts, look/README.md).' },
  { id: 'twod', group: 'Pages', gate: 'local', meaning: 'The look board: a button per row opens the 2D app\'s preview of the same patient in the row.' },
  { id: 'capture', group: 'Open', gate: 'local', meaning: 'One look-board state (the look board\'s own frame opens it): ?capture&look=dark&preset=cirr-decomp&view=circuit&chevrons=0&orbit=25 applies it in memory (nothing saved) and window.__look hands out the canvas (src/debug/look-app.ts).' },
  { id: 'liver', group: 'Open', gate: 'local', meaning: "The cirrhotic liver's cel mock-ups: ?liver=cel1 to cel15 (src/scene/organs/liver-texture.ts); none shows cel15, the standing surface (cel14 soft light, cel13 cobbled soft, cel7 cobbled); c2b the earlier pale-nodule one." },
  { id: 'only', group: 'Pages', gate: 'local', meaning: 'The Phone check or the Sweep: just these journeys or specimens (comma list).' },
  { id: 'steps', group: 'Pages', gate: 'local', meaning: 'The Phone check: steps=0 leaves out the per-step rows.' },
  { id: 'fresh', group: 'Pages', gate: 'local', meaning: 'The Phone check: fresh=1 forgets a walk the browser was part way through.' },
  { id: 'parity', group: 'Pages', gate: 'local', meaning: "The build's progress page: how much of the 2D app the 3D app has, per batch and area (src/parity)." },
  { id: 'charts', group: 'Pages', gate: 'local', meaning: 'The charts gallery (src/ui/charts/gallery).' },
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
/** Whether the address asks for the inspector panel: `?inspect`, or `?joins=debug` (the diagnostics it replaced). */
export const inspectRequested = (at?: At): boolean => flagOn('inspect', at) || flagValue('joins', at) === 'debug';
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

/** Which self-test the address asks for: 'frames' (the outer page that holds the app in sized frames, one after the other), 'here' (this screen only), 'run' (the app inside a frame, which starts at once and reports to its parent), or null.
 *  A bare ?audit is the frames page where a mouse is the pointer (a Mac) and 'here' on a touch screen (an iPhone or iPad runs its own size, never a frame of another). */
export function auditPage(at?: At, fine = false): 'frames' | 'here' | 'run' | null {
  const v = flagValue('audit', at);
  if (v === null) return null;
  if (v === 'run' || v === 'here' || v === 'frames') return v;
  return fine ? 'frames' : 'here';
}

/** The rest of an address's query once these flags are taken out, in its order (the device frame keeps everything but `debug`, `gallery` and `device`, so the page inside it opens as the address asked). */
export function queryWithout(search: string, drop: readonly string[]): string {
  const q = new URLSearchParams(search || '');
  for (const k of drop) q.delete(k);
  return q.toString();
}
