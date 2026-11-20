import { useMemo } from 'react';
import { useUi } from '../ui-store.ts';
import { isFirst, isLast } from './presenter-machine.ts';
import { SettingsMenu } from '../settings/SettingsMenu.tsx';
import { barOf } from '../layout/plan.ts';
import { layoutOf } from '../layout/rules2d.ts';
import { Icon } from '../shell/icons.tsx';
import { leaveTalk } from '../shell/talk.ts';

// the 2D app's chev-left / chev-right (its `.ib` rules size and stroke them)
const Chevron = ({ dir }: { dir: 'l' | 'r' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d={dir === 'l' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} /></svg>
);

/** The 2D app's pill: Back, where you are, Next (and the settings). Lower right of a wide screen; inside the foot of the words' card on a phone or an upright iPad.
 *  The talk's title stands to its left where a wide screen has the room. */
export function PresenterBar({ title }: { title: string }) {
  const stops = useUi((s) => s.stops);
  const pos = useUi((s) => s.pos);
  const vp = useUi((s) => s.vp);
  const colRight = useUi((s) => { const w = s.boxes.words, d = s.boxes.data; return Math.max(w ? w.x + w.w : 0, d ? d.x + d.w : 0); });
  const move = useUi((s) => s.move);
  const jump = useUi((s) => s.jump);
  const first = isFirst(pos), end = useMemo(() => isLast(stops, pos), [stops, pos]);
  const beatsAt = (() => { const st = stops[pos.stop]; return st && st.kind === 'slide' ? st.beats : 1; })();
  const place = barOf(vp, colRight);
  const sideways = vp.h <= 500 && vp.w > vp.h;
  const stacked = layoutOf(vp.w, vp.h) === 'stack' || layoutOf(vp.w, vp.h) === 'tab';
  // the 2D app's own pill markup: `.pz-bar` with `.pzb-pill` on a wide screen, `.phone` stacked; `.ib` buttons, the count `.pzb-n` > `.pzb-nt`
  return (
    <>
      {place.title && <span className="dk-bar-title" style={{ left: place.title.x, top: place.title.y, width: place.title.w, height: place.title.h }}>{title}</span>}
      <div className={`dk-bar pz-bar ${stacked ? 'phone' : 'pzb-pill'}`} data-edge={place.edge} role="toolbar" aria-label="Presenter" style={{ left: place.rect.x, top: place.rect.y, width: place.rect.w, height: place.rect.h, right: 'auto', bottom: 'auto' }}>
        {!sideways && <button type="button" className="ib" aria-label="Previous slide" title="Previous (←)" disabled={first} onClick={() => move('back')}><Chevron dir="l" /></button>}
        {(
          // 2D presenter-scales.js: the count is a button that opens the slide list (G); a slide with two beats (a case, then its slide) shows them as strokes under the number
          <button type="button" className="pzb-n" aria-label={`Slide ${pos.stop + 1} of ${stops.length}. Open the slide list`} title="Slide list (G)" aria-expanded={jump} onClick={() => useUi.getState().setJump()}>
            <span className="pzb-nt">{pos.stop + 1} / {stops.length}</span>
            <span className="pzb-pips" aria-hidden="true" data-n={beatsAt} data-at={pos.beat}><i /><i /><i /></span>
          </button>
        )}
        {!sideways && <button type="button" className="ib pzb-next" aria-label="Next slide" title="Next (→)" disabled={end} onClick={() => move('next')}><Chevron dir="r" /></button>}
        <SettingsMenu />
        {/* 2D presenter-scales.js: the pill ends with Exit (a phone: "Exit the presentation", a wide screen: "Stop presenting", Esc) */}
        <button type="button" className="ib pzb-exit" aria-label={stacked ? 'Exit the presentation' : 'Stop presenting'} title={stacked ? 'Exit' : 'Stop (Esc)'} onClick={() => leaveTalk()}><Icon n="close" /></button>
      </div>
    </>
  );
}
