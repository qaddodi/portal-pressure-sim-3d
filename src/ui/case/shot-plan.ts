// A stop's shot as the scene it asks for: its fields are a slide's, so the slide's own planner makes it (decks/hp/plan.ts planSlide), the framing rules and all. Pure (no scene): the case's
// tests play every stop of every history through it.
import { planSlide, type SceneDirective } from '../../decks/hp/plan.ts';
import type { CopiedSlide } from '../../decks/hp/types.ts';
import type { StopShot } from './types.ts';

/** The scene a stop's shot asks for (throws on a camera or a lens neither app has, as a slide's does: tests/case-stops.test.ts plays every stop of every history through it). */
export function shotScene(s: StopShot): SceneDirective {
  const slide = { id: 'case-stop', cam: s.cam, view: s.view === 'anatomic' ? null : s.view, lens: s.lens ?? null, labels: s.labels ?? [] } as CopiedSlide;
  return planSlide('case', slide, 0).scene;
}

