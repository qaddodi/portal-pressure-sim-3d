// History as the patient's timeline (docs/approved/timeline-story.md, option A, picked 26 Nov 2026): oldest first, chapter by chapter, one card a day for a day that matters and the days between
// folded, with a strip of one reading along the whole course above it. Scrolling the list moves only the strip's playhead (a transform on its own layer, on the one clock); the figure moves only
// when a card's "Show on the figure" is pressed (a restore, through the switch). Each moment keeps History's ways back and to Compare.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { useShell } from '../shell/store.ts';
import { openChartFromHistory } from '../shell/origin.ts';
import { timeline, getInterventionLabels, type Entry } from '../timeline/index.ts';
import { useTimeline } from '../timeline/store.ts';
import { pinEntry } from '../compare/bind.ts';
import { restOpenHistory } from './open-scroll.ts';
import { HIST } from './words.ts';
import { BT } from '../bigtime/words.ts';
import { Chart } from '../charts/Chart.tsx';
import { record } from '../tests/feed.ts';
import { useHidden } from '../tests/hidden.ts';
import { useEngine } from '../../engine/store.ts';
import { clock } from '../../clock/frame.ts';
import { Tweened, easeArrive } from '../../clock/tween.ts';
import { dayReadings, type Chapter, type Item, type Moment, type Numbers } from '../timeline/story.ts';
import { viewOf, momentKey, type View } from '../timeline/story-view.ts';
import { stripScene, stripAxis, stripReading, STRIP_METRICS, type StripMetric } from '../timeline/strip.ts';
import { STORY } from '../timeline/story-words.ts';
import { chaptersOf, isHistory } from '../histories/meta.ts';
import { fmt } from '../charts/fmt.ts';
import { isThumb } from '../shell/thumb.ts';
import { useUi } from '../ui-store.ts';
import { useCase } from '../case/store.ts';
import { playCase, showInCase } from '../case/doors.ts';
import { I } from '../shell/icons.tsx';
import { Fade } from '../fade.tsx';

/** History goes from where it is drawn: its panel, or the page Settings pushed (a phone). */
const leaveHistory = (): void => { const sh = useShell.getState(); sh.closePanel('history'); if (sh.sheet === 'settings') sh.close(); };

/** the reading the strip shows, kept while the page is open */
export const useStoryMetric = create<{ metric: StripMetric | null }>(() => ({ metric: null }));
const TICK_MS = 500;

/** The story as the page has it now: History's entries and the day record (its future too). Made again when History or the days change, or today's point moved. */
function useView(on: boolean): View {
  const rev = useTimeline((s) => s.rev), hidden = useHidden(), preset = useEngine((s) => s.presetId);
  const [tick, setTick] = useState(0);
  useEffect(() => { if (!on) return; const id = clock.every(() => setTick((n) => n + 1), TICK_MS, 'history-story'); return () => clock.cancel(id); }, [on]);
  void tick;
  const last = record.days[record.days.length - 1];
  const sig = `${rev}|${record.daysVer}|${record.future.length}|${preset}|${last ? `${last.day}:${Math.round((last.v.hvpg ?? 0) * 10)}:${Math.round((last.v.asc ?? 0) * 10)}` : ''}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => viewOf({ tl: timeline, days: record.days, future: record.future, calm: record.calm, hidden, labelsOf: getInterventionLabels(), chapters: chaptersOf(preset) }), [sig, hidden]);
}

const ROWS_TONE = (r: { k: string; up?: boolean; a?: number }): string => (r.a == null || r.k === 'shunt' ? '' : r.up ? 'up' : 'down');
/** The readings before and after a change, or on the day (the moment card's; the case's stop card shows the same). */
export function Nums({ n }: { n: Numbers }) {
  if (!n.rows.length) return null;
  return (
    <div className="hs-nums">
      <span className="hs-nums-w">{n.mode === 'change' ? STORY.before(n.when) : STORY.thatDay}</span>
      <span className="hs-nums-r">
        {n.rows.map((r) => {
          const v = (x: number) => fmt(x, r.unit === '%' ? 0 : 1), u = r.unit === '%' ? '%' : ` ${r.unit}`;
          return (
            <span key={r.k} className={ROWS_TONE(r)}>
              {r.name} {r.a != null && <><span className="hs-a">{v(r.a)}</span>{' → '}</>}<b>{v(r.b)}</b>{u}
            </span>
          );
        })}
      </span>
    </div>
  );
}

/** the entry a moment goes back to (the last of its day that kept the model), and the one it compares with */
const goOf = (es: readonly Entry[], ids: readonly number[]): number => { for (let k = ids.length - 1; k >= 0; k--) if (es[ids[k]!]?.snap) return ids[k]!; return -1; };
const frameOf = (es: readonly Entry[], ids: readonly number[]): Entry | null => { for (let k = ids.length - 1; k >= 0; k--) { const e = es[ids[k]!]; if (e?.frame) return e; } return null; };

function Acts({ m, here }: { m: Moment; here: boolean }) {
  const es = timeline.entries(), go = goOf(es, m.ids), pin = frameOf(es, m.ids);
  if (here) return <div className="hs-acts"><span className="hs-here">{STORY.onFigure}</span>{pin && <Compare e={pin} />}</div>;
  if (go < 0 && !pin) return null;
  return (
    <div className="hs-acts">
      {/* (while a case plays, the figure goes to that moment's stop and the case waits there: case/doors.ts) */}
      {go >= 0 && <button type="button" className="hs-go" onClick={() => { if (isThumb()) leaveHistory(); if (!showInCase(go, m.day)) timeline.goTo(go); }}>{STORY.show}</button>}
      {pin && <Compare e={pin} />}
    </div>
  );
}
function Compare({ e }: { e: Entry }) {
  return <button type="button" className="hs-go plain" onClick={() => { leaveHistory(); pinEntry(e); }}>{HIST.compare}</button>;
}

const Then = ({ t }: { t: Item }) => <li data-tone={t.tone}><b>{t.title}</b>{t.detail ? ` · ${t.detail}` : ''}{t.also.length ? ` · ${t.also.join(' · ')}` : ''}</li>;

/** What a moment says under its title: its detail (or a course's own line, `say`), what else that day, what followed, the smaller changes and the numbers.
 *  History's card and the case's stop card both. */
export function MomentWords({ m, v, say = null }: { m: Extract<Moment, { type: 'start' | 'key' | 'today' }>; v: View; say?: string | null }) {
  const head = m.head, nums = m.type === 'key' ? m.nums : dayReadings(v.series, m.day);
  return (
    <>
      {say ? <p>{say}</p> : head?.detail ? <p>{head.detail}</p> : null}
      {head && head.also.length > 0 && <p className="hs-also">{head.also.join(' · ')}</p>}
      {m.type === 'key' && m.then.length > 0 && <ol className="hs-then">{m.then.map((t) => <Then key={t.i} t={t} />)}</ol>}
      {m.type === 'key' && m.minor > 0 && <p className="hs-minor">{STORY.smaller(m.minor)}</p>}
      <Nums n={nums} />
    </>
  );
}

function MomentCard({ m, v, n, here }: { m: Moment; v: View; n: number; here: boolean }) {
  const common = { 'data-moment': momentKey(m), 'data-day': m.day, 'data-n': n, 'data-future': m.future || undefined, 'data-here': here || undefined };
  if (m.type === 'trimmed') return <div className="hs-mo hs-trim" {...common}><p>{STORY.trimmed}</p></div>;
  if (m.type === 'quiet') {
    const one = m.items.length === 1 ? m.items[0]! : null;
    const words = (t: Item) => (t.times > 1 ? `${t.title} (${STORY.times(t.times)})` : t.title);
    return (
      <div className="hs-mo quiet" {...common}>
        <div className="hs-when">{STORY.days(m.day, m.to)}</div><i className="hs-node" />
        <div className="hs-body">
          <h4>{one ? words(one) : STORY.quiet(m.items.reduce((s, t) => s + t.times, 0))}</h4>
          {!one && <p>{m.items.map(words).join(' · ')}</p>}
          {one?.detail && <p>{one.detail}</p>}
        </div>
      </div>
    );
  }
  const kind = m.type === 'start' ? STORY.start : m.type === 'today' ? STORY.today : m.kind;
  const title = m.type === 'start' ? HIST.patient(m.head.title) : m.type === 'today' ? (m.head?.title ?? STORY.now) : m.head.title;
  const tone = m.type === 'key' ? m.head.tone : 'info';
  return (
    <article className="hs-mo key" data-tone={tone} {...common}>
      <div className="hs-when">{STORY.day(m.day)}</div><i className="hs-node" />
      <div className="hs-body">
        <span className="hs-kick">{kind}</span>
        <h4>{title}</h4>
        <MomentWords m={m} v={v} />
        <Acts m={m} here={here} />
      </div>
    </article>
  );
}

function ChapterBlock({ c, v, first, n0, aheadAt }: { c: Chapter; v: View; first: boolean; n0: number; aheadAt: string | null }) {
  const named = !!c.label;
  return (
    <section className="hs-ch" data-from={c.from}>
      {named && <header className="hs-ch-h"><h3>{c.label}</h3><p>{`${STORY.days(c.from, c.to)} · ${STORY.span(c.from, c.to)}`}</p></header>}
      {c.moments.map((m, k) => {
        const key = momentKey(m);
        return (
          <div key={key} className="hs-slot" data-first={first && k === 0 || undefined}>
            {aheadAt === key && <div className="hs-ahead">{STORY.ahead}</div>}
            <MomentCard m={m} v={v} n={n0 + k} here={key === v.here} />
          </div>
        );
      })}
    </section>
  );
}

/** The strip and its playhead. The playhead's place is a transform written by a clock system while it glides; the strip's frame is made again only when the story or the reading changes. */
function Strip({ v, metric, day, setMetric }: { v: View; metric: StripMetric; day: number; setMetric(m: StripMetric): void }) {
  const head = useRef<HTMLDivElement>(null), word = useRef<HTMLSpanElement>(null);
  const axis = useMemo(() => stripAxis(v.marks.map((k) => k.day), v.full), [v]);
  const pos = useRef<Tweened | null>(null);
  useEffect(() => () => { pos.current?.dispose(); }, []);
  useLayoutEffect(() => {
    const el = head.current;
    if (!el) return;
    const p = (pos.current ??= new Tweened(axis.frac(day), 'history-playhead'));
    const apply = () => { el.style.transform = `translateX(${(p.value * 100).toFixed(3)}%)`; };
    const to = axis.frac(day);
    if (!p.moving && Math.abs(p.value - to) < 1e-4) { apply(); return; }
    const off = clock.on('tween', apply, 5);
    p.to(to, { ms: 260, ease: easeArrive, done: () => { apply(); off(); } });
    return () => { off(); };
  }, [axis, day]);
  const read = stripReading(v.series, metric, day);
  const m = STRIP_METRICS.find((x) => x.id === metric)!;
  return (
    <div className="hs-strip">
      <div className="hs-strip-top">
        <span className="hs-seg" role="group" aria-label={STORY.metric}>
          {v.metrics.map((id) => <button key={id} type="button" aria-pressed={id === metric} onClick={() => setMetric(id)}>{STRIP_METRICS.find((x) => x.id === id)!.name}</button>)}
        </span>
        <button type="button" className="hs-chart" onClick={openChartFromHistory}>{BT.open}</button>
      </div>
      <div className="hs-plot">
        <Chart tag="history-strip" deps={[v, metric]} label={`${m.name} along the course`}
          build={(c) => stripScene({ series: v.series, metric, chapters: v.chapters, marks: v.marks, meds: v.meds, full: v.full, cut: v.cut }, c)} />
        <div className="hs-ph-span" aria-hidden="true"><div ref={head} className="hs-ph"><i /></div></div>
      </div>
      <p className="hs-read"><b ref={word}>{STORY.day(day)}</b>{read ? ` · ${m.name} ${read}` : ''}<span>{STORY.figureAt(v.hereDay, v.atToday)}</span></p>
    </div>
  );
}

/** "Play the case" for a model patient on the page (not while its case is already playing: the case bar holds it then; it eases out and gives its room back). On a phone the sheet
 *  goes once the case starts, so the figure is seen. */
function PlayCase() {
  const preset = useEngine((s) => s.presetId), playing = useCase((s) => s.phase === 'stop' || s.phase === 'travel');
  const id = preset && isHistory(preset) ? preset : null;
  const play = () => { if (id) void playCase(id).then((ok) => { if (ok && isThumb()) leaveHistory(); }); };
  return (
    <Fade as="div" axis="y" className="hs-case" on={!!id && !playing}>
      <span className="hs-case-row"><button type="button" className="btn sm primary" onClick={play}><I n="play" className="mi-ic" />{STORY.play}</button></span>
    </Fade>
  );
}

export function HistoryList() {
  const open = useShell((s) => s.panels.history);
  const v = useView(open);
  const entries = timeline.entries();
  const chosen = useStoryMetric((s) => s.metric);
  const metric: StripMetric | null = chosen && v.metrics.includes(chosen) ? chosen : v.metrics[0] ?? null;
  const [day, setDay] = useState(v.hereDay);
  const list = useRef<HTMLDivElement>(null), story = useRef<HTMLDivElement>(null);
  const user = useRef(false);
  // (held sideways, the whole story scrolls, strip and all: history.css)
  const sideways = useUi((s) => s.device) === 'phone-landscape';
  // On opening (or when the figure moves to another moment): the list starts at the moment the figure is at, the playhead on its day. Once, no glide, after the fonts are in.
  useLayoutEffect(() => {
    if (!open) return;
    user.current = false;
    setDay(v.hereDay);
    let live = true;
    const go = () => {
      if (!live) return;
      const el = list.current?.querySelector<HTMLElement>(`[data-moment="${CSS.escape(v.here)}"]`);
      if (list.current) list.current.style.paddingBottom = '';   // (the room an earlier opening gave the list's foot)
      el?.scrollIntoView({ block: 'start', inline: 'nearest' });
      // (a moment near the end cannot reach the top: the list rests on a moment's top, not part-way through one: history/open-scroll.ts)
      const scroller = sideways ? story.current : list.current;
      if (el && scroller && list.current) restOpenHistory(scroller, list.current, el);
    };
    if (typeof document !== 'undefined' && document.fonts && document.fonts.status !== 'loaded') void document.fonts.ready.then(go); else go();
    return () => { live = false; };
  }, [open, v.here, v.hereDay, sideways]);
  // Scrolling moves the playhead to the topmost moment under the chapter heading (no restore, no layout read: the browser says what crosses the line).
  useEffect(() => {
    const root = sideways ? story.current : list.current;
    if (!root || !open || typeof IntersectionObserver !== 'function') return;
    const seen = new Map<Element, number>();
    const io = new IntersectionObserver((rs) => {
      for (const r of rs) { if (r.isIntersecting) seen.set(r.target, +((r.target as HTMLElement).dataset.n ?? 0)); else seen.delete(r.target); }
      if (!user.current || !seen.size) return;
      let top: Element | null = null, n = Infinity;
      for (const [el, k] of seen) if (k < n) { n = k; top = el; }
      const d = Number((top as HTMLElement | null)?.dataset.day);
      if (Number.isFinite(d)) setDay(d);
    }, { root, rootMargin: '-56px 0px -62% 0px' });
    for (const el of root.querySelectorAll('.hs-mo')) io.observe(el);
    const mine = () => { user.current = true; };
    root.addEventListener('pointerdown', mine, { passive: true }); root.addEventListener('wheel', mine, { passive: true }); root.addEventListener('keydown', mine);
    return () => { io.disconnect(); root.removeEventListener('pointerdown', mine); root.removeEventListener('wheel', mine); root.removeEventListener('keydown', mine); };
  }, [open, v, sideways]);
  if (entries.length <= 1) {
    const chart = <button type="button" className="hist-chart" onClick={openChartFromHistory}>{BT.open}</button>;
    return <><div className="hist-list">{chart}</div><p className="hist-empty"><b>{HIST.nothing}</b>{HIST.nothingHint}</p></>;
  }
  // (a tap on a card moves the playhead to its day; the figure moves only on its button)
  const pick = (e: React.MouseEvent) => {
    const t = e.target as Element, el = t.closest<HTMLElement>('.hs-mo');
    if (el && !t.closest('button')) { user.current = true; setDay(+el.dataset.day!); }
  };
  const aheadAt = (() => { const m = v.chapters.flatMap((c) => c.moments).find((x) => x.future); return m ? momentKey(m) : null; })();
  let n = 0;
  return (
    <div ref={story} className="hs-story">
      <PlayCase />
      {metric && <Strip v={v} metric={metric} day={day} setMetric={(id) => useStoryMetric.setState({ metric: id })} />}
      <div ref={list} className="hs-list" onClick={pick}>
        {v.chapters.map((c, k) => { const b = <ChapterBlock key={`${c.from}:${c.label}`} c={c} v={v} first={k === 0} n0={n} aheadAt={aheadAt} />; n += c.moments.length; return b; })}
      </div>
    </div>
  );
}
