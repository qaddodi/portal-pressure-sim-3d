import { useMemo } from 'react';
import { useUi } from '../ui-store.ts';
import { isFirst, isLast } from './presenter-machine.ts';
import { SettingsMenu } from '../settings/SettingsMenu.tsx';
import { barOf } from '../layout/plan.ts';

const Chevron = ({ dir }: { dir: 'l' | 'r' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d={dir === 'l' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} /></svg>
);

/** The 2D app's pill: Back, where you are, Next (and the settings). Lower right of a wide screen; inside the foot of the words' card on a phone or an upright iPad.
 *  The talk's title stands to its left where a wide screen has the room. */
export function PresenterBar({ title }: { title: string }) {
  const stops = useUi((s) => s.stops);
  const pos = useUi((s) => s.pos);
  const vp = useUi((s) => s.vp);
  const colRight = useUi((s) => { const w = s.boxes.words, d = s.boxes.data; return Math.max(w ? w.x + w.w : 0, d ? d.x + d.w : 0); });
  const move = useUi((s) => s.move);
  const first = isFirst(pos), end = useMemo(() => isLast(stops, pos), [stops, pos]);
  const place = barOf(vp, colRight);
  const sideways = vp.h <= 500 && vp.w > vp.h;
  return (
    <>
      {place.title && <span className="dk-bar-title" style={{ left: place.title.x, top: place.title.y, width: place.title.w, height: place.title.h }}>{title}</span>}
      <div className="dk-bar" data-edge={place.edge} role="toolbar" aria-label="Presenter" style={{ left: place.rect.x, top: place.rect.y, width: place.rect.w, height: place.rect.h }}>
        <button type="button" className="dk-pb" aria-label="Back" disabled={first} onClick={() => move('back')}><Chevron dir="l" /></button>
        {!sideways && <span className="dk-count" aria-live="polite">{pos.stop + 1} / {stops.length}</span>}
        <button type="button" className="dk-pb dk-pb--next" aria-label="Next" disabled={end} onClick={() => move('next')}><Chevron dir="r" /></button>
        <SettingsMenu />
      </div>
    </>
  );
}
