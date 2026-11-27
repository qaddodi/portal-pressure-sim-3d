// The promotion page's lists (?promotion, promo/outer.ts): which slides are proposed, how a typed list is read, the pixel ratio each size is taken at and what each file is called.
// A slide is `deck:number`, the number counting from the first slide of the talk (1), the same name the capture's `?pick=` uses; the presenter's own counter reads one higher, because
// the title card is its first stop (lobule:9 is "10 / 12" on the screen). Pure, so a node test loads it.
import { slug } from '../../capture/capture-model.ts';

export interface PromoSlide { deck: string; slide: number; why: string }

/** The sizes the page offers, with the pixel ratio each is taken at: a Mac window at 2x is its own Retina screen, a phone at 3x is its own, a tablet at 2x. */
export const PROMO_SIZES = ['mac', 'iphone', 'ipad-portrait'] as const;
export const PROMO_RATIO: Readonly<Record<string, number>> = Object.freeze({ mac: 2, iphone: 3, 'ipad-portrait': 2 });

/** The twenty proposed slides, in the order of the set: the circulation first, then the lobule, the measurements, the pressure circuit, the bleeds, the shunts, then the patient's story. */
export const PROMO_SLIDES: readonly PromoSlide[] = Object.freeze([
  { deck: 'circulation', slide: 1, why: 'The clean opener: portal blood draining the gut and spleen into the liver, on the whole-body figure.' },
  { deck: 'lobule', slide: 2, why: 'Zone 3 starves for oxygen: the lobule view is the most unusual picture the app has.' },
  { deck: 'lobule', slide: 4, why: 'Cirrhosis narrows the sinusoid: a disease shown where it happens.' },
  { deck: 'hvpg', slide: 3, why: 'The wedged pressure, with the catheter in the hepatic vein: the measurement everything else rests on.' },
  { deck: 'hvpg', slide: 8, why: 'The EUS-PPG from inside the portal vein: a procedure few apps can show.' },
  { deck: 'circuit', slide: 4, why: 'Cirrhosis raises the resistance in the liver, drawn as a circuit: pressure as flow times resistance.' },
  { deck: 'hyperdynamic', slide: 5, why: 'Splanchnic vasodilation keeps the portal pressure high: the whole circulation, labeled.' },
  { deck: 'varices', slide: 1, why: 'Collaterals open where portal and systemic veins meet: the varices lit up on the figure.' },
  { deck: 'variceal-bleed', slide: 2, why: 'The varix ruptures: the most dramatic moment, with the bleeding drawn in.' },
  { deck: 'variceal-bleed', slide: 13, why: 'Her rebleeding is treatment failure: the figure, the algorithm and the pressure on one screen.' },
  { deck: 'endoscopy', slide: 3, why: 'Insufflation flattens the varix: the endoscope view, a different kind of picture.' },
  { deck: 'gastric-varices', slide: 6, why: 'BRTO occludes the gastrorenal shunt retrograde: a procedure with the catheter and the shunt in view.' },
  { deck: 'ascites', slide: 6, why: 'SAAG with the abdomen filling to 5.5 L: a live gauge on the figure.' },
  { deck: 'shunts', slide: 11, why: 'TIPS occlusion returns the gradient: the stent, the catheter and a live Doppler strip.' },
  { deck: 'tips-complete', slide: 12, why: 'The TIPS placed through transjugular access: the procedure itself.' },
  { deck: 'tips-doppler', slide: 6, why: 'A stenosed stent shows low velocity with a focal jet: the Doppler instrument at work.' },
  { deck: 'doppler', slide: 12, why: 'Five waveforms localize five lesions: one table that teaches a whole exam.' },
  { deck: 'carvedilol', slide: 4, why: 'Start carvedilol at CSPH: the treatment decision with its choices on the card.' },
  { deck: 'day', slide: 2, why: 'A meal raises portal flow, pressure and stiffness: the model changing in front of the viewer.' },
  { deck: 'ten-years', slide: 18, why: 'Ten years on one chart: one patient from the first scan to the end of the story.' },
]);

/** What a picture can be of. Beside a slide (`deck:number`) there are two more, named the same way in the box and in the address:
 *  - `history:<case>[:<stop>]`: a model patient's case (Histories, Play the case) at one of its stops, counted from 1 as the case's own stops are: the figure with the stop card and the case bar
 *    (its strip is the patient's chronological timeline). With no stop it is the case's last stop, the patient as they are today, the whole course played in the strip.
 *  - `history:<case>:chart`: the same patient as they are today with the full-screen timeline chart open (History's "See as a chart"): the readings over the whole course in stacked lanes,
 *    the medicines' bars and the events, with what to graph beside it.
 *  - `overview[:<tab>]`: the app's menu open on the first screen a person meets, the talks (`overview`, or `overview:talks`),
 *    the model patients (`overview:patients`) or the histories (`overview:histories`). */
export type Target =
  | { kind: 'slide'; deck: string; slide: number }
  | { kind: 'history'; id: string; stop: number | null }
  | { kind: 'chart'; id: string }
  | { kind: 'overview'; tab: 'present' | 'patients' | 'histories' };

const OVERVIEW_TABS: Readonly<Record<string, 'present' | 'patients' | 'histories'>> = Object.freeze({ talks: 'present', patients: 'patients', histories: 'histories' });

/** What a key names, or null when it names nothing (a slide 0, a stop 0, a tab the menu does not have). */
export function targetOf(key: string): Target | null {
  let m = /^([\w-]+):(\d+)$/.exec(key);
  if (m) { const n = Number(m[2]); return n >= 1 && m[1] !== 'history' && m[1] !== 'overview' ? { kind: 'slide', deck: m[1]!, slide: n } : null; }
  m = /^history:([\w-]+):chart$/.exec(key);
  if (m) return { kind: 'chart', id: m[1]! };
  m = /^history:([\w-]+)(?::(\d+))?$/.exec(key);
  if (m) { const n = m[2] === undefined ? null : Number(m[2]); return n === 0 ? null : { kind: 'history', id: m[1]!, stop: n }; }
  m = /^overview(?::(\w+))?$/.exec(key);
  if (m) { const tab = OVERVIEW_TABS[m[1] ?? 'talks']; return tab ? { kind: 'overview', tab } : null; }
  return null;
}
/** True for a key that is not a slide of a talk (the frame takes these through capture-promo-extra.ts, not through the talks' walk). */
export const isExtra = (key: string): boolean => { const t = targetOf(key); return !!t && t.kind !== 'slide'; };

/** The name a key's files carry between the frame and the page (`lobule-4`, `history-hist-bleed-3`, `history-hist-bleed-last`,
 *  `overview-patients`): the frame writes `<base>.png` and `<base>.json`. */
export function baseOf(key: string): string {
  const t = targetOf(key);
  if (!t) return key.replace(/[^\w-]+/g, '-');
  if (t.kind === 'slide') return `${t.deck}-${t.slide}`;
  if (t.kind === 'chart') return `history-${t.id}-chart`;
  if (t.kind === 'history') return `history-${t.id}-${t.stop ?? 'last'}`;
  return t.tab === 'present' ? 'overview' : `overview-${t.tab}`;
}

/** The stop (0-based) a history key asks for in a case of `n` stops: its own number, or the last (the patient as they are today). Null when the case has no such stop. */
export const stopIndex = (stop: number | null, n: number): number | null => (stop === null ? (n > 0 ? n - 1 : null) : stop >= 1 && stop <= n ? stop - 1 : null);

/** The pictures a typed list names: `deck:number`, `history:<case>[:<stop>]` or `overview[:<tab>]` separated by commas, spaces or new lines;
 *  a `#` starts a note to the end of its line; bad entries are returned apart, repeats dropped. */
export function parseSlides(text: string): { keys: string[]; bad: string[] } {
  const keys: string[] = [], bad: string[] = [];
  for (const line of text.split('\n')) {
    for (const t of line.split('#')[0]!.split(/[\s,]+/).filter(Boolean)) {
      if (targetOf(t)) { if (!keys.includes(t)) keys.push(t); } else bad.push(t);
    }
  }
  return { keys, bad };
}
/** The keys that are slides of a talk, and the ones that are not, each in the order typed. */
export const splitKeys = (keys: readonly string[]): { slides: string[]; extras: string[] } => ({ slides: keys.filter((k) => !isExtra(k)), extras: keys.filter(isExtra) });

/** The proposed pictures that are not slides of a talk: a case at a stop and the menu's first screens. They follow the twenty slides in the box. */
export const PROMO_EXTRAS: readonly { key: string; why: string }[] = Object.freeze([
  { key: 'history:hist-bleed-tips:chart', why: 'A bleed, then a TIPS within 24 hours, as graphs: pressures fall at the TIPS, the shunt fraction rises, events marked.' },
  { key: 'history:hist-ascites:chart', why: 'Refractory ascites as graphs: the ascites volume climbing, each tap a drop, the medicines as bars under the pressures.' },
  { key: 'history:hist-hcv:chart', why: 'Hepatitis C cured: the pressure lanes over 600 days, the cause gone and the portal pressure persisting.' },
  { key: 'history:hist-tips-narrowed:chart', why: 'A TIPS that narrows: the gradient returns after a clean start, drawn over the whole course.' },
  { key: 'history:hist-bleed-tips', why: "A bleed, then a TIPS within 24 hours: the case's last stop with the whole course played in the bar's strip, the patient as they are today." },
  { key: 'history:hist-ascites:4', why: 'Refractory ascites, fourth stop: the stop card, the case bar with its chapters and the belly on the figure.' },
  { key: 'history:hist-hcv', why: 'Hepatitis C cured and the pressure persisting: the one case where the cause is gone and the portal pressure is not.' },
  { key: 'overview', why: "The app's front door: the talks, grouped, as a person first meets them." },
  { key: 'overview:histories', why: "The model patients' histories laid out as a list of courses: what the app offers beyond the talks." },
]);

/** The proposed list as the text the page's box holds, one picture to a line with its reason after a `#`: the twenty slides, then the extras. */
export const slidesText = (list: readonly PromoSlide[] = PROMO_SLIDES, extras: readonly { key: string; why: string }[] = PROMO_EXTRAS): string =>
  [...list.map((s) => `${s.deck}:${s.slide}  # ${s.why}`), ...extras.map((x) => `${x.key}  # ${x.why}`)].join('\n');

/** A file's name for any key: a slide as `promoName` has it, a case `07-history-hist-bleed-3-<title>-iphone.jpg`, the menu `08-overview-patients-iphone.jpg`. */
export function promoNameOf(n: number, key: string, title: string, device: string): string {
  const t = targetOf(key);
  if (!t || t.kind === 'slide') { const [deck, num] = key.split(':'); return promoName(n, deck ?? key, Number(num), title, device); }
  const tt = slug(title).slice(0, 48).replace(/-+$/, '');
  return `${String(n).padStart(2, '0')}-${baseOf(key)}${(t.kind === 'history' || t.kind === 'chart') && tt ? `-${tt}` : ''}-${device}.jpg`;
}

/** A file's name: its place in the set, the slide, the device ("03-lobule-4-cirrhosis-narrows-the-sinusoid-iphone.jpg"). */
export function promoName(n: number, deck: string, slide: number, title: string, device: string): string {
  const t = slug(title).slice(0, 48).replace(/-+$/, '');
  return `${String(n).padStart(2, '0')}-${deck}-${slide}${t ? `-${t}` : ''}-${device}.jpg`;
}
