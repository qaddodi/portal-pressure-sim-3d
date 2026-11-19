// A slide's procedure on its teaching card (2D presenter-lapse.js procEl): the steps as a line of words, each after its number in the step circle, the one on show lit and the ones
// played at full ink; one a patient cannot have shows dimmed with why. The Play button plays the procedure on the figure (ui/deck/procs-link.ts); it plays by itself as the slide lands.
import type { Deck, Slide } from '../../decks/schema.ts';
import { copiedOf } from '../../decks/hp/deck.ts';
import { procPlanOf } from '../deck/procs-plan.ts';
import { useProc } from '../deck/procs-state.ts';
import { playProcedure } from '../deck/procs-link.ts';

export function ProcRow({ slide, deck }: { slide: Slide; deck: Deck }) {
  const i = deck.slides.findIndex((x) => x.id === slide.id), cs = i < 0 ? null : copiedOf(deck.id)?.slides[i];
  const mine = useProc((s) => s.key === `${deck.id}/${slide.id}`), st = useProc();
  if (!cs || !procPlanOf(cs) || !mine) return null;
  const { steps, at, why, phase, name } = st, list = steps.length > 0 && steps.every((x) => x[8]);
  return (
    <>
      <p className={`pz-procs${list ? ' pz-procs-list' : ''}`} role="list" aria-label={`${name}, step by step`} {...(why ? { 'data-why': why, title: why } : {})}>
        {steps.map((s, k) => (
          <span key={k}>
            {k ? ' ' : null}
            <span className={`pz-proc${k === at ? ' on' : ''}${k < at || (phase === 'done' && k === at) ? ' done' : ''}${k === at ? ' at' : ''}`} role="listitem" aria-label={`Step ${k + 1}: ${s[1]}`} title={why || s[2]} {...(k === at ? { 'aria-current': 'step' as const } : {})}>
              <span className="pz-step" aria-hidden="true">{k + 1}</span>{' '}{s[1]}
              {list ? <span className="pz-proc-line"> {s[8]}</span> : null}
            </span>
          </span>
        ))}
      </p>
      <div className="pz-ab" role="group" aria-label={name}>
        <button type="button" className="pz-abb" disabled={!!why || phase === 'play'} title={why || undefined} onClick={() => playProcedure()}>{phase === 'done' ? 'Replay' : 'Play'} {name}</button>
      </div>
    </>
  );
}
