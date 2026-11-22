// Settings › Diagnostics: "Show frame rate" (a small counter in the bottom-left corner) and "Show frame breakdown" (the clock's frame times and who asked for frames, the
// same text ?perf shows). Both read the clock's own timings twice a second; neither draws per frame.
import { useEffect, useRef, useState } from 'react';
import { clock } from '../../clock/frame.ts';
import { useSettings } from '../../state/settings.ts';
import { resolveLook } from '../../looks/looks.ts';
import { perfReport } from '../perf/report.ts';
import { bootDigest } from '../../boot/digest.ts';

const report = () => perfReport(clock.stats(), { ua: navigator.userAgent, dpr: devicePixelRatio, size: `${innerWidth}×${innerHeight}`, look: resolveLook(useSettings.getState().look, matchMedia('(prefers-color-scheme: dark)').matches), hash: String(import.meta.env.VITE_BUILD ?? 'dev'), boot: bootDigest() });

export function Diagnostics() {
  const fps = useSettings((s) => s.showFps), breakdown = useSettings((s) => s.showBreakdown);
  const [rate, setRate] = useState(0);
  const [text, setText] = useState('');
  const last = useRef({ n: 0, t: 0 });
  useEffect(() => {
    if (!fps && !breakdown) return;
    last.current = { n: clock.stats().framesDrawn, t: clock.now() };
    const id = clock.every(() => {
      const n = clock.stats().framesDrawn, t = clock.now();
      setRate(Math.round(((n - last.current.n) * 1000) / Math.max(1, t - last.current.t)));
      last.current = { n, t };
      if (breakdown) setText(report());
    }, 500);
    return () => clock.cancel(id);
  }, [fps, breakdown]);
  return (
    <>
      {fps && <div className="fps-counter" aria-hidden="true"><span className="fps-num">{rate}</span><span className="fps-unit">fps</span></div>}
      <div className="sh-diag" aria-hidden={!breakdown}>
        <pre className="sh-diag-box" data-on={breakdown}>{text}</pre>
      </div>
    </>
  );
}
