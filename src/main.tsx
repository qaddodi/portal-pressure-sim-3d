// Boot order: the saved look (before anything paints) → fonts and the engine's first patient, in parallel → React → the first card.
// Nothing is shown before it is ready: the screen is the look's ground until then, never white, never half-styled.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/shell/global.css';
import { applyLook, resolveLook } from './looks/looks.ts';
import { useSettings, applyGlass } from './state/settings.ts';
import { fontsReady } from './boot/fonts.ts';
import { bootEngine } from './engine/index.ts';
import { App } from './App.tsx';
import { mountPerf } from './ui/perf/mount.ts';
import { hasWebGL2 } from './boot/webgl.ts';
import { NoWebGL } from './ui/shell/NoWebGL.tsx';
import { registerPwa } from './pwa/register.ts';
import { mountCharts } from './ui/charts/gallery/mount.tsx';
import { mountA11y } from './ui/a11y/mount.ts';
import { installCaught } from './ui/debug/caught.ts';

const dark = window.matchMedia('(prefers-color-scheme: dark)');
const paint = () => applyLook(resolveLook(useSettings.getState().look, dark.matches));
paint();
useSettings.subscribe(paint);
applyGlass(useSettings.getState().blur);
useSettings.subscribe((s, prev) => { if (s.blur !== prev.blur) applyGlass(s.blur); });
dark.addEventListener('change', paint);

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
  if (!hasWebGL2()) { createRoot(document.getElementById('root')!).render(<StrictMode><NoWebGL /></StrictMode>); return; }
  const [fonts] = await Promise.all([fontsReady(), bootEngine().catch((err) => { console.error(err); })]);
  if (!fonts) console.warn('[boot] fonts were late; continuing with fallback faces');
  installCaught();
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
  mountA11y();   // the live region, the figure's description, slide announcements, Reduce Motion fades (batch B14)
  mountPerf();
  mountCharts();   // ?charts: the charts gallery (batch B10)
}
void start();
