import { useEffect, useMemo, useRef, useState } from 'react';
import { clock } from '../../../clock/frame.ts';
import { Chart } from '../Chart.tsx';
import type { ChartPainter } from '../painter.ts';
import { headStep, HEAD_DT0 } from '../plot/follow.ts';
import { courseWork, curveKey, curveWork, goalOf, type CurveWork, type Fp, type RunFn, type SlideState } from './data.ts';
import { curveFrame, withAtX, type CurveOut, type CurveTool } from './frame.ts';
import { courseFrame, type CourseTool } from './course-frame.ts';
import { engineRun } from './run.ts';
import '../charts.css';

// What was worked out, kept for the session by slide and tool (2D keeps it per deck): a slide that comes up again draws its lines in the first drawing.
const asked = new Map<string, Promise<unknown>>();
const ready = new Map<string, unknown>();
function kept<T>(key: string, make: () => Promise<T | null>): Promise<T | null> {
  let p = asked.get(key) as Promise<T | null> | undefined;
  if (!p) {
    p = make();
    asked.set(key, p);
    p.then((v) => { if (v == null) asked.delete(key); else ready.set(key, v); }, () => asked.delete(key));
  }
  return p;
}

/** Works a curve or a course out ahead (the deck's slide after the one on show): its sweep runs the model through every point on the worker and takes a while, so a slide that opens on it
 *  finds it done and draws its lines in the first drawing, never an empty chart and then the lines. Asked once (`kept`); the card asks the same question with the same key. */
export function warmCurve(tool: CurveTool | CourseTool, slide: SlideState | null, id: string, fpOf?: (slideId: string) => Fp | null): void {
  if ((tool as { kind?: string }).kind === 'course') { const t = tool as CourseTool; void kept(curveKey(t, id), () => courseWork(t, engineRun(slide))).catch(() => undefined); return; }
  const t = tool as CurveTool;
  if (slide) void kept(curveKey(t, id), () => curveWork(t, slide, engineRun(slide), fpOf)).catch(() => undefined);
}

interface CardProps {
  /** the slide's `tool: { kind: 'curve' | 'course', … }`, as the 2D decks write it */
  tool: CurveTool | CourseTool;
  /** the slide's own state: its fingerprint and parameters (what its tiles read), and the model state each point starts from. Null until it is worked out (the axes still show). */
  slide?: SlideState | null;
  /** a what-if slider or a compare button is driving the model: its parameters and fingerprint (the case's line then follows them) */
  live?: { params?: unknown; fp: Fp } | null;
  /** another slide's fingerprint, for a dot made from a slide (`dots: [{ slide: 'a1' }]`) */
  fpOf?: (slideId: string) => Fp | null;
  /** the worker's chain of steps (the engine's 'sequence'); the engine's own when absent */
  run?: RunFn;
  /** names the slide in the kept results (a deck's slide id); without it the slide's fingerprint does */
  id?: string;
  /** the chart's height, px; else about three fifths of its width */
  height?: number;
  /** the room the data card leaves the chart, px (2D --pz-room, ToolCardBody's `room`): the chart is held to it */
  room?: number;
}

/** A parameter curve or a course for a slide. The points are worked out once on the engine's worker; until they are there the axes show and the lines then fade in. */
export function CurveCard(p: CardProps) {
  return (p.tool as { kind?: string }).kind === 'course' ? <CourseCard {...p} /> : <ParamCurveCard {...p} />;
}

function ParamCurveCard({ tool, slide = null, live = null, fpOf, run, id, height, room }: CardProps) {
  const t = tool as CurveTool;
  const key = useMemo(() => curveKey(t, id ?? slide?.fp), [t, id, slide?.fp]);
  const [work, setWork] = useState<CurveWork | null>(() => (ready.get(key) as CurveWork | undefined) ?? null);
  useEffect(() => {
    setWork((ready.get(key) as CurveWork | undefined) ?? null);
    if (!slide) return;
    let on = true;
    kept(key, () => curveWork(t, slide, run ?? engineRun(slide), fpOf)).then((w) => { if (on && w) setWork(w); }, () => undefined);
    return () => { on = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, !!slide]);

  const goal = useMemo(() => goalOf(t, work?.s ?? null, slide, live), [t, work, slide, live]);
  const painter = useRef<ChartPainter | null>(null);
  const out = useRef<CurveOut | null>(null);
  const shown = useRef<number | null>(null);
  const goalX = goal?.x ?? null;
  const seen = useRef<string>('');
  if (seen.current !== key) { seen.current = key; shown.current = goalX; }

  // the case's line glides after its goal (never a jump); the words stand where they were placed
  useEffect(() => {
    if (goalX == null) { shown.current = null; return; }
    if (shown.current == null) { shown.current = goalX; return; }
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const G = out.current?.G, span = G ? Math.abs(G.x1 - G.x0) || 1 : 1;
    const draw = () => { if (out.current && shown.current != null) painter.current?.show(withAtX(out.current, shown.current), false); };
    if (reduce || Math.abs(goalX - shown.current) < 0.001 * span) { shown.current = goalX; draw(); return; }
    const hold = clock.hold('chart:curve');
    let first = true;
    const off = clock.on('tween', (fi) => {
      shown.current = headStep(shown.current!, goalX, first ? HEAD_DT0 : fi.dt / 1000); first = false;
      if (Math.abs(goalX - shown.current) < 0.001 * span) shown.current = goalX;
      draw();
      if (shown.current === goalX) { off(); hold.release(); }
    });
    return () => { off(); hold.release(); };
  }, [goalX]);

  const [label, setLabel] = useState('A curve');
  return (
    <div className="pz-curve">
      <Chart tag="chart:curve" painter={painter} deps={[t, work, goal, height, room]} label={label} build={(c) => { const o = curveFrame({ tool: t, ser: work?.s ?? null, dots: work?.dd, goal, atX: shown.current, height, room }, c); out.current = o; setLabel(o.frame.label); return o.frame; }} />
    </div>
  );
}

function CourseCard({ tool, slide = null, run, id, height, room }: CardProps) {
  const t = tool as CourseTool;
  const key = useMemo(() => curveKey(t, id ?? slide?.fp ?? 'course'), [t, id, slide?.fp]);
  const [ser, setSer] = useState<unknown>(() => ready.get(key) ?? null);
  useEffect(() => {
    setSer(ready.get(key) ?? null);
    let on = true;
    // (the course is drawn on the patient the slide describes, a fresh model: it does not wait for the slide's own state)
    kept(key, () => courseWork(t, run ?? engineRun(slide))).then((s) => { if (on && s) setSer(s); }, () => undefined);
    return () => { on = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const [label, setLabel] = useState('A course over the days');
  return (
    <div className="pz-curve pz-course">
      <Chart tag="chart:course" deps={[t, ser, height, room]} label={label} build={(c) => { const o = courseFrame({ tool: t, ser, height, room }, c); setLabel(o.frame.label); return o.frame; }} />
    </div>
  );
}
