// Words follow US and Baveno VIII usage (the 2D app's wording rules over the words on the screen). The 3D app's words come from the 2D decks (scripts/copy-decks.mjs), so
// the same word lists judge both; here they judge the text the cards on the screen hold. Pure over the report's cards part.
import { registerRule } from '../core/rules.copied.js';

interface W { id: string; why: string; re: RegExp }
/** Subset of the 2D wording.js rules that read a screen of words (the full list stays in the 2D app; docs/debug.md lists what is carried). */
export const WORDING: readonly W[] = [
  { id: 'wording-em-dash', why: 'No em-dash in learner text (owner); a lone dash standing for an empty table value is a placeholder, not text', re: /—/ },
  { id: 'wording-older-baveno', why: 'The guideline is Baveno VIII only, never VII (owner, 18 Nov 2026)', re: /Baveno\s*(VII\b(?!I)|7\b|V\b|VI\b)/ },
  { id: 'wording-british', why: 'American spelling (US physicians)', re: /\b(oesophag\w*|haemorrhag\w*|anaemi\w*|oedema|colour\w*|programme)\b/i },
  { id: 'wording-no-number', why: 'A value that was never worked out never reaches the page (production)', re: /\b(NaN|undefined|Infinity)\b/ },
  { id: 'wording-open-token', why: 'A {token} the page did not fill never reaches the page (production)', re: /\{[a-z>=<:0-9 ]*\}/i },
];

const wordsOf = (r: Record<string, any>): string[] => (r.words?.lines ?? []) as string[];
for (const w of WORDING) {
  registerRule({ id: w.id, family: 'wording', owner: 'src/decks/', why: w.why,
    check: (r: Record<string, any>) => wordsOf(r).filter((t) => w.re.test(t) && !(w.id === 'wording-em-dash' && t.trim() === '—')).map((t) => ({ what: `"${t.slice(0, 90)}"`, where: 'on a card now' })) });
}
