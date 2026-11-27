// A printed formula's segments (decks/eq-tone.ts): each term that names a station in that station's colour (`.eq-line .eq-*`, app-04-presenter.css), the rest as plain text.
import { Fragment } from 'react';
import { eqClassOf, type EqSeg } from '../../decks/eq-tone.ts';

export function Toned({ segs }: { segs: readonly EqSeg[] }) {
  return <>{segs.map((x, i) => (x.tone ? <span key={i} className={eqClassOf(x.tone)}>{x.s}</span> : <Fragment key={i}>{x.s}</Fragment>))}</>;
}
