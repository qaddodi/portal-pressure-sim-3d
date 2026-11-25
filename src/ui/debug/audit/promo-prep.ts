// ?audit=capture&promo=<ratio>: what the app inside a promotion frame (promo/outer.ts) does before it takes its pictures, so they show the app as a person meets it on a good device:
// the Rich figure (every effect on, the sharpest picture, held there) for this page only, and the credit out of the picture (the corner line and the line in a phone's card foot;
// the frame carries the app's name and logo).
// Nothing is saved: the settings are put in the page's store, never in the browser's storage, so the person's own choices (and the Settings sheet's Rich button) are untouched.
import { useSettings } from '../../../state/settings.ts';
import { presetValues } from '../../../state/figure-presets.ts';

/** The pixel ratio a promo address names (`promo=3`), clamped to 1 to 4; null when the address has none. */
export function promoRatio(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.min(4, n) : 2;
}

/** Rich for this page, no corner credit. Called once, before the first talk opens. */
export function preparePromo(doc: Document = document): void {
  useSettings.setState(presetValues('rich', false));
  const st = doc.createElement('style');
  st.setAttribute('data-capture-skip', '');
  st.textContent = '.stage-credit,.pz-cred{visibility:hidden!important}';
  doc.head.append(st);
}
