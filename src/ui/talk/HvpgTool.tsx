// The HVPG catheter's tracing as a slide's data card (2D tool-hvpg.js, `tool: { kind: 'hvpg' }`): the one pressure monitor on the HVPG script, the readings the slide's state settles at.
//   catheter: true on a slide whose figure has the catheter (cath 'free' | 'wedge' | 'result'): the card shows the step the catheter is at, the slide's number as the callout prints it, and the
//     trace rides the balloon: arriving on the wedge slide, the pressure rises over the balloon's own fill time; arriving on 'result' holds the finished tracing.
//   no catheter: stepped onto going forward it shows the free pressure and waits; each Next takes the next reading (the balloon up and the pressure riding it to the wedge, then the HVPG); Back
//     takes them back. Jumped to, or gone back to, it shows the finished tracing at once. `hvpgSteps` (ui/talk/tool-step.ts) is the Next and Back the presenter hands it.
// The trace is recorded as the clock passes (trace-tape, in the copied monitor): a jump writes the finished tape at once, a step writes it as time runs. Pure parts: stepsOf, targetOf.
import { useEffect, useMemo, useRef, useState } from 'react';
import { clock } from '../../clock/frame.ts';
import { latest } from '../../engine/index.ts';
import { Monitor, type MonSource } from '../tests/ir/Monitor.tsx';
import { hvpgFrame, type TraceSt } from '../tests/ir/hvpg.ts';
import { T, newWave, syncWave } from '../tests/copied/hvpg-clock.copied.js';
import { HVPG_STEPS, STEP_T, stepsOf, levelsOf, startAt } from './hvpg-plan.ts';
import { setToolStep } from './tool-step.ts';
import { claimSlide } from './slide-claim.ts';
import { cathScript } from '../deck/cath-clock.ts';

type Rec = Record<string, unknown>;
/** What the card was showing when it was last taken down: a card that comes back within a moment (the next slide of the same measurement, or its re-mount) carries on from there (2D card-keep.js). */
let kept: { at: number; t: number; at0: number } | null = null;
const KEEP_MS = 1500;

export function HvpgTool({ fp, cath, catheter, forward }: { fp: Rec | null; cath: unknown; catheter: boolean; forward: boolean }) {
  const follow = stepsOf({ catheter }, cath);
  const lv = useMemo(() => levelsOf(fp), [fp]);
  const first = useRef(true);
  const [at, setAt] = useState<number>(() => (follow ? HVPG_STEPS.indexOf(follow) : forward ? 0 : 2));
  const [n, setN] = useState(0);
  const L = useRef({ lv, t: 0, to: 0, running: false, at: -1, follow: false, off: null as null | (() => void) });
  L.current.lv = lv; L.current.follow = !!follow;
  const stepped = useRef(false);
  useEffect(() => { if (follow) setAt(HVPG_STEPS.indexOf(follow)); }, [follow]);
  const src = useMemo<MonSource>(() => {
    const key = {}, wave = newWave(), st: TraceSt = { ph: 'run', t: 0, v: null, blocked: false, running: false, wave };
    return {
      id: 'hvpg-tool', label: () => 'HVPG catheter tracing',
      active: () => L.current.running,
      frame(w, h) {
        const c = L.current;
        st.t = c.t; st.v = c.lv ?? { fhvp: 0, whvp: 0, hvpg: 0 }; st.running = c.running;
        if (c.running) syncWave(wave, latest.frame, c.t, clock.now());
        return hvpgFrame(key, st, w, h, `HVPG catheter tracing${c.lv ? `: free ${c.lv.fhvp.toFixed(1)}, wedged ${c.lv.whvp.toFixed(1)}, HVPG ${c.lv.hvpg.toFixed(1)} mmHg` : ''}`);
      },
    };
  }, []);
  // the clock runs to the time of the reading the card is at: a step forward is written as time passes (the balloon up, the pressure riding it), a step back or a jump is written at once
  useEffect(() => {
    const c = L.current, to = STEP_T[HVPG_STEPS[at]!];
    c.off?.(); c.off = null;
    const k = first.current ? kept : null, fresh = first.current;
    first.current = false;
    const from = fresh ? startAt({ to, carry: k && clock.now() - k.at0 < KEEP_MS && k.at < at ? k.t : null, follow: !!follow, figure: cathScript.on ? cathScript.t : null, forward }) : c.t;
    c.to = to; c.t = from; c.at = at;
    if (!c.lv || from >= to) { c.t = to; c.running = false; setN((x) => x + 1); return; }
    c.running = true; setN((x) => x + 1);
    let last = clock.now();
    const hold = clock.hold('hvpg-tool');
    const off = clock.on('tween', () => {
      const now = clock.now(), dt = Math.min(100, now - last); last = now;
      // (with the catheter on the figure the card reads the figure's own time (scene-link.ts, the one hvpg-clock script), so the trace steps in the frame the balloon fills; with none, its own)
      c.t = Math.min(c.to, c.follow && cathScript.on ? Math.max(c.t, cathScript.t) : c.t + dt);
      if (c.t >= c.to) { c.running = false; setN((x) => x + 1); c.off?.(); c.off = null; }
    });
    let done = false;
    c.off = () => { if (done) return; done = true; off(); hold.release(); };
    return c.off;
  }, [at, !!lv]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { kept = { at: L.current.at, t: L.current.t, at0: clock.now() }; }, []);
  // Next and Back on the slide (a card that takes its readings one Next at a time): ui/talk/tool-step.ts, asked by the presenter's move
  useEffect(() => {
    if (follow) { setToolStep(null); return; }
    const can = (dir: 1 | -1) => (dir > 0 ? at < 2 : stepped.current && at > 0);
    setToolStep({ can, step: (dir) => { if (!can(dir)) return false; stepped.current = true; setAt(at + dir); return true; } });
    return claimSlide('step', () => setToolStep(null));   // (a leaving HVPG card never clears the arriving card's stepper: slide-claim.ts)
  }, [at, follow]);
  if (!lv) return null;
  return (
    <div className="pz-mon pz-hvpg dock-pane-host" data-instrument="hvpg" data-reading={at < 2 ? 'pending' : undefined}>
      <Monitor src={src} h={190} deps={[n, at]} className="chart-box hvpg-box" />
      {!follow && (
        <ol className="mon-steps" aria-label="Readings, one for each Next" data-at={at}>
          {([['FHVP', 'Free pressure'], ['WHVP', 'Wedge pressure'], ['HVPG', 'Wedge minus free']] as const).map(([k, t], i) => (
            <li key={k} title={t} data-state={i < at ? 'done' : i === at ? 'now' : undefined}><span className="ms-dot"><i className="ms-fill" /><b>{i + 1}</b></span><span>{k}</span></li>
          ))}
        </ol>
      )}
    </div>
  );
}
