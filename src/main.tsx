// Boot order: the saved look (before anything paints) → fonts and the engine's first patient, in parallel → React → the first card.
// Nothing is shown before it is ready: the screen is the look's ground until then, never white, never half-styled.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/shell/global.css';
import './ui/css2d/index.css';   // the 2D app's stylesheets, copied unchanged (scripts/copy-2d-css.mjs); the lifted chrome is styled by them
import './ui/shell/ease.css';   // every control eases its state changes (zero weight: a control's own transition wins)
import './ui/glass.css';   // the one glass for every panel, menu, pill and card (tests/glass.test.ts)
import { applyLook, resolveLook } from './looks/looks.ts';
import { lookGlide } from './looks/glide.ts';
import { useSettings, applyGlass } from './state/settings.ts';
import { fontsReady } from './boot/fonts.ts';
import { bootEngine, useEngine } from './engine/index.ts';
import { App } from './App.tsx';
import { mountPerf } from './ui/perf/mount.ts';
import { hasWebGL2 } from './boot/webgl.ts';
import { NoWebGL } from './ui/shell/NoWebGL.tsx';
import { BootCrash } from './ui/shell/BootCrash.tsx';
import { installNoPageZoom } from './ui/shell/no-page-zoom.ts';
import { holdSplash } from './boot/ready.ts';
import { bakedReady } from './scene/vessels/skin/baked.ts';
import { registerPwa } from './pwa/register.ts';
import { warmLater } from './boot/warm.ts';
import { mountCharts } from './ui/charts/gallery/mount.tsx';
import { mountTrials } from './ui/trials/mount.tsx';
import { mountA11y } from './ui/a11y/mount.ts';
import { installCaught } from './ui/debug/caught.ts';
import { mountDebug } from './ui/debug/mount.ts';
import { isPreview } from './ui/debug/gate.ts';
import { isFrameRequest } from './ui/debug/frame/request.ts';
import { flagOn, flagValue, debugPage, inspectRequested, auditPage } from './ui/debug/flags.ts';

const dark = window.matchMedia('(prefers-color-scheme: dark)');
lookGlide.onLook((id) => applyLook(id));   // (the page's colours; the figure's applier is Stage's)
const paint = () => lookGlide.change(resolveLook(useSettings.getState().look, dark.matches));
paint();
useSettings.subscribe(paint);
applyGlass(useSettings.getState().blur);
useSettings.subscribe((s, prev) => { if (s.blur !== prev.blur) applyGlass(s.blur); });
dark.addEventListener('change', paint);
installNoPageZoom();   // the browser's page zoom never fires: every pinch is the figure's

/** A page that is not the app (the device frame, the look board, the self-test) puts nothing in #root, so the loading cover (index.html #boot) would stay over it for 20 s and take every click, and the saved look's
 *  colour scheme would turn its form controls dark on its own light page. It lifts the cover at once and gives the page the browser's own scheme (tests/debug-audit.test.ts holds the three callers). */
function plainPage() {
  (window as unknown as { ppsBootLift?: () => void }).ppsBootLift?.();
  document.documentElement.style.colorScheme = dark.matches ? 'dark' : 'light';
}

async function start() {
  // ?parity: the build's progress page needs neither fonts nor the engine; it is its own small chunk.
  if (new URLSearchParams(location.search).has('parity')) {
    const { ParityPage } = await import('./parity/ParityPage.tsx');
    createRoot(document.getElementById('root')!).render(<StrictMode><ParityPage /></StrictMode>);
    return;
  }
  // ?presenter-view=<session>: the notes window of a talk (text only, no engine, no GL).
  if (new URLSearchParams(location.search).has('presenter-view')) {
    const { run } = await import('./ui/deck/presenter-window.ts');
    run();
    return;
  }
  // ?debug=frame (the preview copy and a local run only): the device frame, an outer page that holds the app in one iframe at a phone's or iPad's size. It starts no app.
  if (isPreview() && isFrameRequest(location.search)) {
    const { bootFrame } = await import('./ui/debug/frame/frame.ts');
    plainPage();
    bootFrame();
    return;
  }
  // ?audit on a Mac (the preview copy and a local run only): the self-test's outer page, which holds the app in sized frames one after the other. It starts no app itself.
  if (isPreview() && auditPage(undefined, matchMedia('(pointer: fine)').matches) === 'frames') {
    const { bootOuter } = await import('./ui/debug/audit/outer.ts');
    plainPage();
    bootOuter();
    return;
  }
  // ?look (the preview copy and a local run only): the Mac look board, an outer page that photographs the figure in a frame (WP11). It starts no app itself.
  if (isPreview() && flagValue('look') === '' && !flagOn('capture') && !debugPage()) {
    const { bootLookBoard } = await import('./debug/look-board.ts');
    plainPage();
    bootLookBoard();
    return;
  }
  if (!hasWebGL2()) { createRoot(document.getElementById('root')!).render(<StrictMode><NoWebGL /></StrictMode>); return; }
  const [fonts] = await Promise.all([fontsReady(), bootEngine().catch((err) => { console.error(err); }), bakedReady]);   // (the junction skins baked at build time are fetched with them: the figure's first frame has its welds)
  if (!fonts) console.warn('[boot] fonts were late; continuing with fallback faces');
  // The engine did not start (its worker failed, crashed or never answered: bootEngine leaves the reason in the store): say so, with Reload, never a page that waits for ever.
  const eng = useEngine.getState();
  if (eng.status === 'crashed' || !eng.presetId) { createRoot(document.getElementById('root')!).render(<StrictMode><BootCrash reason={eng.crash} /></StrictMode>); return; }
  installCaught();
  if (isPreview() && flagOn('capture')) { const m = await import('./debug/look-app.ts'); m.applyBefore(location.search); }   // ?capture: one look-board state (WP11)
  holdSplash();   // the splash stays until the figure has drawn and its labels are placed (boot/ready.ts), then eases away over the app
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
  if (isPreview() && flagOn('capture')) void import('./debug/look-app.ts').then((m) => m.mountLookCapture(location.search));
  mountA11y();   // the live region, the figure's description, slide announcements, Reduce Motion fades (batch B14)
  mountPerf();
  if (flagOn('dust')) void import('./ui/debug/dust-panel.ts').then((m) => m.mountDust());   // ?dust: the hidden tuning panel for the blood's dust
  if (inspectRequested()) void import('./ui/debug/inspect/panel.ts').then((m) => m.mountInspect());   // ?inspect, ?joins=debug: the inspector's panel (turn the figure, switch shaders, passes and layers live)
  if (flagOn('gl')) void import('./debug/gl-check.tsx').then((m) => m.mountGl());   // ?gl: every shader program, compiled on this device (WP10)
  void mountDebug();   // ?watch / ?debug on the preview copy only (batch B14)
  mountCharts();   // ?charts: the charts gallery (batch B10)
  mountTrials();   // ?trials: the Trials pane on its own (batch B12; the Tests card mounts the same pane)
  registerPwa();   // offline: after the first picture, once the page is idle (src/pwa/register.ts)
  warmLater();     // a talk's charts are read in once the page is idle (src/boot/warm.ts)
}
void start();
