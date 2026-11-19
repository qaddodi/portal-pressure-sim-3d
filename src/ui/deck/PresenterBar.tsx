import { useMemo } from 'react';
import { useUi } from '../ui-store.ts';
import { isFirst, isLast } from './presenter-machine.ts';
import { SettingsMenu } from '../settings/SettingsMenu.tsx';

const Chevron = ({ dir }: { dir: 'l' | 'r' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d={dir === 'l' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} /></svg>
);

/** Back, Next, the progress and the settings. On a big screen the talk's name leads; on a phone the buttons stay and the name goes. */
export function PresenterBar({ title }: { title: string }) {
  const stops = useUi((s) => s.stops);
  const pos = useUi((s) => s.pos);
  const vp = useUi((s) => s.vp);
  const device = useUi((s) => s.device);
  const move = useUi((s) => s.move);
  const go = useUi((s) => s.go);
  const first = isFirst(pos), end = useMemo(() => isLast(stops, pos), [stops, pos]);
  const phone = device === 'phone-portrait' || device === 'phone-landscape';
  const left = device === 'phone-landscape' ? vp.safe.left + 346 : vp.safe.left + 24;
  return (
    <div className="dk-bar" style={{ left, right: vp.safe.right + (phone ? 12 : 24), top: vp.safe.top + 8, height: 44 }}>
      {!phone && <span className="dk-bar-title">{title}</span>}
      <div className="dk-dots" role="group" aria-label="Progress">
        {stops.map((_, i) => (
          <button key={i} type="button" aria-label={`Go to ${i + 1} of ${stops.length}`} aria-current={i === pos.stop ? 'step' : undefined} onClick={() => go(i)}><i /><u /></button>
        ))}
      </div>
      <span className="dk-count" aria-live="polite">{pos.stop + 1} / {stops.length}</span>
      <div className="dk-nav">
        <button type="button" aria-label="Back" disabled={first} onClick={() => move('back')}><Chevron dir="l" /></button>
        <button type="button" aria-label="Next" disabled={end} onClick={() => move('next')}><Chevron dir="r" /></button>
        <SettingsMenu />
      </div>
    </div>
  );
}
