// ?perf on a device: a small readout of the clock (frame work times, the slowest frames and who asked for them) with Copy.
// Diagnostic only: it exists when the page address has ?perf, writes its own text twice a second, and is not part of any card.
import { clock } from '../../clock/frame.ts';
import { perfReport } from './report.ts';
import { useSettings } from '../../state/settings.ts';
import { resolveLook } from '../../looks/looks.ts';

export function mountPerf(): void {
  if (!new URLSearchParams(location.search).has('perf')) return;
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:var(--z-perf);max-width:min(560px,92vw);padding:8px 10px;border-radius:10px;background:rgba(0,0,0,.78);color:#fff;font:11px/1.35 ui-monospace,Menlo,monospace;white-space:pre-wrap;pointer-events:auto';
  const pre = document.createElement('div');
  const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:6px;margin-top:6px';
  const mk = (label: string, fn: () => void) => { const b = document.createElement('button'); b.textContent = label; b.style.cssText = 'font:11px ui-monospace,Menlo,monospace;padding:2px 8px;border-radius:6px;border:1px solid #fff6;background:#fff2;color:#fff'; b.onclick = fn; row.append(b); };
  const text = () => perfReport(clock.stats(), {
    ua: navigator.userAgent, dpr: devicePixelRatio, size: `${innerWidth}×${innerHeight}`, look: resolveLook(useSettings.getState().look, matchMedia('(prefers-color-scheme: dark)').matches), hash: (import.meta.env.VITE_BUILD as string | undefined) ?? 'dev',
  });
  mk('Copy', () => { void navigator.clipboard?.writeText(text()).catch(() => undefined); });
  mk('Reset', () => clock.resetStats());
  box.append(pre, row);
  document.body.append(box);
  const tick = () => { pre.textContent = text(); };
  tick();
  setInterval(tick, 500);
}
