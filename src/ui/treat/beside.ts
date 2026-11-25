// Where the Treat card stands while the Tests card is up on the right (F13 of the independent review): both anchor at the right edge, so Treat used to open underneath Tests and Tests covered its
// controls. 2D keeps Treat clear by a custom property, `--instr-occ`, that its stylesheet reads (app-07-floating.css `.treat-card { translate: var(--occ-x) 0 }`, which
// already glides); 3D never set it.
// This is that number: how far Treat steps left so its right edge ends one gap short of the Tests card's left edge, the same gap Treat keeps from the screen's edge. Pure, so a test can judge it
// at 1280, 1440 and 1920 wide. A card in focus (the instrument fills the screen) and a sheet over the dock leave no room beside: those take Treat away instead (action/boot.ts).
import type { Viewport } from '../layout/device.ts';
import type { TestsPlace } from '../tests/place.ts';

/** px Treat's card steps left of its resting place; 0 when no Tests card stands in the right-hand column. */
export function treatStepLeft(vp: Viewport, place: TestsPlace | null): number {
  if (!place || place.kind !== 'side' || place.focus) return 0;
  return Math.max(0, Math.round(vp.w - vp.safe.right - place.rect.x));
}
