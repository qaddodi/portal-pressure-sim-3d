// Boot order: the saved look (before anything paints) → fonts and the engine's first patient, in parallel → React → the first card.
// Nothing is shown before it is ready: the screen is the look's ground until then, never white, never half-styled.
import './boot/started.ts';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/shell/global.css';
import './ui/css2d/index.css';   // the 2D app's stylesheets, copied unchanged (scripts/copy-2d-css.mjs); the lifted chrome is styled by them
import './ui/shell/ease.css';   // every control eases its state changes (zero weight: a control's own transition wins)
import './ui/humanized.css';   // the 2D pills, chips and badges taken off: plain words (docs/HUMANIZED-DESIGN.md; tests/no-dot-pills.test.ts)
import './ui/glass.css';   // the one glass for every panel, menu, pill and card (tests/glass.test.ts)
import { applyLook, resolveLook } from './looks/looks.ts';
import { lookGlide } from './looks/glide.ts';
import { followDevice } from './looks/follow-device.ts';
import { useSettings, applyGlass } from './state/settings.ts';
import { fontsReady } from './boot/fonts.ts';
import { bootEngine, useEngine } from './engine/index.ts';
import { App } from './App.tsx';
import { mountPerf } from './ui/perf/mount.ts';
import { hasWebGL2 } from './boot/webgl.ts';
import { NoWebGL } from './ui/shell/NoWebGL.tsx';
import { BootCrash } from './ui/shell/BootCrash.tsx';
import { AppBoundary } from './ui/shell/AppBoundary.tsx';
import { markStale } from './boot/lazy-retry.ts';
import { useShell } from './ui/shell/store.ts';
import { UPDATE_TOAST } from './pwa/register.ts';
import { reloadKeepingState } from './boot/reload.ts';
import { installNoPageZoom } from './ui/shell/no-page-zoom.ts';
import { holdSplash } from './boot/ready.ts';
import { stamp } from './boot/timeline.ts';
import { bakedReady } from './scene/vessels/skin/baked.ts';
import { registerPwa } from './pwa/register.ts';
import { warmLater } from './boot/warm.ts';
import { mountCharts } from './ui/charts/gallery/mount.tsx';
import { mountTrials } from './ui/trials/mount.tsx';
import { mountA11y } from './ui/a11y/mount.ts';
import { installCrashNet } from './boot/crash-net.ts';
import { mountDebug } from './ui/debug/mount.ts';
import { isPreview } from './ui/debug/gate.ts';
import { flagOn, inspectRequested } from './ui/debug/flags.ts';

/** False in the live site's build (VITE_CHANNEL=live, set by the Pages workflow for main): the bundler then drops every branch below that opens a debug tool, so the debug chunks are not built, not downloaded and not held offline.
 *  On the preview copy and in a local run it is true, and each tool still asks isPreview()/its flag's gate. Only ?gl and ?perf (and the open-a-slide links) work on the live site. tests/live-no-debug.test.ts holds this. */
const DEBUG = import.meta.env.VITE_CHANNEL !== 'live';

const dark = window.matchMedia('(prefers-color-scheme: dark)');
lookGlide.onLook((id) => applyLook(id));   // (the page's colours; the figure's applier is Stage's)
const paint = () => lookGlide.change(resolveLook(useSettings.getState().look, dark.matches));
paint();
useSettings.subscribe(paint);
followDevice({ doc: document, win: window, mq: dark, glide: lookGlide, choice: () => useSettings.getState().look });
applyGlass(useSettings.getState().blur);
useSettings.subscribe((s, prev) => { if (s.blur !== prev.blur) applyGlass(s.blur); });
installCrashNet();   // errors no boundary sees (handlers, timers, promises, a clock system): kept for the reports, and a quiet recovery when the app is left broken (boot/crash-net.ts)
installNoPageZoom();   // the browser's page zoom never fires: every pinch is the figure's
// A lazy part's file is gone (a tab open across two deploys) or the network failed: Vite fires this before the import rejects. The rejection is NOT swallowed: lazyRetry tries again and the pane says so (LazyBoundary);
// here the page learns a newer build may be out, and, online, offers the update toast once.
let preloadToast = false;
window.addEventListener('vite:preloadError', () => {
  markStale();
  if (preloadToast || navigator.onLine === false) return;
  preloadToast = true;
  useShell.getState().say(UPDATE_TOAST, 'info', { label: 'Reload', run: () => { void reloadKeepingState(); } });
});

async function start() {
  if (!hasWebGL2()) { createRoot(document.getElementById('root')!).render(<StrictMode><NoWebGL /></StrictMode>); return; }
  const [fonts] = await Promise.all([fontsReady(), bootEngine().catch((err) => { console.error(err); }), bakedReady]);   // (the junction skins baked at build time are fetched with them: the figure's first frame has its welds)
  if (!fonts) console.warn('[boot] fonts were late; continuing with fallback faces');
  // The engine did not start (its worker failed, crashed or never answered: bootEngine leaves the reason in the store): say so, with Reload, never a page that waits for ever.
  const eng = useEngine.getState();
  if (eng.status === 'crashed' || !eng.presetId) { createRoot(document.getElementById('root')!).render(<StrictMode><BootCrash reason={eng.crash} /></StrictMode>); return; }
  if (DEBUG && isPreview() && flagOn('capture')) { const m = await import('./debug/look-app.ts'); m.applyBefore(location.search); }   // ?capture: one look-board state (WP11)
  stamp('engine');
  holdSplash();   // the splash stays until the figure has drawn and its labels are placed (boot/ready.ts), then eases away over the app
  createRoot(document.getElementById('root')!).render(<StrictMode><AppBoundary layer="root"><App /></AppBoundary></StrictMode>);
  if (DEBUG && isPreview() && flagOn('capture')) void import('./debug/look-app.ts').then((m) => m.mountLookCapture(location.search));
  mountA11y();   // the live region, the figure's description, slide announcements, Reduce Motion fades (batch B14)
  mountPerf();
  if (DEBUG && flagOn('dust')) void import('./ui/debug/dust-panel.ts').then((m) => m.mountDust());   // ?dust: the hidden tuning panel for the blood's dust
  if (DEBUG && inspectRequested()) void import('./ui/debug/inspect/panel.ts').then((m) => m.mountInspect());   // ?inspect, ?joins=debug: the inspector's panel (turn the figure, switch shaders, passes and layers live)
  if (flagOn('gl')) void import('./debug/gl-check.tsx').then((m) => m.mountGl());   // ?gl: every shader program, compiled on this device (WP10)
  if (DEBUG) {
    void mountDebug();   // ?watch / ?debug / ?audit on the preview copy only (batch B14)
    if (isPreview()) { mountCharts(); mountTrials(); }   // ?charts: the charts gallery (batch B10); ?trials: the Trials pane on its own (batch B12; the Tests card mounts the same pane)
  }
  registerPwa();   // offline: after the first picture, once the page is idle (src/pwa/register.ts)
  warmLater();     // a talk's charts are read in once the page is idle (src/boot/warm.ts)
}
void start();
