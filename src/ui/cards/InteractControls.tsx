// The room's part of a slide that asks (decks/interact.ts), under the words of the slide's first card: tap to show the answer, pick one of the options, or slide to a guess and lock it in.
// Before and after the commit are drawn in the SAME place (stacked in one grid cell, the idle one hidden), so the card never changes size when the room commits (the rule for every card).
import { useEffect, useState } from 'react';
import type { Slide, Deck } from '../../decks/schema.ts';
import { wasRight } from '../../decks/interact.ts';
import { useInteract } from '../deck/interact-state.ts';
import { useUi } from '../ui-store.ts';

const num = (v: number, unit?: string): string => `${Math.round(v * 10) / 10}${unit ? ` ${unit}` : ''}`;

export function InteractControls({ slide, deck }: { slide: Slide; deck: Deck }) {
  const it = slide.interact!, key = `${deck.id}/${slide.id}`;
  const st = useInteract(), go = useUi((s) => s.go);
  useEffect(() => { useInteract.getState().open(key); }, [key]);
  const mine = st.key === key, done = mine && st.committed, answer = mine ? st.answer : null;
  const c = it.commit;
  const [guess, setGuess] = useState(c.kind === 'predict' ? (c.min + c.max) / 2 : 0);
  useEffect(() => { if (c.kind === 'predict') setGuess((c.min + c.max) / 2); }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  const right = done && wasRight(c, c.kind === 'predict' ? answer : answer);
  const commit = (a: number | null) => useInteract.getState().commit(key, a);
  const backAt = it.back ? deck.slides.findIndex((x) => x.id === it.back) : -1;
  const chosen = c.kind === 'choose' && answer != null ? c.options[answer] : null;
  const say = c.kind === 'choose' ? (chosen ? `${right ? 'Right. ' : 'Not quite. '}${chosen.why}` : '')
    : c.kind === 'predict' && answer != null ? `You said ${num(answer, c.unit)}. Press Next to see what the model gives.` : '';
  return (
    <div className="pz-int" role="group" aria-label="Your turn" data-kind={c.kind} data-done={done ? '' : undefined}>
      <div className="pz-int-stack">
        <div className="pz-int-ask" aria-hidden={done ? true : undefined} inert={done || undefined}>
          {c.kind === 'think' ? <button type="button" className="pz-int-go pz-abb" onClick={() => commit(null)}>Show answer</button> : null}
          {c.kind === 'choose' ? (
            <div className="pz-ab pz-int-opts" role="group" aria-label="Choose one">
              {c.options.map((o, k) => <button key={k} type="button" className="pz-abb" data-audit-select="" data-on={answer === k ? '' : undefined} onClick={() => commit(k)}>{o.text}</button>)}
            </div>
          ) : null}
          {c.kind === 'predict' ? (
            <div className="pz-int-guess">
              <input type="range" min={c.min} max={c.max} step={c.step ?? 1} value={guess} aria-label={`Your guess for ${c.reading}`} onChange={(e) => setGuess(+e.target.value)} />
              <output>{num(guess, c.unit)}</output>
              <button type="button" className="pz-int-go pz-abb" onClick={() => commit(guess)}>Lock in</button>
            </div>
          ) : null}
        </div>
        <div className="pz-int-said" aria-hidden={done ? undefined : true} aria-live="polite" data-right={done && c.kind === 'choose' ? String(right) : undefined}>
          {c.kind === 'choose' && chosen ? <p className="pz-int-p">{say}</p> : null}
          {c.kind === 'predict' && answer != null ? <p className="pz-int-p">{say}</p> : null}
          {it.reveal ? <p className="pz-int-p">{it.reveal}</p> : null}
          {done && !right && backAt >= 0 ? <button type="button" className="pz-int-back pz-abb" onClick={() => go(backAt + 1)}>Back to “{deck.slides[backAt]!.title}”</button> : null}
        </div>
      </div>
    </div>
  );
}
