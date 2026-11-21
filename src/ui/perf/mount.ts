// ?perf on a device: a small readout of the clock (frame work times, the slowest frames and who asked for them) with Copy.
// Diagnostic only: it exists when the page address has ?perf, writes its own text twice a second, and is not part of any card.
import { clock } from '../../clock/frame.ts';
import { perfReport, perfStrip } from './report.ts';
import { useSettings } from '../../state/settings.ts';
import { resolveLook } from '../../looks/looks.ts';
import { renderStats } from '../../debug/render-stats.ts';
import { cel } from '../../scene/api.ts';
import { shaderFailureLine } from '../../debug/shader-fail.ts';

export function mountPerf(): void {
  if (!new URLSearchParams(location.search).has('perf')) return;
  // a compact strip by default (one line, inside the safe area, along the top so it never covers the controls or the figure's middle); the detail (the slow-frame list) is closed while timings are collected and opens
  // in a height-capped scroll view (release review #18)
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:max(8px,env(safe-area-inset-left));right:max(8px,env(safe-area-inset-right));top:calc(env(safe-area-inset-top,0px) + 4px);z-index:var(--z-perf);max-width:min(560px,calc(100vw - 16px));margin:0 auto;padding:4px 8px;border-radius:10px;background:rgba(0,0,0,.78);color:#fff;font:11px/1.35 ui-monospace,Menlo,monospace;pointer-events:auto';
  const strip = document.createElement('div'); strip.style.cssText = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
  // a red pill when the device's driver refused a shader (src/debug/shader-guard.ts): a broken program looks plain and says so, it is not just missing
  const pill = document.createElement('div');
  pill.style.cssText = 'display:none;margin-bottom:6px;padding:2px 8px;border-radius:999px;background:#d32f2f;color:#fff;font-weight:700;width:fit-content';
  const pre = document.createElement('div'); pre.style.cssText = 'display:none;white-space:pre-wrap;max-height:min(40vh,320px);overflow:auto;margin-top:4px;-webkit-overflow-scrolling:touch';
  let open = false;
  const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:6px;margin-top:4px';
  const mk = (label: string, fn: () => void) => { const b = document.createElement('button'); b.textContent = label; b.style.cssText = 'font:11px ui-monospace,Menlo,monospace;padding:2px 8px;border-radius:6px;border:1px solid #fff6;background:#fff2;color:#fff'; b.onclick = fn; row.append(b); };
  const text = () => perfReport(clock.stats(), {
    ua: navigator.userAgent, dpr: devicePixelRatio, size: `${innerWidth}×${innerHeight}`, look: resolveLook(useSettings.getState().look, matchMedia('(prefers-color-scheme: dark)').matches), hash: (import.meta.env.VITE_BUILD as string | undefined) ?? 'dev', shaders: shaderFailureLine(), gl: renderStats(), skin: cel.skinStats,
  });
  mk('Copy', () => { void navigator.clipboard?.writeText(text()).catch(() => undefined); });
  mk('Reset', () => clock.resetStats());
  mk('Detail', () => { open = !open; pre.style.display = open ? 'block' : 'none'; tick(); });
  mk('Hide', () => { box.style.display = 'none'; hidden = true; });
  box.append(pill, strip, pre, row);
  document.body.append(box);
  let hidden = false;
  const tick = () => {
    if (hidden) return;
    const s = shaderFailureLine(); pill.textContent = s; pill.style.display = s ? 'block' : 'none';
    const full = text(); strip.textContent = perfStrip(full);
    if (open) pre.textContent = full;   // (closed, the long text is not rebuilt: less layout while timings are collected)
  };
  tick();
  setInterval(tick, 500);
}
