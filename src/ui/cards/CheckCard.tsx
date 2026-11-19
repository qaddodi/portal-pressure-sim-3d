import { useState } from 'react';
import type { Deck } from '../../decks/schema.ts';

/** The closing quick check: one question at a time (a list of answers would outgrow a phone on its side); a tap shows the answer. */
export function CheckCard({ deck }: { deck: Deck }) {
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const [q, a] = deck.checks[i];
  const last = i === deck.checks.length - 1;
  const go = (n: number) => { setI(n); setShown(false); };
  return (
    <>
      <div className="pz-kick" data-site="none">Quick check</div>
      <h2 className="pz-h">Check what you remember</h2>
      <div className="dk-q" key={i}>
        <div className="pz-kick dk-q-count" data-site="none">Question {i + 1} of {deck.checks.length}</div>
        <p className="pz-line dk-q-text">{q}</p>
        {shown && <p className="pz-line dk-a">{a}</p>}
      </div>
      <div className="dk-q-nav">
        {!shown
          ? <button type="button" className="btn primary" onClick={() => setShown(true)}>Show answer</button>
          : last
            ? <button type="button" className="btn" onClick={() => go(0)}>Start again</button>
            : <button type="button" className="btn primary" onClick={() => go(i + 1)}>Next question</button>}
        {i > 0 && <button type="button" className="btn" onClick={() => go(i - 1)}>Previous</button>}
      </div>
    </>
  );
}
