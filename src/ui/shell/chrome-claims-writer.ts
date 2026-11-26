// Writes the room the app's own chrome takes on the figure (scene/labels/chrome-claims.ts) for every writer of words on the figure. The numbers the UI publishes (the Tests card, a case's
// stop card, sheet and
// bar) are written the moment they change; the painted chips (the view pill, the zoom pill, the dock, the figure's key) are read once the layout has settled, never in a frame.
import { useEffect } from 'react';
import { clock, type TimerId } from '../../clock/frame.ts';
import { chromeBoxes, chromeClaims } from '../../scene/labels/chrome-claims.ts';
import type { Box } from '../../scene/labels/geometry.ts';
import { readUiWalls } from '../../scene/circuit/ui-walls.ts';
import { useUi } from '../ui-store.ts';
import { useTestsRoom } from '../tests/room.ts';
import { useCase } from '../case/store.ts';
import { caseBarUp, useCaseRoom } from '../case/room.ts';
import { layoutClass } from './room.ts';

export function useChromeClaims(thumb: boolean): void {
  useEffect(() => {
    const d = layoutClass(thumb);
    let walls: Box[] = [], timer: TimerId | null = null;
    const put = () => {
      const c = useCaseRoom.getState();
      chromeClaims.set([
        ...chromeBoxes({ vp: useUi.getState().vp, d, caseUp: caseBarUp(useCase.getState().phase), cut: c.cut, cardH: c.cardH, tests: useTestsRoom.getState().place }),
        ...walls,
      ]);
    };
    const later = () => { clock.cancel(timer); timer = clock.after(() => { walls = readUiWalls(); put(); }, 260); };
    const both = () => { put(); later(); };
    both();
    addEventListener('resize', later);
    // (the figure key stands where it docks: read again when it comes, goes or changes its words)
    const keyMo = new MutationObserver(later);
    for (const k of document.querySelectorAll('.lb-key-wrap')) keyMo.observe(k, { attributes: true, attributeFilter: ['data-on'], childList: true });
    const offs = [
      useUi.subscribe((s, p) => { if (s.vp !== p.vp || s.dockShown !== p.dockShown || s.boxes !== p.boxes) both(); }),
      useCase.subscribe((s, p) => { if (s.phase !== p.phase) both(); }),
      useCaseRoom.subscribe(both),
      useTestsRoom.subscribe(both),
    ];
    return () => { clock.cancel(timer); removeEventListener('resize', later); keyMo.disconnect(); for (const o of offs) o(); chromeClaims.set([]); };
  }, [thumb]);
}
