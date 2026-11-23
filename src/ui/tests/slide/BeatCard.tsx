// The beat-by-beat card of a slide (2D tool { kind: 'trace', range: 'beats', ekg?, hvpgLane?, deltaLabel? }, pressure-time.js on a slide): the header (HVPG, its word) over the EKG-paper card (beat-frame.ts),
// drawn on the shared chart GL from the kept record (feed.ts). The numbers are the slide's own settled state (its pinned fingerprint `fp`), so they match its tiles to the digit; `before` is the
// state the slide's event started from (its delta), drawn as two dotted lines and the old gap. The record keeps recording as the slide stays, the strip sweeping on while the model's own clock stands still.
import { useEffect, useMemo, useRef } from 'react';
import { clock } from '../../../clock/frame.ts';
import { latest, onFrame, useEngine } from '../../../engine/index.ts';
import { Chart, type ChartCtx } from '../../charts/Chart.tsx';
import type { ChartPainter } from '../../charts/painter.ts';
import { feed, record, startFeed } from '../feed.ts';
import { metricsOf } from '../frame.ts';
import { hvpgWordOf, sevTok } from '../trace/model.ts';
import { fmt } from '../../charts/fmt.ts';
import { hiddenNow } from '../hidden.ts';
import { OverTimePane } from '../trace/OverTimePane.tsx';
import { beatFrame, beatReadings, BEAT_CARD_S, type BeatReadings } from './beat-frame.ts';

type Fp = Record<string, unknown> | null;
const NOT_SHOWN = '—';

export interface BeatCardProps {
  /** the slide's settled state (its fingerprint): the numbers on the card */
  fp: Fp;
  /** the state before the slide's event (the slide's delta), or null */
  before?: Fp;
  /** the old gap's name (tool.deltaLabel, default "before") */
  deltaLabel?: string;
  /** tool.ekg === false leaves the strip off */
  ekg?: boolean;
  /** the plot's height (px) */
  h?: number;
}

export function BeatCard({ fp, before = null, deltaLabel, ekg = true, h = 250 }: BeatCardProps) {
  useEffect(() => { startFeed(); }, []);
  const hid = hiddenNow();
  const painter = useRef<ChartPainter | null>(null), ctx = useRef<ChartCtx | null>(null);
  const wall = useRef(0), dirty = useRef(true);
  const inp = useRef({ fp, before, deltaLabel, ekg });
  inp.current = { fp, before, deltaLabel, ekg };
  const hold = useRef<{ release(): void } | null>(null);

  const frame = (c: ChartCtx) => {
    const f = latest.frame, s = inp.current, live = beatReadings(metricsOf(f));
    const pin = s.fp ? beatReadings(s.fp) : null;
    // (A slide's numbers are its settled state's; a number it does not give is the live one's.)
    const now: BeatReadings = pin ? { whvp: Number.isFinite(pin.whvp) ? pin.whvp : live.whvp, fhvp: Number.isFinite(pin.fhvp) ? pin.fhvp : live.fhvp, pv: Number.isFinite(pin.pv) ? pin.pv : live.pv, hr: Number.isFinite(pin.hr) ? pin.hr : live.hr, hvpg: Number.isFinite(pin.hvpg) ? pin.hvpg : live.hvpg } : live;
    const head = feed.headNow(f, wall.current, clock.now());   // (the trace's own clock, forward only: never the model's, which runs backwards while a slide eases in)
    const noPv = !!hid?.has('pv');
    return beatFrame({ rec: record as never, head, now, before: s.before ? { r: beatReadings(s.before), label: s.deltaLabel || 'before' } : null, ekg: s.ekg, noPv, headed: true }, { w: Math.round(c.w), h, pal: c.pal }).frame;
  };
  const draw = () => { const c = ctx.current, p = painter.current; if (c && p) p.show(frame(c), false); };
  const sync = () => {
    const run = !!latest.frame?.running;
    if (run && !hold.current) hold.current = clock.hold('beat-card', { steady: true }); else if (!run && hold.current) { hold.current.release(); hold.current = null; }
  };
  useEffect(() => {
    if (!feed.n || feed.last - feed.t[0]! < BEAT_CARD_S + 1) void feed.backfill(BEAT_CARD_S + 2).then(() => { dirty.current = true; clock.invalidate('beat-card'); });
    const want = feed.want('beat-card', BEAT_CARD_S + 2, () => { dirty.current = true; clock.invalidate('beat-card'); });
    const off = onFrame(() => { wall.current = clock.now(); dirty.current = true; sync(); clock.invalidate('beat-card'); });
    const tick = clock.on('tween', () => { if (dirty.current || hold.current) { dirty.current = false; draw(); } });
    wall.current = clock.now(); sync();
    return () => { off(); tick(); want(); hold.current?.release(); hold.current = null; };
  }, [h]);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { dirty.current = true; clock.invalidate('beat-card'); }, [fp, before, deltaLabel, ekg, h]);

  // the header, as strings: a re-render only when a word changes
  const pinned = useMemo(() => (fp ? beatReadings(fp) : null), [fp]);
  const hero = useEngine((s) => { void s.frames; const m = metricsOf(latest.frame), v = pinned && Number.isFinite(pinned.hvpg) ? pinned.hvpg : (m?.hvpg as number); return Number.isFinite(v) ? `${fmt(Math.max(0, v), 1)}|${hvpgWordOf(Math.max(0, v))}|${sevTok(Math.max(0, v))}` : `${NOT_SHOWN}||none`; });
  const [num, word, sev] = hero.split('|');
  if (hid?.has('trueHVPG')) return <OverTimePane plot={h} />;
  return (
    <div className="pt" data-slide="beats">
      <div className="pt-head">
        <div className="pt-hero">
          <span className="pt-k">HVPG</span>
          <span className="pt-v"><b className="pt-num">{num}</b><small>mmHg</small></span>
          <span className="pt-st"><span className="pt-sev" data-sev={sev}>{word}</span></span>
        </div>
      </div>
      <div className="pt-box" style={{ height: h }}>
        <Chart tag="beat-card" painter={painter} deps={[h, fp, before, deltaLabel, ekg]} label="Pressure beat by beat" build={(c) => { ctx.current = c; return frame(c); }} />
      </div>
    </div>
  );
}
