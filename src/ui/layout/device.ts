// What kind of screen this is, and the type each kind sets. Text never shrinks to fit: these sizes are the floor and the whole scale.

export type DeviceClass = 'desktop' | 'tablet-portrait' | 'phone-portrait' | 'phone-landscape';

export interface Insets { top: number; right: number; bottom: number; left: number }
export interface Rect { x: number; y: number; w: number; h: number }
export interface Viewport { w: number; h: number; safe: Insets }

/** Mac and iPad landscape are `desktop`; an iPad held upright is `tablet-portrait`; an iPhone is a phone in either hold (shorter side under 600 px). */
export function deviceClass(w: number, h: number): DeviceClass {
  const short = Math.min(w, h);
  if (short < 600) return w > h ? 'phone-landscape' : 'phone-portrait';
  return h > w ? 'tablet-portrait' : 'desktop';
}

export const isPhone = (c: DeviceClass) => c === 'phone-portrait' || c === 'phone-landscape';

/** The type of every card, in px (docs/look-and-feel.md section 5). One table: the CSS reads it as custom properties, the tests judge it. */
export interface TypeScale {
  deckTitle: number; slideTitle: number; body: number; data: number; kicker: number; bigNumber: number;
  /** line-height multipliers */
  deckTitleLead: number; slideTitleLead: number; bodyLead: number;
}

const MAC: TypeScale = { deckTitle: 44, slideTitle: 26, body: 17, data: 13, kicker: 11, bigNumber: 40, deckTitleLead: 1.08, slideTitleLead: 1.18, bodyLead: 1.5 };
export const TYPE: Record<DeviceClass, TypeScale> = {
  desktop: MAC,
  'tablet-portrait': MAC,
  'phone-portrait': { ...MAC, deckTitle: 32, slideTitle: 22, body: 16, bodyLead: 1.45, slideTitleLead: 1.2 },
  'phone-landscape': { ...MAC, deckTitle: 28, slideTitle: 22, body: 16, bodyLead: 1.45, slideTitleLead: 1.2, bigNumber: 32 },
};

/** The floors the owner set (rule list of 19 Nov): body 17 Mac and iPad, 16 iPhone; a slide title at least 1.4× the body (1.33× on a phone where the text needs
 *  the room); data text and tags at least 12 px; the kicker is a label (11 px caps). */
export const FLOORS = { body: { mac: 17, phone: 16 }, titleRatio: { mac: 1.4, phone: 1.33 }, data: 12 } as const;

export function checkTypeScale(c: DeviceClass, t: TypeScale = TYPE[c]): string[] {
  const bad: string[] = [];
  const phone = isPhone(c);
  const body = phone ? FLOORS.body.phone : FLOORS.body.mac;
  if (t.body < body) bad.push(`${c}: body ${t.body} px is under ${body}`);
  const ratio = phone ? FLOORS.titleRatio.phone : FLOORS.titleRatio.mac;
  if (t.slideTitle / t.body < ratio) bad.push(`${c}: slide title ${t.slideTitle} px is ${(t.slideTitle / t.body).toFixed(2)}× the body, under ${ratio}×`);
  if (t.data < FLOORS.data) bad.push(`${c}: data text ${t.data} px is under ${FLOORS.data}`);
  if (t.deckTitle < t.slideTitle) bad.push(`${c}: the deck title is smaller than a slide title`);
  return bad;
}
