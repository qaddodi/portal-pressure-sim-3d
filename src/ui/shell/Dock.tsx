// The vitals dock, on the 2D markup (index.html #vdock): the view pill (.nb-views, which 2D's main.js prepends), the timeline row (.stage-bar.bottom > .timeline), the readout strip and, on the thumb layout, the tab row.
import { ViewPills } from './TopBar.tsx';
import { Timeline, Readouts } from './PlayBar.tsx';
import { ThumbBar } from './ThumbBar.tsx';

export function Dock({ thumb }: { thumb: boolean }) {
  return (
    <div className="vdock float-ui stage-blocker" id="vdock" data-safe="bottom">
      <span className="vd-face" aria-hidden="true" />
      <div className="nb-views" id="nbViews" data-safe="bottom" data-safe-pad="12"><span className="vp-face" aria-hidden="true" /><ViewPills /></div>
      <div className="stage-bar bottom" id="stageBottom"><Timeline phone={thumb} /></div>
      <Readouts />
      {thumb && <ThumbBar />}
    </div>
  );
}
