// The Treat card's toasts in the app's own voice. treat.generated.ts is written from the 2D app's files (scripts/gen-treat.mjs) and is never edited by hand; where 3D says a line
// differently (22 Nov, "humanized": plain words, contractions, what happened and then what to do), the line is here. Every key must exist in the generated table, so a 2D rename shows.
// The "done" lines stay as 2D has them: they are clinical and exact.
import { TREAT_WORDS } from './treat.generated.ts';

const OVERRIDES = {
  balloonUp: 'The gastric balloon is already inflated. The esophageal balloon comes next, from the varices card.',
  brtoNone: 'This patient has no gastrorenal shunt, so there’s nothing for BRTO to occlude. You can add one in Advanced › Anatomical variants.',
} as const;

export const TOAST_WORDS: { readonly [K in keyof typeof TREAT_WORDS.lines.toasts]: string } = { ...TREAT_WORDS.lines.toasts, ...OVERRIDES };
export const OVERRIDDEN_TOASTS: readonly string[] = Object.keys(OVERRIDES);
