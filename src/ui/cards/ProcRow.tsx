// A slide's procedure on its teaching card: ONE row (Mohammad, 22 Nov, mock A "one-row step rail", for every procedure): a round play button, a track with one dot per step and
// the step on show by name, and, where every step has its short line (EUS glue), the current step's line under it, crossfading. It replaced 2D's paragraph of numbered words and the Play button's own row (presenter-lapse.js procEl), which took about 100 px of a 340 px card.
// The fill is the step the animation is on, the ring the step Next or Back has navigated to (his two marks, 13 Nov); both move by transform and glide, the dots change colour
// with an ease, the name fades in, so nothing pops and the row never reflows. One a patient cannot have shows dimmed with why. The procedure is guided by Next
// (ui/deck/procs-link.ts); the button is the same press for a hand on the card. What the row says is ui/cards/proc-rail.ts (tests/proc-rail.test.ts).
import type { CSSProperties } from 'react';
import type { Deck, Slide } from '../../decks/schema.ts';
import { copiedOf } from '../../decks/hp/deck.ts';
import { procPlanOf } from '../deck/procs-plan.ts';
import { useProc } from '../deck/procs-state.ts';
import { playProcedure } from '../deck/procs-link.ts';
import { railOf } from './proc-rail.ts';

const ICON = {
  play: <path d="M8 5.5v13l10.5-6.5z" />,
  replay: <path d="M12 5a7 7 0 1 1-6.6 4.7l1.9.6A5 5 0 1 0 12 7v2.6L8 6.3 12 3z" />,
};

export function ProcRow({ slide, deck }: { slide: Slide; deck: Deck }) {
  const i = deck.slides.findIndex((x) => x.id === slide.id), cs = i < 0 ? null : copiedOf(deck.id)?.slides[i];
  const mine = useProc((s) => s.key === `${deck.id}/${slide.id}`), st = useProc();
  if (!cs || !procPlanOf(cs) || !mine) return null;
  const r = railOf(st), n = st.steps.length;
  const track = { ['--n' as string]: String(Math.max(1, n - 1)) } as CSSProperties;
  return (
    <div className="pz-prail-box" role="group" aria-label={`${st.name}, step by step: Next plays each step`} {...(r.why ? { 'data-why': r.why, title: r.why } : {})}>
    <div className="pz-prail">
      <button type="button" className="pz-prail-go" disabled={r.disabled} aria-label={r.action} title={r.why || r.action} onClick={() => playProcedure()}>
        <svg viewBox="0 0 24 24" aria-hidden="true">{ICON[r.icon]}</svg>
      </button>
      <span className="pz-prail-track" style={track} role="list" aria-hidden={n < 2 ? true : undefined}>
        <i className="pz-prail-line" />
        <i className="pz-prail-fill" style={{ transform: `scaleX(${r.fill.toFixed(4)})` }} />
        {st.steps.map((s, k) => (
          <i key={k} className={`pz-prail-dot ${r.dots[k]}`} role="listitem" style={{ ['--k' as string]: String(k) } as CSSProperties}
            aria-label={`Step ${k + 1}: ${s[1]}`} title={s[1]} {...(r.ringOn && k === Math.round(r.ring * Math.max(1, n - 1)) ? { 'aria-current': 'step' as const } : {})} />
        ))}
        <span className={`pz-prail-at${r.ringOn ? ' on' : ''}`} style={{ transform: `translateX(${(r.ring * 100).toFixed(3)}%)` }} aria-hidden="true"><i /></span>
      </span>
      <span className="pz-prail-t" aria-live="polite">
        <span key={`${r.count}|${r.name}`} className="pz-prail-tx" style={{ ['--ch' as string]: String(Math.max(1, r.chars)) } as CSSProperties}>
          {r.count ? <span className="pz-prail-n">{r.count}</span> : null}
          <b>{r.name}</b>
          {r.sub ? <span className="pz-prail-sub"> · {r.sub}</span> : null}
        </span>
      </span>
    </div>
    {r.lines ? (
      <p className="pz-prail-cap" aria-live="polite">
        {r.lines.map((l, k) => <span key={k} className={k === r.line ? 'on' : undefined} aria-hidden={k === r.line ? undefined : true}>{l}</span>)}
      </p>
    ) : null}
    </div>
  );
}
