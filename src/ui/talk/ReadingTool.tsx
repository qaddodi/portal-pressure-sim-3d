// The measurement card of a procedure slide (2D tool-reading.js, `tool: { kind: 'reading' }`): the one pressure monitor on the slide's measuring procedure (HVPG catheter, EUS-PPG, PPG by IR, PPG through a TIPS),
// following the procedure's own clock as the figure plays it: before the tip is in the monitor waits, each reading is a live trace the clock records, and the numbers are the ones the figure's callouts print.
// Pure parts: reading-plan.ts. The clock is the scene's procedure player (`sceneApi.procedure.playing`: kind and ms), the same one the IR pane's Watch row and the presenter's Play button start. 
import { useEffect, useMemo, useRef, useState } from 'react';
import { clock } from '../../clock/frame.ts';
import { latest } from '../../engine/index.ts';
import { sceneApi } from '../../scene/api.ts';
import { Monitor, type MonSource } from '../tests/ir/Monitor.tsx';
import { monitorFrame, type MonitorState } from '../tests/ir/monitor.ts';
import { readingPlan, readingAt, type Script } from './reading-plan.ts';
import { newWave, syncWave } from '../tests/copied/hvpg-clock.copied.js';

type Rec = Record<string, unknown>;
export function ReadingTool({ procedure, fp, of }: { procedure: unknown; fp: Rec | null; of?: unknown }) {
  const { script } = useMemo(() => readingPlan(procedure, of), [procedure, of]);
  const [n, setN] = useState(0);
  const fpRef = useRef(fp); fpRef.current = fp;
  const run = useMemo(() => {
    const tk: Record<string, number> = {}, key = {}, wave = newWave(), v: Record<string, number> = { a: NaN, b: NaN, g: NaN };
    const st: MonitorState = { ph: 'idle', t: 0, v, running: true, wave, probing: false };
    let playing = false;
    const src: MonSource = {
      id: 'reading-tool', label: () => (script ? readingAt(script, tk, script.vals(fpRef.current, v)).words : 'Pressure tracing'),
      active: () => playing,
      frame(w, h) {
        if (!script) return monitorFrame(key, null, st, w, h, 'Pressure tracing');
        script.vals(fpRef.current, v);
        const r = readingAt(script, tk, v);
        st.ph = r.ph as MonitorState['ph']; st.t = r.t;
        if (st.ph === 'run') syncWave(wave, latest.frame, st.t, performance.now());
        return monitorFrame(key, script, st, w, h, r.words);
      },
    };
    return { tk, src, set: (p: boolean) => { playing = p; } };
  }, [script]);
  // the procedure's clock: each frame the figure plays one of this script's kinds, its time is the card's; a first kind starting again sets the later ones back (2D `procAt`)
  useEffect(() => {
    if (!script) return;
    for (const k of Object.keys(run.tk)) delete run.tk[k];
    let hold: { release(): void } | null = null, was = false, last = '';
    const off = clock.on('tween', () => {
      const p = sceneApi.procedure.playing;
      const mine = !!p && script.kinds.includes(p.kind);
      if (mine) {
        if (p.kind === script.kinds[0]) for (let i = 1; i < script.kinds.length; i++) delete run.tk[script.kinds[i]!];
        run.tk[p.kind] = p.t;
        if (!hold) hold = clock.hold('reading-tool');
      } else if (hold) { hold.release(); hold = null; }
      run.set(mine);
      if (was !== mine) { was = mine; setN((x) => x + 1); }   // (the drawn frame once more where the clock stops, and once at the start)
      const key = JSON.stringify(run.tk);
      if (!mine && key !== last) { last = key; setN((x) => x + 1); }
    });
    return () => { off(); hold?.release(); };
  }, [script, run]);
  if (!script) return null;
  return <div className="pz-mon pz-reading dock-pane-host" data-instrument="reading"><Monitor src={run.src} h={170} deps={[n, script.id]} className="chart-box hvpg-box" /></div>;
}
