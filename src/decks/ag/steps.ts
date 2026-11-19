// The slide-to-slide model chain of a deck: what the engine host's `sequence` message plays (preset → params → settle → actions → days → settle), one step per slide,
// each starting from the slide before's state. This is the 2D presenter's own rule (tests/deck-states.js): a slide that changes nothing shows the state of the last
// one that did. The numbers a slide prints are the engine's fingerprint at its step, so a 3D slide and a 2D slide with the same steps print the same numbers.
import type { CopiedSlide } from './types.ts';

export interface ModelStep {
  preset?: string;
  presetDays?: number;
  params?: Record<string, unknown>;
  action?: unknown;
  days?: number;
  relax?: number;
  ramp?: Record<string, [number, number]>;
  /** a time-lapse (a ramp, or `lapse`): the days are stepped one at a time */
  fine?: boolean;
}

/** The fields that make a slide change the model (2D deck-states.js `changes`). */
const MODEL_FIELDS = ['preset', 'presetDays', 'params', 'action', 'days'] as const;
export const changesModel = (s: CopiedSlide): boolean => MODEL_FIELDS.some((k) => !!s[k]);

/** One step per slide: the slide's own change, or an empty step (the state of the slide before). */
export function stepsOf(slides: readonly CopiedSlide[]): ModelStep[] {
  return slides.map((s) => (changesModel(s) ? { preset: s.preset, presetDays: s.presetDays, params: s.params, action: s.action, days: s.days, relax: s.relax, ramp: s.ramp, fine: !!s.lapse } : {}));
}

/** The index of the slide whose engine state slide i shows: its own, or the last before it that changed the model (the first slide always has its own). */
export function stateOf(slides: readonly CopiedSlide[]): number[] {
  let last = 0;
  return slides.map((s, i) => (changesModel(s) || i === 0 ? (last = i) : last));
}
