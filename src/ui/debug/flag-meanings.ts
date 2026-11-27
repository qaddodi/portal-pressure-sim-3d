// What every ?flag does, in words (the flags section of docs/debug.md, `npm run debug -- flags`). Split from flags.ts so the prose, which grows a row per flag, is never in the boot entry:
// flags.ts holds the table the page reads at boot (id, group, gate, old spelling); this file is read by the doc generator, the CLI and tests only (tests/boot-entry.test.ts keeps it out of the entry).
// tests/debug-flags.test.ts holds the two to one set of ids.
import { FLAGS } from './flags.ts';

export const FLAG_MEANINGS: Readonly<Record<string, string>> = Object.freeze({
  perf: "The clock's frame panel: median, p95 and worst frame work, the frames over 20 ms with the phase and who asked for them; Copy (src/ui/perf).",
  joins:
    "Vessel junctions as one merged mesh (docs/junction-skin-spec.md): on by default; ?joins=old is the old overlapping tubes, mesh only the SMV-SV "
    + "confluence, mesh2 every junction; debug, nomarks, noink, noheads: weld diagnostics (every one of them is a switch in the ?inspect "
    + "panel, and debug opens it).",
  inspect:
    "The inspector (src/ui/debug/inspect; ?joins=debug opens it too): an on-screen panel that turns the figure all the way round and changes the joins "
    + "mode, the junction diagnostics (debug tint, no marks, no ink), the shade mode, the flow marks, the ink, the colours and the wireframe of the tubes and "
    + "of the skins, and which layers are drawn, live, with Copy. The programs carry its hooks only on a page that asks for it.",
  gl:
    "Every shader program the app can use, compiled on this device: one line each, green or red, with the driver's own log and Copy "
    + "(src/debug/gl-check.tsx). Open it once per build on the iPhone, the iPad and the Mac.",
  watch:
    "The motion recorder (preview copy or a local run): keeps 20 seconds of camera, label and card numbers, judges them with the motion rules and shows a "
    + "red dot with the findings (src/ui/debug/watch).",
  debug:
    "The debug page (the card gallery, with Report and Full check on its bar; the motion recorder is on by default). ?debug=check is the Phone check, "
    + "?debug=full its long walk, ?debug=frame the device frame.",
  gallery: "The old spelling of ?debug (?gallery&sweep=... runs the Sweep; the sweeps still open it so).",
  check: "The old spelling of ?debug=check, the Phone check (?check=full for the long walk).",
  sweep: "The debug page: run the Sweep over these specimens (a list, or affected).",
  audit:
    "The self-test (src/ui/debug/audit): walks every view, sheet, patient and every slide of every talk by itself, measures layout spill and covered text, "
    + "load times, fade lengths (snaps), frames a second, hitches and console errors, and ends in one report with Copy. Bare ?audit on a Mac runs the app in "
    + "iPhone, iPad and Mac frames one after the other; ?audit=here runs this screen only (do this on the iPhone and iPad). No AI, nothing sent anywhere.",
  promotion: "The promotion pictures on a Mac (src/ui/debug/promo, docs/debug.md): ?promotion&pick=lobule:4&sizes=mac,iphone.",
  stress:
    "The stress capture on any device (src/ui/debug/stress, docs/debug.md): ?stress opens a page with one Start button; it takes key slides, frames inside the main transitions, "
    + "the menus and sheets in an iPhone, an iPad and a Mac layout, one frame at a time, and ends in one small zip with REPORT.md and notes. As audit=capture&stress=<layout> it is the frame.",
  go: "Starts the page's run at once (?stress&go=1).",
  layouts: "The stress capture's layouts: layouts=iphone,mac (a comma list of iphone, ipad-portrait, mac); default all.",
  safe: "A framed phone's safe edges, px (safe=47,0,34,0).",
  promo: "The promotion capture frame's pixel ratio (audit=capture&promo=3).",
  extras: "The promotion frame's pictures that are not slides (extras=history:hist-bleed:3,overview:patients): a case at a stop, the menu.",
  sizes: "The self-test frames: which sizes (comma list of device ids: iphone, ipad-portrait, ipad, mac, mac-short, iphone-landscape).",
  parallel: "The self-test frames: parallel=1 runs every size at once (faster; frame rates and timings are then not valid).",
  depth: "The self-test: depth=quick walks the views, three slides of every talk and the collateral patients; depth=full (the default) walks everything.",
  speed:
    "The self-test: speed=N (1 to 20) runs the page's clock, its timers and every CSS animation N times faster. Layout, words, coverage, errors and settle "
    + "times stay valid (page time); frame rates and GPU-bound never are (stalls are: frame gaps are measured in real time), and above 4 fade, snap and pop "
    + "findings are left out too (the page draws only a frame or two of each ease). The report says what it dropped.",
  sequence:
    "The self-test: sequence=1 walks every talk with Next and Back one press at a time (Back and Next at each stop edge, headings, targets, tab selectors; "
    + "also an element with data-audit-select counts as a selector); sequence=0 leaves it out. Default: on for depth=full, off for quick (the banner has the "
    + "toggle \"Walk every press\").",
  cases:
    "The capture plays every model patient's case with Play the case and photographs every stop (the figure with the stop card and the case bar, the card "
    + "pulled up on a phone, and each Look closer here), into one folder a case with a manifest, in the same zip (src/ui/debug/audit/capture-cases.ts): "
    + "?audit=frames&capture=1&sizes=iphone,mac&cases=all (or ?audit=here&cases=all on a device; cases=hist-bleed,hist-tips names some). Cases alone unless "
    + "slides=1 adds the slides.",
  slides: "The capture with cases: slides=1 takes the slides of the talks as well (before the cases), in the same zip.",
  looks: "The capture of cases: looks=0 leaves out the Look closer here pictures of each stop.",
  noglass:
    "The self-test: noglass=1 turns the frosted-glass blur off for the run (html[data-noglass]), so a second run shows what the glass costs the talk-open "
    + "frame rate.",
  look:
    "The Mac look board (bare ?look; ?look&twod adds the 2D app beside each row): walks about 40 fixed states (patient, view, look, device) in one frame, "
    + "reads the figure canvas in the frame that draws it, shows it beside the saved baseline and the difference (src/debug/look-board.ts, look/README.md).",
  twod: "The look board: a button per row opens the 2D app's preview of the same patient in the row.",
  capture:
    "One look-board state (the look board's own frame opens it): ?capture&look=dark&preset=cirr-decomp&view=circuit&chevrons=0&orbit=25 applies it in "
    + "memory (nothing saved) and window.__look hands out the canvas (src/debug/look-app.ts).",
  liver:
    "The cirrhotic liver's cel mock-ups: ?liver=cel1 to cel15 (src/scene/organs/liver-texture.ts); none shows cel15, the standing surface (cel14 soft "
    + "light, cel13 cobbled soft, cel7 cobbled); c2b the earlier pale-nodule one.",
  only: "The Phone check or the Sweep: just these journeys or specimens (comma list).",
  steps: "The Phone check: steps=0 leaves out the per-step rows.",
  fresh: "The Phone check: fresh=1 forgets a walk the browser was part way through.",
  charts: "The charts gallery (src/ui/charts/gallery).",
  script: "Open this deck (with ?slide=N).",
  slide: "Open this slide of ?script.",
  preset: "Open this patient preset.",
  home: "Open Patients or Present (?home=explore|present).",
});

/** Every flag, for the doc table and the tests. */
export const knownFlags = () => FLAGS.map((f) => ({ id: f.id, group: f.group, gate: f.gate, meaning: FLAG_MEANINGS[f.id] ?? '', alias: f.alias ?? null }));
