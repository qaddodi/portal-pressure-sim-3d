import type { Deck } from '../../decks/schema.ts';

/** The talk's title card. Whole, it holds the name, the summary, the objectives and Start; split in two (a phone on its side) the name and summary come
 *  first and the objectives, with Start, second. */
export function TitleCard({ deck, onStart, onNext, page, pages }: { deck: Deck; onStart(): void; onNext(): void; page: number; pages: number }) {
  const level = deck.level === 'core' ? 'Core talk' : 'Talk';
  const head = pages === 1 || page === 0, objectives = pages === 1 || page === pages - 1;
  return (
    <>
      <div className="pz-kick" data-site="none">{level} · {deck.minutes} minutes{pages > 1 ? <span className="dk-pageno"> · {page + 1} of {pages}</span> : null}</div>
      {head && <h2 className="pz-h">{deck.title}</h2>}
      {head && <p className="pz-line">{deck.summary}</p>}
      {objectives && <div className="pz-kick" data-site="none">By the end you can</div>}
      {objectives && <ul className="dk-obj">{deck.objectives.map((o) => <li key={o}>{o}</li>)}</ul>}
      <div className="dk-actions">
        {objectives
          ? <button type="button" className="btn primary" onClick={onStart}>Start talk</button>
          : <button type="button" className="btn primary" onClick={onNext}>By the end you can</button>}
      </div>
    </>
  );
}
