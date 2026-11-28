import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { readMetric, readStyle } from '../../layout-snap.ts';
import { clock } from '../../../clock/frame.ts';
import { Chart, type ChartCtx } from '../Chart.tsx';
import { pendingFrame } from '../pending.ts';
import type { ChartPainter } from '../painter.ts';
import type { Frame } from '../scene.ts';
import { profileFrame, type CellOpts } from './frame.ts';
import { ProfileMotion } from './glide.ts';
import { tableH } from '../../layout/chart-box.ts';
import { planProfile, profileWords, spansFor, layoutHeight, heldToRoom, fitType, type Fp, type ProfilePlan } from './model.ts';
import { useUi } from '../../ui-store.ts';
import { layoutOf, isSideways } from '../../layout/rules2d.ts';
import { pzhOf } from '../../layout/plan.ts';
import { profileInputs } from './data.ts';
import '../charts.css';

export interface ProfileCardProps {
  /** the state the slide shows (its fingerprint: the readings and `at.P`). The numbers glide to each new state. */
  fp: Fp | null | undefined;
  /** the healthy patient's fingerprint: the dashed line under the profile and the reference for the red blocks */
  healthy?: Fp | null;
  /** the state before this one (the slide's `from`, resolved with data.ts beforeOf): a faint dotted line */
  before?: Fp | null;
  /** its name on the line: 'Before', or a few words ('No Rx', 'Day 0'; the slide's fromLabel) */
  fromLabel?: string;
  /** the brackets the slide asks for (its tool.spans: any of 'hvpg', 'eus', 'ppg'; [] for none); absent: HVPG and PPG */
  spans?: readonly string[];
  /** a question slide's hold: no red blocks and no brackets, the line and its numbers as they are */
  hold?: boolean;
  /** the slide's catheter cannot enter a hepatic vein (Budd-Chiari): no HVPG or EUS-PPG bracket is drawn, they cannot be measured */
  blocked?: boolean;
  /** the chart's height, px; absent: the stacked card's (74 % of the width up to 270, less 1.6 em), never under what the layout needs */
  height?: number;
  /** the ladder's cell variant (the instrument in a wide screen's grid cell) */
  cell?: CellOpts;
  /** the room the data card leaves the chart, px (2D --pz-room; 0 or absent: none measured, or a stacked card): the chart is never taller than it */
  room?: number;
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The pressure from gut to heart through the circuit's eight stations, the healthy line dashed beneath it, the liver's stations on a tint, the HVPG and PPG (and the EUS-PPG) as brackets. */
export function ProfileCard({ fp, healthy = null, before = null, fromLabel = 'Before', spans: want, hold = false, blocked = false, height, cell, room }: ProfileCardProps) {
  const vpNow = useUi((st) => st.vp);   // (the ladder's height is the window's: a new height redraws it)
  const inp = useMemo(() => profileInputs(fp, healthy, before), [fp, healthy, before]);
  const spans = useMemo(() => spansFor(want, fp, blocked), [want?.join(), fp, blocked]);  // eslint-disable-line react-hooks/exhaustive-deps
  const motion = useRef<ProfileMotion | null>(null);
  if (!motion.current) motion.current = new ProfileMotion();
  const painter = useRef<ChartPainter | null>(null), ctx = useRef<ChartCtx | null>(null), plan = useRef<ProfilePlan | null>(null), planKey = useRef('');
  const loop = useRef<{ off(): void; hold: { release(): void } } | null>(null);
  const cellKey = cell ? `${cell.chCap ?? ''}|${cell.lad ?? ''}` : '';
  // The card's title is dropped (`.pz-dh.off`, TilesCard): the chart is as much taller as the title and its gap stood, so the card keeps its height (24 Nov).
  const root = useRef<HTMLDivElement>(null);
  const [freed, setFreed] = useState(0);
  useLayoutEffect(() => {
    const head = cell ? null : root.current?.closest('.pz-data')?.querySelector<HTMLElement>('.pz-dh.off');
    const n = head?.parentElement ? Math.round(readMetric(head, 'offsetHeight') + (parseFloat(readStyle(head.parentElement).rowGap) || 0)) : 0;
    setFreed((was) => (was === n ? was : n));
  });

  const wantRef = useRef<number | undefined>(undefined);   // (the height the chart wants when its room holds it shorter: every frame of its motion carries it)
  const draw = (now: number) => {
    const v = motion.current!.view(now);
    if (v && plan.current && ctx.current) painter.current?.show({ ...profileFrame(plan.current, v, ctx.current, { cell }), want: wantRef.current }, false);
  };
  const stop = () => { loop.current?.off(); loop.current?.hold.release(); loop.current = null; };
  const kick = () => {
    if (loop.current) return;
    const m = motion.current!, h = clock.hold('chart:profile');
    const off = clock.on('tween', (fi) => {
      const busy = m.tick(fi.time);
      draw(fi.time);
      if (!busy) stop();
    });
    loop.current = { off, hold: h };
  };

  const build = (c: ChartCtx): Frame => {
    ctx.current = c;
    const f0 = Math.max(12, cell ? (cell.chCap ?? c.type.sm) * (cell.lad ?? 1) : c.type.sm);
    // (the box this layout gives the ladder, as 2D's CSS does; a cell of the six ladders has its own, and an explicit height wins)
    // (`base` is what the chart WANTS: the screen's table height (layout/card-size.ts; a phone on its side keeps 2D's own); `own` what its card's room gives it: held down to the room, never grown into what the words leave over)
    const vp = useUi.getState().vp, lay = layoutOf(vp.w, vp.h), side = isSideways(vp.w, vp.h);
    const base0 = height ?? (cell ? undefined : tableH() ?? layoutHeight(c.w, f0, lay, side, pzhOf(vp))), base = base0 == null || height != null ? base0 : base0 + freed;
    const f = cell ? f0 : fitType(c.w, base, f0);   // (a wide card's chart sets its words larger, up to 18 px)
    const own = height ?? (cell ? undefined : heldToRoom(base, room, f));
    // (readings not worked out yet: the empty box at the height the drawn chart takes, so the card is measured and locked at its full height, pendingFrame)
    if (!inp) { plan.current = null; planKey.current = ''; return pendingFrame(`profile|${cellKey}`, c.w, own ?? base ?? 0, ''); }
    const m = motion.current!, now = clock.now();
    m.reduce = reduced();
    const key = [c.w, f, own ?? '', cellKey, spans.map(([k]) => k).join(), fromLabel, inp.goal.v.join(), inp.goal.hvpg, inp.goal.ppg, inp.goal.eus, inp.goal.top, inp.hl?.v.join() ?? '', inp.bf?.v.join() ?? ''].join('|');
    if (key !== planKey.current) {
      planKey.current = key;
      plan.current = planProfile(c.w, own ?? 0, f, inp.goal, inp.hl, inp.bf, spans, fromLabel);
      m.aim(inp.goal, plan.current, now, { held: hold });
      // a new look or width is drawn at once; a new state of the same box eases (the shown numbers follow the goal)
      m.tick(now);
      kick();
    }
    const v = m.view(now)!;
    const frame = profileFrame(plan.current!, v, c, { cell });
    wantRef.current = base != null && own != null && base > own ? base : undefined;
    return { ...frame, want: wantRef.current };
  };

  useEffect(() => {
    const m = motion.current!, now = clock.now();
    m.setHold(hold, now);
    if (plan.current) { draw(now); kick(); }
  }, [hold]);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => stop, []);  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="pz-prof" ref={root}>
      <Chart tag="chart:profile" glide={false} painter={painter} deps={[inp, spans, fromLabel, hold, height, room, cellKey, freed, vpNow.w, vpNow.h]} memo={`profile|${cellKey}`} label={inp ? profileWords(inp.goal, spans) : 'Pressure profile'} build={build} />
    </div>
  );
}
