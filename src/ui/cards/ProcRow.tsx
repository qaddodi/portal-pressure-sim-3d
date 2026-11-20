// A slide's procedure on its teaching card (2D presenter-lapse.js procEl): the steps as a line of words, each after its number in the step circle, the one on show lit and the ones
// played at full ink, and the ring on the one Next or Back has navigated to (2D: the ring is the target, the fill follows the catheter); one a patient cannot have shows dimmed with why. The procedure is guided by Next
// (ui/deck/procs-link.ts: the first Next puts the catheter in, each Next after it plays one step, Back takes one back, and the Next after the last moves on); the button is the same press for a hand on the card.
import type { Deck, Slide } from '../../decks/schema.ts';
import { copiedOf } from '../../decks/hp/deck.ts';
import { procPlanOf } from '../deck/procs-plan.ts';
import { useProc } from '../deck/procs-state.ts';
import { playProcedure } from '../deck/procs-link.ts';

export function ProcRow({ slide, deck }: { slide: Slide; deck: Deck }) {
  const i = deck.slides.findIndex((x) => x.id === slide.id), cs = i < 0 ? null : copiedOf(deck.id)?.slides[i];
  const mine = useProc((s) => s.key === `${deck.id}/${slide.id}`), st = useProc();
  if (!cs || !procPlanOf(cs) || !mine) return null;
  const { steps, at, ring, why, phase, name } = st, mark = ring >= 0 ? ring : at, list = steps.length > 0 && steps.every((x) => x[8]);
  return (
    <>
      <p className={`pz-procs${list ? ' pz-procs-list' : ''}`} role="list" aria-label={`${name}, step by step: Next plays each step`} {...(why ? { 'data-why': why, title: why } : {})}>
        {steps.map((s, k) => (
          <span key={k}>
            {k ? ' ' : null}
            <span className={`pz-proc${k === at ? ' on' : ''}${k < at || (phase === 'done' && k === at) ? ' done' : ''}${k === mark ? ' at' : ''}`} role="listitem" aria-label={`Step ${k + 1}: ${s[1]}`} title={why || s[2]} {...(k === mark ? { 'aria-current': 'step' as const } : {})}>
              <span className="pz-step" aria-hidden="true">{k + 1}</span>{' '}{s[1]}
              {list ? <span className="pz-proc-line"> {s[8]}</span> : null}
            </span>
          </span>
        ))}
      </p>
      <div className="pz-ab" role="group" aria-label={name}>
        <button type="button" className="pz-abb" disabled={!!why || (phase === 'play' && mark >= steps.length - 1)} title={why || 'Next plays one step at a time'} onClick={() => playProcedure()}>{phase === 'done' ? `Replay ${name}` : phase === 'play' ? 'Next step' : `Play ${name}`}</button>
      </div>
    </>
  );
}
