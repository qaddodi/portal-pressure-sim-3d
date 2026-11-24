// The timeline chart's card (docs/approved/timeline-chart.md): the chart and its strip on the left, "What to graph" or "What happened" beside it (a sheet raised from the foot on a phone).
// The chart is one frame (frame.ts) drawn by the chart GPU; this file is the card around it and the pointer: hover or drag moves the crosshair, the wheel or a pinch zooms the days, the strip
// under the chart moves the window.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { clock, type TimerId } from '../../clock/frame.ts';
import { Chart, type ChartCtx } from '../charts/Chart.tsx';
import { readBox } from '../layout-snap.ts';
import { useShell } from '../shell/store.ts';
import { useThumb } from '../shell/thumb.ts';
import { useSheetSwipe } from '../shell/use-sheet-swipe.ts';
import { useUi } from '../ui-store.ts';
import { Chooser } from './Chooser.tsx';
import { Happened } from './Happened.tsx';
import { baseName } from './data.ts';
import { bigFrame, leadOf, stripFrame, type BigIn, type Geo } from './frame.ts';
import { MEASURES } from './measures.ts';
import { slid, useBig, zoomed } from './store.ts';
import { useBigData } from './use-data.ts';
import { useBox } from './use-box.ts';
import { useGlide } from './use-glide.ts';
import { BT } from './words.ts';

const MIN_DAYS = 3, GRIP = 10;
type Grab = { mode: 'l' | 'r' | 'move'; off: number; w: number };

export function TimelineCard() {
  const data = useBigData(true);
  const on = useBig((s) => s.on), hidden = useBig((s) => s.hidden), win = useBig((s) => s.win), cursor = useBig((s) => s.cursor), pin = useBig((s) => s.pin);
  const panel = useBig((s) => s.panel), raised = useBig((s) => s.raised), set = useBig.getState().set;
  const vp = useUi((s) => s.vp), thumb = useThumb(), compact = thumb || vp.w < 760 || vp.h < 520;
  const full = data.full;
  const [drag, setDrag] = useState(false), [fresh, setFresh] = useState(false), [open, setOpen] = useState<string | null>(null);
  const target = useMemo<[number, number]>(() => (win ? slid(win, full) : [full[0], full[1]]), [win, full]);
  // a window the learner sets by a word eases; one a hand is dragging, or the whole run as it grows, is set at once
  const [w0, w1] = useGlide(target, drag || (win == null && !fresh));
  const isZoomed = !!win && win[1] - win[0] < full[1] - full[0] - 1e-6;

  const snapFor = useRef<TimerId | null>(null);
  const snapSoon = () => { setDrag(true); clock.cancel(snapFor.current); snapFor.current = clock.after(() => setDrag(false), 160, 'bigtime-snap'); };
  const eased = (w: readonly [number, number] | null) => { clock.cancel(snapFor.current); setDrag(false); setFresh(true); clock.after(() => setFresh(false), 420, 'bigtime-fresh'); set({ win: w }); };

  const plot = useBox<HTMLDivElement>(), stripBox = useBox<HTMLDivElement>();
  const geo = useRef<Geo | null>(null);
  const lead = leadOf(plot.w || 800);
  const shown = cursor ?? pin;
  const ids = MEASURES.filter((m) => on[m.id] && data.series[m.id]).map((m) => m.id);
  const lines = useMemo(() => data.lines.filter((l) => !(l.kind === 'change' && hidden.has(baseName(l.label)))), [data.lines, hidden]);
  const meds = useMemo(() => data.meds.filter((m) => !hidden.has(m.key)), [data.meds, hidden]);
  const inp = (h: number): BigIn => ({ series: data.series, hvpg: data.hvpg, on: ids, lines, meds, full, win: [w0, w1], cursor: shown, open, h });

  // ── the pointer on the chart ──
  const rect = useRef<{ left: number; top: number; w: number } | null>(null);
  const touches = useRef(new Map<number, number>()), pinch = useRef(0);
  const dayOf = (clientX: number): number => {
    const g = geo.current;
    if (!g) return w1;
    return Math.max(full[0], Math.min(full[1], g.dayAt(clientX - (rect.current?.left ?? 0))));
  };
  const measureBox = (el: HTMLElement) => { const b = readBox(el); rect.current = { left: b.left, top: b.top, w: b.width }; };
  const onEnter = (e: RPointerEvent<HTMLDivElement>) => measureBox(e.currentTarget);
  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    measureBox(e.currentTarget);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    touches.current.set(e.pointerId, e.clientX);
    if (touches.current.size === 2) { const [a, b] = [...touches.current.values()]; pinch.current = Math.abs(a! - b!); return; }
    set({ cursor: dayOf(e.clientX) });
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, e.clientX);
    if (touches.current.size === 2) {
      const [a, b] = [...touches.current.values()], d = Math.abs(a! - b!);
      if (pinch.current > 8 && d > 8) { snapSoon(); set({ win: zoomed([w0, w1], full, d / pinch.current, dayOf((a! + b!) / 2)) }); }
      pinch.current = d;
      return;
    }
    if (e.pointerType === 'mouse' && e.buttons === 0) { if (!rect.current) measureBox(e.currentTarget); set({ cursor: dayOf(e.clientX) }); return; }
    if (touches.current.has(e.pointerId)) set({ cursor: dayOf(e.clientX) });
  };
  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    const was = touches.current.size;
    touches.current.delete(e.pointerId);
    // a tap on a phone's "+N" tick (in the band of labels) opens that group, a second tap closes it
    const g = geo.current, tapX = e.clientX - (rect.current?.left ?? 0);
    if (was === 1 && g && g.groups.length && e.clientY - (rect.current?.top ?? 0) < g.top) {
      const near = g.groups.reduce<{ key: string; dx: number } | null>((best, m) => { const dx = Math.abs(m.x - tapX); return dx < 22 && (!best || dx < best.dx) ? { key: m.key, dx } : best; }, null);
      if (near) { setOpen(open === near.key ? null : near.key); set({ cursor: null }); return; }
    }
    if (was === 1) { const d = dayOf(e.clientX); set(e.pointerType === 'mouse' ? { cursor: d, pin: pin != null && Math.abs(pin - d) < (w1 - w0) / 80 ? null : d } : { pin: d, cursor: null }); }
  };
  const onLeave = (e: RPointerEvent<HTMLDivElement>) => { if (e.pointerType === 'mouse') set({ cursor: null }); };
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!rect.current) measureBox(e.currentTarget);
    snapSoon();
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { const k = (w1 - w0) / Math.max(1, rect.current?.w ?? 600); set({ win: slid([w0 + e.deltaX * k, w1 + e.deltaX * k], full) }); return; }
    set({ win: zoomed([w0, w1], full, Math.exp(-e.deltaY * 0.0022), dayOf(e.clientX)) });
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = shown ?? w1, step = Math.max(1, Math.round((w1 - w0) / 40));
    const to = e.key === 'ArrowLeft' ? at - step : e.key === 'ArrowRight' ? at + step : e.key === 'Home' ? w0 : e.key === 'End' ? w1 : null;
    if (to == null) return;
    e.preventDefault();
    set({ pin: Math.max(full[0], Math.min(full[1], to)) });
  };

  // ── the strip: the window's grips ──
  const grab = useRef<Grab | null>(null), stripRect = useRef(0);
  const sd = (x: number) => full[0] + (x - lead.L) / Math.max(1, stripBox.w - lead.L - lead.R) * (full[1] - full[0]);
  const sx = (d: number) => lead.L + (d - full[0]) / Math.max(1e-9, full[1] - full[0]) * (stripBox.w - lead.L - lead.R);
  const stripDown = (e: RPointerEvent<HTMLDivElement>) => {
    const b = readBox(e.currentTarget); stripRect.current = b.left;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const x = e.clientX - b.left, a = sx(w0), z = sx(w1), width = w1 - w0;
    if (Math.abs(x - a) <= GRIP) grab.current = { mode: 'l', off: 0, w: width };
    else if (Math.abs(x - z) <= GRIP) grab.current = { mode: 'r', off: 0, w: width };
    else if (x > a && x < z) grab.current = { mode: 'move', off: sd(x) - w0, w: width };
    else { grab.current = { mode: 'move', off: width / 2, w: width }; setDrag(true); set({ win: slid([sd(x) - width / 2, sd(x) + width / 2], full) }); return; }
    setDrag(true);
  };
  const stripMove = (e: RPointerEvent<HTMLDivElement>) => {
    const g = grab.current;
    if (!g) return;
    const d = sd(e.clientX - stripRect.current);
    set({ win: g.mode === 'l' ? [Math.max(full[0], Math.min(d, w1 - MIN_DAYS)), w1] : g.mode === 'r' ? [w0, Math.min(full[1], Math.max(d, w0 + MIN_DAYS))] : slid([d - g.off, d - g.off + g.w], full) });
  };
  const stripUp = () => { grab.current = null; setDrag(false); };

  const reset = () => eased(null);
  const pick = useCallback((day: number) => {
    set({ pin: day });
    const w = useBig.getState().win ?? full;
    if (day < w[0] || day > w[1]) eased(slid([day - (w[1] - w[0]) / 2, day + (w[1] - w[0]) / 2], full));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full[0], full[1]]);

  const build = (c: ChartCtx) => { const r = bigFrame(inp(plot.h), c); geo.current = r.geo; return r.frame; };
  const stripBuild = (c: ChartCtx) => stripFrame(inp(plot.h), c, leadOf(c.w)).frame;
  const deps = [data, ids.join(), lines, meds, w0, w1, shown, plot.h, open];
  const close = () => useShell.getState().close();
  // A phone's raised panel (What to graph, What happened) is a bottom sheet of its own: a pull down from anywhere on it, from the top of its list, shuts it as every sheet does (shell/sheet-swipe.ts). The card around it is a sheet too and
  // closes the whole chart on a pull, so a touch that begins inside the panel does not reach it (root cause of "I can't swipe it down": the pull was the card's, or nobody's).
  const side = useRef<HTMLElement>(null);
  useSheetSwipe(side, () => set({ raised: false }), () => compact && raised);
  useEffect(() => {
    const el = side.current;
    if (!el || !compact || !raised) return;
    const keep = (e: Event) => e.stopPropagation();
    el.addEventListener('pointerdown', keep); el.addEventListener('touchstart', keep, { passive: true });
    return () => { el.removeEventListener('pointerdown', keep); el.removeEventListener('touchstart', keep); };
  }, [compact, raised]);
  const sideHead = compact ? null : (
    <header className="bt-tabs">
      <div className="bt-seg">
        <button type="button" aria-pressed={panel === 'graph'} onClick={() => set({ panel: 'graph' })}>{BT.graph}</button>
        <button type="button" aria-pressed={panel === 'happened'} onClick={() => set({ panel: 'happened' })}>{BT.happened}</button>
      </div>
      <button type="button" className="bt-done" onClick={close}>{BT.done}</button>
    </header>
  );
  const at = shown ?? full[1];
  return (
    <div className="bt" data-compact={compact || undefined} data-raised={raised || undefined}>
      <div className="bt-main">
        <header className="bt-head">
          <h2>{BT.title}</h2>
          {compact ? (
            <p className="bt-acts">{isZoomed && <button type="button" onClick={reset}>{BT.reset}</button>}<button type="button" className="bt-done" onClick={close}>{BT.done}</button></p>
          ) : (
            <p className="bt-range"><span>{BT.range(w0, w1)}</span><button type="button" data-idle={!isZoomed || undefined} disabled={!isZoomed} onClick={reset}>{BT.reset}</button></p>
          )}
        </header>
        {data.empty ? (
          <p className="bt-empty"><b>{BT.empty}</b>{BT.emptyHint}</p>
        ) : (
          <>
            {data.short && <p className="bt-hint">{BT.shortHint}</p>}
            <div ref={plot.ref} className="bt-plot" role="slider" tabIndex={0} aria-label="Day" aria-valuemin={Math.round(full[0])} aria-valuemax={Math.round(full[1])} aria-valuenow={Math.round(at)} aria-valuetext={BT.day(at)}
              onPointerEnter={onEnter} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onLeave} onWheel={onWheel} onKeyDown={onKey}>
              {plot.h > 0 && plot.w > 0 && <Chart tag="bigtime" glide={false} label={`Over time, ${BT.range(w0, w1).toLowerCase()}`} deps={deps} build={build} />}
            </div>
            <div ref={stripBox.ref} className="bt-strip" role="slider" tabIndex={0} aria-label="Days shown" aria-valuemin={Math.round(full[0])} aria-valuemax={Math.round(full[1])} aria-valuenow={Math.round(w0)} aria-valuetext={BT.range(w0, w1)}
              onPointerDown={stripDown} onPointerMove={stripMove} onPointerUp={stripUp} onPointerCancel={stripUp}>
              {plot.w > 0 && <Chart tag="bigtime-strip" glide={false} label="The whole run, with the days shown" deps={deps} build={stripBuild} />}
            </div>
          </>
        )}
        {compact && (
          <footer className="bt-foot">
            <button type="button" onClick={() => set({ panel: 'graph', raised: true })}><i className="ic ic-trend" aria-hidden="true" />{BT.graph}<i className="ic ic-chev-down bt-go" aria-hidden="true" /></button>
            <button type="button" data-quiet onClick={() => set({ panel: 'happened', raised: true })}><i className="ic ic-bullets" aria-hidden="true" />{BT.happened}<i className="ic ic-chev-down bt-go" aria-hidden="true" /></button>
          </footer>
        )}
      </div>
      <aside ref={side} className="bt-side" aria-label={panel === 'graph' ? BT.graph : BT.happened} inert={compact && !raised}>
        {compact && <span className="sh-grabbar" aria-hidden="true" />}
        {compact ? <header className="bt-tabs"><h2>{panel === 'graph' ? BT.graph : BT.happened}</h2><button type="button" className="bt-done" onClick={() => set({ raised: false })}>{BT.done}</button></header> : sideHead}
        <div className="bt-body">
          {panel === 'graph' ? <Chooser data={data} at={at} /> : <Happened data={data} onPick={pick} scroll={compact} />}
        </div>
      </aside>
    </div>
  );
}
