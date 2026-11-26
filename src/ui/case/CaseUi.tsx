// Playing a case, on the screen (docs/approved/play-the-case.md): the case bar in the play bar's place, the stop's card (or sheet), the card on the way, and the room they leave the figure.
// Its own chunk, mounted when the first case starts (Shell.tsx) and kept: every part stays in the page and fades in and out by `data-on` (case.css), so nothing pops in, and a part
// comes up only once its content is there (the bar once its strip is drawn).
import { useCallback, useEffect, useMemo, useState } from 'react';
import './case.css';
import '../history/history.css';
import { useUi } from '../ui-store.ts';
import { useTests } from '../tests/store.ts';
import { layoutClass, sheetFoot } from '../shell/room.ts';
import { useCase } from './store.ts';
import { caseBarUp, useCaseRoom, CASE_CARD_W, CASE_CARD_GAP, type CaseCut } from './room.ts';
import { CASE_TRAVEL_H } from '../../scene/labels/chrome-claims.ts';
import { useCaseView } from './view.ts';
import { useSwap } from './swap.ts';
import { CaseBar } from './CaseBar.tsx';
import { PhoneStopSheet, StopCards, TravelCard, stopShown, useStopMoved } from './StopCard.tsx';
import { openLook } from './look-pane.ts';

/** The iPhone's layout: the bar in two rows and the stop sheet pulled up for the rest (below this width; an upright iPad keeps one row and the whole card). */
export const PHONE_MAX_W = 700;

export function CaseUi({ thumb }: { thumb: boolean }) {
  const cv = useCaseView();
  const phase = useCase((s) => s.phase), at = useCase((s) => s.at), stops = useCase((s) => s.stops), id = useCase((s) => s.id);
  const vp = useUi((s) => s.vp);
  const phone = thumb && vp.w < PHONE_MAX_W;
  const up = caseBarUp(phase);
  const testsOpen = useTests((s) => s.open);
  const exploring = phase === 'stop' && testsOpen;
  const shownNow = useMemo(() => (cv ? stopShown(cv, stops, at) : null), [cv, stops, at]);
  const stop = useSwap(shownNow, `${id}:${at}`, phase === 'stop' && !!cv);
  const [moved, back] = useStopMoved(stop.shown, phase === 'stop');
  // a stop whose point is a picture (the bleed, through the scope) opens it as it is reached; the card then folds to its title and Continue, as it does for any look
  const opens = phase === 'stop' ? stops[at]?.open ?? null : null;
  useEffect(() => { if (opens) openLook(opens); }, [opens, id, at]);
  // (on a phone or an upright iPad the Tests card is a sheet from the same foot: the stop's sheet makes way for it, and the bar says the case waits)
  const stopOn = stop.on && !(thumb && exploring);
  const [sheetH, setSheetH] = useState(0);
  const onHeight = useCallback((h: number) => setSheetH(h), []);

  // the room the cards leave the figure: the column at the left on a Mac (the same for the card on the way, so the figure does not swing between them), the stop's sheet over the foot
  useEffect(() => {
    let cut: CaseCut | null = useCaseRoom.getState().cut;
    if (!up) cut = null;
    else if (!thumb) cut = { kind: 'left', x: vp.safe.left + CASE_CARD_GAP + CASE_CARD_W };
    else if (exploring) cut = null;
    else if (stopOn && sheetH > 0) cut = { kind: 'foot', y: vp.h - vp.safe.bottom - sheetFoot(layoutClass(true)) - sheetH };
    const was = useCaseRoom.getState().cut;
    if (JSON.stringify(was) !== JSON.stringify(cut)) useCaseRoom.setState({ cut });
  }, [up, thumb, exploring, stopOn, sheetH, vp]);
  // the card's own height at the left, for the labels' keep-out (the card on the way is taller than the column's top: chrome-claims.ts CASE_TRAVEL_H)
  const cardH = up && !thumb ? Math.round(phase === 'travel' ? Math.max(sheetH, CASE_TRAVEL_H) : sheetH) : 0;
  useEffect(() => { if (useCaseRoom.getState().cardH !== cardH) useCaseRoom.setState({ cardH }); }, [cardH]);
  useEffect(() => () => useCaseRoom.setState({ cut: null, cardH: 0 }), []);

  return (
    <div className="case-layer" data-thumb={thumb || undefined} data-phone={phone || undefined}>
      {cv && (phone
        ? <PhoneStopSheet cv={cv} s={stop.shown} on={stopOn} moved={moved} back={back} onHeight={onHeight} />
        : <StopCards cv={cv} s={stop.shown} on={stopOn} fold={exploring} moved={moved} back={back} sheet={thumb} onHeight={onHeight} />)}
      {cv && <TravelCard cv={cv} on={phase === 'travel'} sheet={thumb} phone={phone} />}
      <CaseBar cv={cv} thumb={thumb} exploring={exploring} on={up} />
    </div>
  );
}
