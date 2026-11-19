// The live controls of a teaching card, as the 2D presenter's DOM and classes draw them (pz-ab / pz-abb buttons, pz-wi slider, the scale pill): compare buttons that switch the live
// model (treatments, a patient, another slide's state, the vessel lens), the beta-blocker response, a what-if slider, and the Anatomy / Lobule / Sinusoid pill.
import { useEffect, useState, type CSSProperties } from 'react';
import type { Deck, Slide } from '../../decks/schema.ts';
import { useLapse, lapseText } from '../../decks/hp/lapse.ts';
import { pickCompare, dragWhatIf, whatIfStart, pickScale, dragToolOption, toolOptionStart } from '../talk/controls-run.ts';

const SCALE_LABEL = { anatomy: 'Anatomy', lobule: 'Lobule', sinusoid: 'Sinusoid' } as const;

export function SlideControls({ slide, deck }: { slide: Slide; deck: Deck }) {
  const c = slide.controls;
  const i = deck.slides.findIndex((s) => s.id === slide.id);
  if (!c || i < 0) return null;
  return (
    <>
      {c.scales && <ScalePill slide={slide} deck={deck} i={i} />}
      {c.compare && <Compare slide={slide} deck={deck} i={i} />}
      {c.whatIf && <WhatIf slide={slide} deck={deck} i={i} />}
    </>
  );
}

function Compare({ slide, deck, i }: { slide: Slide; deck: Deck; i: number }) {
  const { opts, name } = slide.controls!.compare!;
  const own = Math.max(0, opts.findIndex((o) => o.own));
  const [on, setOn] = useState(own);
  useEffect(() => setOn(own), [slide.id, own]);
  return (
    <div className="pz-ab" role="group" aria-label={name}>
      {opts.map((o, k) => (
        <button key={k} type="button" className="pz-abb" aria-pressed={on === k} {...(o.short ? { 'data-full': o.label, 'data-short': o.short, 'aria-label': o.label, title: o.label } : {})}
          onClick={() => { setOn(k); void pickCompare(deck, i, o); }}>{o.label}</button>
      ))}
    </div>
  );
}

function WhatIf({ slide, deck, i }: { slide: Slide; deck: Deck; i: number }) {
  const w = slide.controls!.whatIf!;
  const [v0, setV0] = useState(() => (w.tool ? toolOptionStart(deck, i, w.tool, w.min) : whatIfStart(deck, i, w.paths, w.min)));
  const [v, setV] = useState(v0);
  // the slide's own value comes in when its state is worked out (the first slide opens before the engine has answered)
  useEffect(() => { const x = w.tool ? toolOptionStart(deck, i, w.tool, w.min) : whatIfStart(deck, i, w.paths, w.min); setV0(x); setV(x); }, [slide.id, deck, i, w]);
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
            onChange={(e) => { const x = +e.target.value; setV(x); if (w.tool) dragToolOption(deck, i, w.tool, x); else dragWhatIf(w.paths, x); }} onPointerUp={(e) => e.currentTarget.blur()} />
        </div>
        {w.ends ? <span className="pzi-e">{w.ends[1]}</span> : null}
      </div>
      {w.unit ? <output className="pzi-v">{shown}</output> : null}
    </div>
  );
}

function ScalePill({ slide, deck, i }: { slide: Slide; deck: Deck; i: number }) {
  const { own, list, cam } = slide.controls!.scales!;
  const [on, setOn] = useState(own);
  useEffect(() => setOn(own), [slide.id, own]);
  return (
    <div className="pz-ab pz-scales" role="group" aria-label="Scale">
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
