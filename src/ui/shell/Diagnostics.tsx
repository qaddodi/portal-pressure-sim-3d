// Settings › Diagnostics: "Show frame rate" (a small counter in the bottom-left corner) and "Show frame breakdown" (the clock's frame times and who asked for frames, the
// same text ?perf shows). Both read the clock's own timings twice a second; neither draws per frame.
import { useEffect, useRef, useState } from 'react';
import { clock } from '../../clock/frame.ts';
import { useSettings } from '../../state/settings.ts';
import { resolveLook } from '../../looks/looks.ts';
import { perfReport } from '../perf/report.ts';

const report = () => perfReport(clock.stats(), { ua: navigator.userAgent, dpr: devicePixelRatio, size: `${innerWidth}×${innerHeight}`, look: resolveLook(useSettings.getState().look, matchMedia('(prefers-color-scheme: dark)').matches), hash: String(import.meta.env.VITE_BUILD ?? 'dev') });

export function Diagnostics() {
  const fps = useSettings((s) => s.showFps), breakdown = useSettings((s) => s.showBreakdown);
  const [rate, setRate] = useState(0);
  const [text, setText] = useState('');
  const last = useRef({ n: 0, t: 0 });
  useEffect(() => {
    if (!fps && !breakdown) return;
    last.current = { n: clock.stats().framesDrawn, t: performance.now() };
    const id = setInterval(() => {
      const n = clock.stats().framesDrawn, t = performance.now();
      setRate(Math.round(((n - last.current.n) * 1000) / Math.max(1, t - last.current.t)));
      last.current = { n, t };
      if (breakdown) setText(report());
    }, 500);
    return () => clearInterval(id);
  }, [fps, breakdown]);
  return (
    <div className="sh-diag" aria-hidden={!fps && !breakdown}>
      <div className="sh-diag-box" data-on={fps}>{rate} fps</div>
      <pre className="sh-diag-box" data-on={breakdown}>{text}</pre>
    </div>
  );
}
