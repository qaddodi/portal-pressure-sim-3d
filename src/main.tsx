// Boot order: the saved look (before anything paints) → fonts and the engine's first patient, in parallel → React → the first card.
// Nothing is shown before it is ready: the screen is the look's ground until then, never white, never half-styled.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/shell/global.css';
import { applyLook, resolveLook } from './looks/looks.ts';
import { useSettings } from './state/settings.ts';
import { fontsReady } from './boot/fonts.ts';
import { bootEngine } from './engine/index.ts';
import { App } from './App.tsx';
import { mountPerf } from './ui/perf/mount.ts';
import { mountCharts } from './ui/charts/gallery/mount.tsx';

const dark = window.matchMedia('(prefers-color-scheme: dark)');
const paint = () => applyLook(resolveLook(useSettings.getState().look, dark.matches));
paint();
useSettings.subscribe(paint);
dark.addEventListener('change', paint);

async function start() {
  const [fonts] = await Promise.all([fontsReady(), bootEngine().catch((err) => { console.error(err); })]);
  if (!fonts) console.warn('[boot] fonts were late; continuing with fallback faces');
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
  mountPerf();
  mountCharts();   // ?charts: the charts gallery (batch B10)
}
void start();
