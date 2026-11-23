// What kind of screen this is, and the type it sets. Text never shrinks to fit: these sizes are the floor and the whole scale.

import { layoutOf, isSideways, cardScale, WIDE } from './rules2d.ts';

export type DeviceClass = 'desktop' | 'tablet-portrait' | 'phone-portrait' | 'phone-landscape';

export interface Insets { top: number; right: number; bottom: number; left: number }
export interface Rect { x: number; y: number; w: number; h: number }
export interface Viewport { w: number; h: number; safe: Insets }

/** The 2D app's classes (rules2d.ts, from its media queries): an iPhone held sideways is `phone-landscape` (the wallet), an iPhone upright `phone-portrait`,
 *  an iPad upright `tablet-portrait` (the phone stack at 70 % width), Mac and iPad on its side `desktop`. */
export function deviceClass(w: number, h: number): DeviceClass {
  if (isSideways(w, h)) return 'phone-landscape';
  const l = layoutOf(w, h);
  return l === 'stack' ? 'phone-portrait' : l === 'tab' ? 'tablet-portrait' : 'desktop';
}

export const isPhone = (c: DeviceClass) => c === 'phone-portrait' || c === 'phone-landscape';

/** The type of every card, in px: the 2D app's roles (rules2d.ts cardScale) for this screen. One table: the CSS reads it as custom properties, the tests judge it. */
export interface TypeScale {
  deckTitle: number; slideTitle: number; /** the title one step down (2D WIDE.tight), never under its floor over the body: only where the words cannot get the height any other way */ slideTitleTrim: number; body: number; data: number; kicker: number; bigNumber: number;
  /** line-height multipliers */
  deckTitleLead: number; slideTitleLead: number; bodyLead: number;
}

/** What the 2D stylesheet gives the teaching card on this screen: the stacked layouts set the line in its label role and the heading in its value role
 *  (styles/app-05-presenter-cards.css .pz.stack); every floating card sets the line in body and the heading in title. */
export function typeFor(w: number, h: number): TypeScale {
  if (isSideways(w, h)) {
    // a phone held sideways: the side columns are 27 % of the screen wide (docs/approved/landscape-phone.md), so the type is the approved mock's: a 20 px title, 13.5 px words, 12 px small words, 26 px numbers
    const body = 13.5, slideTitle = 20;
    return { deckTitle: 22, slideTitle, slideTitleTrim: Math.min(slideTitle, Math.max(slideTitle * WIDE.tight, 1.4 * body)), body, kicker: 12, data: 12, bigNumber: 26, deckTitleLead: 1.06, slideTitleLead: 1.17, bodyLead: 1.42 };
  }
  const layout = layoutOf(w, h);
  const text = cardScale({ vw: w, vh: h, layout, part: 'text', card: true });
  const data = cardScale({ vw: w, vh: h, layout, part: 'data' });
  const stacked = layout === 'stack' || layout === 'tab';
  const body = stacked ? text.lab : text.body;
  const slideTitle = stacked ? text.val : text.title;
  return {
    deckTitle: stacked ? text.big : text.title, slideTitle, slideTitleTrim: Math.min(slideTitle, Math.max(slideTitle * WIDE.tight, (stacked ? 1.33 : 1.4) * body)), body, kicker: stacked ? text.lab : text.cap, data: Math.max(12, data.lab), bigNumber: data.big,
    deckTitleLead: 1.06, slideTitleLead: 1.06, bodyLead: 1.4,
  };
}

/** The floors the owner set (rule list of 19 Nov): body 17 on a floating card, 16 on a stacked one, 13 on a phone's side column (approved 23 Nov, the mock's 13.5); a slide title at least 1.4× the body (1.33× on a stacked screen where
 *  the text needs the room); data text and tags at least 12 px. */
export const FLOORS = { body: { floating: 17, stacked: 16, sideways: 13 }, titleRatio: { floating: 1.4, stacked: 1.33, sideways: 1.4 }, data: 12 } as const;

export function checkTypeScale(w: number, h: number, t: TypeScale = typeFor(w, h)): string[] {
  const bad: string[] = [];
  const l = layoutOf(w, h), stacked = l === 'stack' || l === 'tab', side = isSideways(w, h), at = `${w}×${h}`;
  const body = side ? FLOORS.body.sideways : stacked ? FLOORS.body.stacked : FLOORS.body.floating;
  if (t.body < body - 1e-9) bad.push(`${at}: body ${t.body} px is under ${body}`);
  const ratio = side ? FLOORS.titleRatio.sideways : stacked ? FLOORS.titleRatio.stacked : FLOORS.titleRatio.floating;
  if (t.slideTitle / t.body < ratio - 1e-6) bad.push(`${at}: slide title ${t.slideTitle} px is ${(t.slideTitle / t.body).toFixed(2)}× the body, under ${ratio}×`);
  if (t.data < FLOORS.data) bad.push(`${at}: data text ${t.data} px is under ${FLOORS.data}`);
  if (t.kicker < FLOORS.data) bad.push(`${at}: kicker ${t.kicker} px is under ${FLOORS.data}`);
  if (t.deckTitle < t.slideTitle) bad.push(`${at}: the deck title is smaller than a slide title`);
  return bad;
}
