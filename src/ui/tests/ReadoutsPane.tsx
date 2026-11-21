// Tests > Readouts (2D readouts-pane.js): every readout the old bottom bar carried, live, in the 2D app's own tile (tile-el.js: `.metric` with its name, number, unit, trend, scale bar with
// cut-off ticks and status line), so the lifted stylesheet (app-01-chrome.css .metric, tests-card.css "Readouts") styles it: plain figures in four groups, hairlines between, the bars
// and boxes of the older look gone. A tap says what drives it (Why?); an HVPG not yet measured opens the procedure that measures it; Ascites opens its own pane. While a moment is pinned each
// tile says its change from then in place of its word. Under the groups, "Have a patient's numbers? Work backward from readings" opens the From readings flow (readings/FromReadings.tsx).
//
// What a tile shows between the model's frames is readouts/live.ts (2D's update(): the 1.2 s running mean, the shown state's glide, the roll of a number that is not carried by the glide, the
// band that changes once its number has landed, the trend arrow, the flash on a worse band). Here each tile only draws its `Out`: the number's text (or the roll of its changed digits, a transform
// the compositor eases), the word and band under a fade, the bar's length (written straight to the bar: translate and scale). Nothing is written in a frame by React.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { tileStatics, vitalStatics, SYSTEMIC_CAP, type Static } from './readouts-model.ts';
import { useTests } from './store.ts';
import { openWhy } from '../why/store.ts';
import { bindReadouts, liveReadouts } from './readouts/runtime.ts';
import { openFromReadings, warmFromReadings } from '../readings/FromReadings.tsx';
import type { Out } from './readouts/live.ts';
import { D_FLIP, D_SMALL, EASE_ARRIVE, EASE_IN } from './copied/motion.copied.js';

import { clock } from '../../clock/frame.ts';
const STATICS = tileStatics(), VITALS = vitalStatics();

/** The number: its text, or, while a roll runs, each changed digit in its own column (the lifted `.odo` rule), then the plain number again. A number that appears where "?" was fades in. */
function Num({ out, cls, nref }: { out: Out; cls?: string; nref?: RefObject<HTMLSpanElement | null> }) {
  const own = useRef<HTMLSpanElement>(null), ref = nref ?? own;
  const [done, setDone] = useState(0);
  const roll = out.roll && out.roll.n !== done ? out.roll : null;
  useEffect(() => {
    const r = out.roll; if (!r) return;
    const t = clock.after(() => setDone(r.n), r.ms + 40);
    return () => clock.cancel(t);
  }, [out.roll]);
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) { first.current = false; return; }
    const el = ref.current;
    if (el?.animate) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: D_SMALL, easing: EASE_ARRIVE });
  }, [out.fade]);
  return (
    <span ref={ref as RefObject<HTMLSpanElement>} className={`val${cls ? ` ${cls}` : ''}${out.stale ? ' recompute' : ''}`}>
      {roll ? roll.plan.map((p, i) => ('t' in p
        ? <span key={`${roll.n}.${i}`}>{p.t}</span>
        : <span key={`${roll.n}.${i}`} className={p.up ? 'odo' : 'odo down'} data-s={p.s.join('\n')} style={{ '--odo-n': p.n, '--odo-ms': `${roll.ms}ms` } as React.CSSProperties}>{p.end}</span>))
        : out.text}
    </span>
  );
}

/** A value that changes under a fade (swapFade): the old fades out (exit curve), the new is put in, and it fades in; `instant` puts it in at once. */
function useSwapped<T>(target: T, ref: RefObject<HTMLElement | null>, instant: boolean): T {
  const [shown, setShown] = useState(target);
  const latest = useRef(target); latest.current = target;
  const pend = useRef(false);
  useLayoutEffect(() => {
    if (Object.is(shown, target) || pend.current) return;
    const el = ref.current;
    if (instant || !el || !el.animate || !el.isConnected) { setShown(target); return; }
    pend.current = true;
    const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: D_FLIP, easing: EASE_IN, fill: 'forwards' });
    const done = () => { pend.current = false; setShown(latest.current); a.cancel(); el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: D_SMALL, easing: EASE_ARRIVE }); };
    void a.finished.then(done, done);
  }, [target, shown, instant, ref]);
  return shown;
}

/** One tile, in the 2D markup. */
function Tile({ s }: { s: Static }) {
  const live = liveReadouts();
  const out = useSyncExternalStore((cb) => live.subscribe(s.id, cb), () => live.get(s.id));
  const show = useTests((x) => x.show);
  const valRef = useRef<HTMLSpanElement>(null), statusRef = useRef<HTMLSpanElement>(null), trRef = useRef<HTMLSpanElement>(null);
  const sev = useSwapped(out.sev, valRef, !out.bandFade);
  const ws = useSwapped(`${out.unmeas ? '1' : ''}${out.word}`, statusRef, false);
  const arrow = useSwapped(out.trend, trRef, false);
  const fillRef = useCallback((el: HTMLElement | null) => live.bindFill(s.id, el), [live, s.id]);
  const interactive = !!(s.why || s.pane);
  const go = () => {
    if (s.pane) { show(s.pane as never); return; }
    if (s.id === 'hvpg' && out.hiddenVal) { show('hvpg'); return; }   // (an HVPG not yet measured opens the procedure that measures it)
    if (s.why) void openWhy(s.why);
  };
  const title = `${s.title}${s.pane ? '\nClick to open the Ascites view.' : s.why ? '\nClick for what is driving it.' : ''}`;
  return (
    <button type="button" className={`metric${s.vital ? ' rp-vital' : ''}${out.flash ? ` ${out.flash}` : ''}${out.hiddenVal ? ' hidden-val' : ''}`} data-id={s.id} data-sev={sev} aria-label={out.aria || undefined} title={title}
      style={interactive ? undefined : { cursor: 'default' }} onClick={interactive ? go : undefined}>
      <span className="k">{s.vital ? <><span className="k-l">{s.name}</span><span className="k-s">{s.short}</span></> : s.name}</span>
      <span className="v">
        {s.bp ? <><span className="val v-bp">{out.pre}</span><span className="v-map"><span className="val v-bp">{out.pre ? '(' : ''}</span><Num out={out} nref={valRef} /><span className="val v-bp">{out.pre ? ')' : ''}</span></span></>
          : <Num out={out} nref={valRef} />}
        <span className={s.u === '%' ? 'unit pct' : 'unit'}>{s.u}{s.ux ? <span className="u-x">{s.ux}</span> : null}</span>
        {!s.vital && <span className="tr" aria-hidden="true" ref={trRef}>{arrow === 'up' ? '▲' : arrow === 'down' ? '▼' : ''}</span>}
      </span>
      <span className="rb" aria-hidden="true">
        <i className="rb-fill" ref={fillRef} />
        {s.ticks.map((t, i) => <i key={i} className="rb-tick" style={{ left: `${t * 100}%` }} />)}
      </span>
      <span className="s">
        {out.cmp ? <span className={`cmp ${out.cmp.dir}`}>{out.cmp.text}</span> : <span ref={statusRef} className={`status${ws.startsWith('1') ? ' unmeas' : ''}`}>{ws.replace(/^1/, '')}</span>}
      </span>
    </button>
  );
}

export function ReadoutsPane(_: { narrow?: boolean }) {
  // (the tiles are fed while the pane is on screen: every model frame, and again when the pinned moment, the hidden set or the patient changes)
  useLayoutEffect(() => bindReadouts(), []);
  useEffect(() => { void warmFromReadings().catch(() => undefined); }, []);
  return (
    <div className="rp-body" data-pane="readouts" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      {STATICS.map((g) => (
        <section key={g.group} className="rp-group" data-group={g.group} aria-label={g.label}>
          <h3 className="rp-cap">{g.label}</h3>
          <div className="rp-tiles">{g.tiles.map((t) => <Tile key={t.id} s={t} />)}</div>
        </section>
      ))}
      <section className="rp-group" data-group="systemic" aria-label={SYSTEMIC_CAP}>
        <h3 className="rp-cap">{SYSTEMIC_CAP}</h3>
        <div className="rp-tiles">{VITALS.map((t) => <Tile key={t.id} s={t} />)}</div>
      </section>
      {/* (A second door to From readings, where readings live: the patient menu's top row is the first. Review U13.) */}
      <section className="rp-group rp-fr" aria-label="From readings">
        <h3 className="rp-cap">Have a patient’s numbers?</h3>
        <button type="button" className="btn sm rp-fr-btn" onClick={() => openFromReadings()}><i className="ic ic-rewind rp-fr-ic" aria-hidden="true" /><span>Work backward from readings</span></button>
      </section>
    </div>
  );
}
