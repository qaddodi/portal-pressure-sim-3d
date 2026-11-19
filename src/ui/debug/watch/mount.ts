// ?watch (and ?debug): the motion recorder on the page. One system on the clock's last phase samples every frame that runs; a slow timer samples a resting page
// twice a second so the history shows "nothing moved" too. A small dot sits at the screen's foot: grey while the last 20 seconds are clean, red with the count when a motion
// rule fired; a tap lists the findings and Copy puts them on the clipboard in the 2D app's words. Nothing is written per frame (the dot changes once a second).
import { clock } from '../../../clock/frame.ts';
import { useShell } from '../../shell/store.ts';
import { createRecorder, type Recorder } from './recorder.ts';
import { domSources } from './sources.ts';
import { attach } from '../pps.ts';
import { findingText } from '../core/rules.copied.js';

let rec: Recorder | null = null;
export const recorder = (): Recorder | null => rec;

export function mountWatch(opts: { dot?: boolean } = {}): Recorder {
  if (rec) return rec;
  const r = createRecorder(domSources(), { env: { vw: innerWidth } });
  rec = r;
  clock.on('tags', (f) => r.sample(f.time), 1000);
  let last = useShell.getState().view;
  useShell.subscribe((s) => { if (s.view !== last) { last = s.view; r.event('view', { to: s.view }); } });
  for (const ev of ['pointerdown', 'wheel', 'touchstart'] as const) window.addEventListener(ev, () => r.event('hand'), { passive: true, capture: true });
  setInterval(() => { if (!clock.awake) r.sample(performance.now()); }, 500);
  const text = () => { const f = r.findings(); return f.length ? f.map((x) => findingText(x)).join('\n') : 'No motion findings in the last 20 seconds.'; };
  attach('watch', { findings: () => r.findings(), history: (s?: number) => r.exportHistory(s), events: () => r.events(), clear: () => r.clear(), text });
  if (opts.dot !== false) mountDot(r, text);
  return r;
}

function mountDot(r: Recorder, text: () => string): void {
  const dot = document.createElement('button');
  dot.type = 'button'; dot.setAttribute('aria-label', 'Motion findings');
  dot.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:var(--z-perf);min-width:22px;height:22px;padding:0 6px;border-radius:11px;border:1px solid #fff8;background:#667;color:#fff;font:11px/20px ui-monospace,Menlo,monospace;pointer-events:auto';
  const panel = document.createElement('pre');
  panel.style.cssText = 'position:fixed;left:8px;bottom:36px;z-index:var(--z-perf);max-width:min(640px,92vw);max-height:50vh;overflow:auto;margin:0;padding:8px 10px;border-radius:10px;background:rgba(0,0,0,.82);color:#fff;font:11px/1.35 ui-monospace,Menlo,monospace;white-space:pre-wrap;display:none';
  let open = false;
  const paint = () => {
    const n = r.findings().length;
    dot.textContent = n ? String(n) : '';
    dot.style.background = n ? '#c33' : '#667';
    if (open) panel.textContent = text();
  };
  dot.onclick = () => {
    open = !open; panel.style.display = open ? 'block' : 'none'; paint();
    if (open) void navigator.clipboard?.writeText(text()).catch(() => undefined);
  };
  document.body.append(dot, panel);
  setInterval(paint, 1000);
}
