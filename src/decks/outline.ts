// The opening slide of every talk: the outline (its sections, in order) and its objectives, as the 2D app builds them (decks.js withOverview).
// A deck never writes this slide itself: the sections are its own (`sections`), else its kicker groups when there are three to five, else the slide titles.
// The card is the same for every talk; the name tab is the deck's short name (decks.js TOPICS, strings.generated.ts) or, for your own, its title when short.

import type { Deck } from './schema.ts';

export const OUTLINE_TITLE = 'Outline and objectives';
export const OUTLINE_HEAD = 'Outline';
export const OBJECTIVES_HEAD = 'By the end you can';
/** The longest a deck's own title may be and still stand as its tab (24 capitals fit a phone card, presenter-question.js deckTab). */
export const TAB_MAX = 24;

/** The outline's lines: the deck's sections, else its kicker groups (three to five, "Summary" aside), else the slide titles. */
export function outlineOf(d: Pick<Deck, 'slides' | 'sections'>): string[] {
  const groups = [...new Set(d.slides.map((s) => s.kicker).filter((k) => k && k !== 'Summary'))];
  const secs = d.sections ?? (groups.length >= 3 && groups.length <= 5 ? groups.map((g) => [g, [g]] as const) : null);
  return secs ? secs.map(([n]) => n) : d.slides.filter((s) => s.kicker !== 'Summary').map((s) => s.title);
}

/** The name in the tab at a card's top right: the deck's short name, else its title when that is short enough, else none. `known` is the 2D menu's name for it. */
export function tabName(d: Pick<Deck, 'title' | 'head'>, known?: string | null): string {
  const name = d.head ?? known ?? (d.title.length <= TAB_MAX ? d.title : '');
  return name;
}

/** What the rules for every deck say about its opening slide (tests/deck-shape.test.ts runs this over every deck the app has): three to five outline lines
 *  (so it fits a phone's card without scrolling), two to three objectives of 100 characters or fewer. Returns what is wrong, empty when nothing is. */
export function outlineProblems(d: Pick<Deck, 'id' | 'slides' | 'sections' | 'objectives'>): string[] {
  const bad: string[] = [];
  const o = outlineOf(d);
  if (o.length < 3 || o.length > 5) bad.push(`${d.id}: ${o.length} outline lines (3 to 5: set sections)`);
  if (d.objectives.length < 2 || d.objectives.length > 3) bad.push(`${d.id}: ${d.objectives.length} objectives (2 to 3)`);
  for (const x of d.objectives) if (x.length > 100) bad.push(`${d.id}: objective too long (${x.length}): ${x}`);
  return bad;
}
