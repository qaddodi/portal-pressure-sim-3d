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

/** The slides a typed list names: `deck:number` separated by commas, spaces or new lines; a `#` starts a note to the end of its line; bad entries are returned apart, repeats dropped. */
export function parseSlides(text: string): { keys: string[]; bad: string[] } {
  const keys: string[] = [], bad: string[] = [];
  for (const line of text.split('\n')) {
    for (const t of line.split('#')[0]!.split(/[\s,]+/).filter(Boolean)) {
      if (/^[\w-]+:\d+$/.test(t) && !/:0+$/.test(t)) { if (!keys.includes(t)) keys.push(t); } else bad.push(t);
    }
  }
  return { keys, bad };
}

/** The proposed list as the text the page's box holds, one slide to a line with its reason after a `#`. */
export const slidesText = (list: readonly PromoSlide[] = PROMO_SLIDES): string => list.map((s) => `${s.deck}:${s.slide}  # ${s.why}`).join('\n');

/** A file's name: its place in the set, the slide, the device ("03-lobule-4-cirrhosis-narrows-the-sinusoid-iphone.jpg"). */
export function promoName(n: number, deck: string, slide: number, title: string, device: string): string {
  const t = slug(title).slice(0, 48).replace(/-+$/, '');
  return `${String(n).padStart(2, '0')}-${deck}-${slide}${t ? `-${t}` : ''}-${device}.jpg`;
}
