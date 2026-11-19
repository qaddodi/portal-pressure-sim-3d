// Wall mechanics, the Endoscopy tab's second view (2D wall-mechanics.js). Not drawn in the 3D app yet: it needs the ink-row text measurements the shared drawer does not offer.
// The view switch keeps the 2D order so the second view lands here without moving anything; until then it says so.
export function WallView(_p: { square: number }) {
  return (
    <div className="en-view en-wall" data-view="wall">
      <p className="ctl-sub">Wall mechanics is not in the 3D app yet. The endoscopic view shows the wall stress as the red wale marks.</p>
    </div>
  );
}
