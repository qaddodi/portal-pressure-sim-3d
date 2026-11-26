// A stop's shot as the scene it asks for: its fields are a slide's, so the slide's own planner makes it (decks/hp/plan.ts planSlide), the framing rules and all. Pure (no scene): the case's
// tests play every stop of every history through it.
import { planSlide, type SceneDirective } from '../../decks/hp/plan.ts';
import type { CopiedSlide } from '../../decks/hp/types.ts';
import type { Rect, DeviceClass } from '../layout/device.ts';
import { VARIX_SITE_OF_CAM } from '../../scene/disease/varix-frame.ts';
import type { StopShot } from './types.ts';
import { caseFree, typicalCut, type CaseCut } from './room.ts';
import { varixShot } from './frame.ts';

/** The scene a stop's shot asks for (throws on a camera or a lens neither app has, as a slide's does: tests/case-stops.test.ts plays every stop of every history through it). */
export function shotScene(s: StopShot): SceneDirective {
  const slide = { id: 'case-stop', cam: s.cam, view: s.view === 'anatomic' ? null : s.view, lens: s.lens ?? null, labels: s.labels ?? [] } as CopiedSlide;
  return planSlide('case', slide, 0).scene;
}


/** The scene a stop asks for in `room` (the figure's room before the cards) with the cards' `cut` (null: not measured yet, so the device's usual card):
 *  the stop's own, except that a stop whose camera is about a varix
 *  (scene/disease/varix-frame.ts) frames that varix in what the cards leave (frame.ts), so the varix is never under the card or at the screen's edge. `left` is the safe area's left inset. */
export function stopScene(s: StopShot, room: Rect, cut: CaseCut | null, d: DeviceClass, left = 0): SceneDirective {
  const sc = shotScene(s), site = sc.view === 'body' ? VARIX_SITE_OF_CAM[s.cam] : undefined;
  return site ? { ...sc, shot: varixShot(site, room, caseFree(room, cut ?? typicalCut(d, room, left))) } : sc;
}
