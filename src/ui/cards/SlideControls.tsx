// The live controls of a teaching card, as the 2D presenter's DOM and classes draw them (pz-ab / pz-abb buttons, pz-wi slider, the scale pill): compare buttons that switch the live
// model (treatments, a patient, another slide's state, the vessel lens), the beta-blocker response, a what-if slider, and the Anatomy / Lobule / Sinusoid pill.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { fitChoiceRow, labelPxOf } from './ab-short.ts';
import { useUi } from '../ui-store.ts';
import type { Deck, Slide } from '../../decks/schema.ts';
import { useLapse, lapseText } from '../../decks/hp/lapse.ts';
import { pickCompare, dragWhatIf, whatIfStart, pickScale, dragToolOption, toolOptionStart, strainHold } from '../talk/controls-run.ts';
import { useVariant } from '../talk/variant-words.ts';
import { useStates } from '../../decks/hp/calc.ts';

/** 2D shows no scale pill (Anatomy, Lobule, Sinusoid) in a talk; kept off here the same. */
export const SCALE_PILL = false;
const SCALE_LABEL = { anatomy: 'Anatomy', lobule: 'Lobule', sinusoid: 'Sinusoid' } as const;

export function SlideControls({ slide, deck }: { slide: Slide; deck: Deck }) {
  const c = slide.controls;
  const i = deck.slides.findIndex((s) => s.id === slide.id);
  if (!c || i < 0) return null;
  return (
    <>
      {/* 2D draws no scale pill on any slide (presenter-scales.js `scalesOf = () => []`; Mohammad, 12 Nov: "Remove the pill anyways"): a slide that wants the lobule or the sinusoid dives into it with its own camera */}
      {SCALE_PILL && c.scales && <ScalePill slide={slide} deck={deck} i={i} />}
      {c.compare && <Compare slide={slide} deck={deck} i={i} />}
      {c.whatIf && <WhatIf slide={slide} deck={deck} i={i} />}
      {c.strain && <Strain label={c.strain.label} slideKey={slide.id} />}
    </>
  );
}

/** 2D's one row (ab-short.ts) for ANY row of choices on a teaching card: measured with the full names, then the compact names where it would wrap, then closed up and scaled, then two
 * balanced rows; again whenever
 *  the card's width changes or the fonts arrive. One hook for every row (the compare chips and the scale pill alike), so a row of choices cannot stand unfitted: Mohammad, 25 Nov, "in
  * teaching slides make sure
 *  the buttons are one row if possible; if two rows, never one button alone on row 2". */
function useChoiceRowFit<T extends HTMLElement>(deps: readonly unknown[]) {
  const row = useRef<T>(null);
  const vw = useUi((st) => st.vp.w), vh = useUi((st) => st.vp.h);
  useLayoutEffect(() => {
    const el = row.current, host = el?.parentElement;
    if (!el) return;
    const fit = () => { fitChoiceRow(el, labelPxOf(vw, vh)); };
    fit();
    let live = true;
    if (typeof document !== 'undefined' && document.fonts) void document.fonts.ready.then(() => { if (live) fit(); });
    if (typeof ResizeObserver === 'undefined' || !host) return () => { live = false; };
    let w = host.clientWidth;
    const ro = new ResizeObserver(() => { if (host.clientWidth !== w) { w = host.clientWidth; fit(); } });
    ro.observe(host);
    return () => { live = false; ro.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, vw, vh]);
  return row;
}

function Compare({ slide, deck, i }: { slide: Slide; deck: Deck; i: number }) {
  const { opts, name } = slide.controls!.compare!;
  const own = Math.max(0, opts.findIndex((o) => o.own));
  const [on, setOn] = useState(own);
  // a slide shown again starts with its own words and its own button
  useEffect(() => { setOn(own); useVariant.getState().set(`${deck.id}/${slide.id}`, null); }, [slide.id, own, deck.id]);
  const row = useChoiceRowFit<HTMLDivElement>([slide.id, opts]);
  return (
    <div ref={row} className="pz-ab" role="group" aria-label={name}>
      {opts.map((o, k) => (
        <button key={k} type="button" className="pz-abb" aria-pressed={on === k} {...(o.short ? { 'data-full': o.label, 'data-short': o.short, 'aria-label': o.label, title: o.label } : {})}
          onClick={() => { setOn(k); void pickCompare(deck, i, o); }}>{o.short ? <><span className="ab-f">{o.label}</span><span className="ab-s" aria-hidden="true">{o.short}</span></> : o.label}</button>
      ))}
    </div>
  );
}

function WhatIf({ slide, deck, i }: { slide: Slide; deck: Deck; i: number }) {
  const w = slide.controls!.whatIf!;
  const [v0, setV0] = useState(() => (w.tool ? toolOptionStart(deck, i, w.tool, w.min) : whatIfStart(deck, i, w.paths, w.min)));
  const [v, setV] = useState(v0);
  // the slide's own value comes in when its state is worked out (the first slide opens before the engine has answered)
  // (the slide's computed state is a dependency: a slide opened by a jump, a link or behind a slow second engine takes its own value when the state arrives, never `min` for good; audit W7)
  const state = useStates((s) => s.results[deck.id]?.[i]);
  useEffect(() => { const x = w.tool ? toolOptionStart(deck, i, w.tool, w.min) : whatIfStart(deck, i, w.paths, w.min); setV0(x); setV(x); }, [slide.id, deck, i, w, state]);
  // a slide shown again starts with its own state: the charts read the slide's own until the slider is moved
  useEffect(() => { useVariant.getState().set(`${deck.id}/${slide.id}`, null); }, [slide.id, deck.id]);
  const frac = (x: number) => Math.min(1, Math.max(0, (x - w.min) / (w.max - w.min)));
  const bare = !!w.unit && w.label.toLowerCase().startsWith(w.unit.toLowerCase());
  const shown = w.unit ? `${v.toFixed(w.step >= 1 ? 0 : 1)}${bare ? '' : ` ${w.unit}`}` : '';
  const wrap = { '--p': frac(v), '--s': frac(v0) } as CSSProperties;
  return (
    <div className="pz-wi" role="group" aria-label={`What if: ${w.label}`}>
      <span className="pzi-l"><span className="pzi-k">What if</span>{w.label}</span>
      <div className="pzi-t">
        {w.ends ? <span className="pzi-e">{w.ends[0]}</span> : null}
        <div className="range-wrap" style={wrap}>
          <span className="sl-start" aria-hidden="true" />
          <input type="range" min={w.min} max={w.max} step={w.step} value={v} aria-label={`What if: ${w.label}`}
            onChange={(e) => { const x = +e.target.value; setV(x); if (w.tool) dragToolOption(deck, i, w.tool, x); else dragWhatIf(deck, i, w.paths, x); }} onPointerUp={(e) => e.currentTarget.blur()} />
        </div>
        {w.ends ? <span className="pzi-e">{w.ends[1]}</span> : null}
      </div>
      {w.unit ? <output className="pzi-v">{shown}</output> : null}
    </div>
  );
}

/** A button that works only while it is held (2D strainEl): pressed, the engine's Valsalva starts; let go (a lost pointer, a blur, a hidden page, the slide leaving too), the model recovers. */
function Strain({ label, slideKey }: { label: string; slideKey: string }) {
  const [down, setDown] = useState(false);
  const release = () => { setDown(false); strainHold(false); };
  const press = () => { setDown(true); strainHold(true); };
  useEffect(() => {
    const hidden = () => { if (document.hidden) release(); };
    document.addEventListener('visibilitychange', hidden);
    return () => { document.removeEventListener('visibilitychange', hidden); strainHold(false); };
  }, [slideKey]);
  return (
    <div className="pz-ab pz-strain" role="group" aria-label="Strain on the live model">
      <button type="button" className="pz-abb pz-strain-b" aria-pressed={down} aria-label={`${label}: press and hold, let go to recover`} title="Press and hold"
        onPointerDown={(e) => { if (e.button) return; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* (no capture: the leave and cancel events below let go) */ } press(); }}
        onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} onBlur={release} onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); press(); } }} onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') release(); }}>{label}</button>
    </div>
  );
}

export function ScalePill({ slide, deck, i }: { slide: Slide; deck: Deck; i: number }) {
  const { own, list, cam } = slide.controls!.scales!;
  const [on, setOn] = useState(own);
  useEffect(() => setOn(own), [slide.id, own]);
  const row = useChoiceRowFit<HTMLDivElement>([slide.id, list]);
  return (
    <div ref={row} className="pz-ab" role="group" aria-label="Scale">
      {list.map((sc) => (
        <button key={sc} type="button" className="pz-abb" aria-pressed={on === sc} onClick={() => { setOn(sc); pickScale(deck, i, sc, sc === own ? undefined : cam[sc]); }}>{SCALE_LABEL[sc]}</button>
      ))}
    </div>
  );
}

/** The time-lapse's counter under the words: a bar and "Day 12 of 60" (or "from → to"), as the 2D presenter draws it; a lapse that does not play on the figure reads as done. */
export function LapseRow({ slide, deck }: { slide: Slide; deck: Deck }) {
  const l = slide.lapse!;
  const mine = useLapse((s) => s.key === `${deck.id}/${slide.id}`), d = useLapse((s) => s.d), done = useLapse((s) => s.done);
  const shownD = l.plays ? (mine ? d : 0) : l.days, shownDone = l.plays ? mine && done : true;
  const style = { ['--k' as string]: (shownD / l.days).toFixed(3) } as CSSProperties;
  return (
    <div className={`pz-lapse${shownDone ? ' done' : ''}`} role="status" style={style}>
      <span className="pzl-bar"><i /></span>
      <span className="pzl-t"><span className="pzv-t">{lapseText({ lapse: l }, shownD, l.days, shownDone)}</span></span>
    </div>
  );
}
