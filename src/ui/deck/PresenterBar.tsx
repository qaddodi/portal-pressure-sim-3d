import { useMemo } from 'react';
import { useUi, atEnd } from '../ui-store.ts';
import { isFirst, isLast } from './presenter-machine.ts';
import { SettingsMenu } from '../settings/SettingsMenu.tsx';
import { barOf, sidePillCentre } from '../layout/plan.ts';
import { layoutOf, isSideways } from '../layout/rules2d.ts';
import { Icon } from '../shell/icons.tsx';
import { stopTalk } from '../shell/talk.ts';
import { finishTalk } from '../cards/finish.ts';

// the 2D app's chev-left / chev-right (its `.ib` rules size and stroke them)
const Chevron = ({ dir }: { dir: 'l' | 'r' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d={dir === 'l' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} /></svg>
);

/** The 2D app's pill: Back, where you are, Next (and the settings). Lower right of a wide screen; inside the foot of the words' card on a phone or an upright iPad.
 */
export function PresenterBar() {
  const stops = useUi((s) => s.stops);
  const pos = useUi((s) => s.pos);
  const vp = useUi((s) => s.vp);
  const move = useUi((s) => s.move);
  const jump = useUi((s) => s.jump);
  const first = isFirst(pos), end = useMemo(() => isLast(stops, pos), [stops, pos]);
  const place = barOf(vp);
  const sideways = isSideways(vp.w, vp.h);
  // a phone on its side: the pill stands at the foot of the figure's column and glides across (a translate, on the compositor) when the slide has a panel standing alone
  const sidePill = useUi((s) => s.boxes.sidePill);
  const dx = sideways ? Math.round(sidePillCentre(vp, sidePill ?? 'column') - sidePillCentre(vp, 'column')) : 0;
  const stacked = layoutOf(vp.w, vp.h) === 'stack' || layoutOf(vp.w, vp.h) === 'tab';
  const phone = layoutOf(vp.w, vp.h) === 'stack';
  // the 2D app's own pill markup: `.pz-bar` with `.pzb-pill` on a wide screen, `.phone` stacked; `.ib` buttons, the count `.pzb-n` > `.pzb-nt`
  return (
    <>
      <div className={`dk-bar pz-bar ${stacked || sideways ? 'phone' : 'pzb-pill'}`} data-edge={place.edge} role="toolbar" aria-label="Presenter" style={phone
        // an iPhone's pill is anchored by its lower right corner (its width is its buttons', never a guessed one), inside the words card
        ? { right: vp.w - (place.rect.x + place.rect.w), top: place.rect.y, left: 'auto', bottom: 'auto', height: place.rect.h, width: 'auto' }
        : { left: place.rect.x, top: place.rect.y, width: place.rect.w, height: place.rect.h, right: 'auto', bottom: 'auto', ...(sideways ? { translate: `${dx}px 0` } : null) }}>
        {<button type="button" className="ib" aria-label="Previous slide" title="Previous (←)" disabled={first} onClick={() => move('back')}><Chevron dir="l" /></button>}
        {(
          // 2D presenter-scales.js: the count is a button that opens the slide list (G); a slide with two beats (a case, then its slide) shows them as strokes under the number
          <button type="button" className="pzb-n" aria-label={`Slide ${pos.stop + 1} of ${stops.length}. Open the slide list`} title="Slide list (G)" aria-expanded={jump} onClick={() => useUi.getState().setJump()}>
            <span className="pzb-nt">{pos.stop + 1} / {stops.length}</span>
          </button>
        )}
        {<button type="button" className="ib pzb-next" aria-label="Next slide" title={end ? 'Finish (→)' : 'Next (→)'} onClick={() => (atEnd(useUi.getState()) ? finishTalk() : move('next'))}><Chevron dir="r" /></button>}
        <SettingsMenu />
        {/* 2D presenter-scales.js: the pill ends with Exit (a phone: "Exit the presentation", a wide screen: "Stop presenting", Esc) */}
        <button type="button" className="ib pzb-exit" aria-label={stacked || sideways ? 'Exit the presentation' : 'Stop presenting'} title={stacked || sideways ? 'Exit' : 'Stop (Esc)'} onClick={() => stopTalk()}><Icon n="close" /></button>
      </div>
    </>
  );
}
