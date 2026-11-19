// The teaching card's fields beyond its words, as pure functions the card draws and the tests read (2D: decks.js siteTag, presenter-cards.js rail, teach-extras.js sidesEl,
// presenter-question.js causes, presenter-words.js the line's one pill). Names and rules are the 2D app's own.
import type { Deck, Slide } from '../../decks/schema.ts';

// ── the level tab ──
/** The level names (2D decks.js SITE_TAGS); `pvt` (portal vein thrombosis) is the pre-hepatic level. */
export const SITE_TAGS: Record<string, string> = { pre: 'Pre-hepatic', pvt: 'Pre-hepatic', presin: 'Presinusoidal', sin: 'Sinusoidal', postsin: 'Postsinusoidal', post: 'Post-hepatic', cardiac: 'Cardiac' };
export interface SiteTag { site: string; name: string; /** the level rail names it (a phone held upright, where the rail is hidden, shows the tab) */ rail?: true }

/** The level of a slide's block, as the tab in the card's top left corner (2D siteTag): on the slides of a deck that teaches more than one level, so the learner always knows which type of portal
 *  hypertension the slide is about. A deck about cirrhosis alone (every site sinusoidal) carries none, nor does a slide whose rail already marks the block, or a visual; a kicker that already
 *  says the level is not said twice. */
export function siteTag(deck: Pick<Deck, 'slides'>, s: Pick<Slide, 'site' | 'rail' | 'visual' | 'kicker'>): SiteTag | null {
  if (!s.site || s.rail || s.visual || !deck.slides.some((x) => x.site && x.site !== 'sin')) return null;
  const name = SITE_TAGS[s.site];
  return name && !(s.kicker || '').toLowerCase().includes(name.toLowerCase()) ? { site: s.site === 'pvt' ? 'pre' : s.site, name } : null;
}
/** The tab a slide shows: its level tag, or, on a slide with a one-level rail, the rail's level (shown only where the rail is hidden). */
export function tabOf(deck: Pick<Deck, 'slides'>, s: Pick<Slide, 'site' | 'rail' | 'visual' | 'kicker'>): SiteTag | null {
  if (s.visual) return null;
  const tag = siteTag(deck, s);
  if (tag) return tag;
  return s.rail && s.rail !== 'all' && s.site && SITE_TAGS[s.site] ? { site: s.site === 'pvt' ? 'pre' : s.site, name: SITE_TAGS[s.site]!, rail: true } : null;
}

// ── the level rail ──
/** The six levels along the route, portal vein to heart (2D presenter-cards.js SITES). The middle three are inside the liver. */
export const RAIL_LEVELS: readonly (readonly [string, string])[] = [['pre', 'Pre-hepatic'], ['presin', 'Presinusoidal'], ['sin', 'Sinusoidal'], ['postsin', 'Postsinusoidal'], ['post', 'Post-hepatic'], ['cardiac', 'Cardiac']];
export interface RailModel { cls: string; label: string; levels: { id: string; name: string; on: boolean }[] }
/** The rail: 'all' names every level, a level id marks that one as the block, anything else shows the levels unmarked (2D rail(mode); a slide's `rail: true` marks its own site). */
export function railOf(s: Pick<Slide, 'rail' | 'site'>): RailModel | null {
  if (!s.rail) return null;
  const mode = s.rail === 'all' ? 'all' : s.site ?? '';
  const at = RAIL_LEVELS.findIndex(([id]) => id === mode);
  return {
    cls: `pz-rail${mode === 'all' ? ' all' : at >= 0 ? ' one' : ''}`,
    label: at >= 0 ? `Resistance: ${RAIL_LEVELS[at]![1]}` : 'Six levels: pre-hepatic, presinusoidal, sinusoidal, postsinusoidal, post-hepatic, cardiac',
    levels: RAIL_LEVELS.map(([id, name], i) => ({ id, name, on: i === at })),
  };
}

// ── two guidelines side by side ──
/** The two columns under the line (2D sidesOf): both need a name and words, and a slide has exactly two or none. */
export const sidesOf = (s: Pick<Slide, 'sides'>): { who: string; text: string }[] => (Array.isArray(s.sides) ? s.sides.filter((x) => x && typeof x.who === 'string' && x.who.trim() && typeof x.text === 'string' && x.text.trim()) : []);

// ── the causes ──
const PROPER = /^(?:Child|Budd|Wilson|Hodgkin|Kupffer|Doppler|Baveno|Laplace)\b/;
/** The causes as a sentence's list (2D glue.js listCase): a name that is not a proper noun starts in lower case after the first. */
export const listCase = (items: readonly string[]): string => items.map((x, i) => (i && /^\p{Lu}\p{Ll}/u.test(x) && !PROPER.test(x) ? x[0]!.toLowerCase() + x.slice(1) : x)).join(', ');

// ── the line's one pill ──
const VAL = /(?:[<>≥≤]\s?)?\d+(?:\.\d+)?(?:\s(?:to|or)\s\d+(?:\.\d+)?)?\s?(?:mmHg|g\/dL|mL\/min|kPa|cm\/s|mm|%)(?![A-Za-z])/;
/** A line with no braced value gets its first value with a unit set in a quiet pill (2D rich: `pill: false` for none). Returns that value as the line writes it, or null. */
export function autoPill(s: Pick<Slide, 'line' | 'pill'>): string | null {
  if (s.pill === false || !s.line) return null;
  if (/\{(?!#\d+\})[^}]+\}/.test(s.line)) return null;
  // (a value inside a [link](term) or **bold** is that piece's, not the pill's)
  const plain = s.line.replace(/\[[^\]]+\]\([\w:-]+\)|\*\*[^*]+\*\*/g, (m) => ' '.repeat(m.length));
  const m = VAL.exec(plain);
  return m ? s.line.slice(m.index, m.index + m[0].length) : null;
}

// ── what the teaching card prints under and beside its line ──
export interface CardFields {
  tab: SiteTag | null;
  sides: { who: string; text: string }[];
  caveat: string | null;
  cite: string | null;
  rail: RailModel | null;
  causes: { head: string; list: string } | null;
  /** the value the line sets in a pill when it braces none */
  pill: string | null;
}
/** Everything the teaching card prints besides its title, equation, line and controls, for the slide as shown (a compare button may have changed its words): the fields that belong at
 *  the foot of the words appear on the card's last page only. `slide` is the slide, `shown` the slide with the words a pressed compare button brought. */
export function cardFields(deck: Pick<Deck, 'slides'> | undefined, slide: Slide, shown: Slide, page: number, pages: number): CardFields {
  const last = page >= pages - 1;
  const sides = sidesOf(slide);
  return {
    tab: deck ? tabOf(deck, shown) : null,
    sides: sides.length === 2 && last ? sides : [],
    caveat: slide.caveat && last ? slide.caveat : null,
    cite: slide.cite && last ? slide.cite : null,
    rail: last ? railOf(shown) : null,
    causes: slide.causes?.length && last ? { head: slide.causesHead || 'Causes', list: listCase(slide.causes) } : null,
    pill: autoPill(shown),
  };
}
