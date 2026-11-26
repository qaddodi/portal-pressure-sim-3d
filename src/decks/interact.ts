// A slide that asks the room something before it shows the answer: the room COMMITS (thinks, chooses, or guesses a number), then the model REVEALS (the slide that follows, with its readings).
// One field for every kind of ask, one card (ui/cards/InteractControls.tsx on the slide's first card), one rule (`interactProblems`). A new way of asking is a new `commit` kind here, never a new
// slide field: a prediction before the model runs, a trace the room spots the mistake in, a patient to guess, a decision with its consequence all have this shape.
//
//   interact: { prompt, commit, reveal?, back? }
//     prompt  the question, in the slide's own words (shown on the slide's first card; a slide with a case or a question keeps those words and adds the controls under them)
//     commit  { kind: 'think' }                                  tap to show the answer
//             { kind: 'choose', options: [{ text, right?, why }] }  pick one; the card says whether it was right and why
//             { kind: 'predict', reading, min, max, step?, unit?, tolerance? }  slide to a guess for one of the readings; the slide that follows shows what the model gives
//     reveal  what the card says once the room has committed, before Next shows the slide
//     back    a slide of the same deck to offer going back to when a choice was wrong
import { READING_KEYS, type ReadingKey } from './schema.ts';

export interface ChooseOption { text: string; right?: boolean; why: string }
export type Commit =
  | { kind: 'think' }
  | { kind: 'choose'; options: ChooseOption[] }
  | { kind: 'predict'; reading: ReadingKey; min: number; max: number; step?: number; unit?: string; tolerance?: number };
export interface Interact { prompt: string; commit: Commit; reveal?: string; back?: string }

/** The kinds of commit the card can draw. */
export const COMMIT_KINDS = ['think', 'choose', 'predict'] as const;

/** The first card's kicker for a slide that asks (a slide with a case or a question keeps those). */
export const INTERACT_KICKER = 'Your turn';

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim();

/** What is wrong with an `interact` in plain words (empty: it can be played). `slideIds` are the deck's slides, for `back`. */
export function interactProblems(x: unknown, slideIds: readonly string[] = []): string[] {
  const bad: string[] = [];
  if (!isObj(x)) return ['an interact is { prompt, commit }'];
  if (!text(x.prompt)) bad.push('the prompt (the question) is empty');
  if (x.reveal != null && !text(x.reveal)) bad.push('the reveal is empty');
  if (x.back != null && !slideIds.includes(x.back as string)) bad.push(`“back” names the slide “${String(x.back)}”, which this deck does not have`);
  const c = x.commit;
  if (!isObj(c) || !(COMMIT_KINDS as readonly unknown[]).includes(c.kind)) { bad.push(`“commit” is one of ${COMMIT_KINDS.join(', ')}`); return bad; }
  if (c.kind === 'choose') {
    const o = Array.isArray(c.options) ? c.options : [];
    if (o.length < 2 || o.length > 4) bad.push('a choice has two to four options');
    o.forEach((p, i) => { if (!isObj(p) || !text(p.text)) bad.push(`option ${i + 1} has no text`); else if (!text(p.why)) bad.push(`option ${i + 1} says nothing about why`); });
    if (o.filter((p) => isObj(p) && p.right === true).length !== 1) bad.push('exactly one option is right');
  } else if (c.kind === 'predict') {
    if (!(READING_KEYS as readonly unknown[]).includes(c.reading)) bad.push(`“reading” is one of ${READING_KEYS.join(', ')}`);
    if (typeof c.min !== 'number' || typeof c.max !== 'number' || !(c.min < c.max)) bad.push('a guess needs a minimum below its maximum');
    if (c.step != null && !(typeof c.step === 'number' && c.step > 0)) bad.push('the step is a number above zero');
  }
  if (x.back != null && c.kind === 'think') bad.push('“back” is for a choice: a question you only think about is never wrong');
  return bad;
}

/** Whether a committed answer was right: a choice by its flag; a guess within the tolerance of the model's value (default 15 % of the range); a thought always. */
export function wasRight(c: Commit, answer: number | null, actual?: number | null): boolean {
  if (c.kind === 'think') return true;
  if (answer == null) return false;
  if (c.kind === 'choose') return c.options[answer]?.right === true;
  if (actual == null || !Number.isFinite(actual)) return true;
  return Math.abs(answer - actual) <= (c.tolerance ?? 0.15 * (c.max - c.min));
}
