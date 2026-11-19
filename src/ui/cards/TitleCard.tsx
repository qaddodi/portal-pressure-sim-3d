import type { Deck } from '../../decks/schema.ts';

/** The talk's title card. Whole, it holds the name, the summary, the objectives and Start; split in two (a phone on its side) the name and summary come
 *  first and the objectives, with Start, second. */
export function TitleCard({ deck, onStart, onNext, page, pages }: { deck: Deck; onStart(): void; onNext(): void; page: number; pages: number }) {
  const level = deck.level === 'core' ? 'Core talk' : 'Talk';
  const head = pages === 1 || page === 0, objectives = pages === 1 || page === pages - 1;
  return (
    <>
      <p className="dk-kicker">{level} · {deck.minutes} minutes{pages > 1 ? <span className="dk-pageno"> · {page + 1} of {pages}</span> : null}</p>
      {head && <h2 className="dk-title dk-title--deck" style={{ margin: '14px 0 14px' }}>{deck.title}</h2>}
      {head && <p className="dk-body dk-body--muted">{deck.summary}</p>}
      {objectives && <p className="dk-kicker" style={{ marginTop: head ? 24 : 14 }}>By the end you can</p>}
      {objectives && <ul className="dk-obj">{deck.objectives.map((o) => <li key={o}>{o}</li>)}</ul>}
      <div className="dk-actions">
        {objectives
          ? <button type="button" className="dk-btn dk-btn--primary" onClick={onStart}>Start talk</button>
          : <button type="button" className="dk-btn dk-btn--primary" onClick={onNext}>By the end you can</button>}
      </div>
    </>
  );
}
