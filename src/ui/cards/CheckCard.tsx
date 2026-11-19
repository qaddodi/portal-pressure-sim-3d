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
      <p className="dk-kicker">Quick check</p>
      <h2 className="dk-title" style={{ margin: '10px 0 0' }}>Check what you remember</h2>
      <div className="dk-q" key={i}>
        <p className="dk-kicker dk-q-count">Question {i + 1} of {deck.checks.length}</p>
        <p className="dk-body dk-q-text">{q}</p>
        {shown && <p className="dk-body dk-a">{a}</p>}
      </div>
      <div className="dk-q-nav">
        {!shown
          ? <button type="button" className="dk-btn dk-btn--primary" onClick={() => setShown(true)}>Show answer</button>
          : last
            ? <button type="button" className="dk-btn" onClick={() => go(0)}>Start again</button>
            : <button type="button" className="dk-btn dk-btn--primary" onClick={() => go(i + 1)}>Next question</button>}
        {i > 0 && <button type="button" className="dk-btn" onClick={() => go(i - 1)}>Previous</button>}
      </div>
    </>
  );
}
