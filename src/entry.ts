// THE page's entry (index.html loads this, not main.tsx). It decides, from the address alone and before any of the app is downloaded or run, which page this is:
//   · a page that is NOT the app (the build's progress page, a talk's notes window, the device frame, the self-test's outer page, the look board) is opened here, at once, with the loading cover lifted;
//   · the app itself is main.tsx, fetched from here (`import('./main.tsx')`): its whole code, the 3D scene's construction and the engine's worker start only for a page that draws the figure.
// Root cause it replaces (22 Nov, "?audit keeps loading and never starts", "the app takes forever to load, even on the Mac"): main.tsx was the entry and statically imports the whole app, and the scene is built when its
// module is first run, so EVERY page, the self-test's empty outer page included, first downloaded, parsed and ran the app (seconds of CPU on a laptop, many on a phone) before its first line of start() could say
// "this one is not the app". tests/boot-route.test.ts holds the rule: nothing but the light gate and flag tables is imported here.
import './boot/started.ts';
import { appStylesReady } from './boot/styles.ts';
import { isPreview } from './ui/debug/gate.ts';
import { isFrameRequest } from './ui/debug/frame/request.ts';
import { flagOn, flagValue, debugPage, auditPage } from './ui/debug/flags.ts';

/** False in the live site's build (VITE_CHANNEL=live, set by the Pages workflow for main): the bundler then drops every branch below that opens a debug tool, so the debug chunks are not built, not downloaded and not held offline.
 *  On the preview copy and in a local run it is true, and each tool still asks isPreview()/its flag's gate. tests/live-no-debug.test.ts holds this. */
const DEBUG = import.meta.env.VITE_CHANNEL !== 'live';

/** What index.html's inline boot script puts on the window (the cover's lift, its failure note and the errors it has kept). */
type Cover = Window & { ppsBootLift?: () => void; ppsBootFail?: () => void; ppsBootErrors?: string[] };

/** A page that is not the app (the device frame, the look board, the self-test) puts nothing in #root, so the loading cover (index.html #boot) would stay over it for 20 s and take every click, and the saved look's
 *  colour scheme would turn its form controls dark on its own light page. It lifts the cover at once, gives the page the browser's own scheme and takes the empty full-screen #root out of the way of its clicks (tests/debug-audit.test.ts holds the three callers). */
function plainPage() {
  (window as Cover).ppsBootLift?.();
  document.documentElement.style.colorScheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  // (#root is position:fixed over the whole screen (global.css): empty, it still paints above the page's own unpositioned content and takes every click)
  const root = document.getElementById('root'); if (root) root.style.display = 'none';
}

/** Which page: opens a page that is not the app and returns true, or returns false (the app). */
async function plain(): Promise<boolean> {
  // (the app's stylesheets load beside the cover, not in front of it, boot/styles.ts: a page that is not the app puts nothing on screen until they are on)
  const styles = appStylesReady();
  // ?parity: the build's progress page needs neither fonts nor the engine; it is its own small chunk.
  if (DEBUG && isPreview() && flagOn('parity')) {
    const [{ createRoot }, { ParityPage }] = await Promise.all([import('react-dom/client'), import('./parity/ParityPage.tsx'), import('./ui/shell/global.css')]);
    const { createElement, StrictMode } = await import('react');
    await styles;
    createRoot(document.getElementById('root')!).render(createElement(StrictMode, null, createElement(ParityPage)));
    return true;
  }
  // ?presenter-view=<session>: the notes window of a talk (text only, no engine, no GL).
  if (new URLSearchParams(location.search).has('presenter-view')) {
    const { run } = await import('./ui/deck/presenter-window.ts');
    await styles;
    run();
    return true;
  }
  // ?debug=frame (the preview copy and a local run only): the device frame, an outer page that holds the app in one iframe at a phone's or iPad's size. It starts no app.
  if (DEBUG && isPreview() && isFrameRequest(location.search)) {
    const { bootFrame } = await import('./ui/debug/frame/frame.ts');
    await styles;
    plainPage();
    bootFrame();
    return true;
  }
  // ?audit on a Mac (the preview copy and a local run only): the self-test's outer page, which holds the app in sized frames one after the other. It starts no app itself.
  if (DEBUG && isPreview() && auditPage(undefined, matchMedia('(pointer: fine)').matches) === 'frames') {
    const { bootOuter } = await import('./ui/debug/audit/outer.ts');
    await styles;
    plainPage();
    bootOuter();
    return true;
  }
  // ?promotion (the preview copy and a local run only): the promotion pictures' outer page: sized frames, each slide laid in a device outline.
  // It starts no app itself.
  if (DEBUG && isPreview() && flagOn('promotion')) {
    const { bootPromotion } = await import('./ui/debug/promo/outer.ts');
    await styles;
    plainPage();
    bootPromotion();
    return true;
  }
  // ?look (the preview copy and a local run only): the Mac look board, an outer page that photographs the figure in a frame (WP11). It starts no app itself.
  if (DEBUG && isPreview() && flagValue('look') === '' && !flagOn('capture') && !debugPage()) {
    const { bootLookBoard } = await import('./debug/look-board.ts');
    await styles;
    plainPage();
    bootLookBoard();
    return true;
  }
  return false;
}

async function route() {
  if (await plain()) return;
  // The simulation's worker starts now, on its own thread, while the app's code downloads and the main thread builds the scene (src/engine/pool.ts early): the first patient is computed beside them, not after them. A part
  // that cannot be fetched or a worker that cannot start is not this call's to report: the app's own boot (bootEngine) asks for the worker again and says why.
  void import('./engine/pool.ts').then((m) => m.enginePool.early()).catch(() => undefined);
  // A link to a talk (?script=) opens it right after the first picture: its UI is a chunk of its own (ui/shell/deck-ui-load.ts), fetched now beside the app's code, not after it. Any other load reads it in when idle (boot/warm.ts).
  if (new URLSearchParams(location.search).has('script')) void import('./ui/shell/deck-ui-load.ts').then((m) => m.loadDeckUi()).catch(() => undefined);
  await import('./main.tsx');   // the app: its first lines of code run when this resolves
  try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* private mode */ }
}
/** A part that cannot be fetched at boot is, nearly always, a page from the build before last: Pages replaces every hashed file on each deploy, so an index.html still held by
 *  the browser's cache (github.io keeps it ten minutes) names chunks that are gone, and Safari says only "Importing a module script failed". Reload ONCE, quietly, to get the new index;
 *  a second failure before a boot succeeds shows the cover, as before (a real fault or no network never loops). The mark is cleared once the app's code has loaded. */
const RELOAD_KEY = 'pps.bootReload';
function reloadOnceForStaleBuild(): boolean {
  try {
    if (navigator.onLine === false) return false;
    if (sessionStorage.getItem(RELOAD_KEY)) return false;
    sessionStorage.setItem(RELOAD_KEY, '1');
  } catch { return false; }
  location.reload();
  return true;
}
route().catch((e) => {
  if (reloadOnceForStaleBuild()) return;
  // (a part that cannot be fetched: a tab open across two deploys, or the network. The cover says so with Reload, never a page that waits for ever)
  const w = window as Cover;
  w.ppsBootErrors?.push(String((e as Error)?.message ?? e));
  console.error(e);
  w.ppsBootFail?.();
});
