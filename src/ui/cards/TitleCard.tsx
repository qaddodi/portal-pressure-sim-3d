import type { Deck } from '../../decks/schema.ts';
import { OBJECTIVES_HEAD, OUTLINE_HEAD, OUTLINE_TITLE, outlineOf } from '../../decks/outline.ts';

/** The opening card, as the 2D app's "Outline and objectives" slide: the talk's name, then its outline (a numbered run of sections) and what you can do by the end
 *  (ticked, on a tinted card). Whole it holds both; split in two (a phone on its side) the name and outline come first and the objectives second. Next goes on. */
export function TitleCard({ deck, page, pages }: { deck: Deck; page: number; pages: number }) {
  const head = pages === 1 || page === 0, objectives = pages === 1 || page === pages - 1;
  const outline = outlineOf(deck);
  return (
    <>
      {head && <h1 className="pz-h">{deck.title}</h1>}
      <p className="pz-line">{OUTLINE_TITLE}{pages > 1 ? <span className="dk-pageno"> · {page + 1} of {pages}</span> : null}</p>
      <div className="pz-outline">
        {head && (
          <section>
            <h2 className="pz-sub">{OUTLINE_HEAD}</h2>
            <ol>{outline.map((k) => <li key={k}>{k}</li>)}</ol>
          </section>
        )}
        {objectives && deck.objectives.length > 0 && (
          <section className="pzo-obj">
            <h2 className="pz-sub">{OBJECTIVES_HEAD}</h2>
            <ul>{deck.objectives.map((o) => <li key={o}>{o}</li>)}</ul>
          </section>
        )}
      </div>
    </>
  );
}
