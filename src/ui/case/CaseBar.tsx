// The case bar (docs/approved/play-the-case.md, "The bar"): it stands in the play bar's place while a case plays. Previous stop, Play or Pause, next stop; the day and where the case is;
// History's strip, the course already played in full ink and the rest faint; Leave the case. Dragging the strip moves the playhead; letting go goes to the stop nearest it.
// Mac and an iPad: one row at the foot. iPhone: two rows, the strip under the buttons. The playhead and the veil over what is still to come are one layer moved by a transform on the
// one clock (History's strip does the same), so the days running never rebuild the chart.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Chart } from '../charts/Chart.tsx';
import { clock } from '../../clock/frame.ts';
import { Tweened, easeArrive, linear } from '../../clock/tween.ts';
import { I, Icon } from '../shell/icons.tsx';
import { useCase } from './store.ts';
import { continueCase, goStop, leaveCase, nextStop, pauseCase, resumeCase } from './run.ts';
import { caseAxis, caseStripScene, stopAtFrac, CASE_STRIP } from './strip.ts';
import { barWords, dragWords, CASE } from './words.ts';
import { nearestStop } from './stops.ts';
import type { CaseView } from './view.ts';

/** The strip with its playhead: drawn once per stop (the names' weights), the playhead and the veil moved on the clock, a drag surface over it. */
function CaseStrip({ cv, at, day, h, names, onDrag, onBuilt }: { cv: CaseView; at: number; day: number; h: number; names: boolean; onDrag(d: number | null): void; onBuilt(): void }) {
  const { v } = cv, stops = useCase((s) => s.stops);
  const axis = useMemo(() => caseAxis(v.marks.map((k) => k.day), v.full), [v]);
  const metric = v.metrics.includes('ppg') ? 'ppg' : v.metrics[0] ?? null;
  const head = useRef<HTMLDivElement>(null), surf = useRef<HTMLDivElement>(null), host = useRef<HTMLDivElement>(null);
  const pos = useRef<Tweened | null>(null), width = useRef(0), drag = useRef<{ id: number; f: number } | null>(null);
  const travel = useCase((s) => s.phase === 'travel' && !s.paused);
  useEffect(() => () => { pos.current?.dispose(); }, []);
  // the playhead and the veil: one transform, eased to the day (the days running: a short linear step each tick, so it runs on smoothly)
  const glide = (f: number, ms: number, ease = easeArrive) => {
    const el = head.current;
    if (!el) return;
    const p = (pos.current ??= new Tweened(f, 'case-playhead'));
    const apply = () => { el.style.transform = `translateX(${(p.value * 100).toFixed(3)}%)`; };
    if (!p.moving && Math.abs(p.value - f) < 1e-4) { apply(); return; }
    const off = clock.on('tween', apply, 5);
    p.to(f, { ms, ease, done: () => { apply(); off(); } });
  };
  useLayoutEffect(() => { if (!drag.current) glide(axis.frac(day), travel ? 170 : 420, travel ? linear : easeArrive); }, [axis, day, travel]);
  useEffect(() => {
    const el = surf.current;
    if (!el || typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver((es) => { const b = es[0]?.borderBoxSize?.[0]; width.current = b ? b.inlineSize : es[0]?.contentRect.width ?? 0; });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const built = () => onBuilt();
    if (el.querySelector('[data-built]')) onBuilt();
    el.addEventListener('pz-chart-built', built);
    return () => el.removeEventListener('pz-chart-built', built);
  }, [onBuilt]);
  const fracOf = (e: React.PointerEvent) => (width.current > 0 ? Math.max(0, Math.min(1, (e.nativeEvent.offsetX - CASE_STRIP.PAD) / Math.max(1, width.current - 2 * CASE_STRIP.PAD))) : 0);
  const down = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const f = fracOf(e);
    drag.current = { id: e.pointerId, f };
    glide(f, 90);
    onDrag(axis.dayAt(f));
  };
  const move = (e: React.PointerEvent) => {
    if (drag.current?.id !== e.pointerId) return;
    const f = fracOf(e);
    drag.current.f = f;
    glide(f, 60);
    onDrag(axis.dayAt(f));
  };
  const up = (e: React.PointerEvent) => {
    const d = drag.current;
    if (d?.id !== e.pointerId) return;
    drag.current = null;
    onDrag(null);
    const i = stopAtFrac(stops, axis, d.f);
    // (the playhead eases onto the stop it goes to; the stop's own day follows from the store)
    glide(axis.frac(stops[i]!.day), 320);
    goStop(i);
  };
  const cancel = () => { drag.current = null; onDrag(null); glide(axis.frac(day), 320); };
  const keys = (e: React.KeyboardEvent) => {
    const i = useCase.getState().at;
    if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); goStop(i - 1); }
    if (e.key === 'ArrowRight' && i < stops.length - 1) { e.preventDefault(); goStop(i + 1); }
  };
  useEffect(() => { if (!metric) onBuilt(); }, [metric, onBuilt]);
  if (!metric) return null;
  const top = names ? CASE_STRIP.NAMES : 2;
  return (
    <div className="cb-strip" ref={host}>
      <Chart tag="case-strip" deps={[v, metric, at, h, names, cv.tones]} label={`${CASE.strip}`}
        build={(c) => caseStripScene({
          series: v.series, metric, chapters: v.chapters, keyDays: v.marks.map((k) => k.day), meds: v.meds, full: v.full, at, h, names,
          stops: stops.map((s, i) => ({ day: s.day, tone: cv.tones[i] ?? 'info', short: cv.shorts[i] ?? '' })),
        }, c)} />
      <div className="cb-ph-span" aria-hidden="true" style={{ top: `${top - 2}px` }}><div ref={head} className="cb-ph"><i className="cb-veil" /><i className="cb-head" /></div></div>
      <div ref={surf} className="cb-drag" role="slider" tabIndex={0} aria-label={CASE.strip}
        aria-valuemin={1} aria-valuemax={stops.length} aria-valuenow={at + 1} aria-valuetext={barWords(useCase.getState()).small}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onKeyDown={keys} />
    </div>
  );
}

export function CaseBar({ cv, thumb, phone, exploring, on }: { cv: CaseView | null; thumb: boolean; phone: boolean; exploring: boolean; on: boolean }) {
  const s = useCase();
  const [dragDay, setDragDay] = useState<number | null>(null);
  const [built, setBuilt] = useState(false);
  const onBuilt = useMemo(() => () => setBuilt(true), []);
  const last = s.at >= s.stops.length - 1;
  const travel = s.phase === 'travel';
  const running = travel && !s.paused;
  const words = dragDay != null ? dragWords(dragDay, s.stops, nearestStop(s.stops, dragDay)) : barWords(s, exploring);
  const prev = () => { if (travel) goStop(s.at); else if (s.at > 0) goStop(s.at - 1); };
  const play = () => { if (travel) { if (s.paused) resumeCase(); else pauseCase(); } else continueCase(); };
  const ctl = (
    <div className="cb-ctl">
      <button type="button" className="cb-ib" aria-label={CASE.prev} title={CASE.prev} disabled={!travel && s.at === 0} onClick={prev}><Icon n="skip-back" /></button>
      <button type="button" className="cb-ib cb-play" aria-label={running ? CASE.pause : CASE.play} title={running ? CASE.pause : CASE.play} disabled={!travel && last} onClick={play}>
        <I n={running ? 'pause' : 'play'} />
      </button>
      <button type="button" className="cb-ib" aria-label={CASE.next} title={CASE.next} disabled={!travel && last} onClick={() => nextStop()}><Icon n="skip-next" /></button>
    </div>
  );
  const when = <div className="cb-when" aria-live="off"><b>{words.day}</b><small>{words.small}</small></div>;
  const leave = <button type="button" className="cb-leave" onClick={() => leaveCase()}><Icon n="close" /><span>{phone || thumb ? CASE.leaveShort : CASE.leave}</span></button>;
  const strip = cv && <CaseStrip cv={cv} at={s.at} day={dragDay ?? s.day} h={phone ? 30 : 66} names={!phone} onDrag={setDragDay} onBuilt={onBuilt} />;
  return (
    <div className="case-bar stage-blocker" data-on={on && built} data-phone={phone || undefined} role="group" aria-label="The case" inert={!on}>
      {phone ? <><div className="cb-row">{ctl}{when}{leave}</div>{strip}</> : <>{ctl}{when}{strip}{leave}</>}
    </div>
  );
}
